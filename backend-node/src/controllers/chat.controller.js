/**
 * src/controllers/chat.controller.js
 *
 * REST endpoints for chat history.
 * Real-time messaging is handled by Socket.IO in sockets/chat.socket.js.
 *
 * Endpoints:
 *  GET /api/chat/conversations        — list conversations for authenticated user
 *  GET /api/chat/:conversationId      — message history (paginated)
 *  PATCH /api/chat/messages/:id/read  — mark a message as read
 */

const { Op } = require('sequelize');
const { Conversation, Message, Match, User, Profile, Photo } = require('../models');

/**
 * GET /api/chat/conversations
 */
const listConversations = async (req, res) => {
  const userId = req.user.id;

  const matches = await Match.findAll({
    where: {
      is_active: true,
      [Op.or]: [{ user1_id: userId }, { user2_id: userId }],
    },
    include: [
      { model: Conversation, as: 'conversation' },
      {
        model: User, as: 'user1',
        include: [{ model: Profile, as: 'profile' }, { model: Photo, as: 'photos', limit: 1, order: [['order_index', 'ASC']] }],
        attributes: ['id'],
      },
      {
        model: User, as: 'user2',
        include: [{ model: Profile, as: 'profile' }, { model: Photo, as: 'photos', limit: 1, order: [['order_index', 'ASC']] }],
        attributes: ['id'],
      },
    ],
  });

  const result = await Promise.all(
    matches.map(async (m) => {
      const json = m.toJSON();
      const conversationId = json.conversation?.id;
      const otherUser = json.user1_id === userId ? json.user2 : json.user1;

      // Get last message
      const lastMessage = conversationId
        ? await Message.findOne({
          where: { conversation_id: conversationId },
          order: [['sent_at', 'DESC']],
          attributes: ['id', 'content', 'message_type', 'sent_at', 'read_at', 'sender_id'],
        })
        : null;

      // Unread count
      const unreadCount = conversationId
        ? await Message.count({
          where: { conversation_id: conversationId, sender_id: { [Op.ne]: userId }, read_at: null },
        })
        : 0;

      return {
        matchId: json.id,
        conversationId,
        otherUser,
        lastMessage,
        unreadCount,
        matchedAt: json.matched_at,
      };
    }),
  );

  return res.json({ success: true, data: result });
};

/**
 * GET /api/chat/:conversationId?page=1&limit=30
 * Paginated message history.
 */
const getMessages = async (req, res) => {
  const userId = req.user.id;
  const { conversationId } = req.params;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 30);
  const offset = (page - 1) * limit;

  // Verify the user is a participant in this conversation
  const conversation = await Conversation.findByPk(conversationId, {
    include: [{ model: Match, as: 'match' }],
  });

  if (!conversation) {
    return res.status(404).json({ success: false, error: 'Conversation not found' });
  }

  const { user1_id, user2_id } = conversation.match;
  if (userId !== user1_id && userId !== user2_id) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const { count, rows } = await Message.findAndCountAll({
    where: { conversation_id: conversationId },
    // Exclude sentiment_score from response — internal field only
    attributes: { exclude: ['sentiment_score'] },
    order: [['sent_at', 'DESC']],
    limit,
    offset,
  });

  return res.json({
    success: true,
    data: rows,
    total: count,
    page,
    pages: Math.ceil(count / limit),
  });
};

/**
 * PATCH /api/chat/messages/:id/read
 */
const markRead = async (req, res) => {
  const message = await Message.findByPk(req.params.id);
  if (!message) {
    return res.status(404).json({ success: false, error: 'Message not found' });
  }

  // Only the recipient can mark as read
  if (message.sender_id === req.user.id) {
    return res.status(400).json({ success: false, error: 'Cannot mark own message as read' });
  }

  await message.update({ read_at: new Date() });
  return res.json({ success: true, data: { read_at: message.read_at } });
};

module.exports = { listConversations, getMessages, markRead };
