const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:12345678@localhost:5433/soulsync' });
client.connect().then(async () => {
    try {
        await client.query("ALTER TABLE profiles ADD COLUMN prompts_json JSONB DEFAULT '[]'::jsonb");
        await client.query("ALTER TABLE profiles ADD COLUMN personal_details_json JSONB DEFAULT '{}'::jsonb");
        console.log('Columns added successfully');
    } catch (e) {
        if (e.code === '42701') console.log('Columns already exist');
        else console.error('Migration failed:', e);
    }
    
    try {
        await client.query('DROP VIEW IF EXISTS v_user_cards;');
        await client.query(`
CREATE OR REPLACE VIEW v_user_cards AS
SELECT
    u.id, u.email, u.membership_tier, u.is_active, p.first_name, p.last_name,
    date_part('year', age(p.date_of_birth))::int as age,
    p.gender, p.bio, p.location, p.latitude, p.longitude, p.interest_tags,
    p.preferences_json, p.prompts_json, p.personal_details_json, p.last_active_at,
    ph.url AS primary_photo_url, ph.thumbnail_url AS primary_photo_thumbnail
FROM users u
JOIN profiles p ON p.user_id = u.id
LEFT JOIN photos ph ON ph.user_id = u.id AND ph.is_primary = TRUE
WHERE u.is_active = TRUE AND u.is_banned = FALSE;
        `);
        console.log('View updated');
    } catch(e) { console.error('View update failed:', e); }

    await client.end();
});
