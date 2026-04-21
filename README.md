# Notion Printer

Notion에서 내려받은 HTML export를 출력용 HTML로 자동 정리하는 독립 워크스페이스입니다.

포함된 기능:

- `print / compact / fast / compact_fast` 출력본 생성
- 상태 라벨 색상 유지
- 설명 문장과 이미지 묶음 유지
- 번호 단계 bullet 제거
- 상위 bullet 아래 하위 bullet 묶음 유지
- 표 잘림 완화와 헤더 반복
- preview asset 생성으로 빠른 인쇄 미리보기
- 하단 쪽번호 자동 삽입
- 화면에서 페이지 넘김 후보를 수동으로 조정하는 편집 패널
- Ubuntu용 GUI 런처
- 더블클릭 가능한 `.desktop` 버튼

## 빠른 실행

```bash
cd /home/robros0/Desktop/ws/notion_printer
./notion_print_export_launcher.sh
```

## 디버그 공장

랜덤 원본 문서를 여러 개 골라 실제 출력 경로로 다시 생성하고, 마지막 샘플의 HTML 미리보기를 바로 열어 편집/확인하려면 아래처럼 실행하면 됩니다.

```bash
cd /home/okj/notion_printer
python3 scripts/print_debug_factory.py --count 2
```

기본 동작:

- `~/Downloads/개인 페이지 & 공유된 페이지` 아래의 원본 Notion HTML만 랜덤 선택
- `compact` 출력본과 `compact_fast` 출력본 생성
- 마지막 샘플의 fast 출력본이 있으면 그걸 우선해서 localhost 미리보기로 띄움
- 결과는 `~/Downloads/개인 페이지 & 공유된 페이지/_notion_printer_debug_factory/` 아래에 배치별로 저장

## 원클릭 앱 실행

레포 루트의 바로가기 세 개를 더블클릭하면 설치 없이 실행됩니다.

- [Notion Printer.desktop](/home/robros0/Desktop/ws/notion_printer/Notion%20Printer.desktop)
- [Notion Printer Advanced.desktop](/home/robros0/Desktop/ws/notion_printer/Notion%20Printer%20Advanced.desktop)
- [Notion Printer Debug.desktop](/home/okj/notion_printer/Notion%20Printer%20Debug.desktop)

이 `.desktop`은 현재 파일 위치를 기준으로 실행기를 찾아서 동작하도록 되어 있어, 저장소 경로가 바뀌어도 재실행 가능합니다.

## 고급 옵션 GUI

```bash
cd /home/robros0/Desktop/ws/notion_printer
./notion_print_export_launcher.sh --advanced
```

고급 GUI에서 설정할 수 있는 항목:

- 출력 모드 체크:
  - `일반 Print`
  - `Compact Print`
  - `Fast Preview 추가`
- `Fast 미리보기 품질` 드롭다운
  - 이 옵션은 fast 출력본의 이미지 경량화 품질에만 적용됩니다.
- `쪽번호` 드롭다운
  - 출력본 하단 쪽번호 표시 여부를 고릅니다.
- `본문 폰트 크기` 드롭다운
  - `아주 작게 / 작게 / 보통 / 크게 / 아주 크게` 중에서 출력본 기본 폰트 크기를 고릅니다.
- `완료 후 열기` 드롭다운
  - 결과 HTML 열기
  - 출력 폴더 열기
  - 둘 다 열기
  - 아무것도 열지 않기

`결과 HTML 열기`는 이제 파일 직접 열기가 아니라 새 터미널 창에서 `localhost` 미리보기 서버를 띄운 뒤 실행됩니다.
즉 브라우저가 출력본을 로컬 웹페이지처럼 열어서 버튼과 드래그 UI가 더 안정적으로 동작합니다.
디버깅할 때는 생성 파일명을 직접 찾지 않아도 됩니다.
미리보기 서버는 항상 같은 경로 `_notion_printer_debug.html`를 함께 내보내고, 포트는 사용 중인 서비스가 있으면 자동으로 다른 포트로 이동합니다.
[open_debug_preview.sh](/home/okj/notion_printer/open_debug_preview.sh) 또는 [Notion Printer Debug.desktop](/home/okj/notion_printer/Notion%20Printer%20Debug.desktop)는 현재 실행 중인 Notion Printer 미리보기 서버의 실제 포트를 읽어서 그 디버그 화면을 바로 엽니다.

## 앱 메뉴 등록

```bash
cd /home/robros0/Desktop/ws/notion_printer
./install_notion_print_export_launcher.sh
```

등록 후에는 Ubuntu 앱 메뉴에서 아래 두 항목을 쓸 수 있습니다.

- `Notion Printer`
- `Notion Printer Advanced`

## 인쇄 팁

- 생성된 출력본에는 하단 쪽번호가 자동으로 들어갑니다.
- 브라우저 인쇄 창에서 기본 `머리글 및 바닥글`은 끄는 것을 권장합니다.
- 생성된 HTML은 화면에서 페이지별 테두리와 페이지 번호가 보이는 미리보기로 열립니다.
- 가장 안정적인 사용 방식은 런처가 자동으로 띄우는 `http://127.0.0.1:포트/...` 미리보기입니다.
- 각 페이지 안의 `드래그 이동` 손잡이를 잡아 원하는 페이지의 위/아래 점선 구역에 놓으면 직접 페이지를 올리거나 내릴 수 있습니다.
- 생성된 HTML 화면 우하단의 `페이지 편집` 버튼으로도 자동 페이지 넘김을 수동 조정할 수 있습니다.
- `자동 / 새 페이지 / 붙이기`를 고른 뒤 `미리보기 다시 계산`을 누르면 화면 페이지 뷰가 다시 계산됩니다.
- 편집 패널 상단의 드롭다운으로 `페이지 이동`과 `블록 이동`도 바로 할 수 있습니다.

세부 사용법은 [notion_print_export/README.md](/home/robros0/Desktop/ws/notion_printer/notion_print_export/README.md)에 정리돼 있습니다.
