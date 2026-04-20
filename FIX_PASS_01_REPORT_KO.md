# FIX PASS 01 보고서

작성일: 2026-04-20

## 1. 무엇을 바꿨는가

- `notion_print_export/runtime.js`
  - 페이지 merge 시 `list_item_heading`을 리스트 밖으로 강제로 떼어내던 DOM detachment 특수 처리를 제거했습니다.
  - merge 대상 candidate 탐색을 보강하고, merge 시 break/space/gap 상태를 더 일관되게 초기화하도록 정리했습니다.
  - post-action 위치 복원을 `candidate_id/persist_id/page_number` 단일 fallback에서 `target + viewport anchor + selection + layout snapshot` 기반으로 확장했습니다.
  - 블록 selection 상태를 추가했습니다.
  - 선택된 블록/이미지에 대해 `Delete` 키로 정확히 삭제할 수 있게 했습니다.
  - 블록 hover/selection 시 작은 `X` 삭제 버튼이 보이도록 direct-manipulation UI를 추가했습니다.
  - live delete 후 빈 wrapper/list/page를 정리해서 아래 블록이 자연스럽게 gap을 메우도록 보강했습니다.
  - page delete 후 이전/다음 페이지의 실제 candidate를 anchor로 잡아 복원 위치가 더 예측 가능하도록 바꿨습니다.
  - merge/delete/space/gap/image-scale/reflow 로그에 viewport/focus/layout effect 메타를 더 넣었습니다.

- `notion_print_export/learning.js`
  - target에 `block_type`, `block_role`, `atomic`, `section_index`, `order_index`, `label`, `viewport_top_px`, `page_offset_top_px`, `page_candidate_index`를 직접 포함하도록 확장했습니다.
  - context에 `viewport`, `selection`을 추가했습니다.
  - block context에도 page-relative position 정보를 추가했습니다.

- `learning_data/schemas/layout_event.schema.json`
  - `layout_reflow` action type을 추가했습니다.
  - 확장된 target/context/meta 필드를 스키마에 반영했습니다.

## 2. 어떤 사용자 불만을 다뤘는가

- `1) merge 후 들여쓰기/중첩이 이상함`
  - 가장 위험한 원인이던 detached title 해킹을 제거했습니다.
  - merge는 DOM 구조를 바꾸지 않고 break/pull-up 상태로만 처리되게 조정했습니다.

- `2) 일부 merge 실패`
  - merge candidate 탐색을 보강했습니다.
  - 그래도 mergeable candidate 자체가 없는 페이지는 명확한 상태 메시지를 보여주게 했습니다.

- `3) merge/delete 후 focus/viewport가 불편하게 워프`
  - reload 전 target offset, viewport anchor, selection, layout snapshot을 저장하고, reload 후 target/anchor/page 순으로 복원합니다.
  - live delete는 현재 보던 위치를 anchor로 유지하면서 다음/이전 블록 selection을 갱신합니다.

- `4) ML/training data logging이 불명확`
  - target identity와 page-relative position을 더 구조적으로 남깁니다.
  - viewport/selection/reflow/layout effect를 로그에 추가했습니다.
  - merge/page delete 같은 reload성 액션은 `layout_reflow` 후속 이벤트로 실제 재배치 결과를 남깁니다.

- `5) 진짜 delete-element 기능`
  - 선택 블록 + `Delete` 키 삭제를 추가했습니다.
  - 블록 자체 `X` 버튼도 추가했습니다.
  - 삭제 후 빈 컨테이너/빈 페이지 정리를 넣었습니다.

- `6) UI/UX awkward`
  - 기존 워크플로는 유지하고, direct manipulation 위에 selection과 inline delete만 최소로 얹었습니다.
  - 선택 상태가 패널 리스트와 화면 모두에서 보이도록 했습니다.

## 3. 남아 있는 known gaps

- headless browser 실제 상호작용 검증은 현재 샌드박스의 Chrome/Crashpad 제한 때문에 끝까지 실행하지 못했습니다.
- candidate가 아예 존재하지 않는 페이지는 구조적으로 “merge할 기준 블록”이 없을 수 있습니다. 이 경우 잘못된 break를 건드리지 않도록 무리한 자동 merge는 하지 않았습니다.
- drag/drop move UI는 현재 저장소에 동작 코드보다 스타일 흔적이 더 많은 상태라, 이번 패스에서는 새 move 기능을 복원하지 않았습니다. 대신 merge/delete/reflow 쪽의 move effect 로그를 강화했습니다.

## 4. 테스트 방법

1. export 결과 HTML 미리보기에서 임의의 블록을 클릭합니다.
2. 선택 outline이 유지되는지 확인합니다.
3. `Delete` 키를 눌러 정확히 그 블록만 삭제되고 아래 내용이 자연스럽게 올라오는지 확인합니다.
4. 블록 우측 상단 `X` 버튼으로도 동일하게 삭제되는지 확인합니다.
5. 페이지 상단 `페이지 합치기`를 눌러, merge 후 리스트 제목/중첩 구조가 과하게 깨지지 않는지 확인합니다.
6. `페이지 없애기` 후 이전/다음 페이지 근처의 익숙한 위치로 돌아오는지 확인합니다.
7. 같은 세션에서 `learning_data/raw/sessions/<session>.events.jsonl`을 열어 `selection`, `viewport`, `layout_reflow`, `layout_effect` 필드가 들어오는지 확인합니다.

## 5. 이번 턴에서 실행한 검증

- `node --check notion_print_export/runtime.js`
- `node --check notion_print_export/learning.js`
- `python3 -m py_compile notion_printer_learning.py scripts/build_learning_dataset.py notion_print_export.py notion_print_preview.py`
- `python3 notion_print_export.py /tmp/notion_printer_fixpass_sample.html --output-dir /tmp/notion_printer_fixpass_out --open none`
- `python3 scripts/build_learning_dataset.py --learning-root learning_data --output-dir /tmp/notion_printer_fixpass_datasets`

브라우저 headless 로딩 검증은 시도했지만 샌드박스에서 Chrome Crashpad/socket 제한으로 실패했습니다.

## 6. 변경 파일

- `notion_print_export/runtime.js`
- `notion_print_export/learning.js`
- `learning_data/schemas/layout_event.schema.json`
- `FIX_PASS_01_REPORT_KO.md`
