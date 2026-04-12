-- ============================================================
-- SoulSync Migration Script: User Prompts & Details
-- Run this on your live database to safely upgrade the schema
-- ============================================================

-- 1. Add new JSONB columns for dynamic Prompts and Personal Details
-- We use IF NOT EXISTS just to be safe if it's already run partially.
-- Note: 'IF NOT EXISTS' for columns is available in PostgreSQL 9.6+
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS prompts_json JSONB DEFAULT '[]';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS personal_details_json JSONB DEFAULT '{}';

-- 2. Drop the existing view since we are adding columns to the SELECT query.
-- PostgreSQL requires views to be dropped before column list expansions.
DROP VIEW IF EXISTS v_user_cards;

-- 3. Recreate the view including the new JSONB columns
CREATE OR REPLACE VIEW v_user_cards AS
SELECT
    u.id, 
    u.email, 
    u.membership_tier, 
    u.is_active, 
    p.first_name, 
    p.last_name,
    date_part('year', age(p.date_of_birth))::int as age,
    p.gender, 
    p.bio, 
    p.location, 
    p.latitude, 
    p.longitude, 
    p.interest_tags,
    p.preferences_json, 
    
    -- NEW COLUMNS
    p.prompts_json, 
    p.personal_details_json, 
    
    p.last_active_at,
    ph.url            AS primary_photo_url,
    ph.thumbnail_url  AS primary_photo_thumbnail
FROM users u
JOIN profiles p      ON p.user_id     = u.id
LEFT JOIN photos ph  ON ph.user_id    = u.id
                     AND ph.is_primary = TRUE
WHERE u.is_active = TRUE
  AND u.is_banned  = FALSE;

-- ============================================================
-- END MIGRATION
-- ============================================================
