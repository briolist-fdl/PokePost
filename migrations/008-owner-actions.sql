ALTER TABLE poke_post_activations ADD COLUMN IF NOT EXISTS repost_requested BIGINT NOT NULL DEFAULT 0;
ALTER TABLE poke_post_activations ADD COLUMN IF NOT EXISTS repost_delivered BIGINT NOT NULL DEFAULT 0;
ALTER TABLE poke_post_delivery_attempts ADD COLUMN IF NOT EXISTS repost_generation BIGINT NOT NULL DEFAULT 0;
ALTER TABLE poke_post_delivery_attempts ADD COLUMN IF NOT EXISTS source_revision BIGINT;
ALTER TABLE poke_post_delivery_attempts ADD COLUMN IF NOT EXISTS source_publishing BOOLEAN;
