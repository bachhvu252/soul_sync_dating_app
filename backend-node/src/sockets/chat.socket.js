/**
 * src/sockets/chat.socket.js
 *
 * Socket.IO chat event handlers.
 *
 * Events:
 *  chat:join        — join a conversation room
 *  chat:message     — send a new message (saves to DB, broadcasts, async sentiment)
 *  chat:typing      — typing indicator (debounced by client; stop after 3s inactivity)
 *  chat:read        — mark a message as read
 *
 * Sentiment analysis is fire-and-forget — errors never break the message flow.
 * Scores are stored in `messages.sentiment_score` and NOT exposed to users.
 */

const axios = require('axios');
const { Conversation, Match, Message } = require('../models');

const FASTAPI_BASE = process.env.FASTAPI_BASE_URL || 'http://localhost:8001';
const SENTIMENT_THRESHOLD = -0.7; // Messages below this are auto-flagged

/**
 * Fire-and-forget: call FastAPI sentiment endpoint then update the message row.
 */
async function analyzeSentiment(messageId, content) {
  try {
    const response = await axios.post(
      `${FASTAPI_BASE}/ai/sentiment`,
      { text: content },
      { timeout: 3000, headers: { 'X-Internal-Secret': process.env.INTERNAL_API_SECRET } },
    );

    const score = response.data?.score ?? null;
    if (score !== null) {
      await Message.update({ sentiment_score: score }, { where: { id: messageId } });

      if (score < SENTIMENT_THRESHOLD) {
        console.warn(`[Sentiment] Message ${messageId} flagged for review (score: ${score})`);
        // TODO: integrate with moderation queue
      }
    }
  } catch (err) {
    console.error('[Sentiment] Analysis failed:', err.message);
  }
}

/**
 * Verify the socket's user is a participant in the given conversation.
 * Returns the Conversation or null.
 */
async function getAuthorizedConversation(conversationId, userId) {
  const conversation = await Conversation.findByPk(conversationId, {
    include: [{ model: Match, as: 'match' }],
  });

  if (!conversation || !conversation.match?.is_active) return null;
  const { user1_id, user2_id } = conversation.match;
  if (userId !== user1_id && userId !== user2_id) return null;

  return conversation;
}

function registerChatHandlers(io, socket) {
  const userId = socket.userId;

  /**
   * chat:join — subscribe to a conversation room
   */
  socket.on('chat:join', async ({ conversationId }) => {
    const conversation = await getAuthorizedConversation(conversationId, userId);
    if (!conversation) {
      return socket.emit('error', { message: 'Not authorised to join this conversation' });
    }
    socket.join(conversationId);
    socket.emit('chat:joined', { conversationId });
  });

  /**
   * chat:message — persist and broadcast a new message
   */
  socket.on('chat:message', async (data) => {
    const { conversationId, content, type = 'text' } = data;

    const conversation = await getAuthorizedConversation(conversationId, userId);
    if (!conversation) {
      return socket.emit('error', { message: 'Conversation not found or not authorised' });
    }

    // Validate message type
    const VALID_TYPES = ['text', 'image', 'emoji', 'starter'];
    if (!VALID_TYPES.includes(type)) {
      return socket.emit('error', { message: 'Invalid message type' });
    }

    const message = await Message.create({
      conversation_id: conversationId,
      sender_id: userId,
      content: content || '',
      media_url: data.mediaUrl || null,
      message_type: type,
    });

    // Broadcast to everyone in the room (including sender for confirmation)
    io.to(conversationId).emit('chat:message:new', {
      id: message.id,
      conversationId,
      senderId: userId,
      content: message.content,
      mediaUrl: message.media_url,
      messageType: message.message_type,
      sentAt: message.sent_at,
    });

    // Fire-and-forget sentiment analysis for text messages
    if (type === 'text' && content?.trim()) {
      analyzeSentiment(message.id, content).catch(console.error);
    }
  });

  /**
   * chat:typing — broadcast typing indicator to the other participant
   */
  socket.on('chat:typing', ({ conversationId, isTyping }) => {
    socket.to(conversationId).emit('chat:typing', { userId, isTyping });
  });

  /**
   * chat:read — mark a message as read and notify sender
   */
  socket.on('chat:read', async ({ messageId }) => {
    const message = await Message.findByPk(messageId);
    if (!message || message.sender_id === userId) return;

    await message.update({ read_at: new Date() });

    // Notify the sender their message was read
    io.to(message.sender_id).emit('chat:read', { messageId, readAt: message.read_at });
  });
}

module.exports = { registerChatHandlers };
