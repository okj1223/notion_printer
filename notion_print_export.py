#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import html as html_lib
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from urllib.parse import unquote, urlparse

from PIL import Image, ImageOps, UnidentifiedImageError

from notion_printer_learning import (
    build_blocks_payload,
    build_document_manifest,
    write_blocks_payload,
    write_document_manifest,
)

Image.MAX_IMAGE_PIXELS = None
RESAMPLE_LANCZOS = getattr(getattr(Image, "Resampling", Image), "LANCZOS", Image.ANTIALIAS)


SCRIPT_DIR = Path(__file__).resolve().parent
TEMPLATE_DIR = SCRIPT_DIR / "notion_print_export"
THEME_PATH = TEMPLATE_DIR / "theme.css"
LEARNING_PATH = TEMPLATE_DIR / "learning.js"
RECOMMENDATION_PATH = TEMPLATE_DIR / "recommendation.js"
RUNTIME_PATH = TEMPLATE_DIR / "runtime.js"
PAGED_POLYFILL_PATH = TEMPLATE_DIR / "paged.polyfill.js"
RULES_MODEL_PATH = SCRIPT_DIR / "learning_data" / "models" / "rules_v1.json"
LAYOUT_MODEL_PATH = SCRIPT_DIR / "learning_data" / "models" / "layout_recommender_v1.json"

THEME_MARKER_START = "<!-- notion-print-export:theme -->"
THEME_MARKER_END = "<!-- /notion-print-export:theme -->"
MANIFEST_MARKER_START = "<!-- notion-print-export:manifest -->"
MANIFEST_MARKER_END = "<!-- /notion-print-export:manifest -->"
BLOCKS_MARKER_START = "<!-- notion-print-export:blocks -->"
BLOCKS_MARKER_END = "<!-- /notion-print-export:blocks -->"
RECOMMENDATION_DATA_MARKER_START = "<!-- notion-print-export:recommendation-data -->"
RECOMMENDATION_DATA_MARKER_END = "<!-- /notion-print-export:recommendation-data -->"
RECOMMENDATION_MARKER_START = "<!-- notion-print-export:recommendation -->"
RECOMMENDATION_MARKER_END = "<!-- /notion-print-export:recommendation -->"
LEARNING_MARKER_START = "<!-- notion-print-export:learning -->"
LEARNING_MARKER_END = "<!-- /notion-print-export:learning -->"
RUNTIME_MARKER_START = "<!-- notion-print-export:runtime -->"
RUNTIME_MARKER_END = "<!-- /notion-print-export:runtime -->"
PAGED_MARKER_START = "<!-- notion-print-export:paged -->"
PAGED_MARKER_END = "<!-- /notion-print-export:paged -->"
PAGED_CONFIG_MARKER_START = "<!-- notion-print-export:paged-config -->"
PAGED_CONFIG_MARKER_END = "<!-- /notion-print-export:paged-config -->"

TITLE_SUFFIX_RE = re.compile(r"\s+\(Print(?: Compact)?(?: Fast)?\)$")
BODY_RE = re.compile(r"<body(?P<attrs>[^>]*)>", re.IGNORECASE)
TITLE_RE = re.compile(r"(<title>)(.*?)(</title>)", re.IGNORECASE | re.DOTALL)
IMG_SRC_RE = re.compile(r'(<img\b[^>]*?\bsrc=")([^"]+)(")', re.IGNORECASE)
ATTR_RE = re.compile(r'(?P<prefix>\b(?:src|href)=")(?P<url>[^"]+)(")', re.IGNORECASE)
PAGE_HEADER_ICON_RE = re.compile(
    r'<div class="page-header-icon[^"]*">.*?</div>',
    re.IGNORECASE | re.DOTALL,
)
WHITESPACE_MARK_RE = re.compile(
    r'<mark\b[^>]*>\s*</mark>',
    re.IGNORECASE | re.DOTALL,
)
EMPTY_CODE_RE = re.compile(
    r'<code\b[^>]*>\s*</code>',
    re.IGNORECASE | re.DOTALL,
)
CONTRACT_WHITESPACE_RE = re.compile(r"\s+")
HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
MAJOR_HEADING_TAGS = {"h1", "h2", "h3"}
LIST_LEADING_INLINE_TAGS = {"mark", "code", "strong", "em", "span", "a", "b", "i", "u", "s", "small", "sup", "sub"}
TABLE_WRAPPER_CLASS_HINTS = {"collection-content-wrapper"}
BLOCK_LEVEL_TAGS = {
    "address",
    "article",
    "aside",
    "blockquote",
    "details",
    "dialog",
    "div",
    "dl",
    "dt",
    "dd",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "li",
    "main",
    "nav",
    "ol",
    "p",
    "pre",
    "section",
    "table",
    "tbody",
    "thead",
    "tfoot",
    "tr",
    "td",
    "th",
    "ul",
}
VOID_TAGS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}


@dataclass
class HtmlNode:
    kind: str
    tag: str | None = None
    attrs: list[tuple[str, str | None]] = field(default_factory=list)
    data: str = ""
    children: list["HtmlNode"] = field(default_factory=list)
    self_closing: bool = False

    def clone_shallow(self) -> "HtmlNode":
        return HtmlNode(
            kind=self.kind,
            tag=self.tag,
            attrs=list(self.attrs),
            data=self.data,
            self_closing=self.self_closing,
        )


class HtmlTreeBuilder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.root = HtmlNode(kind="root")
        self.stack: list[HtmlNode] = [self.root]

    def _append(self, node: HtmlNode) -> None:
        self.stack[-1].children.append(node)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        lowered = tag.lower()
        node = HtmlNode(kind="element", tag=lowered, attrs=list(attrs))
        self._append(node)
        if lowered not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        lowered = tag.lower()
        node = HtmlNode(kind="element", tag=lowered, attrs=list(attrs), self_closing=True)
        self._append(node)

    def handle_endtag(self, tag: str) -> None:
        lowered = tag.lower()
        for idx in range(len(self.stack) - 1, 0, -1):
            if self.stack[idx].tag == lowered:
                del self.stack[idx:]
                break

    def handle_data(self, data: str) -> None:
        if data:
            self._append(HtmlNode(kind="text", data=data))

    def handle_comment(self, data: str) -> None:
        self._append(HtmlNode(kind="comment", data=data))

    def handle_decl(self, decl: str) -> None:
        self._append(HtmlNode(kind="decl", data=decl))

    def unknown_decl(self, data: str) -> None:
        self._append(HtmlNode(kind="decl", data=data))

    def handle_entityref(self, name: str) -> None:
        self._append(HtmlNode(kind="text", data=f"&{name};"))

    def handle_charref(self, name: str) -> None:
        self._append(HtmlNode(kind="text", data=f"&#{name};"))


