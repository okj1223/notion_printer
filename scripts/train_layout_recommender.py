#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from notion_printer_learning import LEARNING_DATA_DIR, ensure_learning_directories


MODEL_VERSION = "layout_recommender_v1"
DATASET_VERSION = "v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train a lightweight layout recommender from generated learning datasets."
    )
    parser.add_argument(
        "--learning-root",
        type=Path,
        default=LEARNING_DATA_DIR,
        help="Path to learning_data root. Default: project learning_data directory.",
    )
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        help="Optional dataset directory. Defaults to <learning-root>/datasets.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional output model path. Defaults to <learning-root>/models/layout_recommender_v1.json.",
    )
    return parser.parse_args()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        rows.append(json.loads(stripped))
    return rows


def safe_float(value: Any, default: float | None = None) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_int(value: Any, default: int | None = None) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def mean_or(default: float, values: list[float]) -> float:
    return float(statistics.fmean(values)) if values else default


def median_or(default: float, values: list[float]) -> float:
    return float(statistics.median(values)) if values else default


def grouped_positive_rate(rows: list[dict[str, Any]], key: str, is_positive) -> dict[str, dict[str, float | int]]:
    buckets: dict[str, list[int]] = {}
    for row in rows:
        bucket_key = str(row.get(key) or "unknown")
        buckets.setdefault(bucket_key, []).append(1 if is_positive(row) else 0)
    result: dict[str, dict[str, float | int]] = {}
    for bucket_key, labels in sorted(buckets.items()):
        positives = sum(labels)
        total = len(labels)
        result[bucket_key] = {
            "sample_count": total,
            "positive_count": positives,
            "positive_rate": round(positives / total, 4) if total else 0.0,
        }
    return result


def build_break_model(rows: list[dict[str, Any]]) -> dict[str, Any]:
    positives = [row for row in rows if int(row.get("label_force_break") or 0) == 1]
    positive_remaining = [
        value for value in (safe_float(row.get("page_remaining_space_px")) for row in positives)
        if value is not None
    ]
    positive_text = [
        value for value in (safe_float(row.get("block_text_char_count")) for row in positives)
        if value is not None
    ]
    global_positive_rate = round((len(positives) / len(rows)), 4) if rows else 0.0
    threshold = min(0.78, max(0.58, global_positive_rate + 0.26)) if rows else 0.62
    model = {
        "sample_count": len(rows),
        "positive_count": len(positives),
        "global_positive_rate": global_positive_rate,
        "global_force_rate": global_positive_rate,
        "suggestion_threshold": round(threshold, 4),
        "threshold_hints": {
            "remaining_space_px_hard": round(median_or(72.0, positive_remaining), 2),
            "remaining_space_px_soft": round(max(96.0, mean_or(120.0, positive_remaining) * 1.35), 2) if positive_remaining else 120.0,
            "text_char_count_soft": round(median_or(140.0, positive_text), 2),
        },
        "by_block_type": grouped_positive_rate(rows, "block_block_type", lambda row: int(row.get("label_force_break") or 0) == 1),
    }
    return model


def build_gap_model(rows: list[dict[str, Any]]) -> dict[str, Any]:
    positives = [row for row in rows if safe_int(row.get("label_gap_delta"), 0) > 0]
    positive_delta = [
        value for value in (safe_float(row.get("label_gap_units_after")) for row in positives)
        if value is not None
    ]
    remaining_values = [
        value for value in (safe_float(row.get("page_remaining_space_px")) for row in positives)
        if value is not None
    ]
    return {
        "sample_count": len(rows),
        "positive_count": len(positives),
        "global_positive_rate": round((len(positives) / len(rows)), 4) if rows else 0.0,
        "avg_positive_units_after": round(mean_or(1.0, positive_delta), 2),
        "threshold_hints": {
            "remaining_space_px_tight": round(median_or(56.0, remaining_values), 2),
            "remaining_space_px_soft": round(max(72.0, mean_or(96.0, remaining_values) * 1.2), 2) if remaining_values else 96.0,
        },
        "by_block_type": grouped_positive_rate(rows, "block_block_type", lambda row: safe_int(row.get("label_gap_delta"), 0) > 0),
    }


def build_image_model(rows: list[dict[str, Any]]) -> dict[str, Any]:
    reduced = [row for row in rows if safe_int(row.get("label_target_scale_pct"), 100) < 100]
    target_scales = [
        value for value in (safe_float(row.get("label_target_scale_pct")) for row in reduced)
        if value is not None
    ]
    remaining_values = [
        value for value in (safe_float(row.get("page_remaining_space_px")) for row in reduced)
        if value is not None
    ]
    image_heights = [
        value for value in (safe_float(row.get("block_dom_height_px")) for row in reduced)
        if value is not None
    ]
    return {
        "sample_count": len(rows),
        "positive_count": len(reduced),
        "global_positive_rate": round((len(reduced) / len(rows)), 4) if rows else 0.0,
        "avg_target_scale_pct": round(mean_or(88.0, target_scales), 2),
        "min_target_scale_pct": round(min(target_scales), 2) if target_scales else 68.0,
        "threshold_hints": {
            "remaining_space_px": round(median_or(60.0, remaining_values), 2),
            "image_dom_height_px": round(median_or(260.0, image_heights), 2),
        },
        "by_block_type": grouped_positive_rate(rows, "block_block_type", lambda row: safe_int(row.get("label_target_scale_pct"), 100) < 100),
    }


