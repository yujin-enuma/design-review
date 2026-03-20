import aiosqlite
import os
from pathlib import Path

STORAGE_DIR = Path(os.environ.get("STORAGE_DIR", "/app/storage"))
DB_PATH = STORAGE_DIR / "review.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    drive_folder_id TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS video_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    filename TEXT NOT NULL,
    drive_file_id TEXT,
    local_path TEXT,
    fps REAL DEFAULT 29.97,
    duration_seconds REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    sheet_name TEXT NOT NULL,
    sheet_type TEXT NOT NULL,
    drive_file_id TEXT,
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sheet_id INTEGER REFERENCES feedback_sheets(id) ON DELETE CASCADE,
    timecode_raw TEXT,
    timecode_seconds REAL,
    scene_number INTEGER,
    reviewer TEXT,
    comment TEXT NOT NULL,
    item_index INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_item_id INTEGER REFERENCES feedback_items(id) ON DELETE CASCADE,
    video_version_id INTEGER REFERENCES video_versions(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    reviewed_by TEXT,
    note TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(feedback_item_id, video_version_id)
);
"""


async def get_db() -> aiosqlite.Connection:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db():
    db = await get_db()
    try:
        await db.executescript(SCHEMA)
        await db.commit()
    finally:
        await db.close()
