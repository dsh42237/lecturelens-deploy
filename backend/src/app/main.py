import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.api.ws import router as ws_router
from app.api.auth import router as auth_router
from app.api.profile import router as profile_router
from app.api.semesters import router as semesters_router
from app.api.courses import router as courses_router
from app.api.sessions import router as sessions_router
from app.core.db import init_db

app = FastAPI(title="LectureLens API")

origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
cors_origin_regex = os.getenv(
    "CORS_ORIGIN_REGEX",
    r"^https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in origins if origin.strip()],
    allow_origin_regex=cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.on_event("startup")
def startup() -> None:
    init_db()


app.include_router(ws_router)
app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(semesters_router)
app.include_router(courses_router)
app.include_router(sessions_router)
