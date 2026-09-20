-- Explicit migration after 001 through 006. No automatic production migration.
CREATE TABLE IF NOT EXISTS poke_post_delivery_attempts (
 guild_id TEXT NOT NULL, discord_user_id TEXT NOT NULL,
 source_channel_id TEXT, source_message_id TEXT, target_channel_id TEXT NOT NULL,
 nonce TEXT NOT NULL, payload JSONB NOT NULL, attempted_at TIMESTAMPTZ,
 recovery_checked_at TIMESTAMPTZ, delivered_message_id TEXT, PRIMARY KEY(guild_id,discord_user_id)
);
CREATE TABLE IF NOT EXISTS poke_post_post_cleanup (
 guild_id TEXT NOT NULL, discord_user_id TEXT NOT NULL, channel_id TEXT NOT NULL,
 message_id TEXT NOT NULL, queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(guild_id,channel_id,message_id)
);
-- Same shape as the currently deployed thread router. Existing references remain.
CREATE TABLE IF NOT EXISTS poke_post_thread_posts (
 guild_id TEXT NOT NULL, discord_user_id TEXT NOT NULL, thread_id TEXT NOT NULL,
 message_id TEXT, content_hash TEXT, delivery_nonce TEXT NOT NULL,
 attempted_at TIMESTAMPTZ, checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(guild_id,discord_user_id)
);
