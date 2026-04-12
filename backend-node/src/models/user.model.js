/**
 * src/models/user.model.js
 *
 * Core authentication record — aligned with schema.sql.
 * Sensitive fields (password_hash) are NEVER returned in API responses.
 * Use user.toSafeJSON() when serialising.
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
    type: DataTypes.STRING(320),
    allowNull: false,
    unique: true,
    validate: { isEmail: true },
  },
  password_hash: {
    type: DataTypes.TEXT,
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
  is_banned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  membership_tier: {
    type: DataTypes.ENUM('free', 'pro', 'premium'),
    defaultValue: 'free',
  },
  last_login_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'users',
  underscored: true,
  // createdAt / updatedAt are mapped to created_at / updated_at by underscored: true
});

/**
 * Return a safe representation of the user — strips password_hash.
 */
User.prototype.toSafeJSON = function () {
  const { password_hash, ...safe } = this.toJSON(); // eslint-disable-line no-unused-vars
  return safe;
};

module.exports = User;
