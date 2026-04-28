#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import random
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
EXPORTER = REPO_ROOT / "notion_print_export.py"
PREVIEW_SERVER = REPO_ROOT / "notion_print_preview.py"
DEFAULT_SOURCE_ROOT = Path.home() / "Downloads" / "개인 페이지 & 공유된 페이지"
DEFAULT_OUTPUT_ROOT = DEFAULT_SOURCE_ROOT / "_notion_printer_debug_factory"
PREVIEW_STATE_FILE = Path(os.environ.get("NOTION_PRINTER_PREVIEW_STATE_FILE", "/tmp/notion_printer_preview_server.json"))
DEBUG_ALIAS_PATH = "/_notion_printer_debug.html"
PRINT_OUTPUT_RE = re.compile(r"_print(?:_compact)?(?:_fast)?\.html$", re.IGNORECASE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run a random Notion Printer debug batch against source exports in the Downloads folder. "
            "Generates real print HTML outputs and opens the last generated HTML in the preview server."
        )
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        default=DEFAULT_SOURCE_ROOT,
        help=f"Directory containing original Notion export HTML files. Default: {DEFAULT_SOURCE_ROOT}",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
        help=f"Directory where batch outputs are written. Default: {DEFAULT_OUTPUT_ROOT}",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=2,
        help="How many random source files to process per batch. Default: 2.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        help="Optional random seed. Defaults to the current timestamp.",
    )
    parser.add_argument(
        "--match",
        help="Optional substring filter for source HTML filenames before random sampling.",
    )
    parser.add_argument(
        "--variants",
        nargs="+",
        choices=("print", "compact"),
        default=("compact",),
        help="Base output variants to generate. Default: compact.",
    )
    parser.add_argument(
        "--no-fast",
        action="store_true",
        help="Disable fast preview outputs. Default is to generate fast outputs too.",
    )
    parser.add_argument(
        "--preferred-output",
        choices=("auto", "print", "compact", "print_fast", "compact_fast"),
        default="auto",
        help="Which generated HTML to preview. Default: auto (prefers fast outputs).",
    )
    parser.add_argument(
        "--max-edge",
        type=int,
        default=1200,
        help="Longest edge for fast preview assets. Default: 1200.",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=68,
        help="WEBP quality for fast preview assets. Default: 68.",
    )
    parser.add_argument(
        "--font-size",
        choices=("xsmall", "small", "normal", "large", "xlarge"),
        default="normal",
        help="Base print font size preset. Default: normal.",
    )
    parser.add_argument(
        "--page-numbers",
        choices=("on", "off"),
        default="on",
        help="Whether to include page numbers. Default: on.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=30.0,
        help="How long to wait for the preview server to come up. Default: 30.",
    )
    parser.add_argument(
        "--no-open-last",
        action="store_true",
        help="Do not open the last preview automatically.",
    )
    return parser.parse_args()


def safe_slug(value: str) -> str:
    slug = re.sub(r"[^0-9A-Za-z._-]+", "_", value).strip("._")
    return slug or "document"


def path_within_generated_subdir(path: Path, source_root: Path) -> bool:
    resolved_path = path.resolve()
    resolved_root = source_root.resolve()
    try:
        relative_parent = resolved_path.parent.relative_to(resolved_root)
    except ValueError:
        return False
    return any(part.startswith("_notion_printer_") or part.startswith("_runs") for part in relative_parent.parts)


def is_source_html(path: Path, source_root: Path, output_root: Path, match_text: str | None) -> bool:
    if not path.is_file():
        return False
    if path.suffix.lower() != ".html":
        return False
    if PRINT_OUTPUT_RE.search(path.name):
        return False
    if output_root in path.parents:
        return False
    if path_within_generated_subdir(path, source_root):
        return False
    if match_text and match_text.lower() not in path.name.lower():
        return False
    return True


def discover_sources(source_root: Path, output_root: Path, match_text: str | None) -> list[Path]:
    return sorted(path for path in source_root.rglob("*.html") if is_source_html(path, source_root, output_root, match_text))


