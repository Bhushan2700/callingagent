import bcrypt
import jwt
import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
load_dotenv()

JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET env var is required — set it before starting the app")
JWT_EXPIRY_HOURS = 24 * 7

# Admin JWT uses a different payload structure to distinguish from tenant tokens
ADMIN_JWT_SECRET = JWT_SECRET  # same secret, different payload
ADMIN_JWT_EXPIRY_HOURS = 24 * 7


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


def create_admin_token(admin_id: str) -> str:
    payload = {
        "admin_id": admin_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ADMIN_JWT_EXPIRY_HOURS),
        "type": "admin",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_admin_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if payload.get("type") != "admin":
            return None
        return payload.get("admin_id")
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
