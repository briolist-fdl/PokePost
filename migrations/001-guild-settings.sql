-- Explicit preparatory migration. Does not modify or copy friendcode_profiles.
CREATE TABLE IF NOT EXISTS poke_post_guilds (
  guild_id TEXT PRIMARY KEY,
  local_channel_id TEXT NOT NULL,
  international_channel_id TEXT NOT NULL,
  local_pattern TEXT NOT NULL DEFAULT 'tundra',
  moderate_channels BOOLEAN NOT NULL DEFAULT FALSE,
  bump_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (local_channel_id <> international_channel_id)
);
