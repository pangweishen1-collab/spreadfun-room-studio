CREATE TABLE IF NOT EXISTS issue_reports (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  context TEXT NOT NULL,
  screenshot TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS issue_reports_recent ON issue_reports(created_at DESC);
