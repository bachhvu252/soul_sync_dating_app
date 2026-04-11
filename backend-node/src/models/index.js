/**
 * src/models/index.js
 *
 * Re-exports all Sequelize models and sets up their associations.
 * Import this file once (in database.js) to register everything.
 */

const User = require('./user.model');
const Profile = require('./profile.model');
const Photo = require('./photo.model');
const Swipe = require('./swipe.model');
const Match = require('./match.model');
const Conversation = require('./conversation.model');
const Message = require('./message.model');
const Report = require('./report.model');
const Block = require('./block.model');

// ── User ←→ Profile (1:1) ──────────────────────────────────────
User.hasOne(Profile, { foreignKey: 'user_id', as: 'profile', onDelete: 'CASCADE' });
Profile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ── User ←→ Photos (1:N) ──────────────────────────────────────
User.hasMany(Photo, { foreignKey: 'user_id', as: 'photos', onDelete: 'CASCADE' });
Photo.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ── Swipes ────────────────────────────────────────────────────
User.hasMany(Swipe, { foreignKey: 'swiper_id', as: 'givenSwipes', onDelete: 'CASCADE' });
User.hasMany(Swipe, { foreignKey: 'swiped_id', as: 'receivedSwipes', onDelete: 'CASCADE' });
Swipe.belongsTo(User, { foreignKey: 'swiper_id', as: 'swiper' });
Swipe.belongsTo(User, { foreignKey: 'swiped_id', as: 'swiped' });

// ── Matches ───────────────────────────────────────────────────
User.hasMany(Match, { foreignKey: 'user1_id', as: 'matchesAsUser1', onDelete: 'CASCADE' });
User.hasMany(Match, { foreignKey: 'user2_id', as: 'matchesAsUser2', onDelete: 'CASCADE' });
Match.belongsTo(User, { foreignKey: 'user1_id', as: 'user1' });
Match.belongsTo(User, { foreignKey: 'user2_id', as: 'user2' });

// ── Match ←→ Conversation (1:1) ───────────────────────────────
Match.hasOne(Conversation, { foreignKey: 'match_id', as: 'conversation', onDelete: 'CASCADE' });
Conversation.belongsTo(Match, { foreignKey: 'match_id', as: 'match' });

// ── Conversation ←→ Messages (1:N) ────────────────────────────
Conversation.hasMany(Message, { foreignKey: 'conversation_id', as: 'messages', onDelete: 'CASCADE' });
Message.belongsTo(Conversation, { foreignKey: 'conversation_id', as: 'conversation' });

// ── Message sender ────────────────────────────────────────────
User.hasMany(Message, { foreignKey: 'sender_id', as: 'sentMessages', onDelete: 'CASCADE' });
Message.belongsTo(User, { foreignKey: 'sender_id', as: 'sender' });

// ── Reports ───────────────────────────────────────────────────
User.hasMany(Report, { foreignKey: 'reporter_id', as: 'filedReports', onDelete: 'CASCADE' });
User.hasMany(Report, { foreignKey: 'reported_id', as: 'receivedReports', onDelete: 'CASCADE' });
Report.belongsTo(User, { foreignKey: 'reporter_id', as: 'reporter' });
Report.belongsTo(User, { foreignKey: 'reported_id', as: 'reported' });

// ── Blocks ────────────────────────────────────────────────────
User.hasMany(Block, { foreignKey: 'blocker_id', as: 'givenBlocks', onDelete: 'CASCADE' });
User.hasMany(Block, { foreignKey: 'blocked_id', as: 'receivedBlocks', onDelete: 'CASCADE' });
Block.belongsTo(User, { foreignKey: 'blocker_id', as: 'blocker' });
Block.belongsTo(User, { foreignKey: 'blocked_id', as: 'blocked' });

module.exports = { User, Profile, Photo, Swipe, Match, Conversation, Message, Report, Block };
