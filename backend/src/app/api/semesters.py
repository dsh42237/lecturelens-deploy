from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user
from app.core.db import get_db
from app.core.user_schemas import SemesterIn, SemesterOut

router = APIRouter(prefix="/semesters", tags=["semesters"])


@router.get("", response_model=list[SemesterOut])
def list_semesters(user=Depends(get_current_user)) -> list[SemesterOut]:
    with get_db() as conn:
        cur = conn.cursor()
        rows = cur.execute(
            "SELECT id, season, year FROM semesters WHERE user_id = ? ORDER BY year DESC",
            (user["id"],),
        ).fetchall()
    return [SemesterOut(id=row["id"], season=row["season"], year=row["year"]) for row in rows]


@router.post("", response_model=SemesterOut)
def create_semester(payload: SemesterIn, user=Depends(get_current_user)) -> SemesterOut:
    season = payload.season.lower()
    if season not in {"winter", "spring", "summer", "fall"}:
        raise HTTPException(status_code=400, detail="Invalid season")
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO semesters (user_id, season, year) VALUES (?, ?, ?)",
            (user["id"], season, payload.year),
        )
        semester_id = cur.lastrowid
    return SemesterOut(id=semester_id, season=season, year=payload.year)


@router.delete("/{semester_id}")
def delete_semester(semester_id: int, user=Depends(get_current_user)) -> dict[str, bool]:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM semesters WHERE id = ? AND user_id = ?",
            (semester_id, user["id"]),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Semester not found")
    return {"ok": True}
