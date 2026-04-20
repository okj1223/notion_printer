# FIX PASS 02 보고서

작성일: 2026-04-20

## 1. 무엇이 아직 구조적으로 잘못 느껴졌는가

- 현재 출력본의 원본 구조는 여전히 `article.page` 하나의 연속 문서이고, 페이지는 Paged.js가 나중에 만든 렌더 결과입니다.
- 그런데 1차 패스까지의 편집 UI는 블록 중심이 강했고, 페이지는 `Page N` 라벨 + hover 버튼이 붙은 시각 효과에 가까웠습니다.
- 특히 `페이지 합치기` / `페이지 없애기`는 “현재 보이는 종이 한 장”을 조작하는 것처럼 보이지만, 실제로는 인접 페이지와 이어진 fragment block에도 영향을 줄 수 있는 구조였습니다.
- 그 결과 페이지가 안정적인 단위가 아니라 “우연히 그렇게 보이는 조각”처럼 느껴졌고, page mental model이 계속 깨졌습니다.

## 2. 이번 패스에서 바꾼 것과 이유

- `notion_print_export/runtime.js`
  - 렌더된 각 페이지에 `print-page-chrome`를 추가해서 페이지 번호, 페이지 대표 라벨, 끝 블록 요약, 연속/제한 상태를 항상 보이게 했습니다.
  - 페이지 배경 클릭으로 페이지 자체를 선택할 수 있게 바꿨습니다. 이제 페이지도 블록과 별개로 “선택 가능한 대상”입니다.
  - 페이지 이동 셀렉트 라벨을 실제 페이지 상태 기반으로 다시 만들었습니다. 페이지가 앞/뒤 페이지와 이어지는 경우 셀렉트에도 드러납니다.
  - 페이지 합치기/삭제 가능 여부를 “해당 페이지가 진짜 독립 페이지인가” 기준으로 다시 계산합니다.
  - 앞 페이지에서 이어져 시작하는 페이지는 합치기 버튼을 막습니다. 이런 페이지는 실제 page-start candidate가 안정적이지 않기 때문입니다.
  - 앞/뒤 페이지와 persist id를 공유하는 페이지는 페이지 삭제를 막습니다. 그렇지 않으면 현재 페이지 fragment를 지우려다가 인접 페이지에 보이는 같은 블록까지 같이 삭제될 수 있습니다.
  - page snapshot / reflow meta / page delete meta / merge meta에 `page_label`, `page_role`, `page_signature`, continuation 정보를 더 남기도록 보강했습니다.
  - editor history snapshot/clone 시 page chrome을 UI artifact로 제거해서 undo/reflow와 문서 내용이 섞이지 않게 했습니다.

- `notion_print_export/learning.js`
  - `context.page`에 `persist_count`, `first/last_persist_id`, `anchor_persist_id`, `page_label`, `continued_from_previous`, `continues_to_next`, `shared_persist_ids`, `page_role`, `page_signature`를 추가했습니다.
  - 이제 page-level edit 로그가 실제 화면에서 사용자가 본 페이지 상태와 더 가깝게 저장됩니다.

- `notion_print_export.py`
  - manifest `features`를 raw source HTML이 아니라 sanitize/contract 이후 block model 기준으로 다시 맞췄습니다.
  - 특히 `section_count`가 runtime/editor가 보는 섹션 구조와 다르게 0으로 찍히던 문제를 정리했습니다.

## 3. 지금은 어떻게 더 “진짜 페이지 편집기”에 가까워졌는가

- 페이지마다 고정된 상단 chrome이 생겨서 page frame이 더 명확합니다. 이제 페이지는 hover artifact가 아니라 상태를 가진 UI object입니다.
- 페이지가 독립 단위인지, 위/아래 페이지와 이어진 상태인지 바로 보입니다.
- 페이지 삭제/합치기가 더 보수적으로 바뀌었습니다. 보이는 종이 한 장만 바꾼다고 생각했는데 실제로는 다른 페이지 내용까지 깨지는 상황을 막는 쪽으로 정리했습니다.
- 페이지 선택, 페이지 이동 라벨, reflow log가 모두 같은 page summary를 공유해서 editor/learning/visible page가 덜 어긋납니다.

## 4. 남아 있는 제한

- 원본 문서는 여전히 “연속 flow + Paged.js pagination” 구조입니다. Word/HWP처럼 문서 모델 자체가 page-first인 것은 아닙니다.
- 따라서 매우 긴 단일 문단/표/복합 블록이 여러 페이지에 걸쳐 실제로 fragment 되면, page delete를 fragment 단위로 안전하게 수행할 수는 없습니다. 이번 패스는 그 상황을 감추지 않고 제한하는 방향으로 정리했습니다.
- 샌드박스 제한 때문에 localhost preview server bind와 Chrome headless screenshot까지는 끝까지 검증하지 못했습니다. 대신 생성기 재실행, 런타임 코드 정독, 샘플 export 재생성, JS/Python 문법 검증으로 확인했습니다.

## 5. KJ 테스트 방법

1. 긴 문서를 export해서 미리보기를 엽니다.
2. 각 페이지 상단에 페이지 chrome이 항상 보이는지 확인합니다.
3. 페이지 번호 외에 대표 라벨과 상태 배지가 함께 보이는지 확인합니다.
4. 페이지 빈 영역을 클릭했을 때 페이지 자체가 선택되고, 페이지 이동 셀렉트가 그 페이지로 맞춰지는지 확인합니다.
5. 어떤 페이지가 앞/뒤 페이지와 이어진 경우 `앞 페이지로 붙이기` 또는 `페이지 내용 삭제`가 비활성화되고, 이유 tooltip/status가 맞는지 확인합니다.
6. 독립 페이지에서는 `페이지 내용 삭제`가 활성화되고, 삭제 후 인접 페이지 내용이 예상치 않게 같이 사라지지 않는지 확인합니다.
7. 독립적으로 시작하는 페이지에서는 `앞 페이지로 붙이기`가 동작하고, 앞 페이지에서 이어져 시작하는 페이지에서는 합치기가 제한되는지 확인합니다.
8. `learning_data/raw/sessions/<session>.events.jsonl`에서 `context.page.page_label`, `page_role`, `continued_from_previous`, `continues_to_next`, `shared_persist_ids`가 기록되는지 확인합니다.
9. 새로 생성한 manifest JSON에서 `features.section_count`가 실제 섹션 수와 맞는지 확인합니다.

## 6. 변경 파일

- `notion_print_export/runtime.js`
- `notion_print_export/learning.js`
- `notion_print_export.py`
- `FIX_PASS_02_REPORT_KO.md`
