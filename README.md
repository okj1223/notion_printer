# Notion Printer

Notion에서 내려받은 HTML export를 출력용 HTML로 자동 정리하는 독립 워크스페이스입니다.

포함된 기능:

- 기본 동작이 통합 프린터인 GUI 런처
- 단일 HTML 선택 지원
- 단일 ZIP 선택 및 자동 압축 해제 지원
- 다중 HTML 선택 및 자동 통합 지원
- 다중 ZIP 선택 및 자동 통합 지원
- 목차 on/off 옵션, 기본값 off
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
- Ubuntu용 `.deb` 설치 패키지 빌드 지원

## 빠른 실행

개발 중 저장소에서 바로 실행할 때는 아래 명령을 사용할 수 있습니다.

```bash
cd /path/to/notion_printer
./notion_print_export_launcher.sh
```

기본 런처 동작:

- HTML 또는 ZIP 파일을 한 개 또는 여러 개 선택할 수 있음
- ZIP을 고르면 `_notion_printer_imported_sources/` 아래에 원본 구조를 보존한 채 자동 압축 해제
- 한 개를 선택해도 통합 프린터 파이프라인으로 생성
- 여러 개를 선택하면 선택한 순서대로 통합 출력본 생성
- 기본 목차 옵션은 `off`
- 기본 출력 프로필은 `compact + fast`
- 기본 Fast 품질은 `빠름 (1200px / WEBP 68)`

## 디버그 공장

랜덤 원본 문서를 여러 개 골라 실제 출력 경로로 다시 생성하고, 마지막 샘플의 HTML 미리보기를 바로 열어 편집/확인하려면 아래처럼 실행하면 됩니다.

```bash
cd /path/to/notion_printer
python3 scripts/print_debug_factory.py --count 2
```

기본 동작:

- `~/Downloads/개인 페이지 & 공유된 페이지` 아래의 원본 Notion HTML만 랜덤 선택
- `compact` 출력본과 `compact_fast` 출력본 생성
- 마지막 샘플의 fast 출력본이 있으면 그걸 우선해서 localhost 미리보기로 띄움
- 결과는 `~/Downloads/개인 페이지 & 공유된 페이지/_notion_printer_debug_factory/` 아래에 배치별로 저장

## 통합 프린터

여러 원본 Notion HTML을 원하는 순서대로 한 권처럼 묶고 통합 출력본을 만들려면 아래 스크립트를 쓰면 됩니다.

```bash
cd /path/to/notion_printer
python3 scripts/print_integrated_factory.py \
  --source-root "$HOME/Downloads/개인 페이지 & 공유된 페이지/_notion_printer_debug_factory" \
  --title "현대 운영 문서 통합본" \
  --preferred-output compact_fast \
  "용어 정리" \
  "[현대] 가이드라인" \
  "IGRIS-RECORDER" \
  "FIXER"
```

기본 동작:

- 문서 순서는 넘긴 인자 순서를 그대로 사용
- 목차 옵션 기본값은 `off`
- `--toc on`을 주면 원본별 주요 heading을 읽어 통합 목차를 생성
- 최종 페이지네이션이 끝난 뒤 목차 쪽번호를 실제 통합 페이지 번호로 다시 채움
- 결과는 별도 `_notion_printer_integrated_factory/` 런 디렉터리에 저장
- 마지막 생성본은 기존 localhost 미리보기처럼 바로 열림

## 원클릭 앱 실행

개발용 저장소에는 바로가기 세 개가 남아 있습니다.
팀 배포용 `.deb`에는 `Notion Printer` 하나만 노출되고, 이 항목은 고급 옵션 GUI를 바로 엽니다.

- [Notion Printer.desktop](./Notion%20Printer.desktop)
- [Notion Printer Advanced.desktop](./Notion%20Printer%20Advanced.desktop)
- [Notion Printer Debug.desktop](./Notion%20Printer%20Debug.desktop)

이 `.desktop`은 현재 파일 위치를 기준으로 실행기를 찾아서 동작하도록 되어 있어, 저장소 경로가 바뀌어도 재실행 가능합니다.

## 고급 옵션 GUI

```bash
cd /path/to/notion_printer
./notion_print_export_launcher.sh --advanced
```

고급 GUI에서 설정할 수 있는 항목:

- 입력 선택
  - `HTML` 또는 `ZIP`
  - `ZIP`은 자동 압축 해제 후 원본 HTML을 찾아서 사용
- 출력 모드 체크:
  - `일반 Print`
  - `Compact Print`
  - `Fast Preview 추가`
- `목차` 드롭다운
  - `끄기 / 켜기`
  - 기본값은 `끄기`
