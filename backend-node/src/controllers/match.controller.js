/**
 * src/controllers/match.controller.js
 *
 * Matching system — swipe recording, mutual match detection, AI-scored suggestions.
 *
 * Swipe flow:
 *  1. Record swipe in `swipes` table.
 *  2. On 'like', check for mutual like → create match + conversation.
 *  3. Emit Socket.IO `match:new` to both users.
 *  4. Async: ask FastAPI for conversation starters.
 *
 * Suggestion flow:
 *  1. Query candidate pool (filtered, excluding swiped and blocked users).
 *  2. Call FastAPI /ai/match/score for ranking.
 *  3. Return top N results.
 */

const Joi = require('joi');
const axios = require('axios');
const { Op, literal } = require('sequelize');
const { User, Profile, Photo, Swipe, Match, Conversation, Block } = require('../models');
const { getIO } = require('../sockets');

const FASTAPI_BASE = process.env.FASTAPI_BASE_URL || 'http://localhost:8001';
const SUGGESTIONS_LIMIT = 20;

// ── Schemas ──────────────────────────────────────────────────────────────────

const swipeSchema = Joi.object({
  swipedUserId: Joi.string().uuid().required(),
  direction: Joi.string().valid('like', 'dislike').required(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch AI-generated conversation starters from FastAPI after a match is created.
 * Fire-and-forget — errors are logged, not propagated.
 */
async function fetchAndStoreStarters(match, user1Profile, user2Profile) {
  try {
    const response = await axios.post(
      `${FASTAPI_BASE}/ai/starters`,
      { profile1: user1Profile, profile2: user2Profile },
      { timeout: 5000, headers: { 'X-Internal-Secret': process.env.INTERNAL_API_SECRET } },
    );
    const starters = response.data?.starters || [];
    await match.update({ starters_json: starters });
  } catch (err) {
    console.error('[Match] Failed to fetch starters:', err.message);
  }
}

// ── Controller ───────────────────────────────────────────────────────────────

/**
 * POST /api/match/swipe
 * Record a swipe. On mutual like, create a match.
 */
const swipe = async (req, res) => {
  const { error, value } = swipeSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, error: error.details[0].message });
  }

  const { swipedUserId, direction } = value;
  const swiperId = req.user.id;

  if (swiperId === swipedUserId) {
    return res.status(400).json({ success: false, error: 'Cannot swipe on yourself' });
  }

  // Check swipe restriction
  if (req.user.swipe_restricted) {
    return res.status(403).json({ success: false, error: 'Swipe ability temporarily restricted' });
  }

  // Ensure swiped user exists and is active
  const swipedUser = await User.findByPk(swipedUserId);
  if (!swipedUser || !swipedUser.is_active) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  // Record (upsert to handle re-swipes gracefully)
  await Swipe.upsert({ swiper_id: swiperId, swiped_id: swipedUserId, direction });

  if (direction !== 'like') {
    return res.json({ success: true, data: { matched: false } });
  }

  // Check for mutual like
  const reverseSwipe = await Swipe.findOne({
    where: { swiper_id: swipedUserId, swiped_id: swiperId, direction: 'like' },
  });

  if (!reverseSwipe) {
    return res.json({ success: true, data: { matched: false } });
  }

  // Mutual match — check if one already exists (idempotent)
  const [u1, u2] = [swiperId, swipedUserId].sort(); // canonical ordering
  const [match, created] = await Match.findOrCreate({
    where: { user1_id: u1, user2_id: u2 },
    defaults: { is_active: true },
  });

  if (created) {
    // Create the conversation
    const conversation = await Conversation.create({ match_id: match.id });

    // Emit match:new to both users via Socket.IO
    const io = getIO();
    const safeUser = req.user.toSafeJSON();
    const safeSwiped = swipedUser.toSafeJSON();
    io.to(swiperId).emit('match:new', { matchId: match.id, conversationId: conversation.id, user: safeSwiped });
    io.to(swipedUserId).emit('match:new', { matchId: match.id, conversationId: conversation.id, user: safeUser });

    // Fire-and-forget AI starters
    const [p1, p2] = await Promise.all([
      Profile.findOne({ where: { user_id: u1 } }),
      Profile.findOne({ where: { user_id: u2 } }),
    ]);
    fetchAndStoreStarters(match, p1?.toJSON(), p2?.toJSON());
  }

  return res.json({ success: true, data: { matched: true, matchId: match.id } });
};