def node_text_content(node: HtmlNode) -> str:
    if node.kind == "text":
        return node.data
    return "".join(node_text_content(child) for child in node.children)


def has_meaningful_content(nodes: list[HtmlNode]) -> bool:
    for child in nodes:
        if child.kind == "text" and child.data.strip():
            return True
        if child.kind == "element":
            if child.tag == "br":
                continue
            if child.tag in {"img", "hr"}:
                return True
            if has_meaningful_content(child.children):
                return True
        if child.kind in {"comment", "decl"}:
            continue
    return False


def attr_map(node: HtmlNode) -> dict[str, str]:
    result: dict[str, str] = {}
    for key, value in node.attrs:
        result[key.lower()] = value or ""
    return result


def set_attr(node: HtmlNode, key: str, value: str | None) -> None:
    updated = False
    next_attrs: list[tuple[str, str | None]] = []
    for attr_key, attr_value in node.attrs:
        if attr_key.lower() == key.lower():
            if not updated:
                next_attrs.append((key, value))
                updated = True
            continue
        next_attrs.append((attr_key, attr_value))
    if not updated:
        next_attrs.append((key, value))
    node.attrs = next_attrs


def remove_attr(node: HtmlNode, key: str) -> None:
    node.attrs = [(attr_key, attr_value) for attr_key, attr_value in node.attrs if attr_key.lower() != key.lower()]


def append_class(node: HtmlNode, class_name: str) -> None:
    if not class_name:
        return
    classes = attr_map(node).get("class", "").split()
    if class_name in classes:
        return
    classes.append(class_name)
    set_attr(node, "class", " ".join(token for token in classes if token))


def remove_display_contents_style(node: HtmlNode) -> None:
    style_value = attr_map(node).get("style", "")
    if not style_value:
        return
    updated = re.sub(r"display\s*:\s*contents\s*;?", "", style_value, flags=re.IGNORECASE)
    updated = re.sub(r";{2,}", ";", updated).strip(" ;")
    if updated:
        set_attr(node, "style", updated)
    else:
        remove_attr(node, "style")


def is_display_contents_div(node: HtmlNode) -> bool:
    if node.kind != "element" or node.tag != "div":
        return False
    style = attr_map(node).get("style", "").replace(" ", "").lower()
    return "display:contents" in style


def has_class(node: HtmlNode, class_name: str) -> bool:
    classes = attr_map(node).get("class", "").split()
    return class_name in classes


def count_descendant_tags(node: HtmlNode, tags: set[str]) -> int:
    total = 0
    for child in node.children:
        if child.kind != "element":
            continue
        if child.tag in tags:
            total += 1
        total += count_descendant_tags(child, tags)
    return total


def has_descendant_tag(node: HtmlNode, tags: set[str]) -> bool:
    return count_descendant_tags(node, tags) > 0


def is_appendix_details_node(node: HtmlNode) -> bool:
    if node.kind != "element" or node.tag != "details":
        return False
    summary = next(
        (child for child in node.children if child.kind == "element" and child.tag == "summary"),
        None,
    )
    summary_text = node_text_content(summary).strip() if summary else ""
    if re.search(r"(단축키|shortcut|부록|appendix)", summary_text, re.IGNORECASE):
        return True
    return count_descendant_tags(node, {"table"}) >= 3


def flatten_details_node(node: HtmlNode) -> None:
    if node.kind != "element" or node.tag != "details":
        return
    appendix = is_appendix_details_node(node)
    node.tag = "div"
    node.attrs = [(key, value) for key, value in node.attrs if key.lower() != "open"]
    append_class(node, "print-details-block")
    if appendix:
        append_class(node, "print-appendix-block")
    for child in node.children:
        if child.kind != "element" or child.tag != "summary":
            continue
        child.tag = "div"
        append_class(child, "print-details-summary")
        if appendix:
            append_class(child, "print-appendix-summary")


def wrap_table_block_node(node: HtmlNode) -> HtmlNode:
    wrapper = HtmlNode(
        kind="element",
        tag="div",
        attrs=[("class", "print-table-block")],
    )
    wrapper.children = [node]
    return wrapper


def is_heading_node(node: HtmlNode) -> bool:
    if node.kind != "element":
        return False
    if has_class(node, "page-title"):
        return True
    return node.tag in HEADING_TAGS


def heading_block_type(node: HtmlNode) -> str | None:
    if node.kind != "element":
        return None
    if has_class(node, "page-title"):
        return "page_title"
    if node.tag in MAJOR_HEADING_TAGS:
        return "section_heading"
    if node.tag in HEADING_TAGS:
        return "subheading"
    return None


def is_callout_node(node: HtmlNode) -> bool:
    return node.kind == "element" and has_class(node, "callout")


def is_quote_block_node(node: HtmlNode) -> bool:
    return node.kind == "element" and node.tag == "blockquote"


def is_code_block_node(node: HtmlNode) -> bool:
    return node.kind == "element" and node.tag == "pre"


def has_meaningful_direct_text(node: HtmlNode) -> bool:
    return any(child.kind == "text" and child.data.strip() for child in node.children)


def direct_element_children(node: HtmlNode) -> list[HtmlNode]:
    return [child for child in node.children if child.kind == "element"]


