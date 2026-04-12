/**
 * src/models/match.model.js
 *
 * Created when two users mutually like each other.
 * `starters_json` holds AI-generated conversation starters (array of strings).
 * `is_active` is set to false when either user blocks the other.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Match = sequelize.define('Match', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user1_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  user2_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  // AI-generated openers — stored as a JSON array string
  starters_json: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get() {
      const raw = this.getDataValue('starters_json');
      try { return JSON.parse(raw); } catch { return []; }
    },
    set(value) {
      this.setDataValue('starters_json', JSON.stringify(value));
    },
  },
}, {
  tableName: 'matches',
  underscored: true,
  createdAt: 'matched_at',
  updatedAt: false,
  indexes: [
    { unique: true, fields: ['user1_id', 'user2_id'] },
  ],
});

module.exports = Match;
