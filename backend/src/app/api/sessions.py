import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user
from app.core.db import get_db
from app.core.user_schemas import FlashcardGenerateIn, SessionFlashcardsOut, SessionOut
from app.services.notes.notes_llm_service import generate_final_notes_text, generate_flashcards

router = APIRouter(prefix="/sessions", tags=["sessions"])


def row_value(row: Any, key: str) -> Any:
    if isinstance(row, dict):
        return row.get(key)
    return row[key]


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


def parse_final_notes_versions(raw: str | None) -> list[dict[str, Any]]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def build_regeneration_source(
    transcript_text: str | None,
    live_notes_history: list[dict[str, Any]],
    student_notes_text: str | None,
) -> str:
    transcript = (transcript_text or "").strip()
    if transcript:
        return transcript

    lines: list[str] = []
    for entry in live_notes_history:
        notes = entry.get("notes")
        if not isinstance(notes, dict):
            continue
        topic = notes.get("nowTopic")
        if isinstance(topic, str) and topic.strip():
            lines.append(topic.strip())
        key_points = notes.get("keyPoints")
        if isinstance(key_points, list):
            for point in key_points:
                if isinstance(point, str) and point.strip():
                    lines.append(point.strip())
        defs = notes.get("defs")
        if isinstance(defs, list):
            for item in defs:
                if not isinstance(item, dict):
                    continue
                term = item.get("term")
                definition = item.get("def")
                if isinstance(term, str) and isinstance(definition, str):
                    lines.append(f"{term.strip()}: {definition.strip()}")
        missed_cue = notes.get("missedCue")
        if isinstance(missed_cue, str) and missed_cue.strip():
            lines.append(missed_cue.strip())

    if lines:
        return "\n".join(lines)

    student_notes = (student_notes_text or "").strip()
    if student_notes:
        return student_notes

    return ""


def build_flashcards_source(
    final_notes_text: str | None,
    transcript_text: str | None,
    live_notes_history: list[dict[str, Any]],
    student_notes_text: str | None,
) -> str:
    blocks: list[str] = []
    final_notes = (final_notes_text or "").strip()
    if final_notes:
        blocks.append(f"FINAL_NOTES:\n{final_notes}")

    regenerated_source = build_regeneration_source(
        transcript_text,
        live_notes_history,
        student_notes_text,
    ).strip()
    if regenerated_source:
        blocks.append(f"SESSION_CONTENT:\n{regenerated_source}")

    student_notes = (student_notes_text or "").strip()
    if student_notes:
        blocks.append(f"STUDENT_NOTES:\n{student_notes}")

    return "\n\n".join(blocks).strip()


def build_session_out(row: dict[str, Any]) -> SessionOut:
    versions = parse_final_notes_versions(row_value(row, "final_notes_versions"))
    return SessionOut(
        id=row_value(row, "id"),
        course_id=row_value(row, "course_id"),
        course_code=row_value(row, "course_code"),
        course_name=row_value(row, "course_name"),
        started_at=row_value(row, "started_at"),
        ended_at=row_value(row, "ended_at"),
        final_notes_text=row_value(row, "final_notes_text"),
        student_notes_text=row_value(row, "student_notes_text"),
        live_notes_history=parse_live_notes_history(row_value(row, "live_notes_history")),
        final_notes_versions_count=len(versions),
    )


@router.get("", response_model=list[SessionOut])
def list_sessions(user=Depends(get_current_user)) -> list[SessionOut]:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT s.id, s.course_id, s.started_at, s.ended_at, s.final_notes_text, s.student_notes_text, s.live_notes_history, s.final_notes_versions, "
            "c.course_code, c.course_name "
            "FROM sessions s "
            "LEFT JOIN courses c ON s.course_id = c.id "
            "WHERE s.user_id = %s ORDER BY s.started_at DESC",
            (user["id"],),
        )
        rows = cur.fetchall()
    return [build_session_out(row) for row in rows]


