import os
from datetime import datetime, timedelta
from typing import Any

from jose import jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change")
JWT_ALG = os.getenv("JWT_ALG", "HS256")
JWT_EXPIRES_DAYS = int(os.getenv("JWT_EXPIRES_DAYS", "7"))


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(
    data: dict[str, Any],
    expires_days: int | None = None,
    expires_seconds: int | None = None,
) -> str:
    if expires_seconds is not None:
        expire = datetime.utcnow() + timedelta(seconds=expires_seconds)
    else:
        expire = datetime.utcnow() + timedelta(days=expires_days or JWT_EXPIRES_DAYS)
    to_encode = {**data, "exp": expire}
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
