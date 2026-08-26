"""Whisper speech-to-text.

Runs on the server rather than in the browser so the Android app and the web build
share one code path. The uploaded audio is written to a temp file, transcribed, and
deleted in a finally block — backend/CLAUDE.md: "Delete audio files immediately after
STT processing. Do not persist them on the server."

The first call downloads the model weights (a few hundred MB), so it is slow once and
fast afterwards.
"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path

from faster_whisper import WhisperModel

from app.config import settings
from app.features.conversation.schemas import TranscribeResponse, TranscriptSegment

logger = logging.getLogger(__name__)

# Browsers and phones hand us whatever the recorder produced; ffmpeg (bundled with
# ctranslate2's audio decoding) handles all of these.
SUPPORTED_SUFFIXES = {".m4a", ".mp3", ".wav", ".webm", ".ogg", ".flac", ".mp4", ".aac"}

_model: WhisperModel | None = None
_loaded_key: str = ""


def _get_model() -> WhisperModel:
    """Load once and keep it — reloading per request would dominate the runtime."""
    global _model, _loaded_key

    key = f"{settings.whisper_model}|{settings.whisper_device}|{settings.whisper_compute_type}"
    if _model is not None and _loaded_key == key:
        return _model

    logger.info("loading whisper model %s", key)
    _model = WhisperModel(
        settings.whisper_model,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute_type,
    )
    _loaded_key = key
    return _model


def transcribe_file(audio_path: Path, language: str | None = "ko") -> TranscribeResponse:
    """Blocking — callers hand this to a threadpool."""
    model = _get_model()

    segments_iter, info = model.transcribe(
        str(audio_path),
        language=None if language in (None, "auto") else language,
        task="transcribe",
        vad_filter=True,  # drop silence so long pauses don't become hallucinated text
        beam_size=5,
    )

    segments = [
        TranscriptSegment(start=s.start, end=s.end, text=s.text.strip()) for s in segments_iter
    ]

    return TranscribeResponse(
        text=" ".join(s.text for s in segments).strip(),
        segments=segments,
        duration_seconds=info.duration,
        language=info.language,
        model=settings.whisper_model,
    )


def transcribe_upload(
    data: bytes, filename: str, language: str | None = "ko"
) -> TranscribeResponse:
    """Write the upload to a temp file, transcribe it, then delete it — always."""
    suffix = Path(filename).suffix.lower() or ".m4a"
    fd, temp_path = tempfile.mkstemp(suffix=suffix, prefix="cardn_stt_")

    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        return transcribe_file(Path(temp_path), language=language)
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            logger.warning("could not delete temp audio %s", temp_path, exc_info=True)