def choose_sources(candidates: list[Path], count: int, seed: int) -> list[Path]:
    rng = random.Random(seed)
    selected_count = min(len(candidates), count)
    return rng.sample(candidates, selected_count)


def build_run_directory(output_root: Path, seed: int) -> Path:
    stamp = time.strftime("%Y%m%d_%H%M%S")
    run_dir = output_root / f"run_{stamp}_seed{seed}"
    run_dir.mkdir(parents=True, exist_ok=False)
    return run_dir


def stage_source_context(source_dir: Path, sample_dir: Path, output_root: Path) -> None:
    output_root = output_root.resolve()
    for child in source_dir.iterdir():
        resolved = child.resolve()
        if resolved == output_root or output_root in resolved.parents:
            continue
        if child.is_file() and child.suffix.lower() == ".html":
            continue
        target = sample_dir / child.name
        if target.exists():
            continue
        target.symlink_to(resolved, target_is_directory=child.is_dir())


def pick_preferred_generated_html(output_dir: Path, input_stem: str, preference: str) -> Path:
    candidates = sorted(
        path
        for path in output_dir.iterdir()
        if path.is_file()
        and path.suffix.lower() == ".html"
        and path.name.startswith(f"{input_stem}_print")
    )
    if not candidates:
        raise FileNotFoundError(f"No generated print HTML files found in {output_dir}")
    order = {
        "auto": (
            f"{input_stem}_print_compact_fast.html",
            f"{input_stem}_print_compact.html",
            f"{input_stem}_print_fast.html",
            f"{input_stem}_print.html",
        ),
        "compact_fast": (f"{input_stem}_print_compact_fast.html",),
        "compact": (f"{input_stem}_print_compact.html",),
        "print_fast": (f"{input_stem}_print_fast.html",),
        "print": (f"{input_stem}_print.html",),
    }
    candidate_map = {path.name: path for path in candidates}
    for name in order[preference]:
        if name in candidate_map:
            return candidate_map[name]
    available = ", ".join(sorted(candidate_map))
    raise FileNotFoundError(f"Preferred output {preference!r} was not generated. Available: {available}")


def run_export(source_html: Path, output_dir: Path, args: argparse.Namespace) -> Path:
    command = [
        sys.executable,
        str(EXPORTER),
        str(source_html),
        "--output-dir",
        str(output_dir),
        "--preferred-output",
        args.preferred_output,
        "--open",
        "none",
        "--page-numbers",
        args.page_numbers,
        "--font-size",
        args.font_size,
        "--max-edge",
        str(args.max_edge),
        "--quality",
        str(args.quality),
        "--variants",
        *args.variants,
    ]
    if args.no_fast:
        command.append("--no-fast")
    subprocess.run(command, check=True, cwd=str(REPO_ROOT))
    return pick_preferred_generated_html(output_dir, source_html.stem, args.preferred_output)


