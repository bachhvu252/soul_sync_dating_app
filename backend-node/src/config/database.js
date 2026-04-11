/**
 * src/config/database.js
 *
 * Sequelize instance configured for SQLite (local dev) or PostgreSQL (prod).
 * Switch by setting DATABASE_URL in .env.local:
 *   - SQLite  : sqlite:./soulsync.db
 *   - Postgres : postgresql://user:pass@host:5432/soulsync
 *
 * `initDB()` is called once at startup and syncs all models.
 */

const { Sequelize } = require('sequelize');
const path = require('path');

let sequelize;

const databaseUrl = process.env.DATABASE_URL || 'sqlite:./soulsync.db';

if (databaseUrl.startsWith('sqlite:')) {
  // Extract the file path after "sqlite:"
  const dbFile = databaseUrl.replace('sqlite:', '');
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.resolve(dbFile),
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
  });
} else {
  // PostgreSQL / other dialects
  sequelize = new Sequelize(databaseUrl, {
    logging: false,
  });
}

/**
 * Import all models (registers them on the Sequelize instance) and sync
 * the schema. Uses `alter: true` in development to keep columns in sync
 * without dropping data. Use migrations for production.
 */
async function initDB() {
  // Register models
  require('../models');

  try {
    await sequelize.authenticate();
    console.log('[DB] Connection established.');

    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    console.log('[DB] Schema synced.');
  } catch (err) {
    console.error('[DB] Unable to connect:', err);
    throw err;
  }
}

module.exports = { sequelize, initDB };
