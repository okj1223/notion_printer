# Learning Data

`learning_data`는 Notion Printer의 학습형 레이아웃 편집 데이터를 쌓는 폴더입니다.

구조:

- `raw/documents/`: export 시 저장되는 문서 manifest
- `raw/sessions/`: preview session 메타데이터와 session별 이벤트 로그
- `raw/events/`: 날짜별 이벤트 집계본
- `datasets/`: 학습 스크립트가 바로 읽을 수 있는 task별 JSONL
- `models/`: 규칙 설정과 이후 학습된 모델 파일

현재 제공 스크립트:

```bash
python3 scripts/build_learning_dataset.py
python3 scripts/train_layout_recommender.py
```

옵션 예시:

```bash
python3 scripts/build_learning_dataset.py --include-space-mode
python3 scripts/build_learning_dataset.py --session-id sess_foo --document-id doc_bar
python3 scripts/train_layout_recommender.py
```
