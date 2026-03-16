from datetime import datetime
import json
from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_current_user
from app.core.db import get_db
from app.core.user_schemas import CourseIn, CourseOut
from app.services.context.ai_context_service import generate_course_context

router = APIRouter(prefix="/courses", tags=["courses"])


@router.get("", response_model=list[CourseOut])
def list_courses(
    semester_id: int | None = Query(default=None), user=Depends(get_current_user)
) -> list[CourseOut]:
    with get_db() as conn:
        cur = conn.cursor()
        if semester_id:
            rows = cur.execute(
                "SELECT c.id, c.semester_id, c.course_code, c.course_name, cc.summary "
                "FROM courses c LEFT JOIN course_context cc ON c.id = cc.course_id "
                "WHERE c.user_id = ? AND c.semester_id = ? ORDER BY c.id DESC",
                (user["id"], semester_id),
            ).fetchall()
        else:
            rows = cur.execute(
                "SELECT c.id, c.semester_id, c.course_code, c.course_name, cc.summary "
                "FROM courses c LEFT JOIN course_context cc ON c.id = cc.course_id "
                "WHERE c.user_id = ? ORDER BY c.id DESC",
                (user["id"],),
            ).fetchall()
    return [
        CourseOut(
            id=row["id"],
            semester_id=row["semester_id"],
            course_code=row["course_code"],
            course_name=row["course_name"],
            context_summary=row["summary"],
        )
        for row in rows
    ]


@router.post("", response_model=CourseOut)
def create_course(payload: CourseIn, user=Depends(get_current_user)) -> CourseOut:
    with get_db() as conn:
        cur = conn.cursor()
        semester = cur.execute(
            "SELECT id FROM semesters WHERE id = ? AND user_id = ?",
            (payload.semester_id, user["id"]),
        ).fetchone()
        if not semester:
            raise HTTPException(status_code=404, detail="Semester not found")
        cur.execute(
            "INSERT INTO courses (user_id, semester_id, course_code, course_name) VALUES (?, ?, ?, ?)",
            (user["id"], payload.semester_id, payload.course_code, payload.course_name),
        )
        course_id = cur.lastrowid
    return CourseOut(
        id=course_id,
        semester_id=payload.semester_id,
        course_code=payload.course_code,
        course_name=payload.course_name,
        context_summary=None,
    )


@router.delete("/{course_id}")
def delete_course(course_id: int, user=Depends(get_current_user)) -> dict[str, bool]:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM courses WHERE id = ? AND user_id = ?",
            (course_id, user["id"]),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Course not found")
    return {"ok": True}


@router.post("/{course_id}/enrich", response_model=CourseOut)
def enrich_course(course_id: int, user=Depends(get_current_user)) -> CourseOut:
    with get_db() as conn:
        cur = conn.cursor()
        course = cur.execute(
            "SELECT course_code, course_name, semester_id FROM courses WHERE id = ? AND user_id = ?",
            (course_id, user["id"]),
        ).fetchone()
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        profile = cur.execute(
            "SELECT institution FROM profiles WHERE user_id = ?",
            (user["id"],),
        ).fetchone()
        summary = generate_course_context(
            course["course_code"], course["course_name"], profile["institution"] if profile else None
        )
        now = datetime.utcnow().isoformat()
        cur.execute(
            "INSERT INTO course_context (course_id, summary, sources, updated_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(course_id) DO UPDATE SET summary = excluded.summary, sources = excluded.sources, updated_at = excluded.updated_at",
            (course_id, summary, json.dumps([]), now),
        )
        context = cur.execute(
            "SELECT summary FROM course_context WHERE course_id = ?",
            (course_id,),
        ).fetchone()
    return CourseOut(
        id=course_id,
        semester_id=course["semester_id"],
        course_code=course["course_code"],
        course_name=course["course_name"],
        context_summary=context["summary"] if context else None,
    )
