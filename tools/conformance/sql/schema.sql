BEGIN;

CREATE TABLE stories (
  story_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE story_versions (
  story_version_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  disclosure_markdown TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE evidence_objects (
  evidence_id_hash TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  blob_uri TEXT NOT NULL,
  media_type TEXT NOT NULL,
  extracted_text TEXT,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claims (
  claim_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  story_version_id TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  text TEXT NOT NULL,
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  time_window JSONB NOT NULL DEFAULT '{}'::jsonb,
  jurisdiction TEXT,
  support_status TEXT NOT NULL DEFAULT 'unsupported',
  confidence_model DOUBLE PRECISION,
  confidence_review DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claim_evidence_edges (
  edge_id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL,
  evidence_id_hash TEXT NOT NULL,
  relation TEXT NOT NULL,
  strength DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  reviewer_actor_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE corrections (
  correction_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_outbox (
  event_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version TEXT NOT NULL DEFAULT 'v1',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

COMMIT;
