/**
 * src/models/conversation.model.js
 *
 * One conversation per match. Created automatically when a match is formed.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Conversation = sequelize.define('Conversation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  match_id: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    references: { model: 'matches', key: 'id' },
  },
}, {
  tableName: 'conversations',
  updatedAt: false,
});

module.exports = Conversation;
