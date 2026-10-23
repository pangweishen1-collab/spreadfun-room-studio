#!/usr/bin/env python3
"""Integration checks against an isolated LOCAL Wrangler server and fresh D1 database.

Usage: python3 tests/worker_api_test.py --base-url http://127.0.0.1:8787
Optional: --database /absolute/path/to/the/local-D1.sqlite for private-row checks.
Never run against the normal preview server or a database containing real user data.
The suite writes synthetic events and tool suggestions, including both rate-limit caps.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
import http.client
import json
from pathlib import Path
import sqlite3
import time
import unittest
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import uuid


BASE_URL = ""
DATABASE = None
MAX_BODY = 16 * 1024


def call(method, path, payload=None, headers=None, raw=None):
    body = raw if raw is not None else (json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None)
    final_headers = {"Content-Type": "application/json"} if body is not None else {}
    final_headers.update(headers or {})
    req = Request(BASE_URL + path, data=body, method=method, headers=final_headers)
    try:
        response = urlopen(req, timeout=30)
    except HTTPError as error:
        response = error
    with response:
        data = response.read()
        content_type = response.headers.get("Content-Type", "")
        return response.status, dict(response.headers), json.loads(data) if data and "application/json" in content_type else data


def chunked(path, body):
    """Send without Content-Length, exercising the actual-byte streaming guard."""
    parsed = urlsplit(BASE_URL)
    connection_class = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    connection = connection_class(parsed.hostname, parsed.port, timeout=30)
    try:
        connection.request("POST", path, body=(body[index:index + 4096] for index in range(0, len(body), 4096)),
                           headers={"Content-Type": "application/json"}, encode_chunked=True)
        response = connection.getresponse()
        data = response.read()
        return response.status, json.loads(data)
    finally:
        connection.close()


def event(tool="banner", kind="generated", count=1, event_id=None):
    return {"id": event_id or str(uuid.uuid4()), "tool": tool, "type": kind, "count": count}


def stats():
    status, _, result = call("GET", "/api/stats")
    if status != 200:
        raise AssertionError("Local Worker statistics failed: " + repr((status, result)))
    return result


class WorkerApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        status, headers, initial = call("GET", "/api/stats")
        if headers.get("Server", "").startswith("FunToolkit"):
            raise RuntimeError("Refusing to write to the ordinary Python preview server. Use isolated Wrangler D1.")
        if status != 200 or initial["totals"] != {"generated": 0, "downloads": 0}:
            raise RuntimeError("Use a fresh, migrated LOCAL D1 database for this destructive test fixture.")

    def test_01_stats_contract_and_methods(self):
        status, headers, body = call("GET", "/api/stats")
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("Cache-Control"), "no-store")
        self.assertEqual(headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(set(body["tools"]), {"room", "avatar", "banner"})
        self.assertTrue(body["startedAt"].endswith("Z"))
        self.assertTrue(body["updatedAt"].endswith("Z"))
        self.assertEqual(call("HEAD", "/api/stats")[0::2], (200, b""))
        for path in ("/api", "/api/", "/api/unknown", "/api/requests", "/api/events"):
            with self.subTest(path=path):
                self.assertEqual(call("GET", path)[0], 404)
        for method in ("OPTIONS", "PUT", "PATCH", "DELETE"):
            with self.subTest(method=method):
                self.assertEqual(call(method, "/api/events")[0], 405)
                self.assertEqual(call(method, "/index.html")[0], 405)

    def test_02_concurrent_uuid_idempotency_and_conflicts(self):
        repeated = event(count=2)
        with ThreadPoolExecutor(max_workers=12) as executor:
            results = list(executor.map(lambda index: call("POST", "/api/events",
                repeated if index < 20 else event(count=3)), range(50)))
        self.assertEqual(sum(result[0] == 201 for result in results), 31)
        self.assertEqual(sum(result[0] == 200 for result in results), 19)
        self.assertEqual(stats()["totals"]["generated"], 92)
        self.assertEqual(call("POST", "/api/events", dict(repeated, count=4))[0], 409)
        self.assertEqual(call("POST", "/api/events", dict(repeated, id=repeated["id"].upper()))[0], 200)
        self.assertEqual(stats()["totals"]["generated"], 92)
        self.assertEqual(call("POST", "/api/events", event("room", "generated", 3))[0], 201)
        self.assertEqual(call("POST", "/api/events", event("avatar", "download", 2))[0], 201)
        current = stats()
        self.assertEqual(current["totals"], {"generated": 95, "downloads": 2})
        self.assertEqual(current["tools"]["room"], {"generated": 3, "downloads": 0})
        self.assertEqual(current["tools"]["avatar"], {"generated": 0, "downloads": 2})

    def test_03_origin_content_type_and_validation(self):
        self.assertEqual(call("POST", "/api/events", event(), {"Origin": BASE_URL})[0], 201)
        for origin in ("https://evil.example", "null", BASE_URL + "/path", BASE_URL + "/"):
            with self.subTest(origin=origin):
                self.assertEqual(call("POST", "/api/events", event(), {"Origin": origin})[0], 403)
        self.assertEqual(call("POST", "/api/events", event(), {"Sec-Fetch-Site": "cross-site"})[0], 403)
        self.assertEqual(call("POST", "/api/events", event(), {"Content-Type": "text/plain"})[0], 415)
        for body in (b"not json", b"[1,2]", b"null", b'"x"', b'{"id":"\xff"}'):
            with self.subTest(body=body):
                self.assertEqual(call("POST", "/api/events", raw=body)[0], 400)
        for change in ({"count": 0}, {"count": 101}, {"count": True}, {"count": 1.5},
                       {"tool": "unknown"}, {"type": "view"}, {"id": "bad-id"}, {"filename": "private.png"}):
            with self.subTest(change=change):
                self.assertEqual(call("POST", "/api/events", dict(event(), **change))[0], 400)
        for payload in ({}, {"title": " ", "description": "test"}, {"title": "x" * 101, "description": "test"},
                        {"title": "x", "description": "x" * 2001}, {"title": "x", "description": "ok", "contact": "x" * 121},
                        {"title": "x", "description": "ok", "image": "private.png"},
                        {"title": "x", "description": "ok", "contact": None},
                        {"title": "x\0", "description": "ok"}):
            with self.subTest(payload=payload):
                self.assertEqual(call("POST", "/api/requests", payload)[0], 400)

    def test_04_body_exact_boundary_and_chunked_limit(self):
        body = json.dumps(event()).encode("utf-8")
        exact = body + b" " * (MAX_BODY - len(body))
        self.assertEqual(call("POST", "/api/events", raw=exact)[0], 201)
        self.assertEqual(call("POST", "/api/events", raw=exact + b" ")[0], 413)
        body = json.dumps(event()).encode("utf-8")
        exact = body + b" " * (MAX_BODY - len(body))
        self.assertEqual(chunked("/api/events", exact)[0], 201)
        self.assertEqual(chunked("/api/events", exact + b" ")[0], 413)

    def test_05_private_request_receipt_and_counter_isolation(self):
        before = stats()
        payload = {"title": " LOCAL WORKER INTEGRATION TEST ", "description": "Synthetic local test, not a real task.",
                   "contact": " nobody@example.test "}
        status, headers, receipt = call("POST", "/api/requests", payload, {"Origin": BASE_URL})
        self.assertEqual(status, 201)
        self.assertEqual(headers.get("Cache-Control"), "no-store")
        uuid.UUID(receipt["id"])
        self.assertTrue(receipt["createdAt"].endswith("Z"))
        self.assertEqual(call("GET", "/api/requests")[0], 404)
        self.assertEqual(stats(), before)
        if DATABASE:
            with sqlite3.connect(DATABASE.as_uri() + "?mode=ro", uri=True) as db:
                row = db.execute("SELECT title, description, contact FROM requests WHERE id = ?", (receipt["id"],)).fetchone()
                self.assertEqual(row, tuple(payload[key].strip() for key in ("title", "description", "contact")))

    def test_06_private_files_not_public(self):
        for path in ("/server.py", "/tests/worker_api_test.py", "/worker/index.mjs", "/migrations/0001_initial.sql",
                     "/.env", "/README.md", "/toolkit.sqlite3", "/GitHub-Pages/"):
            with self.subTest(path=path):
                self.assertEqual(call("GET", path)[0], 404)

    def test_99_atomic_global_fixed_window_caps(self):
        # Exhaust each current fixed window with one repeated event to avoid fixture growth.
        # Restart once if a real wall-clock window boundary happens during the test.
        for endpoint, capacity, seconds, payload in (
                ("events", 600, 60, event()),
                ("requests", 30, 600, {"title": "LOCAL RATE LIMIT TEST", "description": "Synthetic test only."})):
            for attempt in range(2):
                initial_window = int(time.time()) // seconds
                with ThreadPoolExecutor(max_workers=12) as executor:
                    statuses = list(executor.map(lambda _: call("POST", "/api/" + endpoint, payload)[0], range(capacity + 1)))
                if initial_window != int(time.time()) // seconds and attempt == 0:
                    continue
                self.assertIn(429, statuses)
                self.assertTrue(all(status in (200, 201, 429) for status in statuses), statuses)
                self.assertLessEqual(sum(status != 429 for status in statuses), capacity)
                self.assertEqual(call("POST", "/api/" + endpoint, payload)[0], 429)
                break
        if DATABASE:
            with sqlite3.connect(DATABASE.as_uri() + "?mode=ro", uri=True) as db:
                self.assertEqual(db.execute("SELECT count(*) FROM rate_limits").fetchone()[0], 2)
                self.assertEqual([row[1] for row in db.execute("PRAGMA table_info(rate_limits)")],
                                 ["endpoint", "window_start", "count"])
                self.assertEqual(dict(db.execute("SELECT endpoint, count FROM rate_limits")), {"events": 600, "requests": 30})
                self.assertEqual(db.execute("SELECT count FROM counters WHERE tool = 'banner' AND type = 'generated'").fetchone()[0],
                                 db.execute("SELECT sum(count) FROM events WHERE tool = 'banner' AND type = 'generated'").fetchone()[0])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="Isolated LOCAL Wrangler origin, e.g. http://127.0.0.1:8787")
    parser.add_argument("--database", type=Path, help="Optional isolated local D1 SQLite path, opened read-only")
    args = parser.parse_args()
    parsed = urlsplit(args.base_url)
    if (parsed.scheme not in ("http", "https") or parsed.hostname not in ("localhost", "127.0.0.1", "::1")
            or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment):
        parser.error("Only a localhost origin is accepted; production tests are deliberately prohibited.")
    BASE_URL = args.base_url
    DATABASE = args.database.resolve() if args.database else None
    if DATABASE and not DATABASE.is_file():
        parser.error("--database must be an existing isolated LOCAL D1 SQLite file.")
    unittest.main(argv=[__file__], verbosity=2)
