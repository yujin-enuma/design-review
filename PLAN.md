# Design Review & Video Feedback Tracker

## Context
영상/디자인 제작 과정에서 피드백을 Google Sheets(xlsx)로 관리하고 있음. 현재는 피드백이 반영되었는지 수동으로 확인해야 하는 비효율이 있음. 타임코드(초단위) 기반으로 피드백을 영상에 매핑하고, 원본 vs 수정본을 나란히 비교하며 반영 상태를 추적하는 팀용 웹앱을 만든다.

## Tech Stack
- **Backend**: FastAPI + SQLite (`/app/storage/review.db`)
- **Frontend**: Vanilla JS + Tailwind CSS (CDN)
- **Deploy**: Enumalabs 플랫폼 (Docker, `design-review.enumalabs.com`)
- **Data Source**: Google Sheets via Enumalabs Drive Internal API

## 핵심 기능

### 1. Google Sheets 피드백 임포트
- Drive API로 xlsx 파일 읽기 → openpyxl로 파싱
- 4가지 시트 유형 자동 감지:
  - `ani_*_FB`: A열=타임코드, B열=코멘트
  - `FB_{이름}`: A열=타임코드, B열=코멘트, 시트명에서 리뷰어 추출
  - `images_*_FB`: B열=피드백, C열=추가 코멘트, 텍스트에서 씬번호 추출
  - 숫자 시트(`01`): A열=씬#, C열=오디오, D열=설명, E열~=리뷰어별 코멘트

### 2. 타임코드 매핑 (초단위)
- `00:00:08:13` (HH:MM:SS:FF) → 8.43초로 변환 (29.97fps 기준)
- `0000`, `overall` 등 특수 형식도 처리

### 3. 듀얼 비디오 플레이어 (원본 vs 수정본)
- 나란히 재생, 싱크 잠금 기능
- 피드백 항목 클릭 → 해당 타임코드로 양쪽 동시 이동
- 타임라인에 피드백 위치 마커 표시

### 4. 피드백 반영 상태 추적
- 항목별 상태: `pending` / `applied` / `partially_applied` / `rejected` / `needs_discussion`
- 색상 칩으로 시각화 (초록=반영, 노랑=부분, 빨강=미반영, 회색=미확인)
- 진행률 표시 ("12/18 항목 완료 (67%)")

### 5. 필터 & 요약
- 리뷰어별, 상태별, 시트별 필터
- 프로젝트별 반영률 대시보드

## UI 레이아웃

```
+------------------------------------------------------------------+
| [프로젝트 선택]  [시트 선택]                        [사용자 이름] |
+-------------------------------+----------------------------------+
|  원본 (v01)                   |  수정본 (v02)                    |
|  +-------------------------+  |  +----------------------------+  |
|  |     VIDEO PLAYER        |  |  |      VIDEO PLAYER          |  |
|  +-------------------------+  |  +----------------------------+  |
|  [Play/Pause] [Sync Lock: ON]                                    |
+------------------------------------------------------------------+
| TC(초)  | 피드백 내용                    | 리뷰어 | 상태         |
|---------|-------------------------------|--------|-------------|
| -       | 전반적으로 무빙들를 박자에...   | ani_01 | pending     |
| 8.4s    | 기모노로 변할 때 줌인...       | ani_01 | applied     |
| 8.8s    | 띵! 소리 날 때에 기모노...     | 하연   | partial     |
+------------------------------------------------------------------+
```

## 파일 구조

```
apps/design-review/
├── Dockerfile
├── pyproject.toml
├── main.py                    # FastAPI 앱, 라우트, 정적파일 서빙
├── core/
│   ├── database.py            # SQLite 스키마, 커넥션
│   ├── models.py              # Pydantic 모델
│   ├── drive_client.py        # Enumalabs Drive API 래퍼
│   ├── sheet_parser.py        # xlsx 파싱, 타임코드 변환
│   └── feedback_service.py    # 비즈니스 로직
├── static/
│   ├── index.html             # 메인 페이지
│   ├── css/app.css
│   └── js/
│       ├── app.js             # 메인 컨트롤러
│       ├── video-player.js    # 듀얼 싱크 플레이어
│       ├── feedback-panel.js  # 피드백 목록/상태
│       └── api.js             # API 호출 래퍼
└── storage/                   # /app/storage (영구)
    └── review.db
```

## DB 스키마

```sql
CREATE TABLE projects (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    drive_folder_id TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE video_versions (
    id INTEGER PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id),
    version_number INTEGER NOT NULL,
    filename TEXT NOT NULL,
    drive_file_id TEXT,
    fps REAL DEFAULT 29.97,
    duration_seconds REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE feedback_sheets (
    id INTEGER PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id),
    sheet_name TEXT NOT NULL,
    sheet_type TEXT NOT NULL,
    drive_file_id TEXT,
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE feedback_items (
    id INTEGER PRIMARY KEY,
    sheet_id INTEGER REFERENCES feedback_sheets(id),
    timecode_raw TEXT,
    timecode_seconds REAL,
    scene_number INTEGER,
    reviewer TEXT,
    comment TEXT NOT NULL,
    item_index INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE feedback_status (
    id INTEGER PRIMARY KEY,
    feedback_item_id INTEGER REFERENCES feedback_items(id),
    video_version_id INTEGER REFERENCES video_versions(id),
    status TEXT DEFAULT 'pending',
    reviewed_by TEXT,
    note TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(feedback_item_id, video_version_id)
);
```

## API 엔드포인트

```
GET    /api/projects                          # 프로젝트 목록
POST   /api/projects                          # 프로젝트 생성
POST   /api/projects/{id}/import-sheet        # 시트 임포트
GET    /api/projects/{id}/feedback             # 피드백 목록 (필터 지원)
PUT    /api/feedback/{item_id}/status          # 상태 업데이트
GET    /api/projects/{id}/summary              # 진행률 요약
POST   /api/projects/{id}/versions             # 비디오 버전 등록
GET    /api/videos/{version_id}/stream         # 비디오 스트리밍 (Range 지원)
GET    /api/drive/folders/{folder_id}          # Drive 폴더 탐색
```

## 환경변수

```
DJANGO_BASE_URL=https://enumalabs.com
APP_ID=<admin에서 배정>
```

## 구현 순서

### Phase 1: 기본 골격
- pyproject.toml, Dockerfile, main.py (FastAPI + static 서빙)
- database.py (SQLite 스키마 생성)
- index.html 기본 셸

### Phase 2: 시트 임포트
- drive_client.py (Internal API 래퍼)
- sheet_parser.py (4가지 시트 유형 파서 + 타임코드 변환)
- 임포트 API + UI

### Phase 3: 비디오 플레이어 + 피드백 패널
- video-player.js (듀얼 싱크 플레이어)
- 비디오 스트리밍 엔드포인트 (Range 지원)
- feedback-panel.js (목록, 상태 칩, 클릭→시크)
- 타임라인 마커

### Phase 4: 마무리
- 필터링 (리뷰어, 상태, 시트별)
- 진행률 요약 대시보드
- 반응형 조정
- 배포

## 검증 방법
1. 로컬에서 `uvicorn main:app --port 8000` 실행
2. 실제 xlsx 파일(`WM_JP_01_Hinamatsuri_FB.xlsx`)로 임포트 테스트
3. 영상 파일(`WM_JP_01_Hinamatsuri02.mp4`)로 플레이어 테스트
4. 피드백 항목 클릭 → 타임코드 이동 확인
5. 상태 변경 → DB 저장/복원 확인
6. Docker 빌드 → Enumalabs 배포
