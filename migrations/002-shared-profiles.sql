-- Preparatory only; execute explicitly after 001-guild-settings.sql.
CREATE TABLE IF NOT EXISTS poke_post_profiles (
  discord_user_id TEXT PRIMARY KEY,
  pokemon_username TEXT NOT NULL,
  trainer_code_raw TEXT NOT NULL,
  additional_codes TEXT[] NOT NULL DEFAULT '{}',
  campfire_username TEXT,
  vivillon_pattern TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS poke_post_activations (
  guild_id TEXT NOT NULL REFERENCES poke_post_guilds(guild_id),
  discord_user_id TEXT NOT NULL REFERENCES poke_post_profiles(discord_user_id),
  active BOOLEAN NOT NULL DEFAULT FALSE,
  publish_to_followers BOOLEAN NOT NULL DEFAULT FALSE,
  region_override TEXT,
  public_channel_id TEXT NOT NULL,
  public_message_id TEXT,
  last_bumped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, discord_user_id),
  CHECK (active OR public_message_id IS NULL)
);
CREATE INDEX IF NOT EXISTS poke_post_activation_bump_idx
  ON poke_post_activations(guild_id, public_channel_id, last_bumped_at)
  WHERE active AND public_message_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS poke_post_imports (
  import_key TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES poke_post_guilds(guild_id),
  imported_count INTEGER NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
