import os
import sqlite3
from contextlib import contextmanager
from typing import Any, Iterator

try:
    import psycopg2
    import psycopg2.extras
except ImportError:  # pragma: no cover - optional in local SQLite mode
    psycopg2 = None


DATABASE_URL = os.getenv("DATABASE_URL")
DB_PATH = os.getenv("DB_PATH", os.path.join("data", "lecturelens.db"))


def using_postgres() -> bool:
    return bool(DATABASE_URL)


def _ensure_db_dir() -> None:
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)


class SQLiteCursorCompat:
    def __init__(self, cursor: sqlite3.Cursor):
        self._cursor = cursor
        self._pending_row: dict[str, Any] | None = None

    def execute(self, query: str, params: tuple[Any, ...] = ()) -> "SQLiteCursorCompat":
        normalized = query.replace("%s", "?")
        lowered = normalized.lower().strip()

        if lowered.endswith("returning id"):
            trimmed = normalized[: lowered.rfind("returning id")].rstrip()
            self._cursor.execute(trimmed, params)
            self._pending_row = {"id": self._cursor.lastrowid}
            return self

        self._pending_row = None
        self._cursor.execute(normalized, params)
        return self

    def fetchone(self) -> Any:
        if self._pending_row is not None:
            row = self._pending_row
            self._pending_row = None
            return row
        return self._cursor.fetchone()

    def fetchall(self) -> list[Any]:
        if self._pending_row is not None:
            row = self._pending_row
            self._pending_row = None
            return [row]
        return self._cursor.fetchall()

    @property
    def lastrowid(self) -> int:
        return self._cursor.lastrowid

    @property
    def rowcount(self) -> int:
        return self._cursor.rowcount

    def __getattr__(self, name: str) -> Any:
        return getattr(self._cursor, name)


class SQLiteConnectionCompat:
    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    def cursor(self) -> SQLiteCursorCompat:
        return SQLiteCursorCompat(self._conn.cursor())

    def execute(self, query: str, params: tuple[Any, ...] = ()) -> SQLiteCursorCompat:
        return self.cursor().execute(query, params)

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        self._conn.close()

    def __enter__(self) -> "SQLiteConnectionCompat":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        if exc_type is not None:
            self.rollback()
        else:
            self.commit()
        self.close()
        return False

    def __getattr__(self, name: str) -> Any:
        return getattr(self._conn, name)


def connect_db() -> Any:
    if using_postgres():
        if psycopg2 is None:
            raise RuntimeError(
                "DATABASE_URL is set but psycopg2 is not installed. Run `pip install -e .`."
            )
        conn = psycopg2.connect(DATABASE_URL)
        conn.cursor_factory = psycopg2.extras.RealDictCursor
        return conn

    _ensure_db_dir()
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return SQLiteConnectionCompat(conn)


@contextmanager
def get_db() -> Iterator[Any]:
    conn = connect_db()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _init_postgres() -> None:
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
        cursor.execute("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS student_notes_text TEXT")
        cursor.execute("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS live_notes_history TEXT")


def _init_sqlite() -> None:
    _ensure_db_dir()
    with connect_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                mobile_link_nonce INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        cursor.execute("PRAGMA table_info(users)")
        user_columns = {row[1] for row in cursor.fetchall()}
        if "mobile_link_nonce" not in user_columns:
            cursor.execute("ALTER TABLE users ADD COLUMN mobile_link_nonce INTEGER NOT NULL DEFAULT 0")

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
        cursor.execute("PRAGMA table_info(profiles)")
        profile_columns = {row[1] for row in cursor.fetchall()}
        if "program_name" not in profile_columns:
            cursor.execute("ALTER TABLE profiles ADD COLUMN program_name TEXT")

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
                id INTEGER PRIMARY KEY AUTOINCREMENT,
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
                id INTEGER PRIMARY KEY AUTOINCREMENT,
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
                student_notes_text TEXT,
                live_notes_history TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE SET NULL
            )
            """
        )
        cursor.execute("PRAGMA table_info(sessions)")
        session_columns = {row[1] for row in cursor.fetchall()}
        if "live_notes_history" not in session_columns:
            cursor.execute("ALTER TABLE sessions ADD COLUMN live_notes_history TEXT")
        if "student_notes_text" not in session_columns:
            cursor.execute("ALTER TABLE sessions ADD COLUMN student_notes_text TEXT")


def init_db() -> None:
    if using_postgres():
        _init_postgres()
    else:
        _init_sqlite()
