-- Apply after 001. Local region is independent of a separate local feed.
ALTER TABLE poke_post_guilds ALTER COLUMN local_channel_id DROP NOT NULL;
