"""Where the finished battle-card image is written before its path is saved to
``battle_cards.illustration_url``.

Reuses ``app/core/image_store.py``'s storage root (local filesystem, no
deployment - docs/CLAUDE.md) but keeps the generated card art in its own
``illustrations/`` subfolder, separate from the scanned ``persons/`` photos.
"""

from app.core.image_store import STORAGE_ROOT

ILLUSTRATIONS_DIR = STORAGE_ROOT / "illustrations"


def save_illustration(card_id: int, image_bytes: bytes) -> str:
    """Write the generated card image for ``card_id`` and return the value to
    store in ``BattleCard.illustration_url`` (a path relative to the card-image
    store, e.g. ``"illustrations/42.png"``)."""
    ILLUSTRATIONS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{card_id}.png"
    (ILLUSTRATIONS_DIR / filename).write_bytes(image_bytes)
    return f"illustrations/{filename}"
