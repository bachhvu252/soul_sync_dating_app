-- ============================================================
-- SoulSync Dating App — PostgreSQL Schema
-- ============================================================
-- Run this script against a blank "soulsync" database:
--   psql -U <user> -d soulsync -f schema.sql
--
-- Prerequisites:
--   CREATE DATABASE soulsync;
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- pgp_sym_encrypt (optional)
CREATE EXTENSION IF NOT EXISTS "vector";         -- pgvector embeddings (install separately if needed)
-- NOTE: pgvector requires: https://github.com/pgvector/pgvector
-- If not installed, replace the `embedding_vector` column with TEXT.

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE swipe_direction AS ENUM ('like', 'dislike');
CREATE TYPE message_type AS ENUM ('text', 'image', 'emoji', 'starter');
CREATE TYPE report_reason AS ENUM (
    'inappropriate_photo',
    'harassment',
    'spam',
    'fake_profile',
    'other'
);
CREATE TYPE report_status AS ENUM ('pending', 'reviewed', 'resolved', 'dismissed');
CREATE TYPE membership_tier AS ENUM ('free', 'pro', 'premium');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'non_binary', 'prefer_not_to_say', 'other');

-- ============================================================
-- TABLE: users
-- Core authentication record. Minimal PII — profile details
-- live in the `profiles` table.
-- ============================================================
CREATE TABLE users (
    id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    email            VARCHAR(320) NOT NULL UNIQUE,
    password_hash    TEXT         NOT NULL,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    is_verified      BOOLEAN      NOT NULL DEFAULT FALSE,
    is_banned        BOOLEAN      NOT NULL DEFAULT FALSE,
    membership_tier  membership_tier NOT NULL DEFAULT 'free',
    last_login_at    TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for fast login lookup
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_created_at ON users (created_at DESC);

-- ============================================================
-- TABLE: profiles
-- Extended user data for matching & display. 1-to-1 with users.
-- ============================================================
CREATE TABLE profiles (
    user_id          UUID         PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    first_name       VARCHAR(100) NOT NULL,
    last_name        VARCHAR(100),
    date_of_birth    DATE,
    age              INT GENERATED ALWAYS AS (
                         DATE_PART('year', AGE(date_of_birth))::INT
                     ) STORED,
    gender           gender_type,
    bio              TEXT         DEFAULT '',
    location         VARCHAR(255) DEFAULT '',
    latitude         DECIMAL(9, 6),
    longitude        DECIMAL(9, 6),

    -- JSON blob for flexible preferences:
    -- { "min_age": 22, "max_age": 35, "max_distance_km": 50,
    --   "genders": ["female"], "interests": ["travel","music"] }
    preferences_json JSONB        DEFAULT '{}',

    -- Interests / tags for quick overlap scoring (denormalized for query speed)
    interest_tags    TEXT[]       DEFAULT '{}',

    -- pgvector column for bio embedding (384 dims for all-MiniLM-L6-v2)
    embedding_vector vector(384),

    -- Social/activity metrics
    profile_views    INT          NOT NULL DEFAULT 0,
    last_active_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_location ON profiles (latitude, longitude);
CREATE INDEX idx_profiles_embedding ON profiles USING ivfflat (embedding_vector vector_cosine_ops)
    WITH (lists = 100);   -- Approximate nearest-neighbor index
CREATE INDEX idx_profiles_last_active ON profiles (last_active_at DESC);
CREATE INDEX idx_profiles_interest_tags ON profiles USING GIN (interest_tags);

-- ============================================================
-- TABLE: photos
-- Profile photos. Multiple per user, one marked primary.
-- ============================================================
CREATE TABLE photos (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url           TEXT         NOT NULL,
    thumbnail_url TEXT,
    is_primary    BOOLEAN      NOT NULL DEFAULT FALSE,
    order_index   SMALLINT     NOT NULL DEFAULT 0,
    uploaded_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Enforce one primary photo per user at DB level
CREATE UNIQUE INDEX idx_photos_primary_per_user
    ON photos (user_id)
    WHERE is_primary = TRUE;

CREATE INDEX idx_photos_user ON photos (user_id, order_index);

-- ============================================================
-- TABLE: swipes
-- Captures every like/dislike interaction.
-- ============================================================
CREATE TABLE swipes (
    id           UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    swiper_id    UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    swiped_id    UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    direction    swipe_direction NOT NULL,
    created_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- A user can only swipe another user once
    CONSTRAINT uq_swipe UNIQUE (swiper_id, swiped_id),
    CONSTRAINT no_self_swipe CHECK (swiper_id <> swiped_id)
);

CREATE INDEX idx_swipes_swiper    ON swipes (swiper_id, created_at DESC);
CREATE INDEX idx_swipes_swiped    ON swipes (swiped_id);
CREATE INDEX idx_swipes_direction ON swipes (swiped_id, direction)
    WHERE direction = 'like';   -- Partial index for mutual-match lookups

-- ============================================================
-- TABLE: matches
-- Created when two users mutually like each other.
-- ============================================================
CREATE TABLE matches (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user1_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    starters_json   JSONB       DEFAULT '[]',  -- AI-generated conversation starters
    compatibility_score DECIMAL(4, 3),         -- 0.000 – 1.000
    matched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Enforce user1_id < user2_id to prevent duplicate (A,B) / (B,A) rows
    CONSTRAINT uq_match          UNIQUE (user1_id, user2_id),
    CONSTRAINT no_self_match     CHECK  (user1_id <> user2_id),
    CONSTRAINT ordered_match_ids CHECK  (user1_id < user2_id)
);

CREATE INDEX idx_matches_user1 ON matches (user1_id, is_active);
CREATE INDEX idx_matches_user2 ON matches (user2_id, is_active);
CREATE INDEX idx_matches_matched_at ON matches (matched_at DESC);

-- ============================================================
-- TABLE: conversations
-- 1-to-1 mapping with a match. Created on match creation.
-- ============================================================
CREATE TABLE conversations (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id   UUID        NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_match ON conversations (match_id);

-- ============================================================
-- TABLE: messages
-- Chat messages within a conversation.
-- ============================================================
CREATE TABLE messages (
    id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id  UUID         NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content          TEXT,
    media_url        TEXT,
    message_type     message_type NOT NULL DEFAULT 'text',

    -- Sentiment: -1.0 (very negative) to +1.0 (very positive)
    -- Populated asynchronously by the FastAPI AI service
    sentiment_score  DECIMAL(4, 3),
    is_flagged       BOOLEAN      NOT NULL DEFAULT FALSE,

    sent_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    read_at          TIMESTAMPTZ,

    CONSTRAINT message_has_content CHECK (
        content IS NOT NULL OR media_url IS NOT NULL
    )
);

CREATE INDEX idx_messages_conversation ON messages (conversation_id, sent_at DESC);
CREATE INDEX idx_messages_sender       ON messages (sender_id);
CREATE INDEX idx_messages_unread       ON messages (conversation_id, read_at)
    WHERE read_at IS NULL;
CREATE INDEX idx_messages_flagged      ON messages (is_flagged)
    WHERE is_flagged = TRUE;

-- ============================================================
-- TABLE: reports
-- User safety reports.
-- ============================================================
CREATE TABLE reports (
    id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id  UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_id  UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason       report_reason NOT NULL,
    details      TEXT,
    status       report_status NOT NULL DEFAULT 'pending',
    reviewed_by  UUID          REFERENCES users(id),  -- admin user
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT no_self_report CHECK (reporter_id <> reported_id)
);

CREATE INDEX idx_reports_reported ON reports (reported_id, status);
CREATE INDEX idx_reports_reporter ON reports (reporter_id);
CREATE INDEX idx_reports_status   ON reports (status, created_at DESC);

-- ============================================================
-- TABLE: blocks
-- User blocks. One-way but mutual in discovery effect.
-- ============================================================
CREATE TABLE blocks (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_block       UNIQUE (blocker_id, blocked_id),
    CONSTRAINT no_self_block  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX idx_blocks_blocker ON blocks (blocker_id);
CREATE INDEX idx_blocks_blocked ON blocks (blocked_id);

-- ============================================================
-- TABLE: refresh_tokens
-- Server-side refresh token store (alternative to Redis for
-- simpler setups). The Node.js service uses this to rotate
-- tokens and invalidate on logout.
-- ============================================================
CREATE TABLE refresh_tokens (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,  -- SHA-256 of the actual token
    expires_at  TIMESTAMPTZ NOT NULL,
    is_revoked  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tokens_user    ON refresh_tokens (user_id);
CREATE INDEX idx_tokens_hash    ON refresh_tokens (token_hash);
CREATE INDEX idx_tokens_expiry  ON refresh_tokens (expires_at)
    WHERE is_revoked = FALSE;

-- ============================================================
-- TRIGGERS — auto-update `updated_at` columns
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- VIEWS — common queries pre-packaged as views
-- ============================================================

-- Full user card (join users + profiles + primary photo)
CREATE OR REPLACE VIEW v_user_cards AS
SELECT
    u.id,
    u.email,
    u.membership_tier,
    u.is_active,
    p.first_name,
    p.last_name,
    p.age,
    p.gender,
    p.bio,
    p.location,
    p.latitude,
    p.longitude,
    p.interest_tags,
    p.preferences_json,
    p.last_active_at,
    ph.url            AS primary_photo_url,
    ph.thumbnail_url  AS primary_photo_thumbnail
FROM users u
JOIN profiles p      ON p.user_id     = u.id
LEFT JOIN photos ph  ON ph.user_id    = u.id
                     AND ph.is_primary = TRUE
WHERE u.is_active = TRUE
  AND u.is_banned  = FALSE;

-- Active matches with conversation id
CREATE OR REPLACE VIEW v_active_matches AS
SELECT
    m.id            AS match_id,
    m.user1_id,
    m.user2_id,
    m.matched_at,
    m.compatibility_score,
    m.starters_json,
    c.id            AS conversation_id
FROM matches m
JOIN conversations c ON c.match_id = m.id
WHERE m.is_active = TRUE;

-- ============================================================
-- SEED DATA (optional — for local development)
-- Uncomment to insert two demo user accounts.
-- Passwords below are bcrypt hashes of "Password123!"
-- ============================================================
/*
INSERT INTO users (id, email, password_hash, is_verified, membership_tier)
VALUES
    ('00000000-0000-0000-0000-000000000001',
     'demo1@soulsync.app',
     '$2b$12$KIXOhP3a3B7g/mL8DpDl2OdqFWB1D9UchD6H5B2lIGLLj0P3j9PGi',
     TRUE, 'pro'),
    ('00000000-0000-0000-0000-000000000002',
     'demo2@soulsync.app',
     '$2b$12$KIXOhP3a3B7g/mL8DpDl2OdqFWB1D9UchD6H5B2lIGLLj0P3j9PGi',
     TRUE, 'free');

INSERT INTO profiles (user_id, first_name, last_name, date_of_birth, gender, bio, location, interest_tags)
VALUES
    ('00000000-0000-0000-0000-000000000001',
     'Ha Chi', 'Phuong', '1998-04-11', 'female',
     'Coffee lover, sunset chaser. Looking for someone to explore Hanoi with 🌸',
     'Hanoi, Vietnam', ARRAY['travel','coffee','photography','music']),
    ('00000000-0000-0000-0000-000000000002',
     'Long', 'Trinh', '1995-08-22', 'male',
     'Adventure seeker and home cook. Let''s find our vibe together!',
     'Hanoi, Vietnam', ARRAY['cooking','hiking','travel','film']);
*/

-- ============================================================
-- END OF SCHEMA
-- ============================================================
