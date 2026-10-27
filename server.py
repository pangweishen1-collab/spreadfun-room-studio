#!/usr/bin/env python3
"""Serve Fun Toolkit and its anonymous shared counters using Python's standard library."""

import argparse
from collections import deque
from contextlib import contextmanager
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sqlite3
import sys
import threading
import time
from urllib.parse import unquote, urlsplit
import uuid


SITE_ROOT = Path(__file__).resolve().parent
TOOLS = ("room", "avatar", "banner", "gift", "resources", "vap")
EVENT_TYPES = ("generated", "download")
MAX_BODY = 16 * 1024
STATIC_EXTENSIONS = {
    ".html", ".css", ".js", ".mjs", ".wasm", ".webp", ".png", ".jpg",
    ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".svga",
}


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def default_database():
    configured = os.environ.get("FUN_TOOLKIT_DATA_DIR")
    if configured:
        directory = Path(configured).expanduser()
    elif sys.platform == "darwin":
        directory = Path.home() / "Library" / "Application Support" / "Fun Toolkit"
    else:
        directory = Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))) / "fun-toolkit"
    return directory / "toolkit.sqlite3"


def origin_key(value):
    """Compare browser origins with default ports normalized; reject URL paths and credentials."""
    try:
        origin = urlsplit(value)
        if (value != value.strip() or origin.scheme not in ("http", "https") or not origin.hostname
                or origin.username or origin.password or origin.path or origin.query or origin.fragment):
            return None
        return origin.scheme, origin.hostname.lower(), origin.port or (443 if origin.scheme == "https" else 80)
    except ValueError:
        return None


