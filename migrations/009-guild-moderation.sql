ALTER TABLE poke_post_delivery_attempts ADD COLUMN IF NOT EXISTS source_region TEXT;
CREATE TABLE IF NOT EXISTS poke_post_moderation_audit (
 id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, moderator_id TEXT NOT NULL,
 discord_user_id TEXT NOT NULL, interaction_id TEXT NOT NULL UNIQUE,
 action TEXT NOT NULL, details JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
