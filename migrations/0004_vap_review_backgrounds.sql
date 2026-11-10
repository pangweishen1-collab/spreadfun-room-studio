CREATE TABLE IF NOT EXISTS vap_review_backgrounds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  background_image TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS vap_review_backgrounds_created_at
  ON vap_review_backgrounds (created_at DESC, id);
