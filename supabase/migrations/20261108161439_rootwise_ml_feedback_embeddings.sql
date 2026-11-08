-- RootWise ML private data schema and persistent vector/feedback storage.
CREATE SCHEMA IF NOT EXISTS rootwise_ml;

CREATE TABLE IF NOT EXISTS rootwise_ml.feedback_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id TEXT NOT NULL,
    image_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('confirm', 'correct', 'reject')),
    actor TEXT NOT NULL,
    correct_label TEXT,
    comment TEXT,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_events_event_id_idx ON rootwise_ml.feedback_events (event_id);
CREATE INDEX IF NOT EXISTS feedback_events_image_id_idx ON rootwise_ml.feedback_events (image_id);
CREATE INDEX IF NOT EXISTS feedback_events_received_at_idx ON rootwise_ml.feedback_events (received_at DESC);

REVOKE ALL ON SCHEMA rootwise_ml FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA rootwise_ml FROM PUBLIC, anon, authenticated;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
SET search_path TO public, extensions;

CREATE TABLE IF NOT EXISTS rootwise_ml.image_embeddings (
    image_id TEXT PRIMARY KEY,
    embedding vector NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS image_embeddings_created_at_idx ON rootwise_ml.image_embeddings (created_at DESC);
REVOKE ALL ON rootwise_ml.image_embeddings FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    CREATE ROLE rootwise_ml_runtime NOLOGIN;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

GRANT USAGE ON SCHEMA rootwise_ml TO rootwise_ml_runtime;
GRANT USAGE ON SCHEMA extensions TO rootwise_ml_runtime;
GRANT SELECT, INSERT ON rootwise_ml.feedback_events TO rootwise_ml_runtime;
GRANT SELECT, INSERT ON rootwise_ml.image_embeddings TO rootwise_ml_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA rootwise_ml TO rootwise_ml_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA rootwise_ml
    GRANT SELECT, INSERT ON TABLES TO rootwise_ml_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA rootwise_ml
    GRANT USAGE, SELECT ON SEQUENCES TO rootwise_ml_runtime;
