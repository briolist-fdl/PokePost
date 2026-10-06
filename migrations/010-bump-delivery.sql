-- Apply explicitly to the multi-server database before using bump delivery.
ALTER TABLE poke_post_delivery_attempts ADD COLUMN IF NOT EXISTS auto_bump BOOLEAN NOT NULL DEFAULT FALSE;