def contains_block_descendant(node: HtmlNode) -> bool:
    for child in node.children:
        if child.kind != "element":
            continue
        if (
            child.tag in {"figure", "table", "ul", "ol", "details", "hr", "blockquote", "pre"}
            or child.tag in HEADING_TAGS
            or has_class(child, "print-table-block")
            or has_class(child, "print-details-block")
            or has_class(child, "print-details-summary")
            or has_class(child, "callout")
        ):
            return True
        if contains_block_descendant(child):
            return True
    return False


def wrap_leading_text_nodes(container: HtmlNode, class_name: str) -> HtmlNode | None:
    if container.kind != "element":
        return None

    nodes: list[HtmlNode] = []
    for child in container.children:
        if child.kind == "text":
            if child.data.replace("\u00a0", " ").strip() or nodes:
                nodes.append(child)
            continue
        if child.kind == "element" and child.tag == "br":
            if nodes:
                nodes.append(child)
            continue
        if child.kind == "element" and child.tag in LIST_LEADING_INLINE_TAGS and not contains_block_descendant(child):
            nodes.append(child)
            continue
        break

    if not nodes:
        return None

    wrapper = HtmlNode(kind="element", tag="div", attrs=[("class", class_name)])
    wrapper.children = nodes
    container.children = [wrapper] + container.children[len(nodes) :]
    return wrapper


def is_table_wrapper_node(node: HtmlNode) -> bool:
    if node.kind != "element":
        return False
    if has_class(node, "print-table-block"):
        return True
    if node.tag in {"td", "th"}:
        return False

    classes = set(attr_map(node).get("class", "").split())
    if classes & TABLE_WRAPPER_CLASS_HINTS:
        return True

    if has_meaningful_direct_text(node):
        return False

    element_children = direct_element_children(node)
    if len(element_children) != 1:
        return False

    only_child = element_children[0]
    if only_child.tag == "table":
        return True
    if has_class(only_child, "print-table-block"):
        return True
    return False


def promote_table_wrapper_node(node: HtmlNode) -> None:
    if node.kind != "element":
        return
    element_children = direct_element_children(node)
    if len(element_children) == 1 and has_class(element_children[0], "print-table-block"):
        node.children = list(element_children[0].children)
    remove_display_contents_style(node)
    append_class(node, "print-table-block")


def normalize_contract_text(text: str) -> str:
    return CONTRACT_WHITESPACE_RE.sub(" ", html_lib.unescape(text or "")).strip()


def first_element_child(node: HtmlNode, tag_name: str) -> HtmlNode | None:
    for child in node.children:
        if child.kind == "element" and child.tag == tag_name:
            return child
    return None


def is_image_node(node: HtmlNode) -> bool:
    return node.kind == "element" and node.tag == "figure" and has_class(node, "image")


def block_contract_for_node(node: HtmlNode, *, inside_table: bool) -> dict[str, object] | None:
    if node.kind != "element":
        return None
    heading_type = heading_block_type(node)
    if heading_type == "page_title":
        return {"block_type": "page_title", "block_role": "title", "atomic": True}
    if heading_type == "section_heading":
        return {"block_type": "section_heading", "block_role": "heading", "atomic": True}
    if heading_type == "subheading":
        return {"block_type": "subheading", "block_role": "heading", "atomic": True}
    if has_class(node, "print-table-block"):
        return {"block_type": "table", "block_role": "table", "atomic": True}
    if has_class(node, "print-major-title") and not inside_table:
        return {"block_type": "list_item_heading", "block_role": "heading", "atomic": True}
    if has_class(node, "print-inline-block") and not inside_table:
        return {"block_type": "list_item_text", "block_role": "text", "atomic": True}
    if is_image_node(node) and not inside_table:
        return {"block_type": "image", "block_role": "media", "atomic": True}
    if is_callout_node(node) and not inside_table:
        return {"block_type": "callout", "block_role": "callout", "atomic": True}
    if is_quote_block_node(node) and not inside_table:
        return {"block_type": "quote_block", "block_role": "quote", "atomic": True}
    if is_code_block_node(node) and not inside_table:
        return {"block_type": "code_block", "block_role": "code", "atomic": True}
    if node.tag == "p" and not inside_table:
        return {"block_type": "paragraph", "block_role": "text", "atomic": True}
    if has_class(node, "print-details-summary") and not inside_table:
        return {"block_type": "details_summary", "block_role": "summary", "atomic": True}
    if has_class(node, "print-details-block"):
        return {"block_type": "details_block", "block_role": "container", "atomic": False}
    if node.tag == "li" and not inside_table:
        return {"block_type": "list_item", "block_role": "container", "atomic": False}
    return None


def block_label_for_node(node: HtmlNode, block_type: str) -> str:
    if block_type == "image":
        caption = first_element_child(node, "figcaption")
        caption_text = normalize_contract_text(node_text_content(caption)) if caption else ""
        return caption_text[:96] if caption_text else "이미지"
    if block_type == "table":
        text = normalize_contract_text(node_text_content(node))
        return ("표 - " + text[:92]) if text else "표 블록"
    text = normalize_contract_text(node_text_content(node))
    if text:
        return text[:96]
    if block_type == "page_title":
        return "페이지 제목"
    if block_type == "section_heading":
        return "섹션 제목"
    if block_type == "subheading":
        return "소제목"
    if block_type == "details_summary":
        return "요약 블록"
    if block_type == "callout":
        return "콜아웃"
    if block_type == "quote_block":
        return "인용 블록"
    if block_type == "code_block":
        return "코드 블록"
    return block_type.replace("_", " ")


def next_contract_persist_id(block_type: str, block_role: str, counters: dict[str, int]) -> str:
    key = f"{block_type}:{block_role}"
    index = counters.get(key, 0)
    counters[key] = index + 1
    safe_type = block_type.replace("_", "-")
    safe_role = block_role.replace("_", "-")
    return f"{safe_type}::{safe_role}:{index}"


