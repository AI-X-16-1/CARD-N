"""Which install is talking to us.

CARD:N has no accounts. Every row in the database nevertheless belongs to exactly one
install, and this is what says which — the `X-Device-Id` header, a UUID the app generates
on first launch and keeps (frontend/src/shared/lib/deviceId.ts).

**This is isolation, not authentication.** The header is self-asserted: anyone can send
someone else's id and read their contacts. What it buys is that two people using the app
normally never see each other's data, which is the part that was broken while
`ME_PERSON_ID = 0` was the only user in the world. Treat it as a scoping key, never as
proof of identity, and do not hang anything security-critical off it. When real accounts
arrive, the scoping is already in place — only where the value comes from changes.
"""

import re

from fastapi import Header, HTTPException

# A UUID as the client writes it, with room to spare. Bounded and charset-checked because
# this value reaches every WHERE clause in the app: an unbounded header would let a caller
# push arbitrary length into indexed columns.
_DEVICE_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{8,64}$")

DEVICE_ID_MAX_LENGTH = 64


async def get_device_id(x_device_id: str = Header(...)) -> str:
    """The calling install's id, or 400 if it is missing or malformed.

    Required rather than defaulted: a request with no id used to mean "the only user", and
    silently falling back to a shared bucket is exactly the data-mixing this exists to
    stop. A client that forgets the header should fail loudly.
    """
    if not _DEVICE_ID_PATTERN.match(x_device_id):
        raise HTTPException(status_code=400, detail="INVALID_DEVICE_ID")
    return x_device_id
