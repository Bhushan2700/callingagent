import bcrypt
import jwt
import os
from datetime import datetime, timedelta, timezone

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
JWT_EXPIRY_HOURS = 24 * 7


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_token(tenant_id: str) -> str:
    payload = {
        "tenant_id": tenant_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload.get("tenant_id")
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