def annotate_block_contract(root: HtmlNode) -> list[dict[str, object]]:
    blocks: list[dict[str, object]] = []
    counters: dict[str, int] = {}
    state = {
        "current_section_index": 0,
        "next_section_index": 0,
        "order_index": 0,
    }

    def walk(node: HtmlNode, *, inside_table: bool) -> None:
        if node.kind != "element":
            return

        current_inside_table = inside_table or node.tag in {"table", "thead", "tbody", "tfoot", "tr", "td", "th"}
        contract = block_contract_for_node(node, inside_table=inside_table)
        if contract:
            block_type = str(contract["block_type"])
            block_role = str(contract["block_role"])
            atomic = bool(contract["atomic"])
            section_index = int(state["current_section_index"])
            if block_type == "section_heading":
                section_index = int(state["next_section_index"])
                state["current_section_index"] = section_index
                state["next_section_index"] = section_index + 1

            persist_id = next_contract_persist_id(block_type, block_role, counters)
            set_attr(node, "data-print-persist-id", persist_id)
            set_attr(node, "data-print-block-type", block_type)
            set_attr(node, "data-print-block-role", block_role)
            set_attr(node, "data-print-atomic", "true" if atomic else "false")
            set_attr(node, "data-print-section-index", str(section_index))

            if atomic:
                order_index = int(state["order_index"])
                state["order_index"] = order_index + 1
                label = block_label_for_node(node, block_type)
                set_attr(node, "data-print-order-index", str(order_index))
                set_attr(node, "data-print-block-label", label)
                blocks.append(
                    {
                        "persist_id": persist_id,
                        "block_type": block_type,
                        "block_role": block_role,
                        "atomic": True,
                        "section_index": section_index,
                        "order_index": order_index,
                        "tag_name": node.tag or "",
                        "text_char_count": len(normalize_contract_text(node_text_content(node))),
                        "label": label,
                    }
                )

        for child in node.children:
            walk(child, inside_table=current_inside_table)

    for child in root.children:
        walk(child, inside_table=False)

    return blocks


def split_paragraph_node(node: HtmlNode) -> list[HtmlNode]:
    attrs = list(node.attrs)
    segments: list[HtmlNode] = []
    inline_buffer: list[HtmlNode] = []

    def flush_inline_buffer() -> None:
        nonlocal inline_buffer
        if not has_meaningful_content(inline_buffer):
            inline_buffer = []
            return
        paragraph = HtmlNode(kind="element", tag="p", attrs=list(attrs))
        paragraph.children = inline_buffer
        segments.append(paragraph)
        inline_buffer = []

    for child in node.children:
        if child.kind == "element" and (child.tag in BLOCK_LEVEL_TAGS or is_display_contents_div(child)):
            flush_inline_buffer()
            if is_display_contents_div(child):
                segments.extend(child.children)
            else:
                segments.append(child)
        else:
            inline_buffer.append(child)

    flush_inline_buffer()
    return segments


def sanitize_node_children(parent: HtmlNode) -> None:
    sanitized: list[HtmlNode] = []
    for child in parent.children:
        if child.kind != "element":
            sanitized.append(child)
            continue

        sanitize_node_children(child)

        if child.tag == "img":
            set_attr(child, "loading", "eager")
            set_attr(child, "decoding", "sync")
            set_attr(child, "fetchpriority", "high")

        if has_class(child, "page-header-icon"):
            continue
        if child.tag in {"mark", "code"} and not has_meaningful_content(child.children):
            continue
        if child.tag == "details":
            flatten_details_node(child)
            sanitized.append(child)
            continue
        if child.tag == "li":
            wrapped_leading_text = wrap_leading_text_nodes(child, "print-inline-block")
            if wrapped_leading_text and parent.tag == "ol" and has_class(parent, "numbered-list"):
                append_class(wrapped_leading_text, "print-major-title")
                append_class(child, "print-major-item")
            elif wrapped_leading_text and parent.tag == "ul":
                append_class(child, "print-bullet-item")
        if is_table_wrapper_node(child):
            promote_table_wrapper_node(child)
            sanitized.append(child)
            continue
        if child.tag == "table" and parent.tag not in {"td", "th"} and not has_class(parent, "print-table-block"):
            sanitized.append(wrap_table_block_node(child))
            continue
        if is_display_contents_div(child):
            sanitized.extend(child.children)
            continue
        if child.tag == "p":
            split_nodes = split_paragraph_node(child)
            if not split_nodes:
                continue
            sanitized.extend(split_nodes)
            continue
        sanitized.append(child)
    parent.children = sanitized


def serialize_node(node: HtmlNode) -> str:
    if node.kind == "root":
        return "".join(serialize_node(child) for child in node.children)
    if node.kind == "text":
        return node.data
    if node.kind == "comment":
        return f"<!--{node.data}-->"
    if node.kind == "decl":
        return f"<!{node.data}>"

    attrs = []
    for key, value in node.attrs:
        if value is None:
            attrs.append(key)
        else:
            attrs.append(f'{key}="{html_lib.escape(value, quote=True)}"')
    attrs_str = (" " + " ".join(attrs)) if attrs else ""

    if node.self_closing or node.tag in VOID_TAGS:
        return f"<{node.tag}{attrs_str}/>"
    return f"<{node.tag}{attrs_str}>" + "".join(serialize_node(child) for child in node.children) + f"</{node.tag}>"


@dataclass(frozen=True)
class Variant:
    name: str
    body_classes: tuple[str, ...]
    title_suffix: str
    fast: bool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate print-friendly HTML variants from a Notion-exported HTML file. "
            "Creates print/compact layouts and optional fast-render variants with downscaled preview assets."
        )
    )
    parser.add_argument("input_html", type=Path, help="Path to the Notion-exported HTML file.")
    parser.add_argument(
        "--variants",
        nargs="+",
        choices=("print", "compact"),
        default=("print", "compact"),
        help="Base print variants to generate. Defaults to both print and compact.",
    )
    parser.add_argument(
        "--no-fast",
        action="store_true",
        help="Skip fast-render outputs and preview asset generation.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Directory for generated HTML and preview assets. Defaults to the input HTML directory.",
    )
    parser.add_argument(
        "--preview-dir-name",
        help="Custom name for the preview asset directory. Defaults to '<input-stem>_preview_assets'.",
    )
    parser.add_argument(
        "--max-edge",
        type=int,
        default=2200,
        help="Longest edge for generated preview images in fast mode. Default: 2200.",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=78,
        help="WEBP quality for fast preview assets. Default: 78.",
    )
    parser.add_argument(
        "--page-numbers",
        choices=("on", "off"),
        default="on",
        help="Whether to include page numbers in print output. Default: on.",
    )
    parser.add_argument(
        "--font-size",
        choices=("xsmall", "small", "normal", "large", "xlarge"),
        default="normal",
        help="Base print font size preset. Default: normal.",
    )
    parser.add_argument(
        "--open",
        choices=("none", "preferred", "dir", "both"),
        default="none",
        help="Open the generated preferred HTML, output directory, or both after generation.",
    )
    parser.add_argument(
        "--preferred-output",
        choices=("auto", "print", "compact", "print_fast", "compact_fast"),
        default="auto",
        help="Preferred output variant when --open preferred/both is used.",
    )
    return parser.parse_args()


