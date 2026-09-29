ALTER TABLE poke_post_guilds ADD COLUMN IF NOT EXISTS main_bump_interval_minutes INTEGER NOT NULL DEFAULT 240 CHECK(main_bump_interval_minutes BETWEEN 30 AND 10080);
ALTER TABLE poke_post_guilds ADD COLUMN IF NOT EXISTS local_bump_interval_minutes INTEGER NOT NULL DEFAULT 480 CHECK(local_bump_interval_minutes BETWEEN 30 AND 10080);
ALTER TABLE poke_post_guilds ADD COLUMN IF NOT EXISTS main_bump_cooldown_days INTEGER NOT NULL DEFAULT 3 CHECK(main_bump_cooldown_days BETWEEN 0 AND 365);
ALTER TABLE poke_post_guilds ADD COLUMN IF NOT EXISTS local_bump_cooldown_days INTEGER NOT NULL DEFAULT 5 CHECK(local_bump_cooldown_days BETWEEN 0 AND 365);
CREATE TABLE IF NOT EXISTS poke_post_guild_bump_schedule (
 guild_id TEXT NOT NULL REFERENCES poke_post_guilds(guild_id) ON DELETE CASCADE,
 feed TEXT NOT NULL CHECK(feed IN ('main','local')), channel_id TEXT NOT NULL,
 interval_minutes INTEGER NOT NULL CHECK(interval_minutes BETWEEN 30 AND 10080),
 cooldown_days INTEGER NOT NULL CHECK(cooldown_days BETWEEN 0 AND 365),
 next_run_at TIMESTAMPTZ NOT NULL, last_attempt_at TIMESTAMPTZ, last_success_at TIMESTAMPTZ,
 PRIMARY KEY(guild_id,feed)
);
