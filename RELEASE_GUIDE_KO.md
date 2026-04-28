# Notion Printer 배포 · 버전 운영 가이드

## 목적

팀에 배포되는 버전은 항상 `안정 버전`이어야 하고, 개발 중인 기능은 `다음 버전 후보`로 분리해서 관리합니다.

현재 권장 배포 기준 기능:

- 기본 동작은 `통합 노션 프린터`
- 팀 배포판 앱 메뉴에는 `Notion Printer` 하나만 노출
- `Notion Printer` 실행 시 고급 옵션 GUI를 바로 표시
- HTML 또는 ZIP 파일 `1개 선택 가능`
- HTML 또는 ZIP 파일 `여러 개 선택 가능`
- ZIP은 자동 압축 해제 후 원본 HTML을 찾아서 처리
- 1개를 선택해도 통합 파이프라인으로 처리
- 여러 개를 선택하면 `자동 통합`
- 목차 `on/off` 지원, 기본값은 `off`
- 기본 권장 출력 프로필은 `Compact Print + Fast Preview`
- 기본 권장 옵션은 Fast 품질 `선명 (2200px / WEBP 78)`, 쪽번호 `on`, 본문 폰트 `보통`, 완료 후 열기 `브라우저 미리보기`

## 권장 브랜치 전략

- `main`
  - 팀에 배포하는 안정 버전만 둡니다.
- `develop`
  - 다음 배포 후보를 모으는 브랜치로 씁니다.
- `feature/<기능명>`
  - 기능 개발 단위 브랜치입니다.

권장 흐름:

1. 새 기능은 `feature/*`에서 개발
2. 기능 검증이 끝나면 `develop`으로 병합
3. 팀 확인까지 끝난 버전만 `main`으로 병합
4. `main`에서 태그를 찍고 배포

## 버전 규칙

세 자리 버전 규칙을 권장합니다.

- `v1.0.0`
  - 첫 팀 배포 버전
- `v1.0.1`
  - 버그 수정만 있는 재배포
- `v1.1.0`
  - 기존 흐름은 유지하면서 기능 추가
- `v2.0.0`
  - 사용 방식이 바뀌거나 호환성이 깨지는 큰 변경

## 버전 일치 원칙

배포할 때는 아래 값이 모두 같은 버전을 가리켜야 합니다.

- 루트의 `VERSION`
- Git 태그 이름
- `.deb` 파일명
- `.deb` 내부 `DEBIAN/control`의 `Version`
- 설치 후 `/opt/notion-printer/VERSION`

설치된 버전 확인:

```bash
dpkg-query -W -f='${Version}\n' notion-printer
```

.deb 파일 자체의 버전 확인:

```bash
dpkg-deb -f notion-printer_1.x.x_all.deb Version
```

기능을 지우거나 패키지에 포함되는 파일 구성이 바뀌면 패치 버전을 올립니다. 예를 들어 `1.0.1` 배포 후 학습 데이터 파일을 제거했다면 같은 `1.0.1`로 다시 덮어쓰지 않고 `1.0.2`로 배포합니다.

## 배포 전 체크리스트

릴리스 전에는 아래 8가지를 반드시 직접 확인합니다.

1. 설치된 `Notion Printer` 앱 메뉴 항목이 고급 옵션 GUI를 바로 연다.
2. HTML 또는 ZIP 1개 선택 시 정상 생성된다.
3. HTML/ZIP 여러 개 또는 혼합 선택 시 통합 출력본이 생성된다.
4. 목차 기본값이 `off`로 동작한다.
5. 고급 옵션에서 목차 `on`을 켜면 목차가 포함된다.
6. 생성 후 브라우저 미리보기와 출력 폴더 접근이 정상 동작한다.
7. ZIP 입력은 원본 HTML을 정상 추출하고, 생성된 출력 HTML은 다시 입력으로 받지 않는다.
8. 릴리스 커밋에는 `tmp/`, `dist/deb-build/` 같은 실행 산출물이 섞이지 않는다.

추가로 확인하면 좋은 것:

- `Compact + Fast` 기본 프로필이 유지되는지
- 쪽번호 on/off가 정상 반영되는지
- 출력 결과가 첫 번째 선택 문서 기준 폴더의 `_notion_printer_integrated_factory/` 아래 생성되는지

## 추천 배포 절차

### 1. 기능 개발

```bash
git checkout develop
git checkout -b feature/integrated-launcher-default
```

