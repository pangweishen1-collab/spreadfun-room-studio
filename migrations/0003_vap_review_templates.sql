CREATE TABLE IF NOT EXISTS vap_review_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  settings TEXT NOT NULL,
  background_image TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS vap_review_templates_created_at
  ON vap_review_templates (created_at DESC, id);
