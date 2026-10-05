-- Phase 1 channels only. This migration creates no recipients, messages or jobs.
CREATE TABLE airmech.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES airmech.users(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('in_app', 'email')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  message text NOT NULL CHECK (length(btrim(message)) BETWEEN 1 AND 4000),
  entity_type text CHECK (entity_type ~ '^[a-z][a-z0-9_]{0,63}$'),
  entity_id uuid,
  deduplication_key text CHECK (deduplication_key ~ '^[a-f0-9]{64}$'),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient_id, channel, deduplication_key),
  CHECK ((entity_type IS NULL) = (entity_id IS NULL)),
  CHECK (read_at IS NULL OR read_at >= created_at)
);
CREATE INDEX notifications_recipient_page ON airmech.notifications
  (recipient_id, channel, created_at DESC, id DESC);
CREATE INDEX notifications_unread_page ON airmech.notifications
  (recipient_id, created_at DESC, id DESC) WHERE channel = 'in_app' AND read_at IS NULL;
ALTER TABLE airmech.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON airmech.notifications FROM PUBLIC;
