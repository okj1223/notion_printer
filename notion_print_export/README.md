# Notion Print Export

Notion에서 내려받은 HTML export를 받아서 출력용 HTML을 자동 생성하는 CLI입니다.

생성 가능한 결과물:

- `_print.html`
- `_print_compact.html`
- `_print_fast.html`
- `_print_compact_fast.html`

현재 자동 적용 기준:

- 상단 속성 표 제거
- 흰 배경 / 저잉크 출력용 스타일 적용
- 로마자 섹션과 상위 번호 섹션 페이지 시작 규칙 적용
- 설명 문장과 이미지 묶음 유지
- 번호 단계(`1-1`, `2-1`, `❶`)는 bullet 없이 번호만 유지
- 상위 bullet 아래의 하위 bullet 묶음 유지
- 상태 라벨 색상 유지 (`PASS/WARN/FAIL`, `Success/Dirty Success/Pending/Trash` 등)
- 표 헤더 반복 및 표/행 잘림 완화
- fast 모드에서는 로컬 이미지를 downscale + WEBP preview asset으로 생성
- 생성된 preview asset은 재사용
- 생성된 HTML 화면에는 페이지 프레임이 보이고, 페이지 위에서 블록을 직접 드래그해 페이지 시작 위치를 바꿀 수 있음

## Requirements

- Ubuntu
- Python 3
- Pillow

## Usage

같은 폴더에 결과물을 만들고 fast/compact까지 전부 생성:

```bash
python3 scripts/notion_print_export.py "/path/to/Notion Export.html"
```

출력 폴더 지정:

```bash
python3 scripts/notion_print_export.py "/path/to/Notion Export.html" \
  --output-dir /tmp/notion-print-output
```

compact만 생성:

```bash
python3 scripts/notion_print_export.py "/path/to/Notion Export.html" \
  --variants compact
```

fast preview asset 없이 일반 print만 생성:

```bash
python3 scripts/notion_print_export.py "/path/to/Notion Export.html" \
  --variants print compact \
  --no-fast
```

fast 이미지 압축 강도 조정:

```bash
python3 scripts/notion_print_export.py "/path/to/Notion Export.html" \
  --max-edge 1600 \
  --quality 72
```

## Notes

- 기본 preview asset 폴더 이름은 `<input-stem>_preview_assets` 입니다.
- 원본 이미지가 매우 크면 첫 fast 생성은 시간이 좀 걸릴 수 있습니다.
- 같은 preview asset이 이미 있으면 재사용합니다.
- 생성된 HTML을 브라우저로 열면 각 페이지 상단/하단에 점선 드롭 구역이 보입니다.
- `드래그 이동` 손잡이를 원하는 페이지의 위쪽에 놓으면 그 블록부터 새 페이지가 시작되고, 아래쪽에 놓으면 위 페이지에 붙이기 처리됩니다.

## One-Click Launcher

추천 프로필로 바로 생성:

```bash
./scripts/notion_print_export_launcher.sh
```

특정 HTML 파일을 바로 넘기기:

```bash
./scripts/notion_print_export_launcher.sh "/path/to/Notion Export.html"
```

고급 옵션 GUI:

```bash
./scripts/notion_print_export_launcher.sh --advanced
```

Ubuntu 앱 런처에 등록:

```bash
./scripts/install_notion_print_export_launcher.sh
```
