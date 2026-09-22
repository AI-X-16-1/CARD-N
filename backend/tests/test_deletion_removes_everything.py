"""Deleting something has to delete all of it.

docs/privacy-policy.md tells people that removing a contact removes their card image and
that removing a conversation removes its summary. Both were false: the image file had no
delete path at all, and summaries were also written to .cache/summaries/ under a key
derived from the transcript — which is never stored, so nothing could find the file again.

These tests are the promise, written down. They fail if either leak comes back.
"""

import json

from fastapi.testclient import TestClient

from app.core import image_store
from app.features.conversation import summarizer


def _create_person(client: TestClient, **overrides) -> dict:
    payload = {"name": "홍길동", "company": "카카오", "job_class": "dev", "relation": "other"}
    payload.update(overrides)
    response = client.post("/api/v1/contacts", json=payload)
    assert response.status_code == 201
    return response.json()


def _png_bytes() -> bytes:
    """A one-pixel PNG — enough to be a real upload without pulling in Pillow here."""
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
        b"\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05"
        b"\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )


# ─────────────────────────────────────────────────────────────
# Card images
# ─────────────────────────────────────────────────────────────


def test_deleting_a_contact_deletes_their_card_image(
    client: TestClient, tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr(image_store, "STORAGE_ROOT", tmp_path)
    monkeypatch.setattr(image_store, "PERSONS_DIR", tmp_path / "persons")
    monkeypatch.setattr(image_store, "STAGING_DIR", tmp_path / "staging", raising=False)

    token = image_store.stage_image(_png_bytes())
    assert token is not None
    created = _create_person(client, image_token=token)

    stored = image_store.PERSONS_DIR / f"{created['id']}.jpg"
    assert stored.exists(), "the contact should have a saved image to begin with"

    assert client.delete(f"/api/v1/contacts/{created['id']}").status_code == 204

    assert not stored.exists(), "the card photo outlived the contact"


def test_deleting_a_contact_without_an_image_is_fine(client: TestClient) -> None:
    """A contact added by hand never had one. Deletion must not care."""
    created = _create_person(client)

    assert client.delete(f"/api/v1/contacts/{created['id']}").status_code == 204


def test_a_filesystem_error_does_not_fail_the_deletion(monkeypatch, tmp_path) -> None:
    """The row is what the app reads. A stray file is worth a log line, not a 500 that
    sends the user back to delete a contact that is already gone.
    """
    monkeypatch.setattr(image_store, "PERSONS_DIR", tmp_path)

    def explode(self, missing_ok=False):
        raise OSError("disk said no")

    monkeypatch.setattr("pathlib.Path.unlink", explode)

    image_store.delete_person_image("7.jpg")  # must not raise


# ─────────────────────────────────────────────────────────────
# Summary cache
# ─────────────────────────────────────────────────────────────


def test_summaries_are_never_written_to_disk(tmp_path, monkeypatch) -> None:
    """The cache used to be one JSON file per summary, holding the summary text and the
    names it mentions, with nothing able to delete them afterwards.
    """
    summarizer.clear_cache()
    calls: list[str] = []

    def fake_llm(prompt: str) -> str:
        calls.append(prompt)
        return json.dumps({"one_line": "요약", "key_points": [], "mentioned_people": []})

    monkeypatch.setattr(summarizer, "_call_llm", fake_llm)
    monkeypatch.chdir(tmp_path)

    summarizer.summarize("오늘 만난 이야기", person={"name": "홍길동"})

    written = [p for p in tmp_path.rglob("*") if p.is_file()]
    assert written == [], f"summaries reached the filesystem: {written}"


def test_the_cache_still_saves_a_second_call_for_the_same_prompt(monkeypatch) -> None:
    """Dropping the disk cache must not mean paying Gemini twice for one recording."""
    summarizer.clear_cache()
    calls: list[str] = []

    def fake_llm(prompt: str) -> str:
        calls.append(prompt)
        return json.dumps({"one_line": "요약", "key_points": [], "mentioned_people": []})

    monkeypatch.setattr(summarizer, "_call_llm", fake_llm)

    summarizer.summarize("같은 대화", person={"name": "홍길동"})
    summarizer.summarize("같은 대화", person={"name": "홍길동"})

    assert len(calls) == 1


def test_a_cached_summary_cannot_be_mutated_through_the_cache(monkeypatch) -> None:
    summarizer.clear_cache()
    monkeypatch.setattr(
        summarizer,
        "_call_llm",
        lambda prompt: json.dumps({"one_line": "원본", "key_points": []}),
    )

    first = summarizer.summarize("대화", person=None)
    first["one_line"] = "덮어썼다"
    second = summarizer.summarize("대화", person=None)

    assert second["one_line"] == "원본"


def test_the_cache_does_not_grow_without_bound(monkeypatch) -> None:
    """It lives for the process now, so it needs a ceiling."""
    summarizer.clear_cache()
    monkeypatch.setattr(summarizer, "_call_llm", lambda prompt: json.dumps({"one_line": "요약"}))

    for i in range(summarizer._CACHE_LIMIT + 20):
        summarizer.summarize(f"대화 {i}", person=None)

    assert len(summarizer._cache) <= summarizer._CACHE_LIMIT


def test_the_old_on_disk_cache_is_gone_for_good() -> None:
    """The directory constant was the whole mechanism. Bringing it back brings back a
    summary file nothing can delete, so name it here and let the failure say why.
    """
    assert not hasattr(summarizer, "CACHE_DIR")
