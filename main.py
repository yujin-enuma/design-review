import os
from pathlib import Path
from fastapi import FastAPI, Request, UploadFile, File, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from contextlib import asynccontextmanager
from core.database import init_db, get_db, STORAGE_DIR
from core.models import (
    ProjectCreate, VideoVersionCreate, StatusUpdate, ImportSheetRequest,
)
from core import feedback_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(title="Design Review Tracker", lifespan=lifespan)

STATIC_DIR = Path(__file__).parent / "static"


def get_user(request: Request) -> dict:
    return {
        "email": request.headers.get("X-User-Email", "local@dev"),
        "name": request.headers.get("X-User-Name", "Local Dev"),
        "id": request.headers.get("X-User-Id", "0"),
    }


# --- Projects ---

@app.get("/api/projects")
async def list_projects():
    db = await get_db()
    try:
        rows = await db.execute("SELECT * FROM projects ORDER BY created_at DESC")
        return [dict(r) for r in await rows.fetchall()]
    finally:
        await db.close()


@app.post("/api/projects")
async def create_project(data: ProjectCreate, request: Request):
    user = get_user(request)
    db = await get_db()
    try:
        cursor = await db.execute(
            "INSERT INTO projects (name, drive_folder_id, created_by) VALUES (?, ?, ?)",
            (data.name, data.drive_folder_id, user["email"]),
        )
        await db.commit()
        return {"id": cursor.lastrowid, "name": data.name}
    finally:
        await db.close()


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: int):
    db = await get_db()
    try:
        await db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        await db.commit()
        return {"ok": True}
    finally:
        await db.close()


# --- Video Versions ---

@app.get("/api/projects/{project_id}/versions")
async def list_versions(project_id: int):
    db = await get_db()
    try:
        rows = await db.execute(
            "SELECT * FROM video_versions WHERE project_id = ? ORDER BY version_number",
            (project_id,),
        )
        return [dict(r) for r in await rows.fetchall()]
    finally:
        await db.close()


@app.post("/api/projects/{project_id}/versions")
async def create_version(project_id: int, data: VideoVersionCreate):
    db = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO video_versions
               (project_id, version_number, filename, drive_file_id, local_path, fps, duration_seconds)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (project_id, data.version_number, data.filename,
             data.drive_file_id, data.local_path, data.fps, data.duration_seconds),
        )
        await db.commit()
        return {"id": cursor.lastrowid}
    finally:
        await db.close()


# --- Import Sheets ---

@app.post("/api/projects/{project_id}/import-sheet")
async def import_sheet(project_id: int, file: UploadFile = File(...)):
    if not file.filename.endswith((".xlsx", ".xls", ".numbers")):
        raise HTTPException(400, "xlsx 또는 numbers 파일만 지원합니다")
    file_data = await file.read()
    db = await get_db()
    try:
        result = await feedback_service.import_sheet_from_bytes(
            db, project_id, file_data, filename=file.filename
        )
        return {"imported": result}
    finally:
        await db.close()


@app.get("/api/projects/{project_id}/sheets")
async def list_sheets(project_id: int):
    db = await get_db()
    try:
        rows = await db.execute(
            "SELECT * FROM feedback_sheets WHERE project_id = ? ORDER BY imported_at",
            (project_id,),
        )
        return [dict(r) for r in await rows.fetchall()]
    finally:
        await db.close()


# --- Feedback ---

@app.get("/api/projects/{project_id}/feedback")
async def list_feedback(
    project_id: int,
    version_id: int = Query(None),
    reviewer: str = Query(None),
    status: str = Query(None),
    sheet_name: str = Query(None),
):
    db = await get_db()
    try:
        items = await feedback_service.get_feedback_items(
            db, project_id, version_id, reviewer, status, sheet_name,
        )
        return items
    finally:
        await db.close()


@app.put("/api/feedback/{item_id}/status")
async def update_feedback_status(item_id: int, data: StatusUpdate, request: Request):
    user = get_user(request)
    db = await get_db()
    try:
        await feedback_service.update_status(
            db, item_id, data.video_version_id, data.status, user["email"], data.note,
        )
        return {"ok": True}
    finally:
        await db.close()


@app.get("/api/projects/{project_id}/summary")
async def get_summary(project_id: int, version_id: int = Query(None)):
    db = await get_db()
    try:
        return await feedback_service.get_summary(db, project_id, version_id)
    finally:
        await db.close()


@app.get("/api/projects/{project_id}/reviewers")
async def list_reviewers(project_id: int):
    db = await get_db()
    try:
        rows = await db.execute(
            """SELECT DISTINCT fi.reviewer FROM feedback_items fi
               JOIN feedback_sheets fs ON fi.sheet_id = fs.id
               WHERE fs.project_id = ? AND fi.reviewer IS NOT NULL
               ORDER BY fi.reviewer""",
            (project_id,),
        )
        return [r["reviewer"] for r in await rows.fetchall()]
    finally:
        await db.close()


# --- Video Streaming ---

@app.post("/api/projects/{project_id}/upload-video")
async def upload_video(project_id: int, version_number: int = Query(...), file: UploadFile = File(...)):
    videos_dir = STORAGE_DIR / "videos" / str(project_id)
    videos_dir.mkdir(parents=True, exist_ok=True)
    filepath = videos_dir / file.filename
    with open(filepath, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)
    db = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO video_versions
               (project_id, version_number, filename, local_path)
               VALUES (?, ?, ?, ?)""",
            (project_id, version_number, file.filename, str(filepath)),
        )
        await db.commit()
        return {"id": cursor.lastrowid, "filename": file.filename}
    finally:
        await db.close()


@app.get("/api/videos/{version_id}/stream")
async def stream_video(version_id: int, request: Request):
    db = await get_db()
    try:
        row = await db.execute("SELECT * FROM video_versions WHERE id = ?", (version_id,))
        version = await row.fetchone()
        if not version:
            raise HTTPException(404, "Video not found")
    finally:
        await db.close()

    filepath = Path(version["local_path"]) if version["local_path"] else None
    if not filepath or not filepath.exists():
        raise HTTPException(404, "Video file not found on disk")

    file_size = filepath.stat().st_size
    range_header = request.headers.get("range")

    if range_header:
        range_match = range_header.replace("bytes=", "").split("-")
        start = int(range_match[0])
        end = int(range_match[1]) if range_match[1] else file_size - 1
        chunk_size = end - start + 1

        def iter_file():
            with open(filepath, "rb") as f:
                f.seek(start)
                remaining = chunk_size
                while remaining > 0:
                    read_size = min(remaining, 1024 * 1024)
                    data = f.read(read_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        return StreamingResponse(
            iter_file(),
            status_code=206,
            media_type="video/mp4",
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(chunk_size),
            },
        )

    def iter_full():
        with open(filepath, "rb") as f:
            while chunk := f.read(1024 * 1024):
                yield chunk

    return StreamingResponse(
        iter_full(),
        media_type="video/mp4",
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        },
    )


# --- Static Files ---

@app.get("/", response_class=HTMLResponse)
async def index():
    return (STATIC_DIR / "index.html").read_text(encoding="utf-8")


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
