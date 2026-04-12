/**
 * src/models/message.model.js
 *
 * Individual chat message.
 * `sentiment_score` is populated asynchronously by the FastAPI AI service
 * after the message is saved — it is NEVER exposed in API responses to users.
 * `read_at` is set when the recipient acknowledges reading the message.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  conversation_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'conversations', key: 'id' },
  },
  sender_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  content: {
    type: DataTypes.TEXT,
    defaultValue: '',
  },
  media_url: {
    type: DataTypes.STRING,
    defaultValue: null,
  },
  message_type: {
    type: DataTypes.ENUM('text', 'image', 'emoji', 'starter'),
    defaultValue: 'text',
  },
  // Populated async by AI service; not exposed to end users
  sentiment_score: {
    type: DataTypes.FLOAT,
    defaultValue: null,
  },
  read_at: {
    type: DataTypes.DATE,
    defaultValue: null,
  },
}, {
  tableName: 'messages',
  underscored: true,
  createdAt: 'sent_at',
  updatedAt: false,
});

module.exports = Message;
