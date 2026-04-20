#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
GENERATOR="$SCRIPT_DIR/notion_print_export.py"
PREVIEW_SERVER="$SCRIPT_DIR/notion_print_preview.py"
PYTHON_BIN="${PYTHON_BIN:-python3}"

MODE="quick"
if [[ "${1:-}" == "--advanced" ]]; then
  MODE="advanced"
  shift
fi

if ! command -v zenity >/dev/null 2>&1; then
  echo "zenity is required for the GUI launcher." >&2
  exit 1
fi

if ! command -v xdg-open >/dev/null 2>&1; then
  echo "xdg-open is required to open the generated output." >&2
  exit 1
fi

if ! command -v gnome-terminal >/dev/null 2>&1; then
  echo "gnome-terminal is required for the preview launcher." >&2
  exit 1
fi

if [[ ! -f "$GENERATOR" ]]; then
  zenity --error --title="Notion Printer" --text="Generator not found:\n$GENERATOR"
  exit 1
fi

if [[ ! -f "$PREVIEW_SERVER" ]]; then
  zenity --error --title="Notion Printer" --text="Preview server not found:\n$PREVIEW_SERVER"
  exit 1
fi

pick_input_file() {
  zenity --file-selection \
    --title="Notion Printer: HTML 선택" \
    --file-filter="HTML files | *.html" \
    --file-filter="All files | *"
}

show_advanced_form() {
  zenity --forms \
    --title="Notion Printer 옵션" \
    --text="fast 미리보기 품질은 fast 출력본에만 적용됩니다." \
    --separator="|" \
    --add-combo="Fast 미리보기 품질 (fast 선택 시)" \
    --combo-values="빠름 (1200px / WEBP 68)|균형 (1600px / WEBP 72)|선명 (2200px / WEBP 78)|고품질 (2800px / WEBP 84)" \
    --add-combo="쪽번호" \
    --combo-values="켜기|끄기" \
    --add-combo="본문 폰트 크기" \
    --combo-values="보통|작게|아주 작게|크게|아주 크게" \
    --add-combo="완료 후 열기" \
    --combo-values="결과 HTML|출력 폴더|둘 다|아무것도 안 함"
}

pick_output_modes() {
  zenity --list \
    --title="Notion Printer 출력 모드 선택" \
    --text="원하는 출력본을 체크하세요. fast는 선택한 일반/compact 출력본의 빠른 미리보기 버전을 추가 생성합니다." \
    --checklist \
    --width=760 \
    --height=360 \
    --separator="|" \
    --column="선택" \
    --column="출력" \
    --column="설명" \
    TRUE "일반 Print" "표준 출력용 HTML" \
    TRUE "Compact Print" "페이지 수를 줄인 출력용 HTML" \
    TRUE "Fast Preview 추가" "선택한 출력본에 대해 fast 버전도 함께 생성"
}

resolve_quality_preset() {
  local preset="$1"
  case "$preset" in
    "빠름 (1200px / WEBP 68)")
      MAX_EDGE="1200"
      QUALITY="68"
      ;;
    "균형 (1600px / WEBP 72)")
      MAX_EDGE="1600"
      QUALITY="72"
      ;;
    "고품질 (2800px / WEBP 84)")
      MAX_EDGE="2800"
      QUALITY="84"
      ;;
    *)
      MAX_EDGE="2200"
      QUALITY="78"
      ;;
  esac
}

resolve_page_number_choice() {
  local choice="$1"
  case "$choice" in
    "끄기")
      PAGE_NUMBER_ARG="off"
      ;;
    *)
      PAGE_NUMBER_ARG="on"
      ;;
  esac
}

resolve_font_size_choice() {
  local choice="$1"
  case "$choice" in
    "아주 작게")
      FONT_SIZE_ARG="xsmall"
      ;;
    "작게")
      FONT_SIZE_ARG="small"
      ;;
    "아주 크게")
      FONT_SIZE_ARG="xlarge"
      ;;
    "크게")
      FONT_SIZE_ARG="large"
      ;;
    *)
      FONT_SIZE_ARG="normal"
      ;;
  esac
}

