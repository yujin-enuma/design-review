import aiosqlite
from core.sheet_parser import parse_file, detect_sheet_type


async def import_sheet_from_bytes(
    db: aiosqlite.Connection,
    project_id: int,
    file_data: bytes,
    filename: str = "file.xlsx",
    drive_file_id: str = None,
    fps: float = 29.97,
) -> dict:
    parsed = parse_file(file_data, filename, fps)
    imported = {}
    for sheet_name, sheet_data in parsed.items():
        sheet_type = sheet_data["type"]
        items = sheet_data["items"]
        cursor = await db.execute(
            "INSERT INTO feedback_sheets (project_id, sheet_name, sheet_type, drive_file_id) VALUES (?, ?, ?, ?)",
            (project_id, sheet_name, sheet_type, drive_file_id),
        )
        sheet_id = cursor.lastrowid
        for item in items:
            await db.execute(
                """INSERT INTO feedback_items
                   (sheet_id, timecode_raw, timecode_seconds, scene_number, reviewer, comment, item_index)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    sheet_id,
                    item["timecode_raw"],
                    item["timecode_seconds"],
                    item["scene_number"],
                    item["reviewer"],
                    item["comment"],
                    item["item_index"],
                ),
            )
        imported[sheet_name] = {"type": sheet_type, "count": len(items)}
    await db.commit()
    return imported


async def get_feedback_items(
    db: aiosqlite.Connection,
    project_id: int,
    version_id: int = None,
    reviewer: str = None,
    status: str = None,
    sheet_name: str = None,
) -> list[dict]:
    query = """
        SELECT fi.*, fs.sheet_name, fs.sheet_type,
               COALESCE(fst.status, 'pending') as status,
               fst.reviewed_by, fst.note
        FROM feedback_items fi
        JOIN feedback_sheets fs ON fi.sheet_id = fs.id
        LEFT JOIN feedback_status fst ON fi.id = fst.feedback_item_id
    """
    conditions = ["fs.project_id = ?"]
    params = [project_id]

    if version_id:
        query = query.replace(
            "LEFT JOIN feedback_status fst ON fi.id = fst.feedback_item_id",
            "LEFT JOIN feedback_status fst ON fi.id = fst.feedback_item_id AND fst.video_version_id = ?"
        )
        params.insert(0, version_id)
        # Reorder: version_id goes before project_id in params
        params = [version_id, project_id]

    if reviewer:
        conditions.append("fi.reviewer = ?")
        params.append(reviewer)
    if status:
        if status == "pending":
            conditions.append("(fst.status IS NULL OR fst.status = 'pending')")
        else:
            conditions.append("fst.status = ?")
            params.append(status)
    if sheet_name:
        conditions.append("fs.sheet_name = ?")
        params.append(sheet_name)

    query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY COALESCE(fi.timecode_seconds, 9999), fi.scene_number, fi.item_index"

    rows = await db.execute(query, params)
    results = []
    for row in await rows.fetchall():
        results.append({
            "id": row["id"],
            "sheet_id": row["sheet_id"],
            "sheet_name": row["sheet_name"],
            "sheet_type": row["sheet_type"],
            "timecode_raw": row["timecode_raw"],
            "timecode_seconds": row["timecode_seconds"],
            "scene_number": row["scene_number"],
            "reviewer": row["reviewer"],
            "comment": row["comment"],
            "item_index": row["item_index"],
            "status": row["status"],
            "reviewed_by": row["reviewed_by"],
            "note": row["note"],
        })
    return results


async def update_status(
    db: aiosqlite.Connection,
    feedback_item_id: int,
    video_version_id: int,
    status: str,
    reviewed_by: str,
    note: str = None,
):
    await db.execute(
        """INSERT INTO feedback_status (feedback_item_id, video_version_id, status, reviewed_by, note, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(feedback_item_id, video_version_id)
           DO UPDATE SET status=?, reviewed_by=?, note=?, updated_at=CURRENT_TIMESTAMP""",
        (feedback_item_id, video_version_id, status, reviewed_by, note,
         status, reviewed_by, note),
    )
    await db.commit()


async def get_summary(
    db: aiosqlite.Connection,
    project_id: int,
    version_id: int = None,
) -> dict:
    total_row = await db.execute(
        """SELECT COUNT(*) as cnt FROM feedback_items fi
           JOIN feedback_sheets fs ON fi.sheet_id = fs.id
           WHERE fs.project_id = ?""",
        (project_id,),
    )
    total = (await total_row.fetchone())["cnt"]

    if version_id:
        status_rows = await db.execute(
            """SELECT COALESCE(fst.status, 'pending') as st, COUNT(*) as cnt
               FROM feedback_items fi
               JOIN feedback_sheets fs ON fi.sheet_id = fs.id
               LEFT JOIN feedback_status fst ON fi.id = fst.feedback_item_id AND fst.video_version_id = ?
               WHERE fs.project_id = ?
               GROUP BY st""",
            (version_id, project_id),
        )
    else:
        status_rows = await db.execute(
            """SELECT COALESCE(fst.status, 'pending') as st, COUNT(*) as cnt
               FROM feedback_items fi
               JOIN feedback_sheets fs ON fi.sheet_id = fs.id
               LEFT JOIN feedback_status fst ON fi.id = fst.feedback_item_id
               WHERE fs.project_id = ?
               GROUP BY st""",
            (project_id,),
        )

    counts = {"pending": 0, "applied": 0, "partially_applied": 0, "rejected": 0, "needs_discussion": 0}
    for row in await status_rows.fetchall():
        st = row["st"] or "pending"
        if st in counts:
            counts[st] = row["cnt"]

    resolved = counts["applied"] + counts["partially_applied"] + counts["rejected"]
    progress = round((resolved / total * 100) if total > 0 else 0, 1)

    return {
        "total": total,
        **counts,
        "progress_percent": progress,
    }
