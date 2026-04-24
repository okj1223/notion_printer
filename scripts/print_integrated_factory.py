#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html as html_lib
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.parse import ParseResult, urlparse, urlunparse
from urllib.request import urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from notion_print_export import HtmlNode, HtmlTreeBuilder, attr_map, has_class, is_local_url, node_text_content, resolve_existing_local_path, serialize_node, set_attr  # noqa: E402


EXPORTER = REPO_ROOT / "notion_print_export.py"
PREVIEW_SERVER = REPO_ROOT / "notion_print_preview.py"
DEFAULT_SOURCE_ROOT = Path.home() / "Downloads" / "개인 페이지 & 공유된 페이지"
PREVIEW_STATE_FILE = Path(os.environ.get("NOTION_PRINTER_PREVIEW_STATE_FILE", "/tmp/notion_printer_preview_server.json"))
DEBUG_ALIAS_PATH = "/_notion_printer_debug.html"
PRINT_OUTPUT_RE = re.compile(r"_print(?:_compact)?(?:_fast)?\.html$", re.IGNORECASE)
RAW_TAG_RE = re.compile(
    r"<(?P<closing>/)?(?P<tag>[A-Za-z0-9:_-]+)\b(?P<attrs>[^<>]*?)(?P<selfclose>/?)>",
    re.IGNORECASE | re.DOTALL,
)
RAW_CLASS_ATTR_RE = re.compile(
    r"""\bclass\s*=\s*(?P<quote>["'])(?P<value>.*?)(?P=quote)""",
    re.IGNORECASE | re.DOTALL,
)


@dataclass
class TocEntry:
    section_id: str
    label: str
    level: int


@dataclass
class SourceDocument:
    index: int
    source_html: Path
    title: str
    summary: str
    meta_rows: list[tuple[str, str]]
    header_node: HtmlNode | None
    body_node: HtmlNode
    heading_entries: list[TocEntry]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Merge multiple Notion export HTML files into one integrated print document with "
            "a front table of contents, then run the standard Notion Printer export pipeline."
        )
    )
    parser.add_argument(
        "documents",
        nargs="+",
        help="Ordered document specs. Each value can be a path, filename, stem, or unique substring.",
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        default=DEFAULT_SOURCE_ROOT,
        help=f"Directory containing the original Notion export HTML files. Default: {DEFAULT_SOURCE_ROOT}",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        help=(
            "Directory where integrated runs are written. "
            "Defaults next to the source root when the source root itself is a generated factory folder."
        ),
    )
    parser.add_argument(
        "--title",
        default="Notion 통합 프린터",
        help="Combined document title. Default: Notion 통합 프린터",
    )
    parser.add_argument(
        "--subtitle",
        help="Optional combined document subtitle.",
    )
    parser.add_argument(
        "--toc",
        choices=("on", "off"),
        default="off",
        help="Whether to include the front table of contents. Default: off.",
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
        default=2200,
        help="Longest edge for fast preview assets. Default: 2200.",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=78,
        help="WEBP quality for fast preview assets. Default: 78.",
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
        help="Do not open the generated preview automatically.",
    )
    return parser.parse_args()


def safe_slug(value: str) -> str:
    slug = re.sub(r"[^0-9A-Za-z._-]+", "_", value).strip("._")
    return slug or "document"


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def path_within_generated_subdir(path: Path, source_root: Path) -> bool:
    resolved_path = path.resolve()
    resolved_root = source_root.resolve()
    try:
        relative_parent = resolved_path.parent.relative_to(resolved_root)
    except ValueError:
        return False
    return any(part.startswith("_notion_printer_") or part.startswith("_runs") for part in relative_parent.parts)


def is_source_html(path: Path, source_root: Path, output_root: Path | None) -> bool:
    if not path.is_file():
        return False
    if path.suffix.lower() != ".html":
        return False
    if PRINT_OUTPUT_RE.search(path.name):
        return False
    if output_root and output_root.resolve() in path.resolve().parents:
        return False
    if path_within_generated_subdir(path, source_root):
        return False
    return True


def discover_sources(source_root: Path, output_root: Path | None) -> list[Path]:
    return sorted(path for path in source_root.rglob("*.html") if is_source_html(path, source_root, output_root))


