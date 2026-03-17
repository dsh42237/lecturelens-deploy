import json
from typing import Any

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.core.db import get_db
from app.core.user_schemas import SessionOut

router = APIRouter(prefix="/sessions", tags=["sessions"])


def parse_live_notes_history(raw: str | None) -> list[dict[str, Any]]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


@router.get("", response_model=list[SessionOut])
def list_sessions(user=Depends(get_current_user)) -> list[SessionOut]:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT s.id, s.course_id, s.started_at, s.ended_at, s.final_notes_text, s.live_notes_history, "
            "c.course_code, c.course_name "
            "FROM sessions s "
            "LEFT JOIN courses c ON s.course_id = c.id "
            "WHERE s.user_id = %s ORDER BY s.started_at DESC",
            (user["id"],),
        )
        rows = cur.fetchall()
    return [
        SessionOut(
            id=row["id"],
            course_id=row["course_id"],
            course_code=row["course_code"],
            course_name=row["course_name"],
            started_at=row["started_at"],
            ended_at=row["ended_at"],
            final_notes_text=row["final_notes_text"],
            live_notes_history=parse_live_notes_history(row["live_notes_history"]),
        )
        for row in rows
    ]


@router.delete("/{session_id}")
def delete_session(session_id: str, user=Depends(get_current_user)) -> dict[str, bool]:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM sessions WHERE id = %s AND user_id = %s",
            (session_id, user["id"]),
        )
        if cur.rowcount == 0:
            return {"ok": False}
    return {"ok": True}
