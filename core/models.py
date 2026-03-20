from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str
    drive_folder_id: Optional[str] = None


class ProjectOut(BaseModel):
    id: int
    name: str
    drive_folder_id: Optional[str]
    created_by: Optional[str]
    created_at: Optional[str]


class VideoVersionCreate(BaseModel):
    version_number: int
    filename: str
    drive_file_id: Optional[str] = None
    local_path: Optional[str] = None
    fps: float = 29.97
    duration_seconds: Optional[float] = None


class VideoVersionOut(BaseModel):
    id: int
    project_id: int
    version_number: int
    filename: str
    drive_file_id: Optional[str]
    local_path: Optional[str]
    fps: float
    duration_seconds: Optional[float]


class FeedbackItemOut(BaseModel):
    id: int
    sheet_id: int
    sheet_name: Optional[str] = None
    timecode_raw: Optional[str]
    timecode_seconds: Optional[float]
    scene_number: Optional[int]
    reviewer: Optional[str]
    comment: str
    item_index: Optional[int]
    status: str = "pending"
    reviewed_by: Optional[str] = None
    note: Optional[str] = None


class StatusUpdate(BaseModel):
    status: str
    video_version_id: int
    note: Optional[str] = None


class ImportSheetRequest(BaseModel):
    drive_file_id: Optional[str] = None
    local_path: Optional[str] = None


class SummaryOut(BaseModel):
    total: int
    pending: int
    applied: int
    partially_applied: int
    rejected: int
    needs_discussion: int
    progress_percent: float
