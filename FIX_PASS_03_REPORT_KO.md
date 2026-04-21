# FIX PASS 03 보고서

작성일: 2026-04-21

## 1. 실제 root cause

- 사이드바 썸네일은 `notion_print_export/runtime.js`의 `buildPageSidebarThumbnail()`에서 live `.pagedjs_page` 전체를 `cloneNode(true)`로 그대로 복제하고 있었습니다.
- 그런데 direct page manipulation 경로는 `expandRenderedPageFrame()`에서 `.pagedjs_page`, `.pagedjs_sheet`, `.pagedjs_pagebox`, `.pagedjs_page_content`, `.pagedjs_area`, `article.page`를 전부 `height:auto`, `maxHeight:none`, `overflow:visible`로 풀어 둡니다.
- 그 상태의 live page를 다시 사이드바 안에 넣으면 원래 pagination context에 의존하던 Paged.js wrapper가 더 이상 “한 페이지 클리핑”을 보장하지 못해서, 썸네일이 페이지 조각이 아니라 연속 문서처럼 길게 보일 수 있었습니다.
- 동시에 썸네일 크기도 live page의 `getBoundingClientRect()/offsetHeight`를 그대로 사용하고 있었는데, 이미 `height:auto`로 풀린 페이지는 실제 종이 높이가 아니라 확장된 flow 높이를 반환할 수 있었습니다. 이 때문에 썸네일 비율 자체가 page model과 어긋났습니다.
- 마지막으로, full `.pagedjs_page` clone 안에는 Paged.js wrapper와 editor page chrome/action DOM까지 함께 들어왔습니다. 이 복잡한 레이어를 작은 scale 썸네일 안에서 다시 페인트시키는 방식이 간헐적인 검은 썸네일의 직접 원인이었습니다.

## 2. 이번 패스에서 바꾼 것

- `notion_print_export/runtime.js`
  - 사이드바 썸네일 크기를 live rect가 아니라 Paged.js CSS 변수(`--pagedjs-width*`, `--pagedjs-height*`, `--pagedjs-pagebox-*`) 기반으로 계산하도록 `sidebarPageMetrics()`를 추가했습니다.
  - CSS 변수 값이 `8.5in`, `calc(...)`처럼 px가 아닐 수 있어서, 임시 measurement probe로 안전하게 px로 환산하도록 `parseSidebarCssPx()`를 넣었습니다.
  - `buildPageSidebarThumbnail()`의 full page deep-clone을 제거했습니다.
  - 대신 `buildPageSidebarPreviewContent()`로 현재 페이지의 `article.page` fragment만 최소 복제하고, header/body만 따로 붙여서 “페이지 내용 미리보기”만 남기도록 바꿨습니다.
  - `sanitizePageSidebarPreview()`를 추가해서 page chrome, action button, selection state, editor artifact, 중복 `id`를 사이드바 썸네일에서 제거했습니다.
  - 사이드바 썸네일용 preview wrapper 스타일을 추가해서 preview가 독립적인 작은 종이처럼 고정 폭/고정 높이 안에서 동작하도록 정리했습니다.

## 3. 왜 이 방식이 더 안전한가

- 이제 썸네일은 “live paged document를 사이드바에 한 번 더 중첩 렌더링”하지 않습니다.
- 대신 현재 페이지에 이미 배치된 fragment만 복제하므로, editor가 보고 있는 page model과 sidebar preview가 같은 단위를 가리킵니다.
- page frame이 edit 과정에서 `height:auto`로 풀려도, 썸네일은 canonical page size를 따르기 때문에 비율이 흔들리지 않습니다.
- editor 전용 chrome/action DOM을 제거해서 페인트 레이어가 단순해졌고, 검은 썸네일이 나올 여지를 줄였습니다.

## 4. KJ 테스트 방법

1. 긴 문서를 export해서 preview를 엽니다.
2. 좌측 페이지 사이드바를 열고, 각 썸네일이 한 장씩 분리된 종이처럼 보이는지 확인합니다.
3. 페이지를 여러 장 아래로 스크롤한 뒤에도 활성 페이지 하이라이트와 썸네일 페이지 번호가 맞는지 확인합니다.
4. `앞 페이지로 붙이기`, `페이지 내용 삭제`, break 조정 등으로 reflow를 여러 번 만든 뒤에도 썸네일이 전체 연속 문서로 늘어나지 않는지 확인합니다.
5. 특히 reflow 직후에도 썸네일이 검게 변하지 않고, editor의 실제 페이지 내용과 같은 단위로 유지되는지 확인합니다.
6. 창 크기를 바꾼 뒤 사이드바가 다시 refresh되어도 썸네일이 계속 페이지 단위로 유지되는지 확인합니다.

## 5. 이번 턴에서 실행한 검증

- `node --check notion_print_export/runtime.js`

브라우저 기반 상호작용 스모크 테스트는 현재 샌드박스에서 직접 실행하지 못해서, 코드 경로 점검과 JS 문법 검증으로 확인했습니다.

## 6. 변경 파일

- `notion_print_export/runtime.js`
- `FIX_PASS_03_REPORT_KO.md`
