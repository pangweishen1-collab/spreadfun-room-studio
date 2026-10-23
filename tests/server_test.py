#!/usr/bin/env python3
"""Integration checks for shared statistics and private tool requests. No external packages."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import http.client
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
import uuid


sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("toolkit_server", ROOT / "server.py")
APP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(APP)


@contextmanager
def running(database, public_origin=None):
    server = APP.create_server("127.0.0.1", 0, database, public_origin)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


def request(server, method, path, payload=None, headers=None, raw=None):
    connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=20)
    body = raw if raw is not None else (None if payload is None else json.dumps(payload).encode("utf-8"))
    final_headers = {"Content-Type": "application/json"} if body is not None else {}
    final_headers.update(headers or {})
    try:
        connection.request(method, path, body=body, headers=final_headers)
        response = connection.getresponse()
        data = response.read()
        content_type = response.getheader("Content-Type", "")
        return response.status, dict(response.getheaders()), json.loads(data) if data and "application/json" in content_type else data
    finally:
        connection.close()


def event(tool="banner", kind="generated", count=1, event_id=None):
    return {"id": event_id or str(uuid.uuid4()), "tool": tool, "type": kind, "count": count}


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="fun-toolkit-api-test-")
        self.database = Path(self.temporary.name) / "private" / "test.sqlite3"

    def tearDown(self):
        self.temporary.cleanup()

    def test_independent_clients_share_counters_and_restart_persists(self):
        with running(self.database) as server:
            status, headers, first = request(server, "GET", "/api/stats")
            self.assertEqual(status, 200)
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertEqual(first["totals"], {"generated": 0, "downloads": 0})
            self.assertEqual(set(first["tools"]), {"room", "avatar", "banner"})
            self.assertTrue(first["startedAt"].endswith("Z"))
            self.assertEqual(request(server, "POST", "/api/events", event("room", "generated", 3))[0], 201)
            self.assertEqual(request(server, "POST", "/api/events", event("avatar", "download", 2))[0], 201)
            self.assertEqual(request(server, "POST", "/api/events", event("banner", "generated", 2))[0], 201)
            _, _, shared = request(server, "GET", "/api/stats")
            self.assertEqual(shared["totals"], {"generated": 5, "downloads": 2})
            self.assertEqual(shared["tools"]["room"], {"generated": 3, "downloads": 0})
            self.assertEqual(shared["tools"]["avatar"], {"generated": 0, "downloads": 2})
        with running(self.database) as restarted:
            self.assertEqual(request(restarted, "GET", "/api/stats")[2], shared)

    def test_idempotency_and_concurrent_transactions(self):
        repeated = event(count=2)
        with running(self.database) as server:
            def send(index):
                return request(server, "POST", "/api/events", repeated if index < 20 else event(count=3))
            with ThreadPoolExecutor(max_workers=12) as workers:
                results = list(workers.map(send, range(50)))
            self.assertEqual(sum(result[0] == 201 for result in results), 31)
            self.assertEqual(sum(result[0] == 200 for result in results), 19)
            self.assertEqual(request(server, "GET", "/api/stats")[2]["totals"]["generated"], 92)
            conflict = dict(repeated, count=4)
            self.assertEqual(request(server, "POST", "/api/events", conflict)[0], 409)
            self.assertEqual(request(server, "GET", "/api/stats")[2]["totals"]["generated"], 92)

    def test_requests_are_private_persisted_and_available_only_in_author_cli(self):
        payload = {"title": " A new tool ", "description": "Need a batch export tool.", "contact": "author@example.test"}
        with running(self.database) as server:
            status, headers, receipt = request(server, "POST", "/api/requests", payload)
            self.assertEqual(status, 201)
            self.assertEqual(headers["Cache-Control"], "no-store")
            uuid.UUID(receipt["id"])
            self.assertTrue(receipt["createdAt"].endswith("Z"))
            self.assertEqual(request(server, "GET", "/api/requests")[0], 404)
            self.assertEqual(request(server, "GET", "/api/stats")[2]["totals"], {"generated": 0, "downloads": 0})
        with sqlite3.connect(self.database) as connection:
            self.assertEqual(connection.execute("SELECT title, description, contact FROM requests").fetchone(),
                             ("A new tool", payload["description"], payload["contact"]))
        result = subprocess.run([sys.executable, str(ROOT / "server.py"), "--db", str(self.database), "--list-requests"],
                                check=True, capture_output=True, text=True)
        rows = json.loads(result.stdout)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], receipt["id"])
        self.assertEqual(rows[0]["title"], "A new tool")

    def test_validation_origin_and_body_limits(self):
        with running(self.database) as server:
            same_origin = f"http://127.0.0.1:{server.server_port}"
            self.assertEqual(request(server, "POST", "/api/events", event(), {"Origin": same_origin})[0], 201)
            for origin in ("https://evil.example", "null", "http://evil.example", same_origin + "/path"):
                with self.subTest(origin=origin):
                    status, headers, body = request(server, "POST", "/api/events", event(), {"Origin": origin})
                    self.assertEqual(status, 403)
                    self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertEqual(request(server, "POST", "/api/events", event(), {"Sec-Fetch-Site": "cross-site"})[0], 403)
            self.assertEqual(request(server, "POST", "/api/events", event(), {"Content-Type": "text/plain"})[0], 415)
            self.assertEqual(request(server, "POST", "/api/events", raw=b"not json")[0], 400)
            self.assertEqual(request(server, "POST", "/api/events", raw=b"[1,2]")[0], 400)
            self.assertEqual(request(server, "POST", "/api/events", raw=b"x" * (APP.MAX_BODY + 1))[0], 413)
            for change in ({"count": 0}, {"count": 101}, {"count": True}, {"count": 1.5}, {"tool": "unknown"},
                           {"type": "view"}, {"id": "bad-id"}, {"filename": "private.png"}):
                with self.subTest(change=change):
                    self.assertEqual(request(server, "POST", "/api/events", dict(event(), **change))[0], 400)
            for payload in ({}, {"title": " ", "description": "test"}, {"title": "x" * 101, "description": "test"},
                            {"title": "x", "description": "x" * 2001}, {"title": "x", "description": "ok", "contact": "x" * 121},
                            {"title": "x", "description": "ok", "image": "private.png"}):
                with self.subTest(payload=payload):
                    self.assertEqual(request(server, "POST", "/api/requests", payload)[0], 400)
            self.assertEqual(request(server, "GET", "/api/stats")[2]["totals"], {"generated": 1, "downloads": 0})

    def test_static_files_are_served_without_exposing_source_or_private_data(self):
        with running(self.database) as server:
            for path in ("/", "/index.html", "/toolkit.css", "/banner.js", "/vendor/webp/webp_enc.wasm"):
                with self.subTest(path=path):
                    self.assertEqual(request(server, "GET", path)[0], 200)
            for path in ("/server.py", "/tests/server_test.py", "/tests/", "/.env", "/README.md", "/vendor/",
                         "/../server.py", "/%2e%2e/server.py", "/GitHub-Pages/", "/private/test.sqlite3"):
                with self.subTest(path=path):
                    self.assertEqual(request(server, "GET", path)[0], 404)
            for method in ("PUT", "DELETE", "OPTIONS", "PATCH"):
                status, headers, _ = request(server, method, "/api/events")
                self.assertEqual(status, 405)
                self.assertEqual(headers["Cache-Control"], "no-store")
        with self.assertRaises(ValueError):
            APP.Store(ROOT / "do-not-create.sqlite3")

    def test_rate_limit_does_not_store_client_identifiers(self):
        limiter = APP.RateLimit()
        self.assertTrue(all(limiter.allow("requests") for _ in range(30)))
        self.assertFalse(limiter.allow("requests"))
        self.assertTrue(all(isinstance(timestamp, float) for timestamp in limiter.windows["requests"]))

    def test_explicit_https_proxy_origin_is_supported_without_trusting_forwarded_headers(self):
        with running(self.database, "https://tools.example.test") as server:
            self.assertEqual(request(server, "POST", "/api/events", event(), {"Origin": "https://tools.example.test"})[0], 201)
            self.assertEqual(request(server, "POST", "/api/events", event(), {"Origin": "http://tools.example.test"})[0], 403)
            self.assertEqual(request(server, "POST", "/api/events", event(), {
                "Origin": "https://evil.example", "X-Forwarded-Host": "evil.example", "X-Forwarded-Proto": "https",
            })[0], 403)
        for invalid in ("https://tools.example.test/path", "https://user:pass@tools.example.test", "null", "file://tools"):
            with self.subTest(origin=invalid), self.assertRaises(ValueError):
                APP.create_server("127.0.0.1", 0, self.database, invalid)


if __name__ == "__main__":
    unittest.main(verbosity=2)
