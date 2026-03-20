# Design Review & Video Feedback Tracker

영상/디자인 피드백을 타임코드(초단위) 기반으로 추적하고, 원본 vs 수정본을 나란히 비교하며 반영 상태를 관리하는 팀용 웹앱.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 피드백 시트 임포트 | Numbers/xlsx 파일에서 피드백 자동 파싱 |
| 타임코드 변환 | `00:00:08:13` (HH:MM:SS:FF) → `8.43초`로 자동 변환 |
| 듀얼 비디오 플레이어 | 원본/수정본 나란히 싱크 재생, 개별 독립 재생도 가능 |
| 타임코드 점프 | 피드백 항목 클릭 시 해당 타임코드로 양쪽 영상 동시 이동 |
| 상태 추적 | 반영됨 / 부분반영 / 미반영 / 논의필요 / 미확인 |
| 진행률 대시보드 | 전체 피드백 반영률 실시간 표시 |
| 필터링 | 리뷰어별, 상태별, 시트별 필터 |
| 타임라인 마커 | 영상 타임라인 위에 피드백 위치 색상 표시 |

---

## 시트 자동 감지 규칙

| 시트 이름 패턴 | 유형 | 파싱 방식 |
|---------------|------|----------|
| `ani_*_FB` | 애니메이션 피드백 | A열=타임코드, B열=코멘트 |
| `FB_{이름}` | 개인 리뷰어 피드백 | A열=타임코드, B열=코멘트 |
| `images_*_FB` | 디자인/이미지 피드백 | B열=피드백, C열=추가 코멘트 |
| 숫자 이름 (`01`) | 스토리보드 | A열=씬#, E열~=리뷰어별 코멘트 |

---

## 사용법

### 1. 프로젝트 생성
- 상단 `+ 프로젝트` 버튼 클릭
- 프로젝트 이름 입력 (예: `WM_JP_01_Hinamatsuri`)

### 2. 피드백 시트 임포트
- `피드백 시트 임포트` 버튼 클릭
- `.numbers` 또는 `.xlsx` 파일 선택
- 시트 유형이 자동 감지되어 피드백 항목이 추출됨

### 3. 영상 업로드
- `원본 영상` 버튼 → 원본(v1) 영상 업로드 (파일명에 01이 포함된 파일)
- `수정본 영상` 버튼 → 수정본(v2) 영상 업로드 (파일명에 02가 포함된 파일)
- 두 영상이 나란히 표시됨

### 4. 영상 재생
- **Both Play / Pause** → 양쪽 영상 동시 재생/정지
- **각 영상의 Play 버튼** → 원본 또는 수정본만 독립 재생
- **Sync: ON/OFF** → ON이면 양쪽 동시 이동, OFF면 독립 조작
- 각 영상 아래에 개별 타임코드 표시

### 5. 피드백 검토
- 피드백 테이블에서 항목을 **클릭** → 해당 타임코드로 영상 이동
- **상태 칩(미확인)을 클릭** → 상태 변경 모달 표시
- 상태 선택 후 저장 → 진행률 자동 업데이트

### 6. 필터링
- 리뷰어별, 상태별, 시트별로 필터 가능
- 진행률 바에서 전체 반영 현황 확인

---

## 로컬 실행

```bash
cd apps/design-review

# 의존성 설치
pip install fastapi uvicorn openpyxl httpx aiosqlite python-multipart numbers-parser

# 서버 실행
STORAGE_DIR=./storage uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 브라우저에서 http://localhost:8000 접속
```

---

## Enumalabs 배포

### 환경변수 (Django Admin에서 설정)
```
DJANGO_BASE_URL=https://enumalabs.com
APP_ID=<admin에서 배정된 앱 ID>
```

### 배포 절차
1. 코드를 `git.enumalabs.com/apps/design-review`에 push
2. 관리자에게 배포 요청
3. `design-review.enumalabs.com`에서 접속

---

## 파일 구조

```
apps/design-review/
├── Dockerfile              # Docker 빌드 설정
├── pyproject.toml          # Python 의존성
├── main.py                 # FastAPI 앱 (API 라우트 + 비디오 스트리밍)
├── core/
│   ├── database.py         # SQLite 스키마 및 연결
│   ├── models.py           # Pydantic 데이터 모델
│   ├── drive_client.py     # Google Drive API 래퍼
│   ├── sheet_parser.py     # Numbers/xlsx 파서 + 타임코드 변환
│   └── feedback_service.py # 비즈니스 로직 (임포트, 상태 관리)
├── static/
│   ├── index.html          # 메인 페이지
│   ├── css/app.css         # 스타일
│   └── js/
│       ├── api.js          # API 호출 래퍼
│       ├── video-player.js # 듀얼 싱크 비디오 플레이어
│       ├── feedback-panel.js # 피드백 테이블 + 상태 모달
│       └── app.js          # 메인 앱 로직
└── storage/                # 영구 저장소 (/app/storage)
    └── review.db           # SQLite DB
```

---

## API 엔드포인트

| Method | URL | 설명 |
|--------|-----|------|
| GET | `/api/projects` | 프로젝트 목록 |
| POST | `/api/projects` | 프로젝트 생성 |
| POST | `/api/projects/{id}/import-sheet` | 피드백 시트 임포트 (multipart) |
| GET | `/api/projects/{id}/feedback` | 피드백 목록 (필터: reviewer, status, sheet_name) |
| PUT | `/api/feedback/{id}/status` | 상태 업데이트 |
| GET | `/api/projects/{id}/summary` | 진행률 요약 |
| POST | `/api/projects/{id}/upload-video` | 영상 업로드 (query: version_number) |
| GET | `/api/videos/{id}/stream` | 영상 스트리밍 (Range 지원) |
