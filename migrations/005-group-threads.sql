-- Preparatory schema. Apply explicitly after 001 and 004.
CREATE TABLE IF NOT EXISTS poke_post_group_threads (
  guild_id TEXT NOT NULL REFERENCES poke_post_guilds(guild_id),
  group_key TEXT NOT NULL CHECK (group_key IN ('blizzard','bloom','crossroads','horizons','waves','wetlands')),
  thread_id TEXT NOT NULL,
  PRIMARY KEY(guild_id,group_key),
  UNIQUE(guild_id,thread_id)
);
