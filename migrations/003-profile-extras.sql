-- Explicit preparatory migration after 001 and 002. Not run by the live bot.
ALTER TABLE poke_post_profiles
  ADD COLUMN IF NOT EXISTS personal_message TEXT CHECK (char_length(personal_message) <= 160),
  ADD COLUMN IF NOT EXISTS wanted_regions TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE poke_post_guilds
  ADD COLUMN IF NOT EXISTS show_personal_message BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS show_wanted_regions BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE poke_post_activations
  ADD COLUMN IF NOT EXISTS personal_message_hidden BOOLEAN NOT NULL DEFAULT FALSE;
