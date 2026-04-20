#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from notion_printer_learning import LEARNING_DATA_DIR, ensure_learning_directories


DATASET_VERSION = "v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build task-specific learning datasets from raw Notion Printer action logs."
    )
    parser.add_argument(
        "--learning-root",
        type=Path,
        default=LEARNING_DATA_DIR,
        help="Path to the learning_data root. Default: project learning_data directory.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Optional output directory for generated datasets. Defaults to <learning-root>/datasets.",
    )
    parser.add_argument(
        "--session-id",
        action="append",
        default=[],
        help="Limit building to one or more session ids.",
    )
    parser.add_argument(
        "--document-id",
        action="append",
        default=[],
        help="Limit building to one or more document ids.",
    )
    parser.add_argument(
        "--include-space-mode",
        action="store_true",
        help="Also build space mode dataset rows.",
    )
    return parser.parse_args()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        rows.append(json.loads(stripped))
    return rows


def load_manifests(documents_dir: Path) -> dict[tuple[str, str], dict[str, Any]]:
    manifests: dict[tuple[str, str], dict[str, Any]] = {}
    for path in sorted(documents_dir.rglob("manifest_*.json")):
        manifest = read_json(path)
        document_id = str(manifest.get("document_id") or "")
        variant = str(manifest.get("variant") or "")
        if not document_id or not variant:
            continue
        manifests[(document_id, variant)] = manifest
    return manifests


def load_sessions(sessions_dir: Path) -> dict[str, dict[str, Any]]:
    sessions: dict[str, dict[str, Any]] = {}
    for path in sorted(sessions_dir.glob("*.json")):
        payload = read_json(path)
        session = payload.get("session") if isinstance(payload.get("session"), dict) else payload
        session_id = str((session or {}).get("session_id") or "")
        if not session_id:
            continue
        sessions[session_id] = payload
    return sessions


def parse_int(value: Any, fallback: int = -1) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return parsed


