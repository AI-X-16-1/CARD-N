from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db
from app.features.conversation.schemas import (
    ConversationListResponse,
    ConversationResponse,
    ConversationSummary,
    SaveConversationRequest,
    SummarizeRequest,
    SummarizeResponse,
    TranscribeResponse,
)
from app.features.conversation.service import ConversationService
from app.features.conversation.stt import SUPPORTED_SUFFIXES, transcribe_upload
from app.features.conversation.summarizer import PROMPT_VERSION, summarize

router = APIRouter()

# Whisper slows down roughly linearly with audio length; this keeps a stray 3-hour
# file from tying up a worker for the rest of the afternoon.
MAX_AUDIO_BYTES = 100 * 1024 * 1024
MAX_TRANSCRIPT_CHARS = 100_000


def _service(db: AsyncSession = Depends(get_db)) -> ConversationService:
    return ConversationService(db)


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"feature": "conversation", "status": "ok"}


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    audio: UploadFile = File(..., description="Recording to transcribe"),
    language: str = Form(default="ko"),
) -> TranscribeResponse:
    """Speech to text. The upload is deleted as soon as it has been transcribed."""
    suffix = Path(audio.filename or "").suffix.lower()
    if suffix and suffix not in SUPPORTED_SUFFIXES:
        raise HTTPException(
            status_code=415,
            detail=f"지원하지 않는 오디오 형식입니다 ({suffix}). "
            f"지원 형식: {', '.join(sorted(SUPPORTED_SUFFIXES))}",
        )

    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"파일이 너무 큽니다 ({len(data) / 1048576:.1f}MB). "
            f"{MAX_AUDIO_BYTES // 1048576}MB 이하로 올려주세요.",
        )

    try:
        # Whisper is blocking and CPU-bound; off the event loop it goes.
        return await run_in_threadpool(
            transcribe_upload, data, audio.filename or "audio.m4a", language
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"음성 인식에 실패했습니다: {e}") from e


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_transcript(
    data: SummarizeRequest, service: ConversationService = Depends(_service)
) -> SummarizeResponse:
    """Summarize a transcript.

    The client sends `person_id` and nothing else about the contact — the server reads
    the name, company and previous summaries out of the contacts tables and decides
    what goes into the prompt.
    """
    text = data.transcript.strip()
    if not text:
        raise HTTPException(status_code=400, detail="transcript가 비어 있습니다.")
    if len(text) > MAX_TRANSCRIPT_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"transcript가 너무 깁니다 ({len(text)}자). "
            f"{MAX_TRANSCRIPT_CHARS}자 이하로 줄여주세요.",
        )

    person_context = None
    prompt_person = None
    history: list[str] = []
    if data.person_id is not None:
        person_context, prompt_person, history = await service.build_person_context(
            data.person_id, text
        )

    try:
        result = await run_in_threadpool(summarize, text, prompt_person, history)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"요약에 실패했습니다: {e}") from e

    return SummarizeResponse(
        model=settings.gemini_model,
        prompt_version=PROMPT_VERSION,
        result=ConversationSummary.model_validate(result),
        person=person_context,
        history_used=len(history),
    )


@router.post("", response_model=ConversationResponse, status_code=201)
async def save_conversation(
    data: SaveConversationRequest, service: ConversationService = Depends(_service)
) -> ConversationResponse:
    return await service.save(data)


@router.get("", response_model=ConversationListResponse)
async def list_conversations(
    person_id: int = Query(..., description="Contact whose history to read"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    service: ConversationService = Depends(_service),
) -> ConversationListResponse:
    return await service.list_for_person(person_id, limit, offset)


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: int, service: ConversationService = Depends(_service)
) -> None:
    await service.delete(conversation_id)
