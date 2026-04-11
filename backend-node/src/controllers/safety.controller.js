/**
 * src/controllers/safety.controller.js
 *
 * Safety & moderation — report a user, block a user.
 *
 * Report rules:
 *  - Cannot report yourself.
 *  - `status` starts as 'pending'.
 *  - Auto-restriction: after 3+ pending reports against a user, their
 *    `swipe_restricted` flag is set to true.
 *
 * Block rules:
 *  - Cannot block yourself.
 *  - On block: deactivate any mutual match, removes both from each other's
 *    discovery (enforced at DB query level, not app layer).
 */

const Joi = require('joi');
const { Op } = require('sequelize');
const { Report, Block, Match, User } = require('../models');
const { REPORT_REASONS } = require('../models/report.model');

const PENDING_REPORT_THRESHOLD = 3;

// ── Schemas ──────────────────────────────────────────────────────────────────

const reportSchema = Joi.object({
  reportedUserId: Joi.string().uuid().required(),
  reason: Joi.string().valid(...REPORT_REASONS).required(),
  details: Joi.string().max(1000).allow('').default(''),
});

const blockSchema = Joi.object({
  blockedUserId: Joi.string().uuid().required(),
});

// ── Controller ───────────────────────────────────────────────────────────────

/**
 * POST /api/safety/report
 */
const reportUser = async (req, res) => {
  const { error, value } = reportSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, error: error.details[0].message });
  }

  const { reportedUserId, reason, details } = value;
  const reporterId = req.user.id;

  if (reporterId === reportedUserId) {
    return res.status(400).json({ success: false, error: 'Cannot report yourself' });
  }

  const reportedUser = await User.findByPk(reportedUserId);
  if (!reportedUser) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  const report = await Report.create({
    reporter_id: reporterId,
    reported_id: reportedUserId,
    reason,
    details,
  });

  // Auto-restriction check — count pending reports against this user
  const pendingCount = await Report.count({
    where: { reported_id: reportedUserId, status: 'pending' },
  });

  if (pendingCount >= PENDING_REPORT_THRESHOLD && !reportedUser.swipe_restricted) {
    await reportedUser.update({ swipe_restricted: true });
    console.log(`[Safety] User ${reportedUserId} swipe-restricted after ${pendingCount} reports.`);
  }

  return res.status(201).json({ success: true, data: { reportId: report.id } });
};

/**
 * POST /api/safety/block
 */
const blockUser = async (req, res) => {
  const { error, value } = blockSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, error: error.details[0].message });
  }

  const { blockedUserId } = value;
  const blockerId = req.user.id;

  if (blockerId === blockedUserId) {
    return res.status(400).json({ success: false, error: 'Cannot block yourself' });
  }

  const blockedUser = await User.findByPk(blockedUserId);
  if (!blockedUser) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  // Create block record (ignore if already blocked)
  await Block.findOrCreate({ where: { blocker_id: blockerId, blocked_id: blockedUserId } });

  // Deactivate any mutual match between the two users
  const [u1, u2] = [blockerId, blockedUserId].sort();
  await Match.update(
    { is_active: false },
    { where: { user1_id: u1, user2_id: u2 } },
  );

  return res.json({ success: true, data: { message: 'User blocked' } });
};

/**
 * DELETE /api/safety/block/:userId
 * Unblock a previously blocked user.
 */
const unblockUser = async (req, res) => {
  const blocked = await Block.findOne({
    where: { blocker_id: req.user.id, blocked_id: req.params.userId },
  });

  if (!blocked) {
    return res.status(404).json({ success: false, error: 'Block not found' });
  }

  await blocked.destroy();
  return res.json({ success: true, data: { message: 'User unblocked' } });
};

module.exports = { reportUser, blockUser, unblockUser };
