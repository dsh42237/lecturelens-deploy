import os
from contextlib import contextmanager
from typing import Iterator

import psycopg2
import psycopg2.extras

DATABASE_URL = os.getenv("DATABASE_URL")


def connect_db() -> psycopg2.extensions.connection:
    conn = psycopg2.connect(DATABASE_URL)
    conn.cursor_factory = psycopg2.extras.RealDictCursor
    return conn


@contextmanager
def get_db() -> Iterator[psycopg2.extensions.connection]:
    conn = connect_db()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                mobile_link_nonce INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS profiles (
                user_id INTEGER PRIMARY KEY,
                full_name TEXT,
                program_name TEXT,
                institution TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS profile_context (
                user_id INTEGER PRIMARY KEY,
                summary TEXT,
                sources TEXT,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS semesters (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                season TEXT NOT NULL,
                year INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS courses (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                semester_id INTEGER NOT NULL,
                course_code TEXT NOT NULL,
                course_name TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(semester_id) REFERENCES semesters(id) ON DELETE CASCADE
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS course_context (
                course_id INTEGER PRIMARY KEY,
                summary TEXT,
                sources TEXT,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                course_id INTEGER,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                final_notes_text TEXT,
                live_notes_history TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE SET NULL
            )
            """
        )
        cursor.execute(
            "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS student_notes_text TEXT"
        )
        cursor.execute(
            "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS live_notes_history TEXT"
        )
