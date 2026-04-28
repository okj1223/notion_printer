#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
GENERATOR="$SCRIPT_DIR/scripts/print_integrated_factory.py"
INPUT_PREPARER="$SCRIPT_DIR/scripts/prepare_notion_inputs.py"
PYTHON_BIN="${PYTHON_BIN:-python3}"
APP_ICON_PATH="$SCRIPT_DIR/assets/icons/notion-printer-256.png"
if [[ -f "$APP_ICON_PATH" ]]; then
  ZENITY_ICON="$APP_ICON_PATH"
else
  ZENITY_ICON="printer"
fi

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

if [[ ! -f "$GENERATOR" ]]; then
  zenity --error --title="Notion Printer" --text="Integrated generator not found:\n$GENERATOR"
  exit 1
fi

if [[ ! -f "$INPUT_PREPARER" ]]; then
  zenity --error --title="Notion Printer" --text="Input preparation script not found:\n$INPUT_PREPARER"
  exit 1
fi

pick_input_files() {
  zenity --file-selection \
    --multiple \
    --separator="|" \
    --title="Notion Printer: HTML 또는 ZIP 파일 선택" \
    --file-filter="Notion export | *.html *.zip" \
    --file-filter="HTML files | *.html" \
    --file-filter="ZIP files | *.zip" \
    --file-filter="All files | *"
}

show_advanced_form() {
  zenity --forms \
    --title="Notion Printer 옵션" \
    --text="선택한 HTML 또는 ZIP은 통합 프린터로 처리됩니다. ZIP은 자동 압축 해제 후 원본 HTML을 찾아 사용하며, 여러 파일이면 자동 통합되고 목차 기본값은 꺼져 있습니다." \
    --separator="|" \
    --add-combo="Fast 미리보기 품질 (fast 선택 시)" \
    --combo-values="빠름 (1200px / WEBP 68)|균형 (1600px / WEBP 72)|선명 (2200px / WEBP 78)|고품질 (2800px / WEBP 84)" \
    --add-combo="목차" \
    --combo-values="끄기|켜기" \
    --add-combo="쪽번호" \
    --combo-values="켜기|끄기" \
    --add-combo="본문 폰트 크기" \
    --combo-values="보통|작게|아주 작게|크게|아주 크게" \
    --add-combo="완료 후 열기" \
    --combo-values="브라우저 미리보기|출력 폴더|둘 다|아무것도 안 함"
}

pick_output_modes() {
  zenity --list \
    --title="Notion Printer 출력 모드 선택" \
    --text="선택한 HTML을 통합 프린터로 생성합니다. fast는 선택한 일반/compact 출력본의 빠른 미리보기 버전을 추가 생성합니다." \
    --checklist \
    --width=760 \
    --height=360 \
    --separator="|" \
    --column="선택" \
    --column="출력" \
    --column="설명" \
    FALSE "일반 Print" "표준 출력용 HTML" \
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
    "선명 (2200px / WEBP 78)")
      MAX_EDGE="2200"
      QUALITY="78"
      ;;
    *)
      MAX_EDGE="1200"
      QUALITY="68"
      ;;
  esac
}

resolve_toc_choice() {
  local choice="$1"
  case "$choice" in
    "켜기")
      TOC_ARG="on"
      ;;
    *)
      TOC_ARG="off"
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
  elif [[ "$use_fast" == "true" && "$use_print" == "true" ]]; then
    PROFILE_ARGS+=(--preferred-output print_fast)
  elif [[ "$use_compact" == "true" ]]; then
    PROFILE_ARGS+=(--preferred-output compact)
  else
    PROFILE_ARGS+=(--preferred-output print)
  fi
}

resolve_open_action() {
  local open_choice="$1"
  FACTORY_OPEN_ARGS=()
  case "$open_choice" in
    "브라우저 미리보기")
      OPEN_MODE="preview"
      ;;
    "출력 폴더")
      FACTORY_OPEN_ARGS+=(--no-open-last)
      OPEN_MODE="dir"
      ;;
    "둘 다")
      OPEN_MODE="both"
      ;;
    *)
      FACTORY_OPEN_ARGS+=(--no-open-last)
      OPEN_MODE="none"
      ;;
  esac
}

