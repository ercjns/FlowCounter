from datetime import datetime, timezone
import os
import bcrypt

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password:
        return True
    if not plain_password:
        return False
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

def verify_admin_key(plain_key: str) -> bool:
    if len(plain_key) < 1:
        return False
    if plain_key == os.getenv("FLOWCOUNT_ADMIN_KEY"):
        return True
    return False

def get_15m_bucket(dt: datetime) -> datetime:
    """
    Floors a datetime to the nearest 15-minute interval (:00, :15, :30, :45).
    Guarantees UTC timezone-aware datetime.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    
    minute = (dt.minute // 15) * 15
    return dt.replace(minute=minute, second=0, microsecond=0)
