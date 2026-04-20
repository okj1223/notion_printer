#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import html as html_lib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


SCHEMA_VERSION = 1
GENERATOR_VERSION = "learning-mvp-1"
PROJECT_DIR = Path(__file__).resolve().parent
LEARNING_DATA_DIR = PROJECT_DIR / "learning_data"

TAG_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")
NON_SLUG_RE = re.compile(r"[^a-z0-9]+")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sha1_text(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()


def safe_slug(value: str, fallback: str = "document") -> str:
    lowered = value.strip().lower()
    lowered = NON_SLUG_RE.sub("-", lowered)
    lowered = lowered.strip("-")
    return lowered or fallback


def strip_html_tags(html: str) -> str:
    unescaped = html_lib.unescape(TAG_RE.sub(" ", html))
    return WHITESPACE_RE.sub(" ", unescaped).strip()


def ensure_learning_directories(root_dir: Path | None = None) -> dict[str, Path]:
    base = (root_dir or LEARNING_DATA_DIR).resolve()
    raw_dir = base / "raw"
    docs_dir = raw_dir / "documents"
    sessions_dir = raw_dir / "sessions"
    events_dir = raw_dir / "events"
    datasets_dir = base / "datasets"
    models_dir = base / "models"
    for path in (base, raw_dir, docs_dir, sessions_dir, events_dir, datasets_dir, models_dir):
        path.mkdir(parents=True, exist_ok=True)
    return {
        "base": base,
        "raw": raw_dir,
        "documents": docs_dir,
        "sessions": sessions_dir,
        "events": events_dir,
        "datasets": datasets_dir,
        "models": models_dir,
    }


def extract_document_features(html: str) -> dict[str, int]:
    plain_text = strip_html_tags(html)
    return {
        "section_count": len(re.findall(r"<h3\b", html, flags=re.IGNORECASE)),
        "paragraph_count": len(re.findall(r"<p\b", html, flags=re.IGNORECASE)),
        "image_count": len(re.findall(r"<img\b", html, flags=re.IGNORECASE)),
        "table_count": len(re.findall(r"<table\b", html, flags=re.IGNORECASE)),
        "bulleted_list_count": len(re.findall(r"<ul\b", html, flags=re.IGNORECASE)),
        "numbered_list_count": len(re.findall(r"<ol\b", html, flags=re.IGNORECASE)),
        "list_item_count": len(re.findall(r"<li\b", html, flags=re.IGNORECASE)),
        "details_count": len(re.findall(r"<details\b", html, flags=re.IGNORECASE)),
        "text_char_count": len(plain_text),
    }


def build_document_id(input_path: Path, source_html: str) -> str:
    source_hash = sha1_text(source_html)[:12]
    stem = safe_slug(input_path.stem)[:48]
    return f"doc_{stem}_{source_hash}"


def build_document_manifest(
    *,
    input_path: Path,
    output_path: Path,
    variant_name: str,
    body_classes: Iterable[str],
    source_html: str,
) -> dict[str, object]:
    body_class_list = [cls for cls in body_classes if cls]
    source_hash = sha1_text(source_html)
    document_id = build_document_id(input_path, source_html)
    return {
        "schema_version": SCHEMA_VERSION,
        "generator_version": GENERATOR_VERSION,
        "generated_at": utc_now_iso(),
        "document_id": document_id,
        "source_hash": source_hash,
        "input_file": str(input_path),
        "input_name": input_path.name,
        "output_file": str(output_path),
        "output_name": output_path.name,
        "variant": variant_name,
        "body_classes": body_class_list,
        "is_fast_variant": variant_name.endswith("fast"),
        "is_compact_variant": "print-compact" in body_class_list,
        "features": extract_document_features(source_html),
    }


def document_manifest_path(manifest: dict[str, object], root_dir: Path | None = None) -> Path:
    directories = ensure_learning_directories(root_dir)
    document_id = safe_slug(str(manifest.get("document_id") or "unknown-document"))
    variant = safe_slug(str(manifest.get("variant") or "unknown-variant"))
    doc_dir = directories["documents"] / document_id
    doc_dir.mkdir(parents=True, exist_ok=True)
    return doc_dir / f"manifest_{variant}.json"


def write_document_manifest(manifest: dict[str, object], root_dir: Path | None = None) -> Path:
    target = document_manifest_path(manifest, root_dir=root_dir)
    target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return target


def build_blocks_payload(
    *,
    manifest: dict[str, object],
    blocks: list[dict[str, object]],
) -> dict[str, object]:
    document_id = str(manifest.get("document_id") or "unknown-document")
    variant = str(manifest.get("variant") or "")
    normalized_blocks: list[dict[str, object]] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        normalized = dict(block)
        normalized.setdefault("schema_version", SCHEMA_VERSION)
        normalized.setdefault("document_id", document_id)
        normalized.setdefault("variant", variant)
        normalized_blocks.append(normalized)
    return {
        "schema_version": SCHEMA_VERSION,
        "document_id": document_id,
        "variant": variant,
        "generated_at": utc_now_iso(),
        "block_count": len(normalized_blocks),
        "blocks": normalized_blocks,
    }


def blocks_manifest_path(payload: dict[str, object], root_dir: Path | None = None) -> Path:
    directories = ensure_learning_directories(root_dir)
    document_id = safe_slug(str(payload.get("document_id") or "unknown-document"))
    doc_dir = directories["documents"] / document_id
    doc_dir.mkdir(parents=True, exist_ok=True)
    return doc_dir / "blocks.jsonl"


def write_blocks_payload(payload: dict[str, object], root_dir: Path | None = None) -> Path:
    target = blocks_manifest_path(payload, root_dir=root_dir)
    blocks = payload.get("blocks")
    rows = blocks if isinstance(blocks, list) else []
    with target.open("w", encoding="utf-8") as handle:
        for row in rows:
            if not isinstance(row, dict):
                continue
            enriched = dict(row)
            enriched.setdefault("schema_version", SCHEMA_VERSION)
            enriched.setdefault("document_id", payload.get("document_id") or "")
            enriched.setdefault("variant", payload.get("variant") or "")
            handle.write(json.dumps(enriched, ensure_ascii=False) + "\n")
    return target


def write_session_payload(payload: dict[str, object], root_dir: Path | None = None) -> Path:
    directories = ensure_learning_directories(root_dir)
    session = payload.get("session") if isinstance(payload.get("session"), dict) else payload
    session_id = safe_slug(str((session or {}).get("session_id") or "unknown-session"))
    target = directories["sessions"] / f"{session_id}.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if isinstance(payload.get("blocks"), dict):
        write_blocks_payload(payload["blocks"], root_dir=root_dir)
    return target


def append_events_payload(payload: dict[str, object], root_dir: Path | None = None) -> list[Path]:
    directories = ensure_learning_directories(root_dir)
    events = payload.get("events")
    if not isinstance(events, list) or not events:
        return []

    session = payload.get("session") if isinstance(payload.get("session"), dict) else {}
    manifest = payload.get("manifest")
    if isinstance(manifest, dict):
        write_document_manifest(manifest, root_dir=root_dir)
    blocks_payload = payload.get("blocks")
    blocks_path = None
    if isinstance(blocks_payload, dict):
        blocks_path = write_blocks_payload(blocks_payload, root_dir=root_dir)

    session_id = safe_slug(str(session.get("session_id") or "unknown-session"))
    daily_target = directories["events"] / f"{datetime.now(timezone.utc).date().isoformat()}.jsonl"
    session_target = directories["sessions"] / f"{session_id}.events.jsonl"

    written: list[Path] = []
    with daily_target.open("a", encoding="utf-8") as daily_file, session_target.open("a", encoding="utf-8") as session_file:
        for event in events:
            if not isinstance(event, dict):
                continue
            enriched_event = dict(event)
            enriched_event.setdefault("schema_version", SCHEMA_VERSION)
            enriched_event.setdefault("server_received_at", utc_now_iso())
            line = json.dumps(enriched_event, ensure_ascii=False)
            daily_file.write(line + "\n")
            session_file.write(line + "\n")
    written.extend([daily_target, session_target])
    if blocks_path is not None:
        written.append(blocks_path)
    return written
