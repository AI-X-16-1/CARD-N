"""Where the finished battle-card image is written before its path is saved to
``battle_cards.illustration_url``.

Reuses ``app/core/image_store.py``'s storage root (local filesystem, no
deployment - docs/CLAUDE.md) but keeps the generated card art in its own
``illustrations/`` subfolder, separate from the scanned ``persons/`` photos.

``BattleCard.illustration_url`` stores a **bare filename** (``"42.png"``) - the
same convention as ``Person.image_path`` - which ``card_illustration_path``
resolves, mirroring ``image_store.person_image_path``.
"""

from pathlib import Path

from app.core.image_store import STORAGE_ROOT

ILLUSTRATIONS_DIR = STORAGE_ROOT / "illustrations"


def save_illustration(card_id: int, image_bytes: bytes) -> str:
    """Write the generated card image for ``card_id`` and return the bare
    filename to store in ``BattleCard.illustration_url`` (e.g. ``"42.png"``)."""
    ILLUSTRATIONS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{card_id}.png"
    (ILLUSTRATIONS_DIR / filename).write_bytes(image_bytes)
    return filename


def card_illustration_path(illustration_url: str) -> Path:
    """Resolve a stored ``BattleCard.illustration_url`` to its file on disk -
    the illustration counterpart of ``image_store.person_image_path``."""
    return ILLUSTRATIONS_DIR / illustration_url