resolve_profile_args() {
  local use_print="$1"
  local use_compact="$2"
  local use_fast="$3"

  PROFILE_ARGS=()

  if [[ "$use_print" == "true" && "$use_compact" == "true" ]]; then
    PROFILE_ARGS+=(--variants print compact)
  elif [[ "$use_print" == "true" ]]; then
    PROFILE_ARGS+=(--variants print)
  elif [[ "$use_compact" == "true" ]]; then
    PROFILE_ARGS+=(--variants compact)
  else
    zenity --error \
      --title="Notion Printer" \
      --text="일반 Print 또는 Compact Print 중 하나 이상은 선택해야 합니다."
    exit 1
  fi

  if [[ "$use_fast" != "true" ]]; then
    PROFILE_ARGS+=(--no-fast)
  fi

  if [[ "$use_fast" == "true" && "$use_compact" == "true" ]]; then
    PROFILE_ARGS+=(--preferred-output compact_fast)
    PREFERRED_OUTPUT_FILE="${INPUT_STEM}_print_compact_fast.html"
  elif [[ "$use_fast" == "true" && "$use_print" == "true" ]]; then
    PROFILE_ARGS+=(--preferred-output print_fast)
    PREFERRED_OUTPUT_FILE="${INPUT_STEM}_print_fast.html"
  elif [[ "$use_compact" == "true" ]]; then
    PROFILE_ARGS+=(--preferred-output compact)
    PREFERRED_OUTPUT_FILE="${INPUT_STEM}_print_compact.html"
  else
    PROFILE_ARGS+=(--preferred-output print)
    PREFERRED_OUTPUT_FILE="${INPUT_STEM}_print.html"
  fi
}

resolve_open_action() {
  local open_choice="$1"
  case "$open_choice" in
    "결과 HTML")
      OPEN_ARGS=(--open none)
      OPEN_MODE="preview"
      ;;
    "출력 폴더")
      OPEN_ARGS=(--open none)
      OPEN_MODE="dir"
      ;;
    "둘 다")
      OPEN_ARGS=(--open none)
      OPEN_MODE="both"
      ;;
    *)
      OPEN_ARGS=(--open none)
      OPEN_MODE="none"
      ;;
  esac
}

launch_preview_terminal() {
  local html_path="$1"
  gnome-terminal -- bash -lc "\"$PYTHON_BIN\" \"$PREVIEW_SERVER\" serve \"$html_path\"; echo; echo 'Notion Printer preview server stopped.'; read -n 1 -s -r -p 'Press any key to close...'"
}

INPUT_PATH="${1:-}"
if [[ -z "$INPUT_PATH" ]]; then
  INPUT_PATH="$(pick_input_file || true)"
fi

if [[ -z "$INPUT_PATH" ]]; then
  exit 0
fi

INPUT_PATH="$(realpath "$INPUT_PATH")"
OUTPUT_DIR="$(dirname "$INPUT_PATH")"
INPUT_STEM="$(basename "${INPUT_PATH%.html}")"

USE_PRINT="false"
USE_COMPACT="true"
USE_FAST="true"
QUALITY_PRESET="선명 (2200px / WEBP 78)"
MAX_EDGE="2200"
QUALITY="78"
PAGE_NUMBER_CHOICE="켜기"
PAGE_NUMBER_ARG="on"
FONT_SIZE_CHOICE="보통"
FONT_SIZE_ARG="normal"
OPEN_CHOICE="결과 HTML"

