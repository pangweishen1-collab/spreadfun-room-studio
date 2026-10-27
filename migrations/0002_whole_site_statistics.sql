-- Extend the allowed tools without resetting any recorded events or counts.
-- Copy the counters themselves: rebuilding from events could alter historic totals.
-- No trigger is attached to the replacement events table during the copy.
CREATE TABLE events_whole_site (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL CHECK (tool IN ('room', 'avatar', 'banner', 'gift', 'resources', 'vap')),
  type TEXT NOT NULL CHECK (type IN ('generated', 'download')),
  count INTEGER NOT NULL CHECK (typeof(count) = 'integer' AND count BETWEEN 1 AND 100),
  created_at TEXT NOT NULL
);

CREATE TABLE counters_whole_site (
  tool TEXT NOT NULL CHECK (tool IN ('room', 'avatar', 'banner', 'gift', 'resources', 'vap')),
  type TEXT NOT NULL CHECK (type IN ('generated', 'download')),
  count INTEGER NOT NULL DEFAULT 0 CHECK (typeof(count) = 'integer' AND count >= 0),
  PRIMARY KEY (tool, type)
);

INSERT INTO events_whole_site (id, tool, type, count, created_at)
SELECT id, tool, type, count, created_at FROM events;
INSERT INTO counters_whole_site (tool, type, count)
SELECT tool, type, count FROM counters;

DROP TRIGGER event_insert_updates_counters;
DROP TABLE events;
DROP TABLE counters;
ALTER TABLE events_whole_site RENAME TO events;
ALTER TABLE counters_whole_site RENAME TO counters;

CREATE TRIGGER event_insert_updates_counters
AFTER INSERT ON events
BEGIN
  INSERT INTO counters (tool, type, count)
  VALUES (NEW.tool, NEW.type, NEW.count)
  ON CONFLICT (tool, type) DO UPDATE SET count = counters.count + excluded.count;
  UPDATE metadata SET value = NEW.created_at WHERE key = 'updatedAt';
END;