def resolve_output_root(source_root: Path, requested: Path | None) -> Path:
    if requested:
        return requested.expanduser().resolve()
    if source_root.name.startswith("_notion_printer_"):
        return (source_root.parent / "_notion_printer_integrated_factory").resolve()
    return (source_root / "_notion_printer_integrated_factory").resolve()


def resolve_output_root_for_sources(
    source_root: Path,
    requested: Path | None,
    ordered_sources: list[Path],
) -> Path:
    if requested:
        return requested.expanduser().resolve()
    if not ordered_sources:
        return resolve_output_root(source_root, requested)
    if source_root.exists() and all(source_root == path.parent or source_root in path.parents for path in ordered_sources):
        return resolve_output_root(source_root, requested)
    return (ordered_sources[0].parent / "_notion_printer_integrated_factory").resolve()


def deep_clone(node: HtmlNode) -> HtmlNode:
    clone = HtmlNode(
        kind=node.kind,
        tag=node.tag,
        attrs=list(node.attrs),
        data=node.data,
        self_closing=node.self_closing,
    )
    clone.children = [deep_clone(child) for child in node.children]
    return clone


def text_node(value: str) -> HtmlNode:
    return HtmlNode(kind="text", data=html_lib.escape(value or "", quote=False))


def element(tag: str, *, attrs: dict[str, str] | None = None, children: list[HtmlNode] | None = None, text: str | None = None) -> HtmlNode:
    node = HtmlNode(kind="element", tag=tag, attrs=list((attrs or {}).items()))
    if text is not None:
        node.children.append(text_node(text))
    if children:
        node.children.extend(children)
    return node


def walk_nodes(node: HtmlNode) -> list[HtmlNode]:
    found: list[HtmlNode] = []

    def visit(current: HtmlNode) -> None:
        found.append(current)
        for child in current.children:
            visit(child)

    visit(node)
    return found


def find_first(node: HtmlNode, predicate) -> HtmlNode | None:
    for current in walk_nodes(node):
        if predicate(current):
            return current
    return None


def find_all(node: HtmlNode, predicate) -> list[HtmlNode]:
    return [current for current in walk_nodes(node) if predicate(current)]


def parse_html_tree(raw_html: str) -> HtmlNode:
    parser = HtmlTreeBuilder()
    parser.feed(raw_html)
    parser.close()
    return parser.root


def page_title_from_tree(root: HtmlNode, fallback: str) -> str:
    title_node = find_first(root, lambda node: node.kind == "element" and has_class(node, "page-title"))
    if title_node:
        title = normalize_space(node_text_content(title_node))
        if title:
            return title
    title_tag = find_first(root, lambda node: node.kind == "element" and node.tag == "title")
    if title_tag:
        title = normalize_space(node_text_content(title_tag))
        if title:
            return title
    return fallback


def meta_rows_from_header(header: HtmlNode | None) -> list[tuple[str, str]]:
    if not header:
        return []
    rows: list[tuple[str, str]] = []
    for row in find_all(header, lambda node: node.kind == "element" and node.tag == "tr"):
        label_node = find_first(row, lambda node: node.kind == "element" and node.tag == "th")
        value_node = find_first(row, lambda node: node.kind == "element" and node.tag == "td")
        label = normalize_space(node_text_content(label_node)) if label_node else ""
        value = normalize_space(node_text_content(value_node)) if value_node else ""
        if label and value:
            rows.append((label, value))
    return rows


def first_summary_text(body_node: HtmlNode) -> str:
    for node in walk_nodes(body_node):
        if node.kind != "element":
            continue
        if node.tag not in {"p", "blockquote", "li", "figcaption"}:
            continue
        text = normalize_space(node_text_content(node))
        if text:
            return text[:180]
    return ""


def heading_level_for_tag(tag_name: str) -> int | None:
    if tag_name == "h2":
        return 2
    if tag_name == "h3":
        return 3
    if tag_name == "h4":
        return 4
    return None


def build_heading_entries(body_node: HtmlNode, doc_prefix: str) -> list[TocEntry]:
    entries: list[TocEntry] = []
    counter = 0
    for node in walk_nodes(body_node):
        if node.kind != "element":
            continue
        level = heading_level_for_tag(node.tag or "")
        if level is None:
            continue
        label = normalize_space(node_text_content(node))
        if not label:
            continue
        counter += 1
        entries.append(
            TocEntry(
                section_id=f"{doc_prefix}-section-{counter:02d}",
                label=label,
                level=level,
            )
        )
    return entries


