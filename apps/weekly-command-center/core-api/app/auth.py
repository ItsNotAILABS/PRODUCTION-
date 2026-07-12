"""Signup/login and the auth dependencies every tenant-scoped route relies
on. `get_current_account` is the single choke point that resolves "who is
calling" into an `Account` row — every business-logic module downstream
takes `account_id` from here, never from a client-supplied parameter, so a
customer can never pass someone else's account_id and read their data.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .db_models import Account, Plan, User
from .schemas import LoginRequest, SignupRequest, TokenResponse
from .security import TokenError, create_access_token, decode_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=False)


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "account"
    return base


def _unique_slug(db: Session, name: str) -> str:
    base = _slugify(name)
    slug = base
    suffix = 1
    while db.execute(select(Account).where(Account.slug == slug)).scalar_one_or_none() is not None:
        suffix += 1
        slug = f"{base}-{suffix}"
    return slug


def _user_and_account_json(user: User, account: Account) -> tuple[dict, dict]:
    return (
        {"id": user.id, "email": user.email, "role": user.role},
        {"id": account.id, "name": account.name, "slug": account.slug, "plan_id": account.plan_id},
    )


@router.post("/signup", response_model=TokenResponse)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    existing = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(409, "an account with that email already exists")

    account = Account(name=payload.account_name, slug=_unique_slug(db, payload.account_name), plan_id="free")
    db.add(account)
    db.flush()  # obtain account.id before creating the user

    user = User(
        account_id=account.id,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role="owner",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.refresh(account)

    token = create_access_token(user.id, account.id)
    user_json, account_json = _user_and_account_json(user, account)
    return TokenResponse(access_token=token, user=user_json, account=account_json)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(401, "invalid email or password")
    account = db.get(Account, user.account_id)

    token = create_access_token(user.id, account.id)
    user_json, account_json = _user_and_account_json(user, account)
    return TokenResponse(access_token=token, user=user_json, account=account_json)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(401, "missing bearer token")
    try:
        payload = decode_access_token(credentials.credentials)
    except TokenError:
        raise HTTPException(401, "invalid or expired token")
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(401, "user no longer exists")
    return user


def get_current_account(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Account:
    account = db.get(Account, user.account_id)
    if account is None:
        raise HTTPException(401, "account no longer exists")
    return account


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    account = db.get(Account, user.account_id)
    plan = db.get(Plan, account.plan_id)
    user_json, account_json = _user_and_account_json(user, account)
    account_json["plan_name"] = plan.name if plan else account.plan_id
    return {"user": user_json, "account": account_json}


@router.post("/invite")
def invite_teammate(
    payload: SignupRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a teammate to the caller's account (owner only). `account_name` in
    the payload is ignored — the teammate joins the inviter's account."""
    from . import billing  # deferred to avoid an auth<->billing import cycle

    if current_user.role != "owner":
        raise HTTPException(403, "only the account owner can invite teammates")
    account = db.get(Account, current_user.account_id)
    billing.enforce_limit(db, account, "users")

    existing = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(409, "an account with that email already exists")

    user = User(account_id=account.id, email=payload.email, hashed_password=hash_password(payload.password), role="member")
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email, "role": user.role}
