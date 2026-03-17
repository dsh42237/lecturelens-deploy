from datetime import datetime
import json
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user
from app.core.db import get_db
from app.core.user_schemas import ProfileIn, ProfileOut
from app.services.context.ai_context_service import generate_profile_context

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileOut)
def get_profile(user=Depends(get_current_user)) -> ProfileOut:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT full_name, program_name, institution FROM profiles WHERE user_id = %s",
            (user["id"],),
        )
        profile = cur.fetchone()
        cur.execute(
            "SELECT summary FROM profile_context WHERE user_id = %s",
            (user["id"],),
        )
        context = cur.fetchone()
    return ProfileOut(
        full_name=profile["full_name"] if profile else None,
        program_name=profile["program_name"] if profile else None,
        institution=profile["institution"] if profile else None,
        context_summary=context["summary"] if context else None,
    )


@router.put("", response_model=ProfileOut)
def update_profile(payload: ProfileIn, user=Depends(get_current_user)) -> ProfileOut:
    now = datetime.utcnow().isoformat()
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE profiles SET full_name = %s, program_name = %s, institution = %s, updated_at = %s WHERE user_id = %s",
            (payload.full_name, payload.program_name, payload.institution, now, user["id"]),
        )
        cur.execute(
            "SELECT full_name, program_name, institution FROM profiles WHERE user_id = %s",
            (user["id"],),
        )
        profile = cur.fetchone()
        cur.execute(
            "SELECT summary FROM profile_context WHERE user_id = %s",
            (user["id"],),
        )
        context = cur.fetchone()
    return ProfileOut(
        full_name=profile["full_name"] if profile else None,
        program_name=profile["program_name"] if profile else None,
        institution=profile["institution"] if profile else None,
        context_summary=context["summary"] if context else None,
    )


@router.post("/enrich", response_model=ProfileOut)
def enrich_profile(user=Depends(get_current_user)) -> ProfileOut:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT full_name, program_name, institution FROM profiles WHERE user_id = %s",
            (user["id"],),
        )
        profile = cur.fetchone()
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        cur.execute(
            "SELECT course_code, course_name FROM courses WHERE user_id = %s",
            (user["id"],),
        )
        courses = cur.fetchall()
        course_list = [
            f"{row['course_code']} - {row['course_name']}" for row in courses
        ]
        summary = generate_profile_context(
            profile["full_name"], profile["program_name"], profile["institution"], course_list
        )
        now = datetime.utcnow().isoformat()
        cur.execute(
            "INSERT INTO profile_context (user_id, summary, sources, updated_at) VALUES (%s, %s, %s, %s) "
            "ON CONFLICT(user_id) DO UPDATE SET summary = EXCLUDED.summary, sources = EXCLUDED.sources, updated_at = EXCLUDED.updated_at",
            (user["id"], summary, json.dumps([]), now),
        )
        cur.execute(
            "SELECT summary FROM profile_context WHERE user_id = %s",
            (user["id"],),
        )
        context = cur.fetchone()
    return ProfileOut(
        full_name=profile["full_name"],
        program_name=profile["program_name"],
        institution=profile["institution"],
        context_summary=context["summary"] if context else None,
    )