def read_preview_state() -> dict[str, Any]:
    if not PREVIEW_STATE_FILE.exists():
        return {}
    try:
        return json.loads(PREVIEW_STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def start_preview_server(html_path: Path, *, open_browser: bool, output_dir: Path) -> subprocess.Popen[str]:
    log_path = output_dir / "preview_server.log"
    log_handle = log_path.open("a", encoding="utf-8")
    command = [sys.executable, str(PREVIEW_SERVER), "serve", str(html_path)]
    if not open_browser:
        command.append("--no-open")
    process = subprocess.Popen(
        command,
        cwd=str(REPO_ROOT),
        stdin=subprocess.DEVNULL,
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
    )
    return process


def wait_for_preview_url(html_path: Path, timeout_seconds: float) -> str:
    expected_html = str(html_path.resolve())
    deadline = time.time() + timeout_seconds
    last_port = None
    while time.time() < deadline:
        state = read_preview_state()
        state_html = str(state.get("html_file") or "")
        port = int(state.get("port") or 0)
        if state_html == expected_html and port > 0:
            last_port = port
            url = f"http://127.0.0.1:{port}{DEBUG_ALIAS_PATH}?np_factory={int(time.time() * 1000)}"
            try:
                with urlopen(url, timeout=2.0) as response:
                    if response.status == 200:
                        return url
            except URLError:
                pass
            except Exception:
                pass
        time.sleep(0.25)
    if last_port:
        raise TimeoutError(f"Preview server started on port {last_port}, but the HTML did not become ready in time.")
    raise TimeoutError(f"Timed out waiting for preview server for {html_path}")


def write_summary(run_dir: Path, payload: dict[str, Any]) -> Path:
    summary_path = run_dir / "factory_summary.json"
    summary_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary_path


def validate_args(args: argparse.Namespace) -> None:
    if args.preferred_output == "auto":
        return
    if args.preferred_output.startswith("compact") and "compact" not in args.variants:
        raise ValueError("preferred-output=compact 계열은 --variants compact가 필요합니다.")
    if args.preferred_output.startswith("print") and "print" not in args.variants:
        raise ValueError("preferred-output=print 계열은 --variants print가 필요합니다.")
    if args.preferred_output.endswith("_fast") and args.no_fast:
        raise ValueError("preferred-output fast 계열은 --no-fast 없이 실행해야 합니다.")


def main() -> int:
    args = parse_args()
    try:
        validate_args(args)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1

    source_root = args.source_root.resolve()
    output_root = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    if not source_root.exists():
        print(f"Source root not found: {source_root}", file=sys.stderr)
        return 1

    seed = args.seed if args.seed is not None else int(time.time())
    candidates = discover_sources(source_root, output_root, args.match)
    if not candidates:
        print(f"No original source HTML files found under {source_root}", file=sys.stderr)
        return 1

    if args.count <= 0:
        print("--count must be greater than 0", file=sys.stderr)
        return 1

    selected_sources = choose_sources(candidates, args.count, seed)
    run_dir = build_run_directory(output_root, seed)
    results: list[dict[str, Any]] = []
    failures = 0

    print(f"Debug factory run: {run_dir}")
    print(f"Seed: {seed}")
    print("Selected sources:")
    for source in selected_sources:
        print(f"- {source}")

    last_preview_html: Path | None = None
    last_preview_url: str | None = None

    for index, source_html in enumerate(selected_sources, start=1):
        sample_slug = f"{index:02d}_{safe_slug(source_html.stem)}"
        sample_dir = run_dir / sample_slug
        sample_dir.mkdir(parents=True, exist_ok=True)
        sample_result: dict[str, Any] = {
            "index": index,
            "source_html": str(source_html),
            "sample_dir": str(sample_dir),
        }
        print(f"[{index}/{len(selected_sources)}] Exporting {source_html.name}")
        try:
            stage_source_context(source_html.parent, sample_dir, output_root)
            preferred_html = run_export(source_html, sample_dir, args)
            sample_result["preferred_html"] = str(preferred_html)

            open_browser = index == len(selected_sources) and not args.no_open_last
            start_preview_server(preferred_html, open_browser=open_browser, output_dir=sample_dir)
            preview_url = wait_for_preview_url(preferred_html, args.timeout_seconds)
            sample_result["preview_url"] = preview_url

            sample_result["status"] = "ok"
            last_preview_html = preferred_html
            last_preview_url = preview_url
        except Exception as error:
            failures += 1
            sample_result["status"] = "error"
            sample_result["error"] = str(error)
            print(f"[{index}/{len(selected_sources)}] Failed: {error}", file=sys.stderr)
        results.append(sample_result)

    summary_payload = {
        "run_dir": str(run_dir),
        "seed": seed,
        "source_root": str(source_root),
        "output_root": str(output_root),
        "count": args.count,
        "selected_count": len(selected_sources),
        "variants": list(args.variants),
        "fast_enabled": not args.no_fast,
        "preferred_output": args.preferred_output,
        "font_size": args.font_size,
        "page_numbers": args.page_numbers,
        "results": results,
        "last_preview_html": str(last_preview_html) if last_preview_html else None,
        "last_preview_url": last_preview_url,
    }
    summary_path = write_summary(run_dir, summary_payload)

    print(f"Summary: {summary_path}")
    if last_preview_url:
        print(f"Last preview: {last_preview_url}")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