def build_delete_model(rows: list[dict[str, Any]]) -> dict[str, Any]:
    positives = [row for row in rows if int(row.get("label_delete") or 0) == 1]
    return {
        "sample_count": len(rows),
        "positive_count": len(positives),
        "global_positive_rate": round((len(positives) / len(rows)), 4) if rows else 0.0,
        "by_block_type": grouped_positive_rate(rows, "block_block_type", lambda row: int(row.get("label_delete") or 0) == 1),
        "by_scope": grouped_positive_rate(rows, "label_delete_scope", lambda row: int(row.get("label_delete") or 0) == 1),
    }


def grouped_counts(rows: list[dict[str, Any]], key: str) -> dict[str, dict[str, int | float]]:
    buckets: dict[str, int] = {}
    for row in rows:
        bucket_key = str(row.get(key) or "unknown")
        buckets[bucket_key] = buckets.get(bucket_key, 0) + 1
    total = sum(buckets.values()) or 1
    return {
        bucket_key: {
            "sample_count": count,
            "share": round(count / total, 4),
        }
        for bucket_key, count in sorted(buckets.items())
    }


def build_model(dataset_dir: Path) -> dict[str, Any]:
    break_rows = read_jsonl(dataset_dir / f"break_candidates_{DATASET_VERSION}.jsonl")
    gap_rows = read_jsonl(dataset_dir / f"gap_actions_{DATASET_VERSION}.jsonl")
    image_rows = read_jsonl(dataset_dir / f"image_scale_{DATASET_VERSION}.jsonl")
    delete_rows = read_jsonl(dataset_dir / f"delete_actions_{DATASET_VERSION}.jsonl")
    page_delete_rows = read_jsonl(dataset_dir / f"page_delete_actions_{DATASET_VERSION}.jsonl")
    space_rows = read_jsonl(dataset_dir / f"space_modes_{DATASET_VERSION}.jsonl")

    return {
        "schema_version": 1,
        "model_version": MODEL_VERSION,
        "generated_at": utc_now_iso(),
        "dataset_version": DATASET_VERSION,
        "source_dataset_files": {
          "break_candidates": str(dataset_dir / f"break_candidates_{DATASET_VERSION}.jsonl"),
          "gap_actions": str(dataset_dir / f"gap_actions_{DATASET_VERSION}.jsonl"),
          "image_scale": str(dataset_dir / f"image_scale_{DATASET_VERSION}.jsonl"),
          "delete_actions": str(dataset_dir / f"delete_actions_{DATASET_VERSION}.jsonl"),
          "page_delete_actions": str(dataset_dir / f"page_delete_actions_{DATASET_VERSION}.jsonl"),
          "space_modes": str(dataset_dir / f"space_modes_{DATASET_VERSION}.jsonl"),
        },
        "tasks": {
            "break_recommendation": build_break_model(break_rows),
            "gap_recommendation": build_gap_model(gap_rows),
            "image_scale_recommendation": build_image_model(image_rows),
            "delete_recommendation": build_delete_model(delete_rows),
            "page_delete_recommendation": {
                "sample_count": len(page_delete_rows),
                "avg_candidate_count": round(mean_or(0.0, [safe_float(row.get("label_candidate_count"), 0.0) or 0.0 for row in page_delete_rows]), 2),
            },
            "space_mode_recommendation": {
                "sample_count": len(space_rows),
                "by_space_mode": grouped_counts(space_rows, "label_space_mode"),
            },
        },
    }


def main() -> int:
    args = parse_args()
    learning_root = args.learning_root.resolve()
    directories = ensure_learning_directories(learning_root)
    dataset_dir = args.dataset_dir.resolve() if args.dataset_dir else directories["datasets"]
    output_path = args.output.resolve() if args.output else directories["models"] / f"{MODEL_VERSION}.json"

    model = build_model(dataset_dir)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(model, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Generated model: {output_path}")
    print(f"- break samples: {model['tasks']['break_recommendation']['sample_count']}")
    print(f"- gap samples: {model['tasks']['gap_recommendation']['sample_count']}")
    print(f"- image samples: {model['tasks']['image_scale_recommendation']['sample_count']}")
    print(f"- delete samples: {model['tasks']['delete_recommendation']['sample_count']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