def load_templates() -> tuple[str, str, str, str, str]:
    missing = [path for path in (THEME_PATH, LEARNING_PATH, RECOMMENDATION_PATH, RUNTIME_PATH, PAGED_POLYFILL_PATH) if not path.exists()]
    if missing:
        missing_list = ", ".join(str(path) for path in missing)
        raise FileNotFoundError(f"Missing print export template files: {missing_list}")
    return (
        THEME_PATH.read_text(encoding="utf-8").strip() + "\n",
        LEARNING_PATH.read_text(encoding="utf-8").strip() + "\n",
        RECOMMENDATION_PATH.read_text(encoding="utf-8").strip() + "\n",
        RUNTIME_PATH.read_text(encoding="utf-8").strip() + "\n",
        PAGED_POLYFILL_PATH.read_text(encoding="utf-8").strip() + "\n",
    )


def normalize_title(title: str) -> str:
    return TITLE_SUFFIX_RE.sub("", title.strip())


def strip_injected_blocks(html: str) -> str:
    blocks = (
        (THEME_MARKER_START, THEME_MARKER_END),
        (MANIFEST_MARKER_START, MANIFEST_MARKER_END),
        (BLOCKS_MARKER_START, BLOCKS_MARKER_END),
        (RECOMMENDATION_DATA_MARKER_START, RECOMMENDATION_DATA_MARKER_END),
        (RECOMMENDATION_MARKER_START, RECOMMENDATION_MARKER_END),
        (LEARNING_MARKER_START, LEARNING_MARKER_END),
        (RUNTIME_MARKER_START, RUNTIME_MARKER_END),
        (PAGED_MARKER_START, PAGED_MARKER_END),
    )
    cleaned = html
    for start, end in blocks:
        cleaned = re.sub(
            re.escape(start) + r".*?" + re.escape(end),
            "",
            cleaned,
            flags=re.DOTALL,
        )
    return cleaned


def sanitize_export_html(html: str) -> tuple[str, list[dict[str, object]]]:
    cleaned = html
    cleaned = PAGE_HEADER_ICON_RE.sub("", cleaned)
    cleaned = WHITESPACE_MARK_RE.sub("", cleaned)
    cleaned = EMPTY_CODE_RE.sub("", cleaned)
    parser = HtmlTreeBuilder()
    parser.feed(cleaned)
    parser.close()
    sanitize_node_children(parser.root)
    blocks = annotate_block_contract(parser.root)
    cleaned = serialize_node(parser.root)
    cleaned = WHITESPACE_MARK_RE.sub("", cleaned)
    cleaned = EMPTY_CODE_RE.sub("", cleaned)
    return cleaned, blocks


def set_title(html: str, suffix: str) -> str:
    match = TITLE_RE.search(html)
    if not match:
        return html
    base_title = normalize_title(match.group(2))
    return TITLE_RE.sub(rf"\1{base_title} {suffix}\3", html, count=1)


def set_body_classes(html: str, classes: Iterable[str]) -> str:
    desired = [cls for cls in classes if cls]

    def repl(match: re.Match[str]) -> str:
        attrs = match.group("attrs") or ""
        class_match = re.search(r'\bclass="([^"]*)"', attrs, flags=re.IGNORECASE)
        existing: list[str] = []
        if class_match:
            existing = [
                token
                for token in class_match.group(1).split()
                if token not in {"print-ready", "print-compact"}
            ]
        merged = existing + [token for token in desired if token not in existing]
        class_attr = f' class="{" ".join(merged).strip()}"' if merged else ""
        if class_match:
            attrs = re.sub(r'\bclass="[^"]*"', class_attr.strip() or "", attrs, count=1)
            if class_attr and "class=" not in attrs:
                attrs = attrs.rstrip() + class_attr
            return f"<body{attrs}>"
        return f"<body{attrs}{class_attr}>"

    return BODY_RE.sub(repl, html, count=1)


def inject_theme(html: str, theme_css: str) -> str:
    block = f"{THEME_MARKER_START}\n<style>\n{theme_css}</style>\n{THEME_MARKER_END}\n"
    if "</head>" in html:
        return html.replace("</head>", block + "</head>", 1)
    return block + html


def inject_manifest(html: str, manifest: dict[str, object]) -> str:
    manifest_json = json.dumps(manifest, ensure_ascii=False)
    block = (
        f"{MANIFEST_MARKER_START}\n"
        f'<script id="notion-printer-manifest" type="application/json">{manifest_json}</script>\n'
        f"{MANIFEST_MARKER_END}\n"
    )
    if "</body>" in html:
        return html.replace("</body>", block + "</body>", 1)
    return html + block


def inject_blocks_manifest(html: str, blocks_payload: dict[str, object]) -> str:
    block_json = json.dumps(blocks_payload, ensure_ascii=False)
    block = (
        f"{BLOCKS_MARKER_START}\n"
        f'<script id="notion-printer-blocks-manifest" type="application/json">{block_json}</script>\n'
        f"{BLOCKS_MARKER_END}\n"
    )
    if "</body>" in html:
        return html.replace("</body>", block + "</body>", 1)
    return html + block


