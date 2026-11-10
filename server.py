#!/usr/bin/env python3
"""Serve Fun Toolkit and its anonymous shared counters using Python's standard library."""

import argparse
from base64 import b64decode
from collections import deque
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sqlite3
import sys
import threading
import time
from unicodedata import normalize
from urllib.parse import unquote, urlsplit
import uuid


SITE_ROOT = Path(__file__).resolve().parent
TOOLS = ("room", "avatar", "banner", "gift", "resources", "vap")
EVENT_TYPES = ("generated", "download")
MAX_BODY = 16 * 1024
MAX_REVIEW_BODY = 704 * 1024
MAX_REVIEW_ENTRIES = 100
TEMPLATES_PATH = "/api/vap-review-templates"
BACKGROUNDS_PATH = "/api/vap-review-backgrounds"
REVIEW_COLLECTIONS = {TEMPLATES_PATH: "template", BACKGROUNDS_PATH: "background"}
WEBP_DATA = "data:image/webp;base64,"
STATIC_EXTENSIONS = {
    ".html", ".css", ".js", ".mjs", ".wasm", ".webp", ".png", ".jpg",
    ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".svga", ".skel", ".atlas", ".mp3",
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


def review_name(value, error):
    if not isinstance(value, str):
        raise ValueError(error)
    name = normalize("NFC", value.strip())
    if not 1 <= len(name) <= 40 or any(ord(char) < 32 or ord(char) == 0x7f or 0xd800 <= ord(char) <= 0xdfff for char in name):
        raise ValueError(error)
    return name


def validate_background_image(image, error):
    if not isinstance(image, str) or not image.startswith(WEBP_DATA):
        raise ValueError(error)
    data = b64decode(image[len(WEBP_DATA):], validate=True)
    if (not 20 <= len(data) <= 512 * 1024 or data[:4] != b"RIFF" or data[8:12] != b"WEBP"
            or data[12:16] not in (b"VP8 ", b"VP8L", b"VP8X")
            or int.from_bytes(data[4:8], "little") != len(data) - 8):
        raise ValueError(error)


def validate_background(payload):
    if set(payload) != {"name", "backgroundImage"}:
        raise ValueError("invalid_background")
    name = review_name(payload["name"], "invalid_background")
    validate_background_image(payload["backgroundImage"], "invalid_background")
    return name, None, payload["backgroundImage"]


def validate_template(payload):
    def fields(value, keys):
        return isinstance(value, dict) and value.keys() == set(keys.split())

    has_reference = "backgroundId" in payload
    if not fields(payload, "name background slots backgroundImage backgroundId" if has_reference else "name background slots backgroundImage"):
        raise ValueError("invalid_template")
    name = review_name(payload["name"], "invalid_template")
    background, slots, image = (payload[key] for key in ("background", "slots", "backgroundImage"))
    if background not in ("ludo", "dark", "custom") or not isinstance(slots, list) or not 1 <= len(slots) <= 6:
        raise ValueError("invalid_template")
    for slot in slots:
        if (not fields(slot, "scale offsetY key mask")
                or type(slot["scale"]) not in (int, float) or not 25 <= slot["scale"] <= 110 or slot["scale"] % 1
                or type(slot["offsetY"]) not in (int, float) or not -50 <= slot["offsetY"] <= 50
                or slot["key"] not in ("auto", "opaque", "black_luma", "white_luma", "chroma_key")
                or not fields(slot["mask"], "enabled topStart topEnd bottomStart bottomEnd")):
            raise ValueError("invalid_template")
        mask = slot["mask"]
        start, upper, lower, end = (mask[key] for key in ("topStart", "topEnd", "bottomStart", "bottomEnd"))
        if (type(mask["enabled"]) is not bool or any(type(value) not in (int, float) for value in (start, upper, lower, end))
                or not 0 <= start < upper <= lower < end <= 1):
            raise ValueError("invalid_template")
    settings = {"background": background, "slots": slots}
    if has_reference:
        reference = payload["backgroundId"]
        if background != "custom" or not isinstance(reference, str) or image is not None:
            raise ValueError("invalid_template")
        if str(uuid.UUID(reference)) != reference.lower():
            raise ValueError("invalid_template")
        settings["backgroundId"] = reference.lower()
    elif background == "custom":
        validate_background_image(image, "invalid_template")
    elif image is not None:
        raise ValueError("invalid_template")
    return name, settings, image


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
            for migration in ("0003_vap_review_templates.sql", "0004_vap_review_backgrounds.sql"):
                connection.executescript((SITE_ROOT / "migrations" / migration).read_text())
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

    def review_entries(self, kind, entry_id=None):
        table = "vap_review_templates" if kind == "template" else "vap_review_backgrounds"
        with self.connection() as connection:
            if entry_id is None:
                return {kind + "s": [dict(row) for row in connection.execute(
                    f"SELECT id, name, created_at AS createdAt FROM {table} ORDER BY created_at DESC, id LIMIT ?",
                    (MAX_REVIEW_ENTRIES,),
                )]}
            settings = ", settings" if kind == "template" else ""
            row = connection.execute(f"""SELECT id, name, created_at AS createdAt, background_image AS backgroundImage{settings}
                FROM {table} WHERE id = ?""", (entry_id,)).fetchone()
            if row is None:
                return None
            entry = dict(row)
            return {**json.loads(entry.pop("settings")), **entry} if kind == "template" else entry

    def create_review_entry(self, kind, name, settings, image):
        table = "vap_review_templates" if kind == "template" else "vap_review_backgrounds"
        receipt = {"id": str(uuid.uuid4()), "name": name, "createdAt": utc_now()}
        name_key = name.lower()
        since = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        with self.connection() as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            background_id = (settings or {}).get("backgroundId")
            if background_id and not connection.execute("SELECT 1 FROM vap_review_backgrounds WHERE id = ?", (background_id,)).fetchone():
                raise ValueError("background_missing")
            if connection.execute(f"SELECT 1 FROM {table} WHERE name_key = ?", (name_key,)).fetchone():
                raise ValueError(kind + "_exists")
            if connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0] >= MAX_REVIEW_ENTRIES:
                raise ValueError(kind + "_limit")
            if connection.execute(f"SELECT count(*) FROM {table} WHERE created_at >= ?", (since,)).fetchone()[0] >= 6:
                raise ValueError("rate_limited")
            columns = ", settings" if kind == "template" else ""
            marker = ", ?" if kind == "template" else ""
            values = (receipt["id"], name, name_key, image, receipt["createdAt"])
            if kind == "template":
                values += (json.dumps(settings),)
            connection.execute(f"INSERT INTO {table} (id, name, name_key, background_image, created_at{columns}) VALUES (?, ?, ?, ?, ?{marker})", values)
        return receipt


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

    def end_headers(self):
        if not self.path.startswith("/api"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

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

    def read_api(self, head=False):
        path = self.api_path()
        if path != "/api" and not path.startswith("/api/"):
            return False
        try:
            store = self.server.store
            if path == "/api/stats":
                result = store.stats()
            else:
                collection, separator, entry_id = path.removeprefix("/api/").partition("/")
                kind = REVIEW_COLLECTIONS.get("/api/" + collection)
                result = store.review_entries(kind, entry_id.lower() if separator else None) if kind and (not separator or len(entry_id) == 36) else None
            self.json_response(200 if result is not None else 404, result if result is not None else {"error": "not_found"}, head)
        except sqlite3.Error:
            self.json_response(503, {"error": "storage_unavailable"}, head)
        return True

    def do_GET(self):
        if not self.read_api():
            super().do_GET()

    def do_HEAD(self):
        if not self.read_api(head=True):
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

    def read_json(self, max_body=MAX_BODY):
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
            if length > max_body:
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
        if endpoint in REVIEW_COLLECTIONS:
            kind = REVIEW_COLLECTIONS[endpoint]
            payload = self.read_json(MAX_REVIEW_BODY)
            if payload is None:
                return
            try:
                name, settings, image = (validate_template if kind == "template" else validate_background)(payload)
            except ValueError:
                self.json_response(400, {"error": "invalid_" + kind})
                return
            try:
                self.json_response(201, self.server.store.create_review_entry(kind, name, settings, image))
            except ValueError as error:
                self.json_response(429 if str(error) == "rate_limited" else 409, {"error": str(error)})
            except sqlite3.Error:
                self.json_response(503, {"error": "storage_unavailable"})
            return
        if any(endpoint.startswith(collection + "/") for collection in REVIEW_COLLECTIONS):
            self.json_response(405, {"error": "method_not_allowed"})
            return
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