- `Fast 미리보기 품질` 드롭다운
  - 이 옵션은 fast 출력본의 이미지 경량화 품질에만 적용됩니다.
  - 기본값은 `빠름 (1200px / WEBP 68)`입니다.
- `쪽번호` 드롭다운
  - 출력본 하단 쪽번호 표시 여부를 고릅니다.
- `본문 폰트 크기` 드롭다운
  - `아주 작게 / 작게 / 보통 / 크게 / 아주 크게` 중에서 출력본 기본 폰트 크기를 고릅니다.
- `완료 후 열기` 드롭다운
  - 브라우저 미리보기
  - 출력 폴더 열기
  - 둘 다 열기
  - 아무것도 열지 않기

`브라우저 미리보기`는 생성이 끝난 뒤 통합 출력본을 `localhost` 미리보기 서버로 띄워서 바로 여는 방식입니다.
즉 브라우저가 출력본을 로컬 웹페이지처럼 열어서 버튼과 드래그 UI가 더 안정적으로 동작합니다.
디버깅할 때는 생성 파일명을 직접 찾지 않아도 됩니다.
미리보기 서버는 항상 같은 경로 `_notion_printer_debug.html`를 함께 내보내고, 포트는 사용 중인 서비스가 있으면 자동으로 다른 포트로 이동합니다.
[open_debug_preview.sh](./open_debug_preview.sh) 또는 [Notion Printer Debug.desktop](./Notion%20Printer%20Debug.desktop)는 현재 실행 중인 Notion Printer 미리보기 서버의 실제 포트를 읽어서 그 디버그 화면을 바로 엽니다.

## 앱 메뉴 등록

```bash
cd /path/to/notion_printer
./install_notion_print_export_launcher.sh
```

등록 후에는 Ubuntu 앱 메뉴에서 아래 항목을 쓸 수 있습니다.

- `Notion Printer`

이 항목은 고급 옵션 GUI를 바로 엽니다.

## Ubuntu 설치 패키지

팀원에게 Git 저장소 대신 설치 파일 하나로 배포하려면 `.deb` 패키지를 빌드하면 됩니다.

```bash
cd /path/to/notion_printer
./scripts/build_deb_package.sh
```

기본 버전은 루트의 [VERSION](./VERSION) 파일을 사용합니다.
다른 버전으로 즉시 빌드하려면 이렇게 실행할 수 있습니다.

```bash
cd /path/to/notion_printer
./scripts/build_deb_package.sh 1.x.x
```

빌드 결과:

- `dist/notion-printer_<버전>_all.deb`

빌드한 저장소에서 바로 설치할 때:

```bash
sudo apt install ./dist/notion-printer_1.x.x_all.deb
```

설치 후:

- Ubuntu 앱 메뉴에 `Notion Printer` 하나만 등록됨
- `Notion Printer`는 고급 옵션 GUI를 바로 엶
- 앱 본체는 `/opt/notion-printer`에 설치됨
- 업데이트 후에는 컴퓨터를 다시 시작해주세요.
- `.deb` 파일을 더블클릭해서 Ubuntu Software로 설치하는 방식도 가능함

## 배포 · 버전 운영

팀 배포와 업데이트 재배포 흐름은 [RELEASE_GUIDE_KO.md](./RELEASE_GUIDE_KO.md)에 정리해두었습니다.
팀원에게 공유할 설치/사용 가이드는 [TEAM_USER_GUIDE.html](./TEAM_USER_GUIDE.html)에 정리해두었습니다.

## 인쇄 팁

- 생성된 출력본에는 하단 쪽번호가 자동으로 들어갑니다.
- 브라우저 인쇄 창에서 기본 `머리글 및 바닥글`은 끄는 것을 권장합니다.
- 생성된 HTML은 화면에서 페이지별 테두리와 페이지 번호가 보이는 미리보기로 열립니다.
- 가장 안정적인 사용 방식은 런처가 자동으로 띄우는 `http://127.0.0.1:포트/...` 미리보기입니다.
- 각 페이지 안의 `드래그 이동` 손잡이를 잡아 원하는 페이지의 위/아래 점선 구역에 놓으면 직접 페이지를 올리거나 내릴 수 있습니다.
- 생성된 HTML 화면 우하단의 `페이지 편집` 버튼으로도 자동 페이지 넘김을 수동 조정할 수 있습니다.
- `자동 / 새 페이지 / 붙이기`를 고른 뒤 `미리보기 다시 계산`을 누르면 화면 페이지 뷰가 다시 계산됩니다.
- 편집 패널 상단의 드롭다운으로 `페이지 이동`과 `블록 이동`도 바로 할 수 있습니다.

세부 사용법은 [notion_print_export/README.md](./notion_print_export/README.md)에 정리돼 있습니다.