def inject_learning(html: str, learning_js: str) -> str:
    block = f"{LEARNING_MARKER_START}\n<script>\n{learning_js}</script>\n{LEARNING_MARKER_END}\n"
    if "</body>" in html:
        return html.replace("</body>", block + "</body>", 1)
    return html + block


def load_json_if_exists(path: Path) -> dict[str, object] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def inject_recommendation_data(
    html: str,
    *,
    rules_config: dict[str, object] | None,
    learned_model: dict[str, object] | None,
) -> str:
    blocks: list[str] = [RECOMMENDATION_DATA_MARKER_START]
    if rules_config is not None:
        blocks.append(
            '<script id="notion-printer-recommendation-rules" type="application/json">'
            + json.dumps(rules_config, ensure_ascii=False)
            + "</script>"
        )
    if learned_model is not None:
        blocks.append(
            '<script id="notion-printer-recommendation-model" type="application/json">'
            + json.dumps(learned_model, ensure_ascii=False)
            + "</script>"
        )
    blocks.append(RECOMMENDATION_DATA_MARKER_END)
    block = "\n".join(blocks) + "\n"
    if "</body>" in html:
        return html.replace("</body>", block + "</body>", 1)
    return html + block


def inject_recommendation(html: str, recommendation_js: str) -> str:
    block = f"{RECOMMENDATION_MARKER_START}\n<script>\n{recommendation_js}</script>\n{RECOMMENDATION_MARKER_END}\n"
    if "</body>" in html:
        return html.replace("</body>", block + "</body>", 1)
    return html + block


def inject_runtime(html: str, runtime_js: str) -> str:
    block = f"{RUNTIME_MARKER_START}\n<script>\n{runtime_js}</script>\n{RUNTIME_MARKER_END}\n"
    if "</body>" in html:
        return html.replace("</body>", block + "</body>", 1)
    return html + block


def build_paged_config_js() -> str:
    return """
(function () {
  function waitForWindowLoad(timeoutMs) {
    if (document.readyState === 'complete') return Promise.resolve();
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        window.removeEventListener('load', finish);
        resolve();
      }
      window.addEventListener('load', finish, { once: true });
      window.setTimeout(finish, timeoutMs || 15000);
    });
  }

  function primePrintImages() {
    return Array.from(document.images || []).map(function (img) {
      try { img.loading = 'eager'; } catch (error) {}
      try { img.decoding = 'sync'; } catch (error) {}
      try { img.fetchPriority = 'high'; } catch (error) {}
      try { img.setAttribute('loading', 'eager'); } catch (error) {}
      try { img.setAttribute('decoding', 'sync'); } catch (error) {}
      try { img.setAttribute('fetchpriority', 'high'); } catch (error) {}
      return img;
    });
  }

  function waitForOneImage(img, timeoutMs) {
    if (!img) return Promise.resolve();
    if (img.complete && img.naturalWidth > 0) {
      if (typeof img.decode === 'function') {
        return img.decode().catch(function () {});
      }
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        img.removeEventListener('load', finish);
        img.removeEventListener('error', finish);
        if (img.complete && img.naturalWidth > 0 && typeof img.decode === 'function') {
          img.decode().catch(function () {}).finally(resolve);
          return;
        }
        resolve();
      }
      img.addEventListener('load', finish, { once: true });
      img.addEventListener('error', finish, { once: true });
      window.setTimeout(finish, timeoutMs || 15000);
    });
  }

  function waitForDocumentAssets() {
    var images = primePrintImages();
    var waits = images.map(function (img) {
      return waitForOneImage(img, 15000);
    });
    if (document.fonts && typeof document.fonts.ready === 'object') {
      waits.push(document.fonts.ready.catch(function () {}));
    }
    return Promise.all(waits).then(function () {});
  }

  var existing = window.PagedConfig || {};
  var existingBefore = typeof existing.before === 'function' ? existing.before : null;
  var existingAfter = typeof existing.after === 'function' ? existing.after : null;

  window.PagedConfig = Object.assign({}, existing, {
    auto: existing.auto !== false,
    before: async function () {
      await waitForWindowLoad(15000);
      await waitForDocumentAssets();
      if (existingBefore) {
        await existingBefore();
      }
      document.documentElement.setAttribute('data-notion-printer-assets-ready', 'true');
    },
    after: async function (flow) {
      document.documentElement.setAttribute('data-notion-printer-paged-ready', 'true');
      if (existingAfter) {
        await existingAfter(flow);
      }
    }
  });
})();
""".strip()


def inject_paged_config(html: str, paged_config_js: str) -> str:
    block = (
        f"{PAGED_CONFIG_MARKER_START}\n"
        f"<script>\n{paged_config_js}\n</script>\n"
        f"{PAGED_CONFIG_MARKER_END}\n"
    )
    if "</body>" in html:
        return html.replace("</body>", block + "</body>", 1)
    return html + block


def inject_paged_polyfill(html: str, paged_js: str) -> str:
    block = f"{PAGED_MARKER_START}\n<script>\n{paged_js}</script>\n{PAGED_MARKER_END}\n"
    if "</body>" in html:
        return html.replace("</body>", block + "</body>", 1)
    return html + block


def build_theme_css(theme_css: str, page_numbers: str, font_size: str) -> str:
    overrides: list[str] = []
    font_size_presets = {
        "xsmall": {
            "screen": "0.90em",
            "compact_screen": "0.88em",
            "print": "9.2pt",
            "compact_print": "8.4pt",
        },
        "small": {
            "screen": "0.95em",
            "compact_screen": "0.93em",
            "print": "9.8pt",
            "compact_print": "8.9pt",
        },
        "large": {
            "screen": "1.05em",
            "compact_screen": "1.03em",
            "print": "11pt",
            "compact_print": "10.1pt",
        },
        "xlarge": {
            "screen": "1.10em",
            "compact_screen": "1.08em",
            "print": "11.6pt",
            "compact_print": "10.7pt",
        },
    }

    if page_numbers == "off":
        overrides.append(
            """
@media only print {
  @page {
    @bottom-center { content: none !important; }
  }
}
""".strip()
        )

    if font_size in font_size_presets:
        preset = font_size_presets[font_size]
        screen_size = preset["screen"]
        compact_screen_size = preset["compact_screen"]
        print_size = preset["print"]
        compact_print_size = preset["compact_print"]
        overrides.append(
            f"""
body.print-ready.print-font-{font_size} {{ font-size: {screen_size}; }}
body.print-ready.print-compact.print-font-{font_size} {{ font-size: {compact_screen_size}; }}
@media only print {{
  body.print-ready.print-font-{font_size} {{ font-size: {print_size}; }}
  body.print-ready.print-compact.print-font-{font_size} {{ font-size: {compact_print_size}; }}
}}
""".strip()
        )

    if not overrides:
        return theme_css
    return theme_css + "\n" + "\n\n".join(overrides) + "\n"


