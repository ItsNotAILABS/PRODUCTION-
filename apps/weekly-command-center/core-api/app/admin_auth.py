"""Admin authentication — separate from tenant auth (auth.py) on purpose.

Analytics endpoints aggregate data across every account, so they must never
be reachable via the normal `get_current_account` dependency (which always
scopes to the caller's own tenant). Instead they require a static bearer
token set out-of-band by the operator (ADMIN_API_KEY env var) — no tenant
user, however privileged their role, can reach these routes with their own
account's JWT.

If ADMIN_API_KEY is unset, admin routes are disabled entirely (503) rather
than silently open — there is no insecure default here.
"""
from __future__ import annotations

import os
import secrets

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY")

_bearer = HTTPBearer(auto_error=False)


def require_admin(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> None:
    if not ADMIN_API_KEY:
        raise HTTPException(503, "admin API not configured (ADMIN_API_KEY not set)")
    if credentials is None or not secrets.compare_digest(credentials.credentials, ADMIN_API_KEY):
        raise HTTPException(401, "invalid admin credentials")