### 2. 로컬 검증

권장 검증:

- 런처로 단일 HTML/ZIP 테스트
- 런처로 다중 HTML/ZIP 또는 HTML+ZIP 혼합 테스트
- 고급 모드에서 목차 `끄기/켜기` 둘 다 테스트
- 출력 결과를 실제 브라우저 인쇄 미리보기까지 확인

### 3. develop 반영

```bash
git checkout develop
git merge --no-ff feature/integrated-launcher-default
```

### 4. 팀 확인 완료 후 main 반영

```bash
git checkout main
git merge --no-ff develop
git tag v1.0.1
```

버전만 바꿔서 같은 방식으로 반복하면 됩니다.

### 5. .deb 패키지 빌드

`main`에 반영하고 태그를 찍은 뒤 설치 파일을 만듭니다.

```bash
./scripts/build_deb_package.sh
```

또는 버전을 직접 지정할 수 있습니다.

```bash
./scripts/build_deb_package.sh 1.x.x
```

생성 결과:

- `dist/notion-printer_<버전>_all.deb`

### 6. 팀 배포

팀원에게는 Git 저장소 대신 `.deb` 파일 하나만 전달하면 됩니다.

권장 배포 채널:

- GitHub Releases
- 사내 드라이브
- Slack/Notion 다운로드 링크

팀원 설치 명령:

```bash
sudo apt install ./notion-printer_1.x.x_all.deb
```

또는 팀원은 전달받은 `.deb` 파일을 더블클릭해서 Ubuntu Software로 설치할 수 있습니다.

## 업데이트 재배포 운영 방식

업데이트는 항상 아래 순서로 운영하는 것을 권장합니다.

1. `feature/*`에서 개발한다.
2. 본인이 기능 완료 여부를 체크리스트로 검증한다.
3. `develop`에 먼저 반영해서 내부 확인을 거친다.
4. 배포 가능 판단이 끝나면 `main`에 병합한다.
5. 새 태그를 찍고 `.deb` 파일을 다시 빌드한다.
6. 릴리스 노트를 남긴다.
7. 팀에는 새 `.deb`, 변경사항, 재시작 안내만 짧게 공지한다.

예시:

- 버그만 고쳤으면 `v1.0.0 -> v1.0.1`
- 기능을 하나 추가했으면 `v1.0.1 -> v1.1.0`
- 기본 사용 흐름을 바꿨으면 `v1.1.0 -> v2.0.0`

## 릴리스 노트 템플릿

매번 아래 형식으로 짧게 남기면 운영이 편해집니다.

```text
버전: v1.x.x
배포일: YYYY-MM-DD
설치파일: notion-printer_1.x.x_all.deb

변경사항
- 기본 동작을 통합 노션 프린터로 변경
- 팀 배포판 앱 메뉴는 Notion Printer 하나로 정리
- Notion Printer 실행 시 고급 옵션 GUI 표시
- HTML 다중 선택 지원
- ZIP 단일/다중 선택 및 자동 압축 해제 지원
- 단일 선택도 통합 파이프라인으로 처리
- 목차 on/off 추가, 기본값 off
- 기본 권장 프로필은 Compact Print + Fast Preview

확인 완료
- 단일 파일 테스트 완료
- 다중 파일 테스트 완료
- ZIP 입력 테스트 완료
- 목차 off/on 테스트 완료
- 미리보기 및 출력 폴더 열기 확인 완료
- 업데이트 후 컴퓨터 재시작 안내 확인 완료
```

## 팀 배포 시 권장 안내 문구

팀원에게는 아래 정도로 공지하면 충분합니다.

```text
Notion Printer v1.x.x 배포합니다.
이번 버전부터 기본 동작은 통합 프린터입니다.
앱 메뉴에는 Notion Printer 하나만 표시되고, 실행하면 고급 옵션 화면이 바로 열립니다.
HTML이나 ZIP은 1개 또는 여러 개를 선택할 수 있고, 여러 개를 고르면 자동으로 합쳐집니다.
ZIP을 넣으면 원본 구조를 유지한 채 자동 압축 해제해서 처리합니다.
목차는 옵션으로 켤 수 있고 기본값은 꺼져 있습니다.
설치는 첨부된 notion-printer_1.x.x_all.deb 파일을 실행하거나 apt로 설치하면 됩니다.
업데이트 후에는 컴퓨터를 다시 시작해주세요.
```