@router.get("/{session_id}", response_model=SessionOut)
def get_session(session_id: str, user=Depends(get_current_user)) -> SessionOut:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT s.id, s.course_id, s.started_at, s.ended_at, s.final_notes_text, s.student_notes_text, s.live_notes_history, s.final_notes_versions, "
            "c.course_code, c.course_name "
            "FROM sessions s "
            "LEFT JOIN courses c ON s.course_id = c.id "
            "WHERE s.user_id = %s AND s.id = %s",
            (user["id"], session_id),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return build_session_out(row)


@router.post("/{session_id}/regenerate-final-notes", response_model=SessionOut)
def regenerate_final_notes(session_id: str, user=Depends(get_current_user)) -> SessionOut:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT s.id, s.course_id, s.started_at, s.ended_at, s.final_notes_text, s.student_notes_text, "
            "s.live_notes_history, s.transcript_text, s.final_notes_versions, c.course_code, c.course_name "
            "FROM sessions s "
            "LEFT JOIN courses c ON s.course_id = c.id "
            "WHERE s.user_id = %s AND s.id = %s",
            (user["id"], session_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")

        live_history = parse_live_notes_history(row["live_notes_history"])
        source_text = build_regeneration_source(
            row_value(row, "transcript_text"),
            live_history,
            row_value(row, "student_notes_text"),
        )
        if not source_text.strip():
            raise HTTPException(
                status_code=400,
                detail="No stored transcript or live-note history is available to regenerate final notes for this session.",
            )

        regenerated_text = generate_final_notes_text(
            source_text,
            row_value(row, "student_notes_text") or "",
        )

        versions = parse_final_notes_versions(row_value(row, "final_notes_versions"))
        previous_notes = row_value(row, "final_notes_text")
        if isinstance(previous_notes, str) and previous_notes.strip():
            versions.append(
                {
                    "created_at": datetime.utcnow().isoformat(),
                    "text": previous_notes,
                }
            )

        cur.execute(
            "UPDATE sessions SET final_notes_text = %s, final_notes_versions = %s WHERE id = %s AND user_id = %s",
            (
                regenerated_text,
                json.dumps(versions),
                session_id,
                user["id"],
            ),
        )

        cur.execute(
            "SELECT s.id, s.course_id, s.started_at, s.ended_at, s.final_notes_text, s.student_notes_text, s.live_notes_history, s.final_notes_versions, "
            "c.course_code, c.course_name "
            "FROM sessions s "
            "LEFT JOIN courses c ON s.course_id = c.id "
            "WHERE s.user_id = %s AND s.id = %s",
            (user["id"], session_id),
        )
        updated_row = cur.fetchone()

    if not updated_row:
        raise HTTPException(status_code=404, detail="Session not found after regeneration")
    return build_session_out(updated_row)


@router.post("/{session_id}/generate-flashcards", response_model=SessionFlashcardsOut)
def generate_session_flashcards(
    session_id: str,
    payload: FlashcardGenerateIn,
    user=Depends(get_current_user),
) -> SessionFlashcardsOut:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT s.id, s.final_notes_text, s.student_notes_text, s.live_notes_history, s.transcript_text "
            "FROM sessions s "
            "WHERE s.user_id = %s AND s.id = %s",
            (user["id"], session_id),
        )
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    live_history = parse_live_notes_history(row_value(row, "live_notes_history"))
    source_text = build_flashcards_source(
        row_value(row, "final_notes_text"),
        row_value(row, "transcript_text"),
        live_history,
        row_value(row, "student_notes_text"),
    )
    if not source_text:
        raise HTTPException(
            status_code=400,
            detail="No stored notes or transcript are available to generate flashcards for this session.",
        )

    try:
        flashcards = generate_flashcards(
            source_text,
            student_notes=row_value(row, "student_notes_text") or "",
            focus_request=payload.request or "",
            count=payload.count,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return SessionFlashcardsOut(session_id=session_id, flashcards=flashcards)


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