/**
 * GET /api/match/suggestions?page=1&limit=20
 * Return AI-scored candidate suggestions for the authenticated user.
 */
const getSuggestions = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, parseInt(req.query.limit, 10) || SUGGESTIONS_LIMIT);
  const offset = (page - 1) * limit;

  const userId = req.user.id;
  const profile = await Profile.findOne({ where: { user_id: userId } });
  if (!profile) {
    return res.status(400).json({ success: false, error: 'Complete your profile before discovering matches' });
  }

  const prefs = profile.preferences_json || {};
  const { ageMin = 18, ageMax = 100, genderPreference, maxDistanceKm } = prefs;

  // Subquery: user IDs already swiped on
  const swipedIds = await Swipe.findAll({
    where: { swiper_id: userId },
    attributes: ['swiped_id'],
    raw: true,
  }).then((rows) => rows.map((r) => r.swiped_id));

  // Subquery: blocked user IDs (both directions — block is mutual in effect)
  const blockedIds = await Block.findAll({
    where: {
      [Op.or]: [{ blocker_id: userId }, { blocked_id: userId }],
    },
    attributes: ['blocker_id', 'blocked_id'],
    raw: true,
  }).then((rows) =>
    rows.map((r) => (r.blocker_id === userId ? r.blocked_id : r.blocker_id)),
  );

  const excludeIds = [...new Set([...swipedIds, ...blockedIds, userId])];

  // Build candidate where clause
  const profileWhere = {
    user_id: { [Op.notIn]: excludeIds.length ? excludeIds : ['_none_'] },
    age: { [Op.between]: [ageMin, ageMax] },
  };
  if (genderPreference && genderPreference !== 'any') {
    profileWhere.gender = genderPreference;
  }

  const { count, rows: candidates } = await Profile.findAndCountAll({
    where: profileWhere,
    include: [
      { model: User, as: 'user', where: { is_active: true }, attributes: ['id', 'is_verified'] },
      { model: Photo, as: 'photos', required: false, order: [['order_index', 'ASC']] },
    ],
    limit,
    offset,
  });

  // Call FastAPI for ranking (with timeout fallback to raw list)
  let ranked = candidates.map((c) => c.toJSON());
  try {
    const aiResponse = await axios.post(
      `${FASTAPI_BASE}/ai/match/score`,
      { userId, userProfile: profile.toJSON(), candidates: ranked },
      { timeout: 3000, headers: { 'X-Internal-Secret': process.env.INTERNAL_API_SECRET } },
    );
    if (aiResponse.data?.ranked) {
      ranked = aiResponse.data.ranked;
    }
  } catch (err) {
    console.warn('[Match] FastAPI scoring unavailable, returning unranked:', err.message);
  }

  return res.json({
    success: true,
    data: ranked,
    total: count,
    page,
    pages: Math.ceil(count / limit),
  });
};

/**
 * GET /api/match/list
 * Return all active matches for the authenticated user.
 */
const getMatches = async (req, res) => {
  const userId = req.user.id;

  const matches = await Match.findAll({
    where: {
      is_active: true,
      [Op.or]: [{ user1_id: userId }, { user2_id: userId }],
    },
    include: [
      { model: User, as: 'user1', include: [{ model: Profile, as: 'profile' }, { model: Photo, as: 'photos' }] },
      { model: User, as: 'user2', include: [{ model: Profile, as: 'profile' }, { model: Photo, as: 'photos' }] },
      { model: Conversation, as: 'conversation' },
    ],
    order: [['matched_at', 'DESC']],
  });

  // Shape response: always show "the other user"
  const shaped = matches.map((m) => {
    const json = m.toJSON();
    const otherUser = json.user1_id === userId ? json.user2 : json.user1;
    return {
      matchId: json.id,
      conversationId: json.conversation?.id,
      matchedAt: json.matched_at,
      starters: json.starters_json,
      otherUser,
    };
  });

  return res.json({ success: true, data: shaped });
};

module.exports = { swipe, getSuggestions, getMatches };
