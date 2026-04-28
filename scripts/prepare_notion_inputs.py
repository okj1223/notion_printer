#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shlex
import shutil
import sys
import zipfile
from pathlib import Path, PurePosixPath


PRINT_OUTPUT_RE = re.compile(r"_print(?:_compact)?(?:_fast)?\.html$", re.IGNORECASE)
NOTION_PAGE_BODY_RE = re.compile(
    r"\bclass\s*=\s*(['\"])[^'\"]*\bpage-body\b[^'\"]*\1",
    re.IGNORECASE,
)


def safe_slug(value: str) -> str:
    slug = re.sub(r"[^0-9A-Za-z._-]+", "_", value).strip("._")
    return slug or "document"


def path_within_generated_subdir(path: Path, source_root: Path) -> bool:
    try:
        relative_parent = path.resolve().parent.relative_to(source_root.resolve())
    except ValueError:
        return False
    return any(part.startswith("_notion_printer_") or part.startswith("_runs") for part in relative_parent.parts)


def is_source_html(path: Path, source_root: Path) -> bool:
    if not path.is_file():
        return False
    if path.suffix.lower() != ".html":
        return False
    if PRINT_OUTPUT_RE.search(path.name):
        return False
    if path_within_generated_subdir(path, source_root):
        return False
    if not has_notion_page_body(path):
        return False
    return True


def has_notion_page_body(path: Path) -> bool:
    try:
        raw_html = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False
    return bool(NOTION_PAGE_BODY_RE.search(raw_html))


def path_within_managed_output(path: Path) -> bool:
    managed_prefixes = (
        "_notion_printer_integrated_factory",
        "_notion_printer_debug_factory",
    )
    return any(part.startswith(managed_prefixes) or part == "_runs" for part in path.resolve().parts)


def discover_source_htmls(source_root: Path) -> list[Path]:
    return sorted(path.resolve() for path in source_root.rglob("*.html") if is_source_html(path, source_root))


def archive_signature(zip_path: Path) -> dict[str, object]:
    stat = zip_path.stat()
    return {
        "source_zip": str(zip_path.resolve()),
        "size": stat.st_size,
        "mtime_ns": stat.st_mtime_ns,
    }


def import_root_for_zip(zip_path: Path) -> Path:
    signature = archive_signature(zip_path)
    digest_source = f"{signature['source_zip']}::{signature['size']}::{signature['mtime_ns']}"
    digest = hashlib.sha1(digest_source.encode("utf-8")).hexdigest()[:10]
    base_dir = zip_path.parent / "_notion_printer_imported_sources"
    return base_dir / f"{safe_slug(zip_path.stem)}-{digest}"


def manifest_path(import_root: Path) -> Path:
    return import_root / ".notion-printer-import.json"


def can_reuse_import(import_root: Path, zip_path: Path) -> bool:
    manifest_file = manifest_path(import_root)
    source_root = import_root / "source"
    if not manifest_file.exists() or not source_root.exists():
        return False
    try:
        current = json.loads(manifest_file.read_text(encoding="utf-8"))
    except Exception:
        return False
    return current.get("archive_signature") == archive_signature(zip_path)


def validated_zip_member_path(member: zipfile.ZipInfo, destination: Path) -> Path:
    raw_name = member.filename.replace("\\", "/")
    member_path = PurePosixPath(raw_name)
    parts = member_path.parts
    if (
        not raw_name.strip()
        or member_path.is_absolute()
        or not parts
        or any(part in {"", ".", ".."} for part in parts)
        or re.match(r"^[A-Za-z]:", parts[0])
    ):
        raise ValueError(f"ZIP 안에 안전하지 않은 경로가 있습니다: {member.filename}")

    root = destination.resolve()
    target = destination.joinpath(*parts).resolve()
    try:
        target.relative_to(root)
    except ValueError as error:
        raise ValueError(f"ZIP 안에 import 폴더 밖을 가리키는 경로가 있습니다: {member.filename}") from error
    return target


def validate_zip_members(archive: zipfile.ZipFile, destination: Path) -> None:
    for member in archive.infolist():
        validated_zip_member_path(member, destination)


