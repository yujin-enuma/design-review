# CLAUDE.md - Design Review & Video Feedback Tracker

## 프로젝트 개요
영상/디자인 피드백을 타임코드(초단위) 기반으로 추적하고, 원본 vs 수정본을 나란히 비교하며 반영 상태를 관리하는 팀용 웹앱.

## Tech Stack
- **Backend**: FastAPI + SQLite (aiosqlite)
- **Frontend**: Vanilla JS (빌드 없음)
- **파서**: openpyxl (xlsx), numbers-parser (Numbers)
- **배포**: Docker → Render.com / Enumalabs / GitHub Pages (정적 버전)

## 로컬 실행
```bash
cd apps/design-review
pip install fastapi uvicorn openpyxl httpx aiosqlite python-multipart numbers-parser
STORAGE_DIR=./storage uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## 주요 규칙
- 시트 파싱 시 4가지 유형 자동 감지: `ani_*_FB`, `FB_{이름}`, `images_*_FB`, 숫자(스토리보드)
- 타임코드 변환: HH:MM:SS:FF → 초 (29.97fps 기준)
- 피드백 상태: pending / applied / partially_applied / rejected / needs_discussion
- 영상은 version_number=1 (원본), version_number=2 (수정본)

## 두 가지 배포 버전
1. **풀 버전** (`static/`): FastAPI 백엔드 필요 → Render/Enumalabs 배포
2. **GitHub Pages 버전** (`docs/`): 순수 클라이언트 사이드, SheetJS로 xlsx 파싱, localStorage 저장

## DB
SQLite (WAL 모드), `STORAGE_DIR` 환경변수로 경로 지정, 기본값 `/app/storage`

## API 패턴
- 모든 DB 접근은 `async with` 패턴 대신 try/finally로 close
- 유저 정보는 `X-User-Email`, `X-User-Name` 헤더에서 추출
