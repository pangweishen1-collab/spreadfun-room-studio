CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL CHECK (tool IN ('room', 'avatar', 'banner')),
  type TEXT NOT NULL CHECK (type IN ('generated', 'download')),
  count INTEGER NOT NULL CHECK (typeof(count) = 'integer' AND count BETWEEN 1 AND 100),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS counters (
  tool TEXT NOT NULL CHECK (tool IN ('room', 'avatar', 'banner')),
  type TEXT NOT NULL CHECK (type IN ('generated', 'download')),
  count INTEGER NOT NULL DEFAULT 0 CHECK (typeof(count) = 'integer' AND count >= 0),
  PRIMARY KEY (tool, type)
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  contact TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Exactly two global buckets; no IP address, cookie or client identifier is stored.
CREATE TABLE IF NOT EXISTS rate_limits (
  endpoint TEXT PRIMARY KEY CHECK (endpoint IN ('events', 'requests')),
  window_start INTEGER NOT NULL CHECK (window_start >= 0),
  count INTEGER NOT NULL CHECK (count > 0)
);

INSERT OR IGNORE INTO metadata (key, value)
VALUES ('startedAt', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT OR IGNORE INTO metadata (key, value)
SELECT 'updatedAt', value FROM metadata WHERE key = 'startedAt';

-- An event and its cumulative count commit in the same SQLite statement.
-- Duplicate event IDs do not fire this trigger.
CREATE TRIGGER IF NOT EXISTS event_insert_updates_counters
AFTER INSERT ON events
BEGIN
  INSERT INTO counters (tool, type, count)
  VALUES (NEW.tool, NEW.type, NEW.count)
  ON CONFLICT (tool, type) DO UPDATE SET count = counters.count + excluded.count;
  UPDATE metadata SET value = NEW.created_at WHERE key = 'updatedAt';
END;
