import hashlib
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pmtracker.store import json_store

router = APIRouter(tags=["auth"])

VALID_OTP_SUMS = {40, 50, 60, 70}
ADMIN_EMAIL = "604671@cognizant.com"
DEMO_EMAIL = "demo@demo.local"
VALID_ROLES = {"Dev", "QA", "PM", "PO"}


def is_demo(email: str) -> bool:
    """Check if the given email is the demo user."""
    return email == DEMO_EMAIL


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _load_auth_users() -> list:
    return json_store.load("auth_users", default=[])


def _save_auth_users(users: list) -> None:
    json_store.save("auth_users", users)


def _load_sessions() -> list:
    return json_store.load("auth_sessions", default=[])


def _save_sessions(sessions: list) -> None:
    json_store.save("auth_sessions", sessions)


# --- Models ---

class RegisterRequest(BaseModel):
    email: str


class VerifyOtpRequest(BaseModel):
    email: str
    otp: str
    password: str
    display_name: str = ""
    role: str = "Dev"


class LoginRequest(BaseModel):
    email: str
    password: str


class DemoLoginRequest(BaseModel):
    otp: str


# --- Endpoints ---

@router.post("/auth/register")
def register(body: RegisterRequest):
    email = body.email.strip().lower()

    if not email.endswith("@cognizant.com"):
        raise HTTPException(400, "Only @cognizant.com email addresses are allowed.")

    users = _load_auth_users()
    existing = next((u for u in users if u["email"] == email), None)

    if existing and existing.get("verified"):
        raise HTTPException(409, "This email is already registered. Please log in.")

    if not existing:
        users.append({
            "email": email,
            "password_hash": None,
            "verified": False,
            "created": _now(),
        })
        _save_auth_users(users)

    return {
        "message": "Please reach out to 604671@cognizant.com for your OTP.",
        "email": email,
    }


@router.post("/auth/verify-otp")
def verify_otp(body: VerifyOtpRequest):
    email = body.email.strip().lower()
    otp = body.otp.strip()

    # Validate OTP format
    if len(otp) != 6 or not otp.isdigit():
        raise HTTPException(400, "OTP must be exactly 6 digits.")

    # Validate OTP digit sum
    digit_sum = sum(int(d) for d in otp)
    if digit_sum not in VALID_OTP_SUMS:
        raise HTTPException(400, "Invalid OTP. Please check and try again.")

    # Validate password
    if len(body.password) < 4:
        raise HTTPException(400, "Password must be at least 4 characters.")

    users = _load_auth_users()
    user = next((u for u in users if u["email"] == email), None)

    if not user:
        raise HTTPException(404, "Email not found. Please register first.")

    if user.get("verified"):
        raise HTTPException(409, "This email is already verified. Please log in.")

    user["password_hash"] = _hash(body.password)
    user["verified"] = True
    user["verified_at"] = _now()
    if body.display_name.strip():
        user["display_name"] = body.display_name.strip()
    # Assign role: admin email gets "Admin", others get selected role
    if email == ADMIN_EMAIL:
        user["role"] = "Admin"
    else:
        user["role"] = body.role if body.role in VALID_ROLES else "Dev"
    _save_auth_users(users)

    return {"message": "Registration complete! You can now log in.", "email": email}


@router.post("/auth/login")
def login(body: LoginRequest):
    email = body.email.strip().lower()

    users = _load_auth_users()
    user = next((u for u in users if u["email"] == email), None)

    if not user:
        raise HTTPException(401, "Invalid email or password.")

    if not user.get("verified"):
        raise HTTPException(403, "Account not verified. Please complete OTP verification first.")

    if user.get("password_hash") != _hash(body.password):
        raise HTTPException(401, "Invalid email or password.")

    # Generate session token
    token = _hash(email + _now())
    sessions = _load_sessions()
    sessions.append({
        "token": token,
        "email": email,
        "created": _now(),
    })
    _save_sessions(sessions)

    role = user.get("role", "Admin" if email == ADMIN_EMAIL else "Dev")
    return {"token": token, "email": email, "role": role}


@router.post("/auth/demo-login")
def demo_login(body: DemoLoginRequest):
    otp = body.otp.strip()

    if len(otp) != 6 or not otp.isdigit():
        raise HTTPException(400, "OTP must be exactly 6 digits.")

    digit_sum = sum(int(d) for d in otp)
    if digit_sum not in VALID_OTP_SUMS:
        raise HTTPException(400, "Invalid OTP. Please check and try again.")

    token = _hash(DEMO_EMAIL + _now())
    sessions = _load_sessions()
    sessions.append({
        "token": token,
        "email": DEMO_EMAIL,
        "created": _now(),
    })
    _save_sessions(sessions)

    return {"token": token, "email": DEMO_EMAIL, "role": "Demo"}


@router.post("/auth/logout")
def logout_endpoint(token: str = ""):
    sessions = _load_sessions()
    sessions = [s for s in sessions if s["token"] != token]
    _save_sessions(sessions)
    return {"message": "Logged out."}


def validate_token(token: str) -> dict | None:
    """Check if a token is valid. Returns session dict or None."""
    sessions = _load_sessions()
    return next((s for s in sessions if s["token"] == token), None)


def is_admin(email: str) -> bool:
    """Check if the given email belongs to an admin user."""
    if email == ADMIN_EMAIL:
        return True
    users = _load_auth_users()
    user = next((u for u in users if u["email"] == email), None)
    return user.get("role") == "Admin" if user else False