INPUT_PATHS=()
if (($# > 0)); then
  INPUT_PATHS=("$@")
else
  PICKED_INPUTS="$(pick_input_files || true)"
  if [[ -z "$PICKED_INPUTS" ]]; then
    exit 0
  fi
  IFS="|" read -r -a INPUT_PATHS <<< "$PICKED_INPUTS"
fi

PREPARE_STATUS_FILE="$(mktemp)"
PREPARE_LOG_FILE="$(mktemp)"
(
  set +e
  "$PYTHON_BIN" "$INPUT_PREPARER" --shell "${INPUT_PATHS[@]}" >"$PREPARE_STATUS_FILE" 2>"$PREPARE_LOG_FILE"
  echo "$?" >"$PREPARE_STATUS_FILE.exit"
)
PREPARE_EXIT_CODE="$(cat "$PREPARE_STATUS_FILE.exit" 2>/dev/null || echo 1)"
rm -f "$PREPARE_STATUS_FILE.exit"
if [[ "$PREPARE_EXIT_CODE" != "0" ]]; then
  zenity --text-info \
    --title="Notion Printer 입력 실패" \
    --width=880 \
    --height=520 \
    --window-icon="$ZENITY_ICON" \
    --filename="$PREPARE_LOG_FILE"
  rm -f "$PREPARE_STATUS_FILE" "$PREPARE_LOG_FILE"
  exit 1
fi
eval "$(cat "$PREPARE_STATUS_FILE")"
rm -f "$PREPARE_STATUS_FILE" "$PREPARE_LOG_FILE"
RESOLVED_INPUTS=("${PREPARED_INPUTS[@]}")

if ((${#RESOLVED_INPUTS[@]} == 0)); then
  exit 0
fi

DOC_COUNT="${#RESOLVED_INPUTS[@]}"
FIRST_INPUT_PATH="${RESOLVED_INPUTS[0]}"
SOURCE_ROOT="$(dirname "$FIRST_INPUT_PATH")"
OUTPUT_ROOT="$PREPARED_OUTPUT_BASE/_notion_printer_integrated_factory"

if ((DOC_COUNT == 1)); then
  JOB_TITLE="$(basename "${FIRST_INPUT_PATH%.html}")"
else
  JOB_TITLE="Notion 통합 프린터"
fi

USE_PRINT="false"
USE_COMPACT="true"
USE_FAST="true"
QUALITY_PRESET="빠름 (1200px / WEBP 68)"
MAX_EDGE="1200"
QUALITY="68"
TOC_CHOICE="끄기"
TOC_ARG="off"
PAGE_NUMBER_CHOICE="켜기"
PAGE_NUMBER_ARG="on"
FONT_SIZE_CHOICE="보통"
FONT_SIZE_ARG="normal"
OPEN_CHOICE="브라우저 미리보기"

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
  IFS="|" read -r QUALITY_PRESET TOC_CHOICE PAGE_NUMBER_CHOICE FONT_SIZE_CHOICE OPEN_CHOICE <<< "$FORM_RESULT"
  QUALITY_PRESET="${QUALITY_PRESET:-빠름 (1200px / WEBP 68)}"
  TOC_CHOICE="${TOC_CHOICE:-끄기}"
  PAGE_NUMBER_CHOICE="${PAGE_NUMBER_CHOICE:-켜기}"
  FONT_SIZE_CHOICE="${FONT_SIZE_CHOICE:-보통}"
  resolve_quality_preset "$QUALITY_PRESET"
  resolve_toc_choice "$TOC_CHOICE"
  resolve_page_number_choice "$PAGE_NUMBER_CHOICE"
  resolve_font_size_choice "$FONT_SIZE_CHOICE"
else
  QUICK_MESSAGE="Notion Printer가 선택한 입력을 기본 통합 프로필로 처리합니다."
  if [[ "${PREPARED_ZIP_COUNT:-0}" != "0" && "${PREPARED_HTML_COUNT:-0}" != "0" ]]; then
    QUICK_MESSAGE="ZIP ${PREPARED_ZIP_COUNT}개와 HTML ${PREPARED_HTML_COUNT}개를 함께 처리합니다."
  elif [[ "${PREPARED_ZIP_COUNT:-0}" != "0" ]]; then
    QUICK_MESSAGE="ZIP ${PREPARED_ZIP_COUNT}개를 자동 압축 해제해 HTML ${DOC_COUNT}개를 처리합니다."
  elif [[ "${PREPARED_HTML_COUNT:-0}" != "0" ]]; then
    QUICK_MESSAGE="HTML ${DOC_COUNT}개를 기본 통합 프로필로 처리합니다."
  fi
  zenity --notification \
    --window-icon="$ZENITY_ICON" \
    --text="$QUICK_MESSAGE"
fi

resolve_profile_args "$USE_PRINT" "$USE_COMPACT" "$USE_FAST"
resolve_open_action "$OPEN_CHOICE"

STATUS_FILE="$(mktemp)"
LOG_FILE="$(mktemp)"

(
  set +e
  "$PYTHON_BIN" "$GENERATOR" \
    --source-root "$SOURCE_ROOT" \
    --output-root "$OUTPUT_ROOT" \
    --title "$JOB_TITLE" \
    --toc "$TOC_ARG" \
    --max-edge "$MAX_EDGE" \
    --quality "$QUALITY" \
    --page-numbers "$PAGE_NUMBER_ARG" \
    --font-size "$FONT_SIZE_ARG" \
    "${PROFILE_ARGS[@]}" \
    "${FACTORY_OPEN_ARGS[@]}" \
    "${RESOLVED_INPUTS[@]}" >"$LOG_FILE" 2>&1
  echo "$?" >"$STATUS_FILE"
) &
WORKER_PID=$!

(
  while kill -0 "$WORKER_PID" 2>/dev/null; do
    echo "# Notion Printer가 통합 출력용 HTML을 생성하는 중..."
    sleep 0.4
  done
) | zenity --progress \
  --title="Notion Printer" \
  --text="통합 출력용 HTML 생성 중..." \
  --pulsate \
  --auto-close \
  --no-cancel

wait "$WORKER_PID" || true
STATUS_CODE="$(cat "$STATUS_FILE" 2>/dev/null || echo 1)"
rm -f "$STATUS_FILE"

if [[ "$STATUS_CODE" != "0" ]]; then
  zenity --text-info \
    --title="Notion Printer 실패" \
    --width=900 \
    --height=720 \
    --window-icon="$ZENITY_ICON" \
    --filename="$LOG_FILE"
  rm -f "$LOG_FILE"
  exit 1
fi

RUN_DIR="$(sed -n 's/^Integrated factory run: //p' "$LOG_FILE" | tail -n 1)"
if [[ -z "$RUN_DIR" ]]; then
  RUN_DIR="$OUTPUT_ROOT"
fi

rm -f "$LOG_FILE"

if [[ "$OPEN_MODE" == "dir" || "$OPEN_MODE" == "both" ]]; then
  xdg-open "$RUN_DIR" >/dev/null 2>&1 || true
fi

zenity --notification \
  --window-icon="$ZENITY_ICON" \
  --text="Notion Printer 통합 출력 완료"