if [[ "$MODE" == "advanced" ]]; then
  MODE_RESULT="$(pick_output_modes || true)"
  if [[ -z "$MODE_RESULT" ]]; then
    exit 0
  fi

  if [[ "$MODE_RESULT" == *"일반 Print"* ]]; then
    USE_PRINT="true"
  fi
  if [[ "$MODE_RESULT" == *"Compact Print"* ]]; then
    USE_COMPACT="true"
  else
    USE_COMPACT="false"
  fi
  if [[ "$MODE_RESULT" == *"Fast Preview 추가"* ]]; then
    USE_FAST="true"
  else
    USE_FAST="false"
  fi

  FORM_RESULT="$(show_advanced_form || true)"
  if [[ -z "$FORM_RESULT" ]]; then
    exit 0
  fi
  IFS="|" read -r QUALITY_PRESET PAGE_NUMBER_CHOICE FONT_SIZE_CHOICE OPEN_CHOICE <<< "$FORM_RESULT"
  QUALITY_PRESET="${QUALITY_PRESET:-선명 (2200px / WEBP 78)}"
  PAGE_NUMBER_CHOICE="${PAGE_NUMBER_CHOICE:-켜기}"
  FONT_SIZE_CHOICE="${FONT_SIZE_CHOICE:-보통}"
  resolve_quality_preset "$QUALITY_PRESET"
  resolve_page_number_choice "$PAGE_NUMBER_CHOICE"
  resolve_font_size_choice "$FONT_SIZE_CHOICE"
else
  USE_PRINT="false"
  USE_COMPACT="true"
  USE_FAST="true"
  zenity --notification \
    --window-icon="text-html" \
    --text="Notion Printer가 추천 프로필로 출력용 HTML을 생성합니다."
fi

resolve_profile_args "$USE_PRINT" "$USE_COMPACT" "$USE_FAST"
resolve_open_action "$OPEN_CHOICE"

STATUS_FILE="$(mktemp)"
LOG_FILE="$(mktemp)"

(
  set +e
  "$PYTHON_BIN" "$GENERATOR" \
    "$INPUT_PATH" \
    --output-dir "$OUTPUT_DIR" \
    --max-edge "$MAX_EDGE" \
    --quality "$QUALITY" \
    --page-numbers "$PAGE_NUMBER_ARG" \
    --font-size "$FONT_SIZE_ARG" \
    "${PROFILE_ARGS[@]}" \
    "${OPEN_ARGS[@]}" >"$LOG_FILE" 2>&1
  echo "$?" >"$STATUS_FILE"
) &
WORKER_PID=$!

(
  while kill -0 "$WORKER_PID" 2>/dev/null; do
    echo "# Notion Printer가 출력용 HTML을 생성하는 중..."
    sleep 0.4
  done
) | zenity --progress \
  --title="Notion Printer" \
  --text="출력용 HTML 생성 중..." \
  --pulsate \
  --auto-close \
  --no-cancel

wait "$WORKER_PID" || true
STATUS_CODE="$(cat "$STATUS_FILE" 2>/dev/null || echo 1)"
rm -f "$STATUS_FILE"

if [[ "$STATUS_CODE" != "0" ]]; then
  zenity --error \
    --title="Notion Printer 실패" \
    --width=720 \
    --text="생성 중 오류가 발생했습니다.\n\n$(sed 's/&/&amp;/g' "$LOG_FILE")"
  rm -f "$LOG_FILE"
  exit 1
fi

rm -f "$LOG_FILE"

PREFERRED_OUTPUT_PATH="$OUTPUT_DIR/$PREFERRED_OUTPUT_FILE"

if [[ "$OPEN_MODE" == "preview" || "$OPEN_MODE" == "both" ]]; then
  launch_preview_terminal "$PREFERRED_OUTPUT_PATH"
fi

if [[ "$OPEN_MODE" == "dir" || "$OPEN_MODE" == "both" ]]; then
  xdg-open "$OUTPUT_DIR" >/dev/null 2>&1 || true
fi

zenity --notification \
  --window-icon="text-html" \
  --text="Notion Printer 출력 완료"