def is_local_url(url: str) -> bool:
    lowered = url.lower().strip()
    if not lowered or lowered.startswith(("#", "data:", "javascript:", "mailto:")):
        return False
    parsed = urlparse(lowered)
    return parsed.scheme == "" and not lowered.startswith("//")


def resolve_local_path(raw_url: str, base_dir: Path) -> Path:
    parsed = urlparse(raw_url)
    candidate = unquote(parsed.path)
    return (base_dir / candidate).resolve()


def relative_url(target: Path, output_dir: Path) -> str:
    rel = os.path.relpath(target, output_dir)
    rel = rel.replace(os.sep, "/")
    return rel if rel.startswith((".", "..")) else f"./{rel}"


def rewrite_local_urls(html: str, input_dir: Path, output_dir: Path) -> str:
    def repl(match: re.Match[str]) -> str:
        prefix = match.group("prefix")
        raw_url = match.group("url")
        if not is_local_url(raw_url):
            return match.group(0)

        source_path = resolve_local_path(raw_url, input_dir)
        if not source_path.exists():
            return match.group(0)

        rewritten = relative_url(source_path, output_dir)
        return f'{prefix}{rewritten}"'

    return ATTR_RE.sub(repl, html)


def unique_preview_name(source_path: Path, preview_dir: Path) -> str:
    stem = re.sub(r"[^0-9A-Za-z._-]+", "_", source_path.stem).strip("._") or "asset"
    digest = hashlib.sha1(str(source_path).encode("utf-8")).hexdigest()[:8]
    _ = preview_dir
    return f"{stem}-{digest}.webp"


def build_preview_asset(source_path: Path, preview_dir: Path, max_edge: int, quality: int) -> Path:
    preview_dir.mkdir(parents=True, exist_ok=True)

    if source_path.suffix.lower() == ".svg":
        target = preview_dir / source_path.name
        if not target.exists():
            shutil.copy2(source_path, target)
        return target

    target = preview_dir / unique_preview_name(source_path, preview_dir)
    if target.exists():
        return target
    try:
        with Image.open(source_path) as img:
            img = ImageOps.exif_transpose(img)
            if getattr(img, "is_animated", False):
                img.seek(0)
            if img.mode not in {"RGB", "RGBA"}:
                img = img.convert("RGBA" if "A" in img.getbands() else "RGB")

            width, height = img.size
            longest_edge = max(width, height)
            if longest_edge > max_edge:
                scale = max_edge / float(longest_edge)
                resized = (
                    max(1, int(round(width * scale))),
                    max(1, int(round(height * scale))),
                )
                img = img.resize(resized, RESAMPLE_LANCZOS)

            img.save(target, format="WEBP", quality=quality, method=6)
            return target
    except (UnidentifiedImageError, OSError):
        fallback = preview_dir / source_path.name
        if not fallback.exists():
            shutil.copy2(source_path, fallback)
        return fallback


def collect_fast_rewrites(
    html: str,
    input_dir: Path,
    preview_dir: Path,
    output_dir: Path,
    max_edge: int,
    quality: int,
) -> dict[str, str]:
    mapping: dict[str, str] = {}
    seen: set[str] = set()
    for match in IMG_SRC_RE.finditer(html):
        raw_src = match.group(2)
        if raw_src in seen or not is_local_url(raw_src):
            continue
        seen.add(raw_src)
        source_path = resolve_local_path(raw_src, input_dir)
        if not source_path.exists():
            continue
        preview_path = build_preview_asset(source_path, preview_dir, max_edge=max_edge, quality=quality)
        mapping[raw_src] = relative_url(preview_path, output_dir)
    return mapping


def rewrite_img_sources(html: str, mapping: dict[str, str]) -> str:
    if not mapping:
        return html

    def repl(match: re.Match[str]) -> str:
        raw_src = match.group(2)
        if raw_src not in mapping:
            return match.group(0)
        return f'{match.group(1)}{mapping[raw_src]}{match.group(3)}'

    return IMG_SRC_RE.sub(repl, html)


def variant_title_suffix(variant: Variant) -> str:
    return "(Print Compact Fast)" if variant.fast and "print-compact" in variant.body_classes else \
        "(Print Fast)" if variant.fast else \
        "(Print Compact)" if "print-compact" in variant.body_classes else \
        "(Print)"


def output_name(input_stem: str, variant: Variant) -> str:
    if variant.fast and "print-compact" in variant.body_classes:
        return f"{input_stem}_print_compact_fast.html"
    if variant.fast:
        return f"{input_stem}_print_fast.html"
    if "print-compact" in variant.body_classes:
        return f"{input_stem}_print_compact.html"
    return f"{input_stem}_print.html"


def build_variants(base_variants: Iterable[str], include_fast: bool) -> list[Variant]:
    variants: list[Variant] = []
    for base in base_variants:
        if base == "print":
            variants.append(Variant(name="print", body_classes=("print-ready",), title_suffix="(Print)", fast=False))
            if include_fast:
                variants.append(Variant(name="print_fast", body_classes=("print-ready",), title_suffix="(Print Fast)", fast=True))
        elif base == "compact":
            variants.append(Variant(name="print_compact", body_classes=("print-ready", "print-compact"), title_suffix="(Print Compact)", fast=False))
            if include_fast:
                variants.append(Variant(name="print_compact_fast", body_classes=("print-ready", "print-compact"), title_suffix="(Print Compact Fast)", fast=True))
    return variants