def rewrite_local_url(raw_url: str, prefix: str, source_dir: Path) -> str:
    if not is_local_url(raw_url):
        return raw_url
    parsed = urlparse(raw_url)
    relative_path = parsed.path.lstrip("./")
    source_path = resolve_existing_local_path(raw_url, source_dir)
    if source_path.exists():
        try:
            relative_path = source_path.relative_to(source_dir.resolve()).as_posix()
        except ValueError:
            relative_path = parsed.path.lstrip("./")
    next_path = f"{prefix.rstrip('/')}/{relative_path}" if relative_path else prefix.rstrip("/")
    updated = ParseResult(
        scheme=parsed.scheme,
        netloc=parsed.netloc,
        path=next_path,
        params=parsed.params,
        query=parsed.query,
        fragment=parsed.fragment,
    )
    return urlunparse(updated)


def rewrite_local_urls_in_tree(node: HtmlNode, prefix: str, source_dir: Path) -> None:
    if node.kind == "element":
        attrs = attr_map(node)
        for key in ("src", "href"):
            if key in attrs:
                rewritten = rewrite_local_url(attrs[key], prefix, source_dir)
                if rewritten != attrs[key]:
                    set_attr(node, key, rewritten)
    for child in node.children:
        rewrite_local_urls_in_tree(child, prefix, source_dir)


def raw_tag_has_class(raw_attrs: str, class_name: str) -> bool:
    match = RAW_CLASS_ATTR_RE.search(raw_attrs or "")
    if not match:
        return False
    classes = html_lib.unescape(match.group("value")).split()
    return class_name in classes


def extract_first_element_fragment(raw_html: str, tag_name: str, *, required_class: str | None = None) -> str | None:
    lowered_tag = tag_name.lower()
    matches = list(RAW_TAG_RE.finditer(raw_html))
    for index, match in enumerate(matches):
        if match.group("closing"):
            continue
        if match.group("tag").lower() != lowered_tag:
            continue
        if required_class and not raw_tag_has_class(match.group("attrs"), required_class):
            continue
        if match.group("selfclose") or lowered_tag in {"img", "br", "hr", "meta", "link", "input"}:
            return raw_html[match.start() : match.end()]

        depth = 1
        for inner in matches[index + 1 :]:
            if inner.group("tag").lower() != lowered_tag:
                continue
            if inner.group("closing"):
                depth -= 1
                if depth == 0:
                    return raw_html[match.start() : inner.end()]
                continue
            if inner.group("selfclose"):
                continue
            depth += 1
        return raw_html[match.start() :]
    return None


def fallback_parse_source_document(raw_html: str) -> HtmlNode | None:
    article_fragment = extract_first_element_fragment(raw_html, "article", required_class="page")
    if article_fragment:
        return parse_html_tree(article_fragment)

    body_fragment = extract_first_element_fragment(raw_html, "div", required_class="page-body")
    if body_fragment:
        synthetic_html = f'<article class="page"><header></header>{body_fragment}</article>'
        return parse_html_tree(synthetic_html)
    return None


def load_source_document(source_html: Path, index: int) -> SourceDocument:
    raw_html = source_html.read_text(encoding="utf-8", errors="ignore")
    title_root = parse_html_tree(raw_html)
    root = title_root
    article = find_first(root, lambda node: node.kind == "element" and node.tag == "article" and has_class(node, "page"))
    body_node = find_first(article, lambda node: node.kind == "element" and has_class(node, "page-body")) if article else None
    if not article or not body_node:
        fallback_root = fallback_parse_source_document(raw_html)
        if fallback_root is not None:
            root = fallback_root
            article = find_first(root, lambda node: node.kind == "element" and node.tag == "article" and has_class(node, "page"))
            if not article:
                article = find_first(root, lambda node: node.kind == "element" and node.tag == "article")
            body_node = find_first(article, lambda node: node.kind == "element" and has_class(node, "page-body")) if article else None
    if not article:
        raise ValueError(
            f"Could not locate a Notion page container in {source_html}. "
            "Select the original Notion export HTML, not a generated print/integrated output."
        )
    if not body_node:
        raise ValueError(
            f"Could not locate .page-body in {source_html}. "
            "The export HTML may be malformed or may not be a standard Notion page export."
        )

    header = find_first(article, lambda node: node.kind == "element" and node.tag == "header")
    title = page_title_from_tree(title_root, source_html.stem)
    if title == source_html.stem and root is not title_root:
        title = page_title_from_tree(root, source_html.stem)
    doc_prefix = f"merged-doc-{index:02d}"
    heading_entries = build_heading_entries(body_node, doc_prefix)
    summary = first_summary_text(body_node)
    return SourceDocument(
        index=index,
        source_html=source_html,
        title=title,
        summary=summary,
        meta_rows=meta_rows_from_header(header),
        header_node=header,
        body_node=body_node,
        heading_entries=heading_entries,
    )


