"""Local-filesystem storage for the corrected business-card image (docs/CLAUDE.md: no
deployment, local Docker Compose only — a filesystem is a fine store here, unlike the
conversation feature's audio, which must never be persisted at all per backend/CLAUDE.md's
privacy rule; a scanned business card is the opposite case, explicitly kept as a reference).

Lives in app/core/ rather than app/features/scan/ because both scan (writes the staged
image) and contacts (promotes/serves the saved one) need it, and features talk to each
other only through app/core/ or the API — never by importing one another's modules
directly (see backend/CLAUDE.md rule 1).

A scan (POST /scan/ocr) writes the corrected image to `staging/` under a random token
before the user has decided whether to save the contact at all. If they do, ContactsService
promotes it into `persons/{person_id}.jpg`; if they cancel out of the scan flow, the staged
file is simply never claimed. Local dev only, so an occasional orphaned staged file isn't
worth a cleanup job.
"""

import logging
import re
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

STORAGE_ROOT = Path(__file__).resolve().parents[2] / "storage" / "card_images"
STAGING_DIR = STORAGE_ROOT / "staging"
PERSONS_DIR = STORAGE_ROOT / "persons"

# Exactly what stage_image() generates (uuid4().hex) — promote_staged_image's token comes
# straight from the client (CreatePersonRequest.image_token) and gets interpolated into a
# filesystem path, so anything looser than an exact format check (e.g. just rejecting "/")
# is a path-traversal risk: "../persons/5" resolves outside STAGING_DIR entirely, and
# .replace() would then move another contact's already-saved image out from under them.
_TOKEN_RE = re.compile(r"^[0-9a-f]{32}$")


def _ensure_dirs() -> None:
    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    PERSONS_DIR.mkdir(parents=True, exist_ok=True)


def stage_image(image_bytes: bytes) -> str | None:
    """Saves a freshly-OCR'd card image to staging, returning its token — or None if
    there's nothing worth saving (pipeline couldn't produce a JPEG for this photo)."""
    if not image_bytes:
        return None
    _ensure_dirs()
    token = uuid.uuid4().hex
    (STAGING_DIR / f"{token}.jpg").write_bytes(image_bytes)
    return token


def promote_staged_image(token: str, person_id: int) -> str | None:
    """Moves a staged image to its permanent home for `person_id`. Returns the stored
    filename (Person.image_path) on success, None if the token doesn't resolve to a
    staged file (expired, already claimed, or never existed — a stale/replayed token
    from the client shouldn't fail contact creation over a missing picture). Also None
    for a malformed token (see _TOKEN_RE) instead of raising — same "just no picture"
    handling as a token that's merely stale, not a reason to fail contact creation."""
    if not _TOKEN_RE.fullmatch(token):
        return None
    _ensure_dirs()
    staged_path = STAGING_DIR / f"{token}.jpg"
    if not staged_path.is_file():
        return None
    filename = f"{person_id}.jpg"
    staged_path.replace(PERSONS_DIR / filename)
    return filename


def delete_person_image(image_path: str | None) -> None:
    """Remove a contact's saved card image.

    Called after the contact's row is committed away (ContactsService.delete_person).
    Deleting a contact has to delete their card photo too — it is a photograph of
    somebody's name, phone number and employer, and the privacy policy says removing the
    contact removes it.

    Tolerant on purpose: a missing file is the outcome we wanted, and a filesystem error
    must not turn a successful deletion into a 500 that makes the user try again on a
    contact that is already gone. The row is what the app reads; a stray file is an
    inconsistency to report, not a failure to hand back.
    """
    if not image_path:
        return

    target = person_image_path(image_path)
    try:
        target.unlink(missing_ok=True)
    except OSError:
        logger.warning("could not delete card image %s", target, exc_info=True)


def person_image_path(image_path: str) -> Path:
    return PERSONS_DIR / image_path
