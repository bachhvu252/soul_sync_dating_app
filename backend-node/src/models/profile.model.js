/**
 * src/models/profile.model.js
 *
 * Extended user profile — name, age, bio, location, preferences.
 * `preferences_json` stores matching preferences (age range, gender pref, max distance, interests).
 * `embedding_vector` stores a serialised float array from the AI service for cosine similarity matching.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Profile = sequelize.define('Profile', {
  user_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    references: { model: 'users', key: 'id' },
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  age: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 18, max: 100 },
  },
  gender: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  bio: {
    type: DataTypes.TEXT,
    defaultValue: '',
  },
  location: {
    type: DataTypes.STRING,
    defaultValue: '',
  },
  // JSON string: { ageMin, ageMax, genderPreference, maxDistanceKm, interests: [] }
  preferences_json: {
    type: DataTypes.TEXT,
    defaultValue: '{}',
    get() {
      const raw = this.getDataValue('preferences_json');
      try { return JSON.parse(raw); } catch { return {}; }
    },
    set(value) {
      this.setDataValue('preferences_json', JSON.stringify(value));
    },
  },
  // Serialised float array from sentence-transformers (stored as JSON string)
  embedding_vector: {
    type: DataTypes.TEXT,
    defaultValue: null,
    get() {
      const raw = this.getDataValue('embedding_vector');
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    },
    set(value) {
      this.setDataValue('embedding_vector', value ? JSON.stringify(value) : null);
    },
  },
}, {
  tableName: 'profiles',
});

module.exports = Profile;