def extract_zip_file(zip_path: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as archive:
        validate_zip_members(archive, destination)
        archive.extractall(destination)


def extract_nested_archives(root: Path) -> int:
    extracted_count = 0
    seen: set[Path] = set()
    while True:
        pending = sorted(path for path in root.rglob("*.zip") if path.is_file() and path.resolve() not in seen)
        if not pending:
            return extracted_count
        for nested_zip in pending:
            seen.add(nested_zip.resolve())
            destination = nested_zip.parent / safe_slug(nested_zip.stem)
            if destination.exists():
                suffix = 1
                while (nested_zip.parent / f"{destination.name}-{suffix:02d}").exists():
                    suffix += 1
                destination = nested_zip.parent / f"{destination.name}-{suffix:02d}"
            destination.mkdir(parents=True, exist_ok=True)
            extract_zip_file(nested_zip, destination)
            extracted_count += 1


def prepare_zip_input(zip_path: Path) -> dict[str, object]:
    import_root = import_root_for_zip(zip_path)
    source_root = import_root / "source"

    if not can_reuse_import(import_root, zip_path):
        shutil.rmtree(import_root, ignore_errors=True)
        source_root.mkdir(parents=True, exist_ok=True)
        extract_zip_file(zip_path, source_root)
        nested_count = extract_nested_archives(source_root)
        manifest = {
            "archive_signature": archive_signature(zip_path),
            "nested_archives_extracted": nested_count,
        }
        manifest_path(import_root).write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    html_paths = discover_source_htmls(source_root)
    if not html_paths:
        raise ValueError(
            f"ZIP 안에서 Notion 원본 HTML을 찾지 못했습니다: {zip_path}\n"
            "압축 안에 Notion export HTML이 포함되어 있는지 확인해 주세요."
        )

    return {
        "kind": "zip",
        "source": str(zip_path.resolve()),
        "output_base": str(zip_path.parent.resolve()),
        "import_root": str(import_root.resolve()),
        "resolved_inputs": [str(path) for path in html_paths],
    }


def prepare_html_input(html_path: Path) -> dict[str, object]:
    if PRINT_OUTPUT_RE.search(html_path.name) or path_within_managed_output(html_path):
        raise ValueError(
            f"생성된 출력 HTML은 입력으로 다시 사용할 수 없습니다: {html_path}\n"
            "원본 Notion export HTML 또는 ZIP 파일을 선택해 주세요."
        )

    return {
        "kind": "html",
        "source": str(html_path.resolve()),
        "output_base": str(html_path.parent.resolve()),
        "resolved_inputs": [str(html_path.resolve())],
    }


def prepare_inputs(raw_inputs: list[str]) -> dict[str, object]:
    if not raw_inputs:
        raise ValueError("입력 파일이 없습니다.")

    prepared_items: list[dict[str, object]] = []
    deduped_paths: list[str] = []
    seen_paths: set[str] = set()
    output_base: str | None = None
    first_input_kind: str | None = None
    first_input_path: str | None = None

    for raw in raw_inputs:
        path = Path(raw).expanduser().resolve()
        if not path.exists() or not path.is_file():
            raise FileNotFoundError(f"파일을 찾을 수 없습니다: {raw}")

        suffix = path.suffix.lower()
        if suffix == ".html":
            prepared = prepare_html_input(path)
        elif suffix == ".zip":
            prepared = prepare_zip_input(path)
        else:
            raise ValueError(f"지원하지 않는 파일 형식입니다: {path}\nHTML 또는 ZIP 파일만 선택할 수 있습니다.")

        prepared_items.append(prepared)
        if output_base is None:
            output_base = str(Path(str(prepared["output_base"])).resolve())
            first_input_kind = str(prepared["kind"])
            first_input_path = str(Path(str(prepared["source"])).resolve())

        for resolved in prepared["resolved_inputs"]:
            if resolved in seen_paths:
                continue
            deduped_paths.append(resolved)
            seen_paths.add(resolved)

    if not deduped_paths:
        raise ValueError("처리할 HTML 문서를 찾지 못했습니다.")

    zip_count = sum(1 for item in prepared_items if item["kind"] == "zip")
    html_count = sum(1 for item in prepared_items if item["kind"] == "html")
    return {
        "prepared_items": prepared_items,
        "resolved_inputs": deduped_paths,
        "output_base": output_base,
        "first_input_kind": first_input_kind,
        "first_input_path": first_input_path,
        "zip_count": zip_count,
        "html_count": html_count,
    }


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def emit_shell(payload: dict[str, object]) -> str:
    resolved_inputs = payload["resolved_inputs"]
    prepared_items = payload["prepared_items"]
    lines = [
        f"PREPARED_OUTPUT_BASE={shell_quote(str(payload['output_base']))}",
        f"PREPARED_FIRST_INPUT_KIND={shell_quote(str(payload['first_input_kind']))}",
        f"PREPARED_FIRST_INPUT_PATH={shell_quote(str(payload['first_input_path']))}",
        f"PREPARED_HTML_COUNT={shell_quote(str(payload['html_count']))}",
        f"PREPARED_ZIP_COUNT={shell_quote(str(payload['zip_count']))}",
        f"PREPARED_TOTAL_DOCS={shell_quote(str(len(resolved_inputs)))}",
        f"PREPARED_TOTAL_SELECTIONS={shell_quote(str(len(prepared_items)))}",
        "PREPARED_INPUTS=(",
    ]
    for item in resolved_inputs:
        lines.append(f"  {shell_quote(str(item))}")
    lines.append(")")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepare Notion Printer inputs by validating HTML files and extracting ZIP exports."
    )
    parser.add_argument("--shell", action="store_true", help="Emit a shell-evaluable payload.")
    parser.add_argument("inputs", nargs="+", help="HTML or ZIP inputs.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        payload = prepare_inputs(args.inputs)
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1

    if args.shell:
        print(emit_shell(payload))
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