def stage_asset_namespace(source_dir: Path, merged_source_dir: Path, namespace: str) -> str:
    asset_root = merged_source_dir / "combined_assets"
    asset_root.mkdir(parents=True, exist_ok=True)
    link_path = asset_root / namespace
    if link_path.exists() or link_path.is_symlink():
        if link_path.is_symlink() or link_path.is_file():
            link_path.unlink()
        else:
            raise FileExistsError(f"Asset namespace path already exists and is not a symlink: {link_path}")
    link_path.symlink_to(source_dir.resolve(), target_is_directory=True)
    return f"combined_assets/{namespace}"


def publish_combined_assets_for_output(run_dir: Path, merged_source_dir: Path) -> None:
    source_assets = merged_source_dir / "combined_assets"
    if not source_assets.exists():
        return
    published_assets = run_dir / "combined_assets"
    if published_assets.exists() or published_assets.is_symlink():
        if published_assets.is_symlink() or published_assets.is_file():
            published_assets.unlink()
        else:
            raise FileExistsError(f"Output asset path already exists and is not a symlink: {published_assets}")
    published_assets.symlink_to(source_assets.resolve(), target_is_directory=True)


def include_toc_subentries(document: SourceDocument) -> bool:
    title = normalize_space(document.title)
    if "기초 설명서" in title:
        return False
    return True


def assign_section_markers(body_node: HtmlNode, heading_entries: list[TocEntry]) -> None:
    heading_nodes = [
        node
        for node in walk_nodes(body_node)
        if node.kind == "element" and heading_level_for_tag(node.tag or "") is not None and normalize_space(node_text_content(node))
    ]
    for entry, node in zip(heading_entries, heading_nodes):
        set_attr(node, "data-merged-section-id", entry.section_id)
        set_attr(node, "data-merged-section-level", str(entry.level))


def build_toc_block(documents: list[SourceDocument]) -> HtmlNode:
    items: list[HtmlNode] = []
    for doc in documents:
        document_section_id = f"merged-doc-{doc.index:02d}"
        doc_children = [
            element("span", attrs={"class": "print-merged-toc-label"}, text=f"{doc.index:02d}. {doc.title}"),
            element("span", attrs={"class": "print-merged-toc-leader"}),
            element("span", attrs={"class": "print-merged-toc-page"}, text="--"),
        ]
        items.append(
            element(
                "p",
                attrs={
                    "class": "print-merged-toc-item is-level-1",
                    "data-merged-toc-target": document_section_id,
                },
                children=doc_children,
            )
        )
        if not include_toc_subentries(doc):
            continue
        for entry in doc.heading_entries:
            items.append(
                element(
                    "p",
                    attrs={
                        "class": f"print-merged-toc-item is-level-{max(2, min(4, entry.level))}",
                        "data-merged-toc-target": entry.section_id,
                    },
                    children=[
                        element("span", attrs={"class": "print-merged-toc-label"}, text=entry.label),
                        element("span", attrs={"class": "print-merged-toc-leader"}),
                        element("span", attrs={"class": "print-merged-toc-page"}, text="--"),
                    ],
                )
            )
    return element(
        "section",
        attrs={"class": "print-merged-toc-block"},
        children=[
            element("h2", attrs={"class": "print-merged-section-title"}, text="목차"),
            element("div", attrs={"class": "print-merged-toc-list"}, children=items),
        ],
    )


def build_document_header(document: SourceDocument) -> HtmlNode:
    if document.header_node:
        header_clone = deep_clone(document.header_node)
        sanitized_children: list[HtmlNode] = []
        for child in header_clone.children:
            if child.kind != "element":
                if child.kind != "text" or child.data.strip():
                    sanitized_children.append(child)
                continue
            if has_class(child, "page-header-icon"):
                continue
            if child.tag == "table" and has_class(child, "properties"):
                continue
            if child.tag == "p" and has_class(child, "page-description") and not normalize_space(node_text_content(child)):
                continue
            sanitized_children.append(child)
        header_clone.children = sanitized_children
        if sanitized_children:
            return header_clone
    return element(
        "header",
        children=[
            element("h1", attrs={"class": "page-title", "dir": "auto"}, text=document.title),
        ],
    )


