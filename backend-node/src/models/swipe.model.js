/**
 * src/models/swipe.model.js
 *
 * Tracks every swipe action — like or dislike.
 * Unique constraint on (swiper_id, swiped_id) prevents duplicate swipes.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Swipe = sequelize.define('Swipe', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  swiper_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  swiped_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  direction: {
    type: DataTypes.ENUM('like', 'dislike'),
    allowNull: false,
  },
}, {
  tableName: 'swipes',
  underscored: true,
  updatedAt: false,
  indexes: [
    { unique: true, fields: ['swiper_id', 'swiped_id'] },
  ],
});

module.exports = Swipe;
