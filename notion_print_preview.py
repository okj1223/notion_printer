#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import signal
import socket
import subprocess
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlparse

from notion_printer_learning import append_events_payload, write_document_manifest, write_session_payload


STATE_FILE = Path("/tmp/notion_printer_preview_server.json")
DEBUG_ALIAS_PATH = "/_notion_printer_debug.html"


class NotionPrinterPreviewHandler(SimpleHTTPRequestHandler):
    def __init__(
        self,
        *args,
        directory: str | None = None,
        html_file: str | None = None,
        **kwargs,
    ) -> None:
        self.preview_html_file = Path(html_file).resolve() if html_file else None
        super().__init__(*args, directory=directory, **kwargs)

    def json_response(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_preview_html(self, *, head_only: bool = False) -> None:
        if self.preview_html_file is None or not self.preview_html_file.exists():
            self.send_error(404, "preview_html_not_found")
            return
        body = self.preview_html_file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def enrich_payload(self, payload: dict) -> dict:
        enriched = dict(payload)
        session = enriched.get("session")
        if isinstance(session, dict) and self.preview_html_file is not None:
            merged_session = dict(session)
            merged_session.setdefault("served_html_file", str(self.preview_html_file))
            enriched["session"] = merged_session
        manifest = enriched.get("manifest")
        if isinstance(manifest, dict) and self.preview_html_file is not None:
            merged_manifest = dict(manifest)
            merged_manifest.setdefault("served_html_file", str(self.preview_html_file))
            enriched["manifest"] = merged_manifest
        return enriched

    def handle_session_post(self) -> None:
        try:
            payload = self.enrich_payload(self.read_json_body())
        except json.JSONDecodeError:
            self.json_response(400, {"ok": False, "error": "invalid_json"})
            return

        manifest_path = None
        if isinstance(payload.get("manifest"), dict):
            manifest_path = write_document_manifest(payload["manifest"])
        session_path = write_session_payload(payload)
        self.json_response(
            200,
            {
                "ok": True,
                "session_path": str(session_path),
                "manifest_path": str(manifest_path) if manifest_path else None,
            },
        )

    def handle_events_post(self) -> None:
        try:
            payload = self.enrich_payload(self.read_json_body())
        except json.JSONDecodeError:
            self.json_response(400, {"ok": False, "error": "invalid_json"})
            return

        if isinstance(payload.get("session"), dict):
            write_session_payload(payload)
        written_paths = append_events_payload(payload)
        self.json_response(
            200,
            {
                "ok": True,
                "written_paths": [str(path) for path in written_paths],
                "event_count": len(payload.get("events", [])) if isinstance(payload.get("events"), list) else 0,
            },
        )

    def do_POST(self) -> None:
        route = urlparse(self.path).path
        if route == "/__notion_printer/session":
            self.handle_session_post()
            return
        if route == "/__notion_printer/events":
            self.handle_events_post()
            return
        self.json_response(404, {"ok": False, "error": "not_found"})

    def do_HEAD(self) -> None:
        route = urlparse(self.path).path
        if route == DEBUG_ALIAS_PATH:
            self.serve_preview_html(head_only=True)
            return
        super().do_HEAD()

    def do_GET(self) -> None:
        route = urlparse(self.path).path
        if route == DEBUG_ALIAS_PATH:
            self.serve_preview_html()
            return
        super().do_GET()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve a generated Notion Printer HTML over localhost.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    serve = subparsers.add_parser("serve", help="Serve an HTML file over localhost and optionally open it.")
    serve.add_argument("html_file", type=Path, help="Generated print HTML file to preview.")
    serve.add_argument(
        "--serve-dir",
        type=Path,
        default=None,
        help="Optional directory to use as the static-file root. Defaults to the HTML file directory.",
    )
    serve.add_argument("--port", type=int, default=18789, help="Preferred port. Default: 18789.")
    serve.add_argument("--no-open", action="store_true", help="Do not open a browser automatically.")

    subparsers.add_parser("stop", help="Stop the previously started preview server.")
    return parser.parse_args()


def load_state() -> dict:
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(pid: int, port: int, html_file: Path) -> None:
    STATE_FILE.write_text(
        json.dumps({"pid": pid, "port": port, "html_file": str(html_file)}, ensure_ascii=False),
        encoding="utf-8",
    )


def stop_previous_server() -> None:
    state = load_state()
    pid = state.get("pid")
    if not pid:
        return
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    except PermissionError:
        pass
    try:
        STATE_FILE.unlink()
    except FileNotFoundError:
        pass


def pick_port(preferred: int) -> int:
    for candidate in (preferred, 0):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind(("127.0.0.1", candidate))
            except OSError:
                continue
            return sock.getsockname()[1]
    raise OSError(f"Unable to bind preview server port near {preferred}")


def open_browser(url: str) -> None:
    try:
        subprocess.Popen(["xdg-open", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


def serve_html(html_file: Path, preferred_port: int, no_open: bool, serve_dir: Path | None = None) -> int:
    html_file = html_file.resolve()
    if not html_file.exists():
        print(f"HTML file not found: {html_file}", file=sys.stderr)
        return 1

    stop_previous_server()

    static_root = serve_dir.expanduser().resolve() if serve_dir else html_file.parent
    port = pick_port(preferred_port)
    handler = partial(NotionPrinterPreviewHandler, directory=str(static_root), html_file=str(html_file))
    httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)
    save_state(os.getpid(), port, html_file)

    version_token = str(html_file.stat().st_mtime_ns)
    url = f"http://127.0.0.1:{port}{DEBUG_ALIAS_PATH}?np_open={version_token}"
    try:
        source_rel = html_file.relative_to(static_root).as_posix()
    except ValueError:
        source_rel = html_file.name
    source_url = f"http://127.0.0.1:{port}/{quote(source_rel)}?np_open={version_token}"
    print(f"Notion Printer preview: {url}")
    print(f"Notion Printer source: {source_url}")
    if not no_open:
        open_browser(url)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        try:
            STATE_FILE.unlink()
        except FileNotFoundError:
            pass
    return 0


def stop_server() -> int:
    stop_previous_server()
    print("Stopped Notion Printer preview server.")
    return 0


def main() -> int:
    args = parse_args()
    if args.command == "serve":
        return serve_html(args.html_file, args.port, args.no_open, args.serve_dir)
    if args.command == "stop":
        return stop_server()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