def build_document_section(document: SourceDocument, merged_source_dir: Path) -> HtmlNode:
    namespace = f"doc_{document.index:02d}_{safe_slug(document.source_html.stem)}"
    asset_prefix = stage_asset_namespace(document.source_html.parent, merged_source_dir, namespace)
    body_clone = deep_clone(document.body_node)
    rewrite_local_urls_in_tree(body_clone, asset_prefix, document.source_html.parent)
    assign_section_markers(body_clone, document.heading_entries)

    section_id = f"merged-doc-{document.index:02d}"
    header_clone = build_document_header(document)
    rewrite_local_urls_in_tree(header_clone, asset_prefix, document.source_html.parent)
    children: list[HtmlNode] = [header_clone]
    children.extend(deep_clone(child) for child in body_clone.children)
    return element(
        "section",
        attrs={
            "class": "print-merged-document",
            "data-merged-section-id": section_id,
            "data-merged-section-level": "1",
            "data-merged-document-index": str(document.index),
            "data-merged-document-title": document.title,
        },
        children=children,
    )


def build_combined_document(
    title: str,
    subtitle: str,
    documents: list[SourceDocument],
    merged_source_dir: Path,
    *,
    include_toc: bool,
) -> str:
    page_body_children: list[HtmlNode] = []
    if include_toc:
        page_body_children.append(build_toc_block(documents))
    page_body_children.extend(build_document_section(document, merged_source_dir) for document in documents)

    html_tree = HtmlNode(kind="root")
    html_tree.children = [
        element(
            "html",
            children=[
                element(
                    "head",
                    children=[
                        element("meta", attrs={"http-equiv": "Content-Type", "content": "text/html; charset=utf-8"}),
                        element("title", text=title),
                    ],
                ),
                element(
                    "body",
                    children=[
                        element(
                            "article",
                            attrs={"class": "page sans", "id": safe_slug(title)},
                            children=[
                                element(
                                    "header",
                                    children=[
                                        element("h1", attrs={"class": "page-title", "dir": "auto"}, text=title),
                                        element("p", attrs={"class": "page-description", "dir": "auto"}, text=subtitle),
                                    ],
                                ),
                                element("div", attrs={"class": "page-body"}, children=page_body_children),
                            ],
                        )
                    ],
                ),
            ],
        )
    ]
    return "<!DOCTYPE html>\n" + serialize_node(html_tree)


def build_run_directory(output_root: Path) -> Path:
    stamp = time.strftime("%Y%m%d_%H%M%S")
    run_dir = output_root / f"run_{stamp}"
    run_dir.mkdir(parents=True, exist_ok=False)
    return run_dir


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


def start_preview_server(
    html_path: Path,
    *,
    open_browser: bool,
    output_dir: Path,
    serve_dir: Path | None = None,
) -> subprocess.Popen[str]:
    log_path = output_dir / "preview_server.log"
    log_handle = log_path.open("a", encoding="utf-8")
    command = [sys.executable, str(PREVIEW_SERVER), "serve", str(html_path)]
    if serve_dir is not None:
        command.extend(["--serve-dir", str(serve_dir)])
    if not open_browser:
        command.append("--no-open")
    return subprocess.Popen(
        command,
        cwd=str(REPO_ROOT),
        stdin=subprocess.DEVNULL,
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
    )


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


def resolve_explicit_html_path(spec: str, source_root: Path) -> Path | None:
    explicit_candidates = [
        Path(spec).expanduser(),
        (source_root / spec).expanduser(),
    ]
    for candidate in explicit_candidates:
        if candidate.exists() and candidate.is_file() and candidate.suffix.lower() == ".html":
            return candidate.resolve()
    return None


def build_default_subtitle(
    document_count: int,
    *,
    include_toc: bool,
    include_page_numbers: bool,
) -> str:
    parts = [f"{document_count}개 문서"]
    if include_toc:
        parts.append("목차 포함")
    if include_page_numbers:
        parts.append("통합 페이지 번호")
    return " · ".join(parts)