class Store:
    def __init__(self, path, site_root=SITE_ROOT):
        self.path = Path(path).expanduser().resolve()
        if self.path.is_relative_to(Path(site_root).resolve()):
            raise ValueError("The database must be outside the website directory.")
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.path.touch(mode=0o600, exist_ok=True)
        self.path.chmod(0o600)
        with self.connection() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS events (
                    id TEXT PRIMARY KEY, tool TEXT NOT NULL, type TEXT NOT NULL,
                    count INTEGER NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS counters (
                    tool TEXT NOT NULL, type TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (tool, type)
                );
                CREATE TABLE IF NOT EXISTS requests (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
                    contact TEXT NOT NULL, created_at TEXT NOT NULL
                );
            """)
            timestamp = utc_now()
            with connection:
                connection.execute("INSERT OR IGNORE INTO metadata VALUES ('startedAt', ?)", (timestamp,))
                connection.execute("INSERT OR IGNORE INTO metadata VALUES ('updatedAt', ?)", (timestamp,))

    @contextmanager
    def connection(self):
        connection = sqlite3.connect(self.path, timeout=15)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
        finally:
            connection.close()

    def stats(self):
        tools = {tool: {"generated": 0, "downloads": 0} for tool in TOOLS}
        with self.connection() as connection:
            # One read transaction keeps counters and their timestamp in the same snapshot.
            connection.execute("BEGIN")
            for row in connection.execute("SELECT tool, type, count FROM counters"):
                tools[row["tool"]]["downloads" if row["type"] == "download" else "generated"] = row["count"]
            metadata = dict(connection.execute("SELECT key, value FROM metadata"))
        return {
            "totals": {key: sum(tool[key] for tool in tools.values()) for key in ("generated", "downloads")},
            "tools": tools,
            "updatedAt": metadata["updatedAt"],
            "startedAt": metadata["startedAt"],
        }

    def event(self, payload):
        with self.connection() as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute("SELECT tool, type, count FROM events WHERE id = ?", (payload["id"],)).fetchone()
            if existing:
                if tuple(existing) != (payload["tool"], payload["type"], payload["count"]):
                    raise ValueError("event_conflict")
                return True
            timestamp = utc_now()
            connection.execute("INSERT INTO events VALUES (?, ?, ?, ?, ?)",
                               (payload["id"], payload["tool"], payload["type"], payload["count"], timestamp))
            connection.execute("""INSERT INTO counters VALUES (?, ?, ?)
                ON CONFLICT(tool, type) DO UPDATE SET count = count + excluded.count""",
                               (payload["tool"], payload["type"], payload["count"]))
            connection.execute("UPDATE metadata SET value = ? WHERE key = 'updatedAt'", (timestamp,))
        return False

    def request(self, payload):
        receipt = {"id": str(uuid.uuid4()), "createdAt": utc_now()}
        with self.connection() as connection, connection:
            connection.execute("INSERT INTO requests VALUES (?, ?, ?, ?, ?)", (
                receipt["id"], payload["title"], payload["description"], payload.get("contact", ""), receipt["createdAt"],
            ))
        return receipt

    def list_requests(self):
        with self.connection() as connection:
            return [dict(row) for row in connection.execute(
                "SELECT id, title, description, contact, created_at AS createdAt FROM requests ORDER BY created_at DESC"
            )]


class RateLimit:
    """A bounded, server-wide burst limit. No IP addresses or client identifiers are stored."""
    def __init__(self):
        self.lock = threading.Lock()
        self.windows = {"events": deque(), "requests": deque()}

    def allow(self, endpoint):
        capacity, interval = (600, 60) if endpoint == "events" else (30, 600)
        now = time.monotonic()
        with self.lock:
            window = self.windows[endpoint]
            while window and window[0] <= now - interval:
                window.popleft()
            if len(window) >= capacity:
                return False
            window.append(now)
            return True


class ToolkitHandler(SimpleHTTPRequestHandler):
    server_version = "FunToolkit"
    sys_version = ""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE_ROOT), **kwargs)

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def log_message(self, format, *args):
        # Never log client IPs, user file names, query strings, or submitted request content.
        pass

    def json_response(self, status, payload, head=False):
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if not head:
            self.wfile.write(data)

    def api_path(self):
        return urlsplit(self.path).path

    def do_GET(self):
        if self.api_path().startswith("/api/") or self.api_path() == "/api":
            if self.api_path() == "/api/stats":
                try:
                    self.json_response(200, self.server.store.stats())
                except sqlite3.Error:
                    self.json_response(503, {"error": "storage_unavailable"})
            else:
                self.json_response(404, {"error": "not_found"})
            return
        super().do_GET()

    def do_HEAD(self):
        if self.api_path().startswith("/api/") or self.api_path() == "/api":
            if self.api_path() == "/api/stats":
                try:
                    self.json_response(200, self.server.store.stats(), head=True)
                except sqlite3.Error:
                    self.json_response(503, {"error": "storage_unavailable"}, head=True)
            else:
                self.json_response(404, {"error": "not_found"}, head=True)
            return
        super().do_HEAD()

    def same_origin(self):
        if self.headers.get("Sec-Fetch-Site", "").lower() == "cross-site":
            return False
        origins = self.headers.get_all("Origin", [])
        if not origins:
            return True  # CLI clients do not send an Origin header.
        hosts = self.headers.get_all("Host", [])
        if len(origins) != 1 or len(hosts) != 1:
            return False
        origin = origin_key(origins[0])
        expected = origin_key(self.server.public_origin or "http://" + hosts[0])
        return origin is not None and origin == expected

    def read_json(self):
        if not self.same_origin():
            self.json_response(403, {"error": "origin_not_allowed"})
            return None
        if self.headers.get("Transfer-Encoding"):
            self.json_response(400, {"error": "unsupported_transfer_encoding"})
            return None
        if self.headers.get_content_type() != "application/json":
            self.json_response(415, {"error": "json_required"})
            return None
        lengths = self.headers.get_all("Content-Length", [])
        if not lengths:
            self.json_response(411, {"error": "length_required"})
            return None
        try:
            if len(lengths) != 1 or not lengths[0].isdigit():
                raise ValueError
            length = int(lengths[0])
            if length > MAX_BODY:
                self.json_response(413, {"error": "body_too_large"})
                return None
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError
            return payload
        except (ValueError, UnicodeDecodeError):
            self.json_response(400, {"error": "invalid_json"})
            return None

    def do_POST(self):
        endpoint = self.api_path()
        if endpoint not in ("/api/events", "/api/requests"):
            self.json_response(404, {"error": "not_found"})
            return
        payload = self.read_json()
        if payload is None:
            return
        if endpoint == "/api/events":
            try:
                if set(payload) != {"id", "tool", "type", "count"} or not isinstance(payload["id"], str):
                    raise ValueError
                if str(uuid.UUID(payload["id"])) != payload["id"].lower():
                    raise ValueError
                payload["id"] = payload["id"].lower()
                if payload["tool"] not in TOOLS or payload["type"] not in EVENT_TYPES:
                    raise ValueError
                if type(payload["count"]) is not int or not 1 <= payload["count"] <= 100:
                    raise ValueError
            except (ValueError, TypeError, AttributeError):
                self.json_response(400, {"error": "invalid_event"})
                return
            if not self.server.limiter.allow("events"):
                self.json_response(429, {"error": "rate_limited"})
                return
            try:
                duplicate = self.server.store.event(payload)
                self.json_response(200 if duplicate else 201, {"accepted": True, "duplicate": duplicate})
            except ValueError:
                self.json_response(409, {"error": "event_conflict"})
            except sqlite3.Error:
                self.json_response(503, {"error": "storage_unavailable"})
            return
        if set(payload) - {"title", "description", "contact"}:
            self.json_response(400, {"error": "invalid_request"})
            return
        for key, maximum, required in (("title", 100, True), ("description", 2000, True), ("contact", 120, False)):
            value = payload.get(key, "")
            if not isinstance(value, str) or len(value) > maximum or (required and not value.strip()) or "\x00" in value:
                self.json_response(400, {"error": "invalid_request"})
                return
            payload[key] = value.strip()
        if not self.server.limiter.allow("requests"):
            self.json_response(429, {"error": "rate_limited"})
            return
        try:
            self.json_response(201, self.server.store.request(payload))
        except sqlite3.Error:
            self.json_response(503, {"error": "storage_unavailable"})

    def do_OPTIONS(self):
        self.json_response(405, {"error": "method_not_allowed"})

    def do_PUT(self):
        self.json_response(405, {"error": "method_not_allowed"})

    do_DELETE = do_PUT
    do_PATCH = do_PUT

    def send_head(self):
        try:
            path = unquote(self.api_path(), errors="strict")
            parts = Path(path.lstrip("/")).parts
            if "\\" in path or "\x00" in path or any(part in ("..", "tests", "GitHub-Pages") or part.startswith(".") for part in parts):
                raise ValueError
            target = (SITE_ROOT / path.lstrip("/")).resolve()
            if not target.is_relative_to(SITE_ROOT):
                raise ValueError
            if target.is_dir():
                if target != SITE_ROOT:
                    raise ValueError
            elif target.suffix.lower() not in STATIC_EXTENSIONS:
                raise ValueError
        except (ValueError, UnicodeError):
            self.send_error(404, "Not found")
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404, "Not found")
        return None


def create_server(host, port, database, public_origin=None):
    if public_origin is not None and origin_key(public_origin) is None:
        raise ValueError("--public-origin must be an http(s) origin without a path, such as https://tools.example.com")
    store = Store(database)
    server = ThreadingHTTPServer((host, port), ToolkitHandler)
    server.daemon_threads = True
    server.store = store
    server.limiter = RateLimit()
    server.public_origin = public_origin
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1", help="Bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--db", type=Path, default=default_database(), help="SQLite file outside the website directory")
    parser.add_argument("--public-origin", help="Exact browser origin when an HTTPS reverse proxy serves this server")
    parser.add_argument("--list-requests", action="store_true", help="Print saved tool requests to the author's terminal, then exit")
    args = parser.parse_args()
    try:
        if args.list_requests:
            print(json.dumps(Store(args.db).list_requests(), ensure_ascii=False, indent=2))
            return
        server = create_server(args.host, args.port, args.db, args.public_origin)
    except (OSError, ValueError, sqlite3.Error) as error:
        parser.exit(1, f"Unable to start Fun Toolkit: {error}\n")
    print(f"Fun Toolkit: http://{args.host}:{server.server_port}/")
    print(f"Shared statistics and private requests: {server.store.path}")
    print("Press Ctrl-C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
