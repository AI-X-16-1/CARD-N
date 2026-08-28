from unittest.mock import patch

from fastapi.testclient import TestClient

from app.features.scan.ocr.pipeline import OcrPipelineResult

_EMPTY_FIELDS = {
    "company": None,
    "name": None,
    "title": None,
    "department": None,
    "phone": None,
    "address": None,
    "postal_code": None,
    "region": None,
    "email": None,
}


def _mock_result(**fields) -> OcrPipelineResult:
    # image_bytes="" -> stage_image() short-circuits to no-op (no file written), so
    # these tests don't touch the real storage/ directory.
    return OcrPipelineResult(
        fields={**_EMPTY_FIELDS, **fields}, etc=[], raw_lines=["line1", "line2"], image_bytes=b""
    )


def test_scan_ocr_happy_path(client: TestClient) -> None:
    with patch(
        "app.features.scan.service.extract_business_card",
        return_value=_mock_result(name="Hong Gil-dong", company="Kakao"),
    ):
        response = client.post(
            "/api/v1/scan/ocr",
            files={"image": ("card.jpg", b"fake-image-bytes", "image/jpeg")},
        )

    assert response.status_code == 200
    body = response.json()
    labels = {f["label"]: f["value"] for f in body["fields"]}
    assert labels["Name"] == "Hong Gil-dong"
    assert labels["Company"] == "Kakao"
    assert body["raw_text"] == "line1\nline2"


def test_scan_ocr_includes_unrecognized_fields_for_manual_entry(client: TestClient) -> None:
    # ScanResultScreen needs every column present even when OCR found nothing for it,
    # so the user can type a missing value in by hand instead of that column just
    # being absent from the review list.
    with patch(
        "app.features.scan.service.extract_business_card",
        return_value=_mock_result(name="Hong Gil-dong"),
    ):
        response = client.post(
            "/api/v1/scan/ocr",
            files={"image": ("card.jpg", b"fake-image-bytes", "image/jpeg")},
        )

    assert response.status_code == 200
    fields = {f["label"]: f for f in response.json()["fields"]}
    assert len(fields) == 9
    assert fields["Company"]["value"] == ""
    assert fields["Company"]["confidence"] == 0.0
    assert fields["Name"]["value"] == "Hong Gil-dong"
    assert fields["Name"]["confidence"] > 0.9


def test_scan_ocr_batch_happy_path(client: TestClient) -> None:
    with patch(
        "app.features.scan.service.extract_business_card",
        return_value=_mock_result(name="Kim Cheol-su"),
    ):
        response = client.post(
            "/api/v1/scan/ocr/batch",
            files=[
                ("images", ("card1.jpg", b"fake-1", "image/jpeg")),
                ("images", ("card2.jpg", b"fake-2", "image/jpeg")),
            ],
        )

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["filename"] for item in items] == ["card1.jpg", "card2.jpg"]
    assert all(any(f["label"] == "Name" for f in item["fields"]) for item in items)


def test_scan_ocr_invalid_image_returns_400(client: TestClient) -> None:
    with patch(
        "app.features.scan.service.extract_business_card",
        side_effect=ValueError("cannot identify image"),
    ):
        response = client.post(
            "/api/v1/scan/ocr",
            files={"image": ("not-an-image.txt", b"not an image", "text/plain")},
        )

    assert response.status_code == 400


def test_scan_parse_maps_fields_to_person(client: TestClient) -> None:
    response = client.post(
        "/api/v1/scan/parse",
        json={
            "fields": [
                {"label": "Name", "value": "Hong Gil-dong"},
                {"label": "Company", "value": "Kakao"},
                {"label": "Mobile", "value": "010-1234-5678"},
            ],
            "context": "Networking event",
        },
    )

    assert response.status_code == 200
    person = response.json()["person"]
    assert person["name"] == "Hong Gil-dong"
    assert person["company"] == "Kakao"
    assert person["phone"] == "010-1234-5678"
    assert person["context"] == "Networking event"
