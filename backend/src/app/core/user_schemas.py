from typing import Any, Optional
from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: EmailStr


class ProfileIn(BaseModel):
    full_name: Optional[str] = None
    program_name: Optional[str] = None
    institution: Optional[str] = None


class ProfileOut(BaseModel):
    full_name: Optional[str] = None
    program_name: Optional[str] = None
    institution: Optional[str] = None
    context_summary: Optional[str] = None


class SemesterIn(BaseModel):
    season: str
    year: int


class SemesterOut(BaseModel):
    id: int
    season: str
    year: int


class CourseIn(BaseModel):
    semester_id: int
    course_code: str
    course_name: str


class CourseOut(BaseModel):
    id: int
    semester_id: int
    course_code: str
    course_name: str
    context_summary: Optional[str] = None


class SessionOut(BaseModel):
    id: str
    course_id: Optional[int] = None
    course_code: Optional[str] = None
    course_name: Optional[str] = None
    started_at: str
    ended_at: Optional[str] = None
    final_notes_text: Optional[str] = None
    live_notes_history: list[dict[str, Any]] = Field(default_factory=list)
