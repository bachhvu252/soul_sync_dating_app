/**
 * src/models/profile.model.js
 *
 * Extended user profile — aligned with schema.sql.
 * Uses first_name + last_name + date_of_birth (age is computed in the DB view).
 * interest_tags is a PostgreSQL TEXT[] array.
 * preferences_json is stored as JSONB in Postgres.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Profile = sequelize.define('Profile', {
  user_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    references: { model: 'users', key: 'id' },
  },
  first_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  last_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  date_of_birth: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  gender: {
    type: DataTypes.ENUM('male', 'female', 'non_binary', 'prefer_not_to_say', 'other'),
    allowNull: true,
  },
  bio: {
    type: DataTypes.TEXT,
    defaultValue: '',
  },
  location: {
    type: DataTypes.STRING(255),
    defaultValue: '',
  },
  latitude: {
    type: DataTypes.DECIMAL(9, 6),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.DECIMAL(9, 6),
    allowNull: true,
  },
  // Matching preferences: { min_age, max_age, max_distance_km, genders, interests }
  preferences_json: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
  // Profile Prompts: [{label: "...", text: "..."}]
  prompts_json: {
    type: DataTypes.JSONB,
    defaultValue: [],
  },
  // Personal Details: { height, education, drinking, pets, occupation, company }
  personal_details_json: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
  // Quick-access interest tags (denormalized from preferences_json)
  interest_tags: {
    type: DataTypes.ARRAY(DataTypes.TEXT),
    defaultValue: [],
  },
  // pgvector embedding — stored as TEXT; node-postgres returns it as a string
  // when pgvector extension is active. Skip if not installed.
  embedding_vector: {
    type: DataTypes.TEXT,
    defaultValue: null,
  },
  profile_views: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  last_active_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'profiles',
  underscored: true,
});

module.exports = Profile;
