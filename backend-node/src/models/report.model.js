/**
 * src/models/report.model.js
 *
 * User safety reports.
 * Auto-restriction logic: when a user accumulates 3+ pending reports,
 * the matching service sets `users.swipe_restricted = true`.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const REPORT_REASONS = [
  'inappropriate_photo',
  'harassment',
  'spam',
  'fake_profile',
  'other',
];

const Report = sequelize.define('Report', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  reporter_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  reported_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  reason: {
    type: DataTypes.ENUM(...REPORT_REASONS),
    allowNull: false,
  },
  details: {
    type: DataTypes.TEXT,
    defaultValue: '',
  },
  status: {
    type: DataTypes.ENUM('pending', 'reviewed', 'dismissed', 'actioned'),
    defaultValue: 'pending',
  },
}, {
  tableName: 'reports',
  underscored: true,
});

module.exports = Report;
module.exports.REPORT_REASONS = REPORT_REASONS;
