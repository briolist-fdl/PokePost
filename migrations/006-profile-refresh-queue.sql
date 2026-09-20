-- Explicit preparatory migration after 001 through 005.
CREATE TABLE IF NOT EXISTS poke_post_refresh_queue (
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  generation BIGINT NOT NULL DEFAULT 1,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(guild_id,discord_user_id),
  FOREIGN KEY(guild_id,discord_user_id)
    REFERENCES poke_post_activations(guild_id,discord_user_id) ON DELETE CASCADE
);