def resolve_source_spec(spec: str, candidates: list[Path], source_root: Path) -> Path:
    explicit_path = resolve_explicit_html_path(spec, source_root)
    if explicit_path is not None:
        return explicit_path

    lowered = spec.lower().strip()
    if not lowered:
        raise ValueError("Empty document spec is not allowed.")

    exact = [path for path in candidates if path.name.lower() == lowered or path.stem.lower() == lowered]
    if len(exact) == 1:
        return exact[0]

    partial = [path for path in candidates if lowered in path.name.lower() or lowered in path.stem.lower()]
    if len(partial) == 1:
        return partial[0]
    if not partial:
        raise FileNotFoundError(f"Could not resolve document spec {spec!r} under {source_root}")

    choices = ", ".join(path.name for path in partial[:6])
    suffix = "" if len(partial) <= 6 else f" ... (+{len(partial) - 6} more)"
    raise ValueError(f"Document spec {spec!r} is ambiguous: {choices}{suffix}")


def main() -> int:
    args = parse_args()
    try:
        validate_args(args)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1

    source_root = args.source_root.expanduser().resolve()
    requested_output_root = args.output_root.expanduser().resolve() if args.output_root else None

    candidates = discover_sources(source_root, requested_output_root) if source_root.exists() else []
    needs_catalog_lookup = any(resolve_explicit_html_path(spec, source_root) is None for spec in args.documents)
    if needs_catalog_lookup and not source_root.exists():
        print(f"Source root not found: {source_root}", file=sys.stderr)
        return 1
    if needs_catalog_lookup and not candidates:
        print(f"No original source HTML files found under {source_root}", file=sys.stderr)
        return 1

    try:
        ordered_sources = [resolve_source_spec(spec, candidates, source_root) for spec in args.documents]
    except (FileNotFoundError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1

    output_root = resolve_output_root_for_sources(source_root, requested_output_root, ordered_sources)
    output_root.mkdir(parents=True, exist_ok=True)

    documents = [load_source_document(path, index) for index, path in enumerate(ordered_sources, start=1)]
    include_toc = args.toc == "on"
    subtitle = args.subtitle or build_default_subtitle(
        len(documents),
        include_toc=include_toc,
        include_page_numbers=args.page_numbers == "on",
    )

    run_dir = build_run_directory(output_root)
    merged_source_dir = run_dir / "merged_source"
    merged_source_dir.mkdir(parents=True, exist_ok=True)

    merged_html = build_combined_document(
        args.title,
        subtitle,
        documents,
        merged_source_dir,
        include_toc=include_toc,
    )
    merged_source_html = merged_source_dir / f"{safe_slug(args.title)}_integrated.html"
    merged_source_html.write_text(merged_html, encoding="utf-8")
    publish_combined_assets_for_output(run_dir, merged_source_dir)

    print(f"Integrated factory run: {run_dir}")
    print("Ordered sources:")
    for source in ordered_sources:
        print(f"- {source}")

    try:
        preferred_html = run_export(merged_source_html, run_dir, args)
        start_preview_server(
            preferred_html,
            open_browser=not args.no_open_last,
            output_dir=run_dir,
            serve_dir=run_dir,
        )
        preview_url = wait_for_preview_url(preferred_html, args.timeout_seconds)
    except Exception as error:
        print(f"Integrated export failed: {error}", file=sys.stderr)
        return 1

    summary_payload = {
        "run_dir": str(run_dir),
        "source_root": str(source_root),
        "output_root": str(output_root),
        "merged_source_html": str(merged_source_html),
        "title": args.title,
        "subtitle": subtitle,
        "ordered_sources": [str(path) for path in ordered_sources],
        "documents": [
            {
                "index": document.index,
                "title": document.title,
                "source_html": str(document.source_html),
                "heading_count": len(document.heading_entries),
            }
            for document in documents
        ],
        "variants": list(args.variants),
        "fast_enabled": not args.no_fast,
        "preferred_output": args.preferred_output,
        "font_size": args.font_size,
        "toc": args.toc,
        "page_numbers": args.page_numbers,
        "preferred_html": str(preferred_html),
        "preview_url": preview_url,
    }
    summary_path = write_summary(run_dir, summary_payload)

    print(f"Summary: {summary_path}")
    print(f"Preview: {preview_url}")
    print(f"Merged source: {merged_source_html}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
