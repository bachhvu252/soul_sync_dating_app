/**
 * src/models/block.model.js
 *
 * One-way block records. Enforced at the DB query level in candidate queries
 * using subselects — not filtered in application code to avoid edge cases.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Block = sequelize.define('Block', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  blocker_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  blocked_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
}, {
  tableName: 'blocks',
  underscored: true,
  updatedAt: false,
  indexes: [
    { unique: true, fields: ['blocker_id', 'blocked_id'] },
  ],
});

module.exports = Block;