def pick_preferred_output(generated: Iterable[Path], preference: str) -> Path | None:
    generated_map = {path.name: path for path in generated}
    ordered_preferences = {
        "auto": ("_print_compact_fast.html", "_print_compact.html", "_print_fast.html", "_print.html"),
        "compact_fast": ("_print_compact_fast.html",),
        "print_fast": ("_print_fast.html",),
        "compact": ("_print_compact.html",),
        "print": ("_print.html",),
    }
    suffixes = ordered_preferences[preference]
    for suffix in suffixes:
        for path in generated_map.values():
            if path.name.endswith(suffix):
                return path
    return next(iter(generated_map.values()), None)


def sync_manifest_features_from_blocks(
    manifest_features: dict[str, object] | None,
    block_rows: list[dict[str, object]],
) -> None:
    if not isinstance(manifest_features, dict):
        return

    def count(block_type: str) -> int:
        return sum(1 for row in block_rows if row.get("block_type") == block_type)

    manifest_features["block_count"] = len(block_rows)
    manifest_features["section_count"] = count("section_heading")
    manifest_features["paragraph_count"] = count("paragraph")
    manifest_features["image_count"] = count("image")
    manifest_features["table_count"] = count("table")
    manifest_features["list_item_count"] = count("list_item_text") + count("list_item_heading")
    manifest_features["details_count"] = count("details_summary")
    manifest_features["text_char_count"] = sum(int(row.get("text_char_count", 0) or 0) for row in block_rows)


def open_path(target: Path) -> None:
    subprocess.Popen(["xdg-open", str(target)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def generate_variant(
    source_html: str,
    variant: Variant,
    input_path: Path,
    output_dir: Path,
    preview_dir: Path | None,
    theme_css: str,
    learning_js: str,
    recommendation_js: str,
    runtime_js: str,
    paged_js: str,
    font_size: str,
    max_edge: int,
    quality: int,
) -> Path:
    output_path = output_dir / output_name(input_path.stem, variant)
    html, block_rows = sanitize_export_html(strip_injected_blocks(source_html))
    if variant.fast:
        if preview_dir is None:
            raise ValueError("preview_dir is required for fast variants")
        raw_rewrites = collect_fast_rewrites(
            html=html,
            input_dir=input_path.parent,
            preview_dir=preview_dir,
            output_dir=output_dir,
            max_edge=max_edge,
            quality=quality,
        )
    else:
        raw_rewrites = {}

    html = rewrite_local_urls(html, input_path.parent, output_dir)

    if raw_rewrites:
        effective_rewrites = {}
        for raw_src, preview_url in raw_rewrites.items():
            source_path = resolve_local_path(raw_src, input_path.parent)
            current_url = relative_url(source_path, output_dir)
            effective_rewrites[current_url] = preview_url
        html = rewrite_img_sources(html, effective_rewrites)

    html = set_title(html, variant_title_suffix(variant))
    body_classes = list(variant.body_classes)
    if font_size != "normal":
        body_classes.append(f"print-font-{font_size}")
    manifest = build_document_manifest(
        input_path=input_path,
        output_path=output_path,
        variant_name=variant.name,
        body_classes=body_classes,
        source_html=source_html,
    )
    blocks_payload = build_blocks_payload(manifest=manifest, blocks=block_rows)
    manifest_features = manifest.get("features")
    sync_manifest_features_from_blocks(manifest_features, block_rows)
    rules_config = load_json_if_exists(RULES_MODEL_PATH)
    learned_model = load_json_if_exists(LAYOUT_MODEL_PATH)
    html = set_body_classes(html, body_classes)
    html = inject_theme(html, theme_css)
    html = inject_manifest(html, manifest)
    html = inject_blocks_manifest(html, blocks_payload)
    html = inject_recommendation_data(html, rules_config=rules_config, learned_model=learned_model)
    html = inject_recommendation(html, recommendation_js)
    html = inject_learning(html, learning_js)
    html = inject_runtime(html, runtime_js)
    html = inject_paged_config(html, build_paged_config_js())
    html = inject_paged_polyfill(html, paged_js)

    output_path.write_text(html, encoding="utf-8")
    write_document_manifest(manifest)
    write_blocks_payload(blocks_payload)
    return output_path


def main() -> int:
    args = parse_args()
    input_path = args.input_html.resolve()
    if not input_path.exists():
        print(f"Input HTML not found: {input_path}", file=sys.stderr)
        return 1

    output_dir = (args.output_dir.resolve() if args.output_dir else input_path.parent)
    output_dir.mkdir(parents=True, exist_ok=True)

    preview_dir_name = args.preview_dir_name or f"{input_path.stem}_preview_assets"
    preview_dir = output_dir / preview_dir_name

    theme_css, learning_js, recommendation_js, runtime_js, paged_js = load_templates()
    theme_css = build_theme_css(theme_css, page_numbers=args.page_numbers, font_size=args.font_size)
    source_html = input_path.read_text(encoding="utf-8")
    variants = build_variants(args.variants, include_fast=not args.no_fast)

    generated: list[Path] = []
    for variant in variants:
        generated.append(
            generate_variant(
                source_html=source_html,
                variant=variant,
                input_path=input_path,
                output_dir=output_dir,
                preview_dir=preview_dir if variant.fast else None,
                theme_css=theme_css,
                learning_js=learning_js,
                recommendation_js=recommendation_js,
                runtime_js=runtime_js,
                paged_js=paged_js,
                font_size=args.font_size,
                max_edge=args.max_edge,
                quality=args.quality,
            )
        )

    print("Generated files:")
    for path in generated:
        print(f"- {path}")
    if not args.no_fast:
        print(f"- preview assets: {preview_dir}")

    preferred = pick_preferred_output(generated, args.preferred_output)
    if args.open in {"preferred", "both"} and preferred is not None:
        open_path(preferred)
    if args.open in {"dir", "both"}:
        open_path(output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