def load_blocks(documents_dir: Path) -> tuple[dict[tuple[str, str], dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    block_lookup: dict[tuple[str, str], dict[str, Any]] = {}
    blocks_by_document: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for path in sorted(documents_dir.rglob("blocks.jsonl")):
        for block in read_jsonl(path):
            document_id = str(block.get("document_id") or "")
            persist_id = str(block.get("persist_id") or "")
            if not document_id or not persist_id:
                continue
            block_lookup[(document_id, persist_id)] = block
            blocks_by_document[document_id].append(block)

    for document_id, rows in blocks_by_document.items():
        rows.sort(key=lambda row: parse_int(row.get("order_index"), 10**9))
        blocks_by_document[document_id] = rows

    return block_lookup, blocks_by_document


def flatten_value(value: Any) -> Any:
    if isinstance(value, bool):
        return int(value)
    return value


def flatten_dict(prefix: str, data: dict[str, Any] | None) -> dict[str, Any]:
    flat: dict[str, Any] = {}
    for key, value in (data or {}).items():
        safe_key = f"{prefix}_{key}"
        if isinstance(value, dict):
            flat.update(flatten_dict(safe_key, value))
        elif isinstance(value, list):
            flat[safe_key] = json.dumps(value, ensure_ascii=False)
            flat[f"{safe_key}_count"] = len(value)
        else:
            flat[safe_key] = flatten_value(value)
    return flat


def manifest_features(manifest: dict[str, Any] | None) -> dict[str, Any]:
    result: dict[str, Any] = {}
    if not isinstance(manifest, dict):
        return result
    result["manifest_is_fast_variant"] = int(bool(manifest.get("is_fast_variant")))
    result["manifest_is_compact_variant"] = int(bool(manifest.get("is_compact_variant")))
    result["manifest_generator_version"] = manifest.get("generator_version") or ""
    result.update(flatten_dict("doc_static", manifest.get("features") if isinstance(manifest.get("features"), dict) else {}))
    return result


def event_persist_id(event: dict[str, Any]) -> str:
    target = event.get("target") if isinstance(event.get("target"), dict) else {}
    if target.get("persist_id"):
        return str(target.get("persist_id") or "")
    context = event.get("context") if isinstance(event.get("context"), dict) else {}
    block = context.get("block") if isinstance(context.get("block"), dict) else {}
    return str(block.get("persist_id") or "")


def contract_features(
    event: dict[str, Any],
    block_lookup: dict[tuple[str, str], dict[str, Any]],
    blocks_by_document: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    features: dict[str, Any] = {}
    document_id = str(event.get("document_id") or "")
    persist_id = event_persist_id(event)
    if not document_id or not persist_id:
        features["block_contract_match"] = 0
        return features

    block = block_lookup.get((document_id, persist_id))
    if not isinstance(block, dict):
        features["block_contract_match"] = 0
        return features

    features["block_contract_match"] = 1
    features.update(flatten_dict("block_contract", block))
    order_index = parse_int(block.get("order_index"), -1)
    ordered_blocks = blocks_by_document.get(document_id, [])
    if 0 <= order_index < len(ordered_blocks):
        previous_block = ordered_blocks[order_index - 1] if order_index > 0 else None
        next_block = ordered_blocks[order_index + 1] if order_index + 1 < len(ordered_blocks) else None
        if isinstance(previous_block, dict):
            features.update(flatten_dict("block_contract_prev", previous_block))
        if isinstance(next_block, dict):
            features.update(flatten_dict("block_contract_next", next_block))
    return features


def base_row(
    *,
    event: dict[str, Any],
    session_payload: dict[str, Any] | None,
    manifest: dict[str, Any] | None,
    block_lookup: dict[tuple[str, str], dict[str, Any]],
    blocks_by_document: dict[str, list[dict[str, Any]]],
    task: str,
) -> dict[str, Any]:
    session = session_payload.get("session") if isinstance(session_payload, dict) and isinstance(session_payload.get("session"), dict) else {}
    row = {
        "schema_version": 1,
        "dataset_version": DATASET_VERSION,
        "built_at": utc_now_iso(),
        "task": task,
        "sample_id": f"{task}:{event.get('event_id', 'unknown')}",
        "event_id": event.get("event_id") or "",
        "session_id": event.get("session_id") or session.get("session_id") or "",
        "document_id": event.get("document_id") or session.get("document_id") or "",
        "variant": event.get("variant") or session.get("variant") or "",
        "ts": event.get("ts") or "",
        "action_type": event.get("action_type") or "",
    }
    row.update(flatten_dict("target", event.get("target") if isinstance(event.get("target"), dict) else {}))
    row.update(flatten_dict("before", event.get("before") if isinstance(event.get("before"), dict) else {}))
    row.update(flatten_dict("after", event.get("after") if isinstance(event.get("after"), dict) else {}))
    context = event.get("context") if isinstance(event.get("context"), dict) else {}
    row.update(flatten_dict("doc", context.get("doc") if isinstance(context.get("doc"), dict) else {}))
    row.update(flatten_dict("page", context.get("page") if isinstance(context.get("page"), dict) else {}))
    row.update(flatten_dict("block", context.get("block") if isinstance(context.get("block"), dict) else {}))
    row.update(flatten_dict("neighbors", context.get("neighbors") if isinstance(context.get("neighbors"), dict) else {}))
    row.update(flatten_dict("ui", event.get("ui") if isinstance(event.get("ui"), dict) else {}))
    row.update(flatten_dict("meta", event.get("meta") if isinstance(event.get("meta"), dict) else {}))
    row.update(manifest_features(manifest))
    row.update(contract_features(event, block_lookup, blocks_by_document))
    return row


def build_break_row(
    event: dict[str, Any],
    session_payload: dict[str, Any] | None,
    manifest: dict[str, Any] | None,
    block_lookup: dict[tuple[str, str], dict[str, Any]],
    blocks_by_document: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    row = base_row(
        event=event,
        session_payload=session_payload,
        manifest=manifest,
        block_lookup=block_lookup,
        blocks_by_document=blocks_by_document,
        task="break_candidates",
    )
    after_mode = str((event.get("after") or {}).get("break_mode") or "")
    before_mode = str((event.get("before") or {}).get("break_mode") or "")
    row["label_force_break"] = int(after_mode == "force")
    row["label_break_mode"] = after_mode
    row["previous_break_mode"] = before_mode
    return row


def build_space_mode_row(
    event: dict[str, Any],
    session_payload: dict[str, Any] | None,
    manifest: dict[str, Any] | None,
    block_lookup: dict[tuple[str, str], dict[str, Any]],
    blocks_by_document: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    row = base_row(
        event=event,
        session_payload=session_payload,
        manifest=manifest,
        block_lookup=block_lookup,
        blocks_by_document=blocks_by_document,
        task="space_modes",
    )
    row["label_space_mode"] = str((event.get("after") or {}).get("space_mode") or "")
    row["previous_space_mode"] = str((event.get("before") or {}).get("space_mode") or "")
    return row


def build_gap_row(
    event: dict[str, Any],
    session_payload: dict[str, Any] | None,
    manifest: dict[str, Any] | None,
    block_lookup: dict[tuple[str, str], dict[str, Any]],
    blocks_by_document: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    row = base_row(
        event=event,
        session_payload=session_payload,
        manifest=manifest,
        block_lookup=block_lookup,
        blocks_by_document=blocks_by_document,
        task="gap_actions",
    )
    before_units = int((event.get("before") or {}).get("gap_units") or 0)
    after_units = int((event.get("after") or {}).get("gap_units") or 0)
    row["label_gap_delta"] = after_units - before_units
    row["label_gap_units_after"] = after_units
    row["label_gap_direction"] = "increase" if after_units > before_units else "decrease" if after_units < before_units else "same"
    return row


def build_image_scale_row(
    event: dict[str, Any],
    session_payload: dict[str, Any] | None,
    manifest: dict[str, Any] | None,
    block_lookup: dict[tuple[str, str], dict[str, Any]],
    blocks_by_document: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    row = base_row(
        event=event,
        session_payload=session_payload,
        manifest=manifest,
        block_lookup=block_lookup,
        blocks_by_document=blocks_by_document,
        task="image_scale",
    )
    before_scale = int((event.get("before") or {}).get("scale_pct") or 100)
    after_scale = int((event.get("after") or {}).get("scale_pct") or 100)
    row["label_target_scale_pct"] = after_scale
    row["label_scale_delta"] = after_scale - before_scale
    row["label_scale_bucket"] = (
        "default" if after_scale >= 100 else
        "mild_reduce" if after_scale >= 90 else
        "medium_reduce" if after_scale >= 75 else
        "strong_reduce"
    )
    return row


def build_delete_row(
    event: dict[str, Any],
    session_payload: dict[str, Any] | None,
    manifest: dict[str, Any] | None,
    block_lookup: dict[tuple[str, str], dict[str, Any]],
    blocks_by_document: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    row = base_row(
        event=event,
        session_payload=session_payload,
        manifest=manifest,
        block_lookup=block_lookup,
        blocks_by_document=blocks_by_document,
        task="delete_actions",
    )
    row["label_delete"] = int(bool((event.get("after") or {}).get("deleted")))
    row["label_delete_scope"] = str((event.get("target") or {}).get("node_kind") or "")
    return row


def build_page_delete_row(
    event: dict[str, Any],
    session_payload: dict[str, Any] | None,
    manifest: dict[str, Any] | None,
    block_lookup: dict[tuple[str, str], dict[str, Any]],
    blocks_by_document: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    row = base_row(
        event=event,
        session_payload=session_payload,
        manifest=manifest,
        block_lookup=block_lookup,
        blocks_by_document=blocks_by_document,
        task="page_delete_actions",
    )
    candidate_ids = (event.get("meta") or {}).get("candidate_ids")
    row["label_delete_page"] = int(bool((event.get("after") or {}).get("deleted")))
    row["label_candidate_count"] = len(candidate_ids) if isinstance(candidate_ids, list) else 0
    return row


def append_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def build_datasets(
    *,
    learning_root: Path,
    output_dir: Path,
    session_ids: set[str],
    document_ids: set[str],
    include_space_mode: bool,
) -> dict[str, int]:
    directories = ensure_learning_directories(learning_root)
    manifests = load_manifests(directories["documents"])
    sessions = load_sessions(directories["sessions"])
    block_lookup, blocks_by_document = load_blocks(directories["documents"])

    rows_by_dataset: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for event_path in sorted(directories["sessions"].glob("*.events.jsonl")):
        for event in read_jsonl(event_path):
            session_id = str(event.get("session_id") or "")
            document_id = str(event.get("document_id") or "")
            if session_ids and session_id not in session_ids:
                continue
            if document_ids and document_id not in document_ids:
                continue

            session_payload = sessions.get(session_id)
            manifest = manifests.get((document_id, str(event.get("variant") or "")))
            action_type = str(event.get("action_type") or "")

            if action_type == "set_break_mode":
                rows_by_dataset["break_candidates_v1.jsonl"].append(
                    build_break_row(event, session_payload, manifest, block_lookup, blocks_by_document)
                )
            elif action_type == "set_space_mode" and include_space_mode:
                rows_by_dataset["space_modes_v1.jsonl"].append(
                    build_space_mode_row(event, session_payload, manifest, block_lookup, blocks_by_document)
                )
            elif action_type == "adjust_gap":
                rows_by_dataset["gap_actions_v1.jsonl"].append(
                    build_gap_row(event, session_payload, manifest, block_lookup, blocks_by_document)
                )
            elif action_type == "set_image_scale":
                rows_by_dataset["image_scale_v1.jsonl"].append(
                    build_image_scale_row(event, session_payload, manifest, block_lookup, blocks_by_document)
                )
            elif action_type == "delete_node":
                rows_by_dataset["delete_actions_v1.jsonl"].append(
                    build_delete_row(event, session_payload, manifest, block_lookup, blocks_by_document)
                )
            elif action_type == "delete_page":
                rows_by_dataset["page_delete_actions_v1.jsonl"].append(
                    build_page_delete_row(event, session_payload, manifest, block_lookup, blocks_by_document)
                )

    output_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    for filename, rows in sorted(rows_by_dataset.items()):
        target = output_dir / filename
        append_jsonl(target, rows)
        counts[filename] = len(rows)
    return counts


def main() -> int:
    args = parse_args()
    learning_root = args.learning_root.resolve()
    directories = ensure_learning_directories(learning_root)
    output_dir = (args.output_dir.resolve() if args.output_dir else directories["datasets"])
    counts = build_datasets(
        learning_root=learning_root,
        output_dir=output_dir,
        session_ids=set(args.session_id),
        document_ids=set(args.document_id),
        include_space_mode=args.include_space_mode,
    )

    if not counts:
        print("No dataset rows were generated.")
        return 0

    print("Generated datasets:")
    for filename, count in sorted(counts.items()):
        print(f"- {output_dir / filename} ({count} rows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
