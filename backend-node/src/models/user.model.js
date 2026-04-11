/**
 * src/models/user.model.js
 *
 * Core authentication record.
 * Sensitive fields (password_hash) are NEVER included in API responses —
 * use `user.toSafeJSON()` or manually omit when serialising.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: { isEmail: true },
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  is_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  // Swipe restriction flag — auto-set when user accumulates 3+ pending reports
  swipe_restricted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'users',
  // Sequelize adds createdAt / updatedAt automatically
});

/**
 * Return a safe representation of the user — no password_hash.
 */
User.prototype.toSafeJSON = function () {
  const { password_hash, ...safe } = this.toJSON(); // eslint-disable-line no-unused-vars
  return safe;
};

module.exports = User;
