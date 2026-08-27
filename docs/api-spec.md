# API Specification

Base URL: `/api/v1`
Authentication: Bearer token (JWT) — required for all endpoints (may be simplified for MVP)

---

## Scan

**Engine note**: implemented with a self-hosted **PaddleOCR** pipeline (card contour
detection + perspective correction, then regex/heuristic field classification), not the
Google Vision API originally referenced in `CLAUDE.md`. See
`backend/app/features/scan/ocr/` (ported from a validated prototype — field-type
accuracy: name 97-99%, title 91-96%, company 93-98%, phone 94-99%, address 86-100%,
email 88-92%, department 76-97%).

Because the field classifier does not produce a per-instance confidence score, `confidence`
below is a fixed value per field *type*, taken from the accuracy figures above (this is what
drives the >=90% "needs review" split in `ui-spec.md` §3-2 — a field type with historically
lower accuracy, e.g. `department`, is more likely to land below the threshold even when this
particular read is correct).

`job_class`/`grade` (used by 이승환's card generation) are **not** produced by `/scan/parse` —
classifying role/seniority from title/department text isn't part of the ported field
classifier and hasn't been implemented yet.

| Method | Path | Description |
|--------|------|------|
| `POST` | `/scan/ocr` | Analyze a business card image via OCR |
| `POST` | `/scan/ocr/batch` | Batch OCR for business card images |
| `POST` | `/scan/parse` | Reshape user-edited OCR fields into a structured person record |

### POST /scan/ocr

Extracts OCR text from a business card image.

```
Request: multipart/form-data
  - image: File (JPEG/PNG)

Response 200:
{
  "fields": [
    { "label": "Name", "value": "Hong Gil-dong", "confidence": 0.98 },
    { "label": "Company", "value": "Kakao", "confidence": 0.955 },
    { "label": "Title", "value": "Manager", "confidence": 0.935 },
    { "label": "Department", "value": "Marketing Team", "confidence": 0.865 },
    { "label": "Mobile", "value": "010-1234-5678", "confidence": 0.965 },
    { "label": "Email", "value": "hong@kakao.com", "confidence": 0.90 }
  ],
  "raw_text": "Kakao\nMarketing Team Manager\nHong Gil-dong\n..."
}
```

Only fields the pipeline actually found a value for are included (no null entries).
`address`/`postal_code`/`region` appear the same way when present on the card.

### POST /scan/ocr/batch

Same per-field shape as `/scan/ocr`, run over multiple images (multiple business cards
photographed one after another in batch mode — not multiple cards in a single photo).

```
Request: multipart/form-data
  - images: File[] (JPEG/PNG)

Response 200:
{
  "items": [
    { "filename": "IMG_0001.jpg", "fields": [ ... ], "raw_text": "..." },
    { "filename": "IMG_0002.jpg", "fields": [ ... ], "raw_text": "..." }
  ]
}
```

### POST /scan/parse

Reshapes the OCR fields (after the user reviews/edits them on ScanResultScreen) into a
structured person record.

```
Request:
{
  "fields": [ ... ],  // OCR results (after user edits), same {label, value} shape
  "context": "Met at the 2024 AI Conference"
}

Response 200:
{
  "person": {
    "name": "Hong Gil-dong",
    "company": "Kakao",
    "department": "Marketing Team",
    "title": "Manager",
    "phone": "010-1234-5678",
    "email": "hong@kakao.com",
    "address": null,
    "context": "Met at the 2024 AI Conference"
  }
}
```

---

## Contacts

| Method | Path | Description |
|--------|------|------|
| `GET` | `/contacts` | Retrieve list of contacts |
| `POST` | `/contacts` | Register a contact |
| `GET` | `/contacts/{id}` | Retrieve contact details |
| `PUT` | `/contacts/{id}` | Update a contact |
| `DELETE` | `/contacts/{id}` | Delete a contact |
| `GET` | `/contacts/me` | Retrieve my business card |
| `PUT` | `/contacts/me` | Update my business card |

### GET /contacts

```
Query params:
  - q: string (search by name, company, tag)
  - category: enum (all, client, partner, networking, other)
  - limit: int (default 20)
  - offset: int (default 0)

Response 200:
{
  "total": 42,
  "items": [
    {
      "id": 1,
      "name": "Hong Gil-dong",
      "company": "Kakao",
      "department": "Marketing Team",
      "title": "Manager",
      "job_class": "marketing",
      "relation": "client",
      "last_contact": "2024-03-15T09:00:00Z",
      "conversation_count": 3,
      "created_at": "2024-01-10T14:30:00Z"
    }
  ]
}
```

### Conversation history

Moved to the Conversation section: `POST /conversations`, `GET /conversations?person_id=`,
`DELETE /conversations/{conversation_id}`. Conversation records are owned by the
conversation feature, whose router they live on.

Saving a conversation updates this contact's `last_contact`.

### GET /contacts/me, PUT /contacts/me

A single row (`my_card`, one owner — there's no multi-user auth in this app). `title`
was replaced by `department` / `grade` / `job_function` (mirrors the same split on
`Person`) and `address` was added for the home screen's QR code (see `docs/ui-spec.md`).

```
Response 200 (GET), and PUT's response after applying the request body:
{
  "name": "Kang Min-gu",
  "company": "CARD:N",
  "department": "Engineering",
  "grade": "Backend",
  "job_function": "Server",
  "phone": "010-1234-5678",
  "email": "me@cardn.app",
  "address": "Seoul",
  "updated_at": "2024-03-15T09:00:00Z"
}

PUT request body: same shape minus `updated_at`, all fields but `name` optional.
```

### Note: no lookup-by-phone endpoint

An earlier draft of the incoming-call-alert feature specified
`GET /contacts/by-phone`. It was dropped: the alert must work when the backend is
unreachable, so caller lookup happens on the device against a cache prefetched from
`GET /contacts` while the app is open. See `docs/call-alert-spec.md`.

Worth recording if one is ever needed: `Person.phone` is an `EncryptedString` (Fernet)
column, and Fernet uses a random IV per encryption, so the same number becomes different
ciphertext every time — `WHERE phone = ?` can never match and no index helps. Such an
endpoint would have to either decrypt-and-scan, or add an indexed blind-index column
(`HMAC-SHA256(normalize(phone), key)`) alongside the encrypted value.

---

## Graph

| Method | Path | Description |
|--------|------|------|
| `GET` | `/graph` | Full relationship graph data |
| `GET` | `/graph/{person_id}/connections` | Connections for a specific person |
| `GET` | `/graph/{person_id}/mutual` | Retrieve mutual connections |
| `GET` | `/graph/stats` | Relationship graph statistics (1st-degree/2nd-degree counts, etc.) |
| `POST` | `/graph/{person_id}/introduction-requests` | Request a 1st-degree contact's permission to be shown as a 2nd-degree connection to their network |
| `GET` | `/graph/{person_id}/introduction-requests` | Status of my own outgoing request toward this one person |
| `GET` | `/graph/introduction-requests` | List incoming introduction requests awaiting my approval |
| `POST` | `/graph/introduction-requests/{person_id}/approve` | Approve an incoming introduction request |
| `POST` | `/graph/introduction-requests/{person_id}/decline` | Decline an incoming introduction request |

**Privacy rule**: a 2nd-degree person is, by definition, someone I have never met — I only know them through a 1st-degree contact. Their name/company/job_class must never be exposed to me without their own consent. `GET /graph` therefore only returns a candidate as a 2nd-degree node if they have an **approved** introduction request through the connecting 1st-degree contact (see "Introduction Requests" below). Until approved, that person is invisible to me — not shown with a placeholder, not counted in `stats.degree_2_count`.

### GET /graph

```
Query params:
  - depth: int (1 or 2, default 1)
  - job_filter: string (dev, marketing, design, ... or all)

Response 200:
{
  "nodes": [
    {
      "id": 0,
      "type": "me",
      "name": "Me",
      "job_class": null
    },
    {
      "id": 1,
      "type": "person",
      "name": "Hong Gil-dong",
      "job_class": "marketing",
      "company": "Kakao",
      "degree": 1,
      "conversation_count": 3,
      "last_conversation": "2024-03-15T14:00:00Z",
      "introduction_request_status": null
    }
  ],
  "edges": [
    {
      "source": 0,
      "target": 1,
      "weight": 3,
      "last_interaction": "2024-03-15T14:00:00Z"
    }
  ],
  "stats": {
    "degree_1_count": 15,
    "degree_2_count": 3
  }
}
```

`introduction_request_status` on a degree-1 node is *my own* outgoing request status toward that
contact (`null` | `"pending"` | `"approved"` | `"declined"`) — see "Introduction Requests" below.
Always `null` for degree-2 nodes.

### GET /graph/{person_id}/mutual

```
Response 200:
{
  "person_id": 1,
  "mutual_connections": [
    {
      "id": 5,
      "name": "Kim Design",
      "company": "Kakao",
      "job_class": "design"
    }
  ]
}
```

**Open: nothing currently populates this.** A mutual connection requires a `MET_AT`
edge between two people who are not me, and the only edge-creating code
(`contacts/graph_sync.py`) writes `(me)-[MET_AT]-(contact)` and nothing else. The one
path that used to write contact-to-contact edges inferred them from names an LLM heard
in a conversation, and was removed — see `features.md`'s 김민경 touchpoints.

Whatever replaces it **must be consent-gated, not inferred**. The point of the
`INTRO_CONSENT` machinery below is that a person decides who gets to see them through
whom; a mutual-connections list assembled without that decision leaks the same
information the 2nd-degree privacy rule above exists to protect, just through a
different screen. Any proposal here needs review before implementation — treating "we
know both of them" as permission to link them is the mistake that got the previous
version removed.

### Introduction Requests

Lets a person opt in to being surfaced as a 2nd-degree connection through a specific 1st-degree
contact, instead of every 1st-degree contact's network being exposed by default. Two people must
consent for a 2nd-degree edge to appear in `GET /graph`:

- **Me** (the person who wants wider visibility, e.g. sales/BD roles) sends the request.
- **The 1st-degree contact** who would be doing the introducing must approve it before their own
  1st-degree network can see me.

Requires an existing `MET_AT` connection between the two people (you can only ask a contact you
already know to introduce you — not a stranger).

#### POST /graph/{person_id}/introduction-requests

```
Path params:
  - person_id: the 1st-degree contact I'm asking to introduce me

Response 201:
{
  "person_id": 3,
  "status": "pending",
  "requested_at": "2024-03-20T10:00:00Z"
}

Errors:
  409 ALREADY_REQUESTED   - a pending or already-approved request exists for this person
  404 NOT_FIRST_DEGREE    - person_id is not one of my 1st-degree contacts
```

#### GET /graph/{person_id}/introduction-requests

Reads back my own outgoing request toward one person. Same path as the POST — at most one
request exists between me and a given person. Distinct from `GET /graph/introduction-requests`
(no `person_id`), which is the inbox of requests other people sent *me*.

Added for screens that show a single person: `PersonDetailScreen` previously had to fetch the
whole depth-1 graph and pick `introduction_request_status` off the matching node, because this
endpoint did not exist.

```
Path params:
  - person_id: the contact whose request state I want

Response 200:
{
  "person_id": 3,
  "status": "pending",          // null when I have never asked
  "requested_at": "2024-03-20T10:00:00Z",
  "responded_at": null
}
```

`status` is `null` rather than a 404 when no request has been made — not having asked is a
normal state the UI renders as the default row, not an error. A `person_id` that isn't a
1st-degree contact returns the same `null` shape, so this endpoint never reveals whether an
arbitrary id exists.

#### GET /graph/introduction-requests

Incoming requests from people who want *me* to introduce them to my own 1st-degree network.

```
Response 200:
{
  "requests": [
    {
      "person_id": 7,
      "name": "Hong Gil-dong",
      "company": "Kakao",
      "job_class": "sales",
      "requested_at": "2024-03-20T10:00:00Z"
    }
  ]
}
```

#### POST /graph/introduction-requests/{person_id}/approve

```
Response 200:
{
  "person_id": 7,
  "status": "approved",
  "responded_at": "2024-03-21T09:00:00Z"
}
```

#### POST /graph/introduction-requests/{person_id}/decline

```
Response 200:
{
  "person_id": 7,
  "status": "declined",
  "responded_at": "2024-03-21T09:00:00Z"
}
```

**Neo4j model**: a new `INTRO_CONSENT` relationship, separate from `MET_AT` so approval state never
touches conversation-count bookkeeping.

```cypher
(:Person)-[:INTRO_CONSENT {status: "pending" | "approved" | "declined", requested_at, responded_at}]->(:Person)
```

`(A)-[:INTRO_CONSENT]->(B)` reads as "A asked B to introduce A to B's network." `GET /graph`'s
2nd-degree query only follows edges where `status = "approved"`.

**Note on auth**: these endpoints resolve "me" the same way `GET /graph` currently does (MVP's
hardcoded single-user id, see `backend/app/features/graph/queries.py`). The `approve`/`decline`
endpoints assume the caller is authenticated as the target 1st-degree contact — this becomes
meaningful once real per-user auth lands; until then, treat this as the documented contract to
implement against, not something end-to-end testable with two live accounts in the local MVP.

---

## Conversation

| Method | Path | Description |
|--------|------|------|
| `POST` | `/conversations/transcribe` | Upload a recording → transcript (STT) |
| `POST` | `/conversations/summarize` | Transcript → LLM summary |
| `POST` | `/conversations` | Save a summary to a contact's timeline |
| `GET` | `/conversations?person_id=` | Read a contact's conversation history |
| `DELETE` | `/conversations/{conversation_id}` | Delete one saved conversation |
| `POST` | `/conversations/guide` | In-app guide chatbot (app usage Q&A) |

### GET /conversations?person_id=

Documenting the existing shape — this endpoint was already implemented with paging;
the earlier draft of `docs/call-alert-spec.md` wrongly proposed adding `limit` to it.
Results are ordered newest-first, so `?person_id={id}&limit=1` returns just the latest
summary (which is what the incoming-call-alert feature uses).

```
Query params:
  - person_id: int (required)
  - limit: int (default 20, 1..100)
  - offset: int (default 0)

Response 200:
{
  "total": 3,
  "items": [
    {
      "id": 15,
      "person_id": 1,
      "one_liner": "토스 김서연 디자이너와 온보딩 개편 초안 공유 및 일정 논의",
      "summary": { ... the `result` object from /conversations/summarize ... },
      "duration_seconds": 372,
      "recorded_at": "2026-08-26T14:00:00",
      "created_at": "2026-08-26T14:06:11"
    }
  ]
}
```

STT and summarization are two calls rather than the single `/conversations/upload` this
spec originally described. Splitting them lets the user fix a misheard word — a person's
name especially — before it reaches the summarizer, which is the cheapest available way
to improve summary quality. It also keeps a slow Whisper pass from being retried whenever
only the LLM step failed.

### POST /conversations/transcribe

Whisper runs server-side (`faster-whisper`), so the Android app and the web build share
one code path.

```
Request: multipart/form-data
  - audio: File (m4a / mp3 / wav / webm / ogg / flac / mp4 / aac, max 100MB)
  - language: string (default "ko"; "auto" to detect)

Response 200:
{
  "text": "안녕하세요. 지난번 컨퍼런스에서 뵀던 온보딩 개편 건 말인데요. ...",
  "segments": [
    { "start": 0.0, "end": 2.0, "text": "안녕하세요." },
    { "start": 2.0, "end": 7.4, "text": "지난번 컨퍼런스에서 뵀던 온보딩 개편 건 말인데요." }
  ],
  "duration_seconds": 17.1,
  "language": "ko",
  "model": "small"
}
```

**Note**: the audio is written to a temp file, transcribed, and deleted in a `finally`
block. It is never persisted, and neither is the transcript.

### POST /conversations/summarize

```
Request:
{
  "transcript": "...",
  "person_id": 1,          // optional
  "duration_seconds": 372  // optional
}

Response 200:
{
  "model": "gemini-3.5-flash-lite",
  "prompt_version": "v1",
  "result": {
    "one_line": "토스 김서연 디자이너와 온보딩 개편 초안 공유 및 일정 논의",
    "key_points": ["토스 측에서 온보딩 개편 초안을 공유함", "..."],
    "mentioned_people": [
      { "name": "박준호", "relation": "개발 담당 연구원", "confidence": 0.95 }
    ],
    "keywords": ["온보딩", "피그마", "법무검토"]
  },
  "person": {
    "id": 1, "name": "김서연", "company": "토스",
    "title": "프로덕트 디자이너", "meet_count": 3
  },
  "history_used": 2
}
```

The client sends `person_id` and nothing else about the contact. The server reads the
name, company and the previous summaries out of its own tables and decides what goes
into the prompt, so conversation history never travels through the client. `person` and
`history_used` echo back what was actually used.

`mentioned_people` are third parties named during the conversation. `confidence` is the
model's own estimate of whether it heard the name correctly; the UI flags anything under
0.7. They are stored and displayed only — saving a conversation never turns them into
relationship-graph edges. That was built and then removed: a name the model heard is not
evidence two people know each other, and a wrong guess became a permanent edge that was
never surfaced to the user. Any future use needs the user to confirm the relationship.

The summary deliberately carries no to-do list and no "what to raise next time" hints.
Both were dropped after review: on real recordings they were the parts most prone to
being invented, and neither had a screen that acted on them.

### POST /conversations

```
Request:
{
  "person_id": 1,
  "transcript": "...",   // hashed only, never stored
  "summary": { ...the `result` object above... },
  "duration_seconds": 372,
  "recorded_at": "2026-08-26T14:00:00"   // optional, defaults to now
}

Response 201:
{
  "id": 15,
  "person_id": 1,
  "one_liner": "토스 김서연 디자이너와 온보딩 개편 초안 공유 및 일정 논의",
  "summary": { ... },
  "duration_seconds": 372,
  "recorded_at": "2026-08-26T14:00:00",
  "created_at": "2026-08-26T14:06:11"
}
```

`transcript` is only fingerprinted (SHA-256, first 32 hex chars) and then discarded.
Saving the same recording twice updates the existing row instead of adding a second one,
so pressing "요약하기" again cannot turn a 4th meeting into a 5th.

Saving also sets the contact's `last_contact`.

**Note**: this replaces the originally specced `/contacts/{id}/conversations`. Conversation
history is owned by the conversation feature, and `features/*` may not add routes to
another feature's router (backend/CLAUDE.md).

### POST /conversations/guide

The in-app guide chatbot — answers "how do I use CARD:N" in Korean.

```
Request:
{
  "messages": [
    { "role": "assistant", "content": "CARD:N 사용법을 안내해 드려요. 궁금한 걸 물어보세요." },
    { "role": "user", "content": "명함 어떻게 등록해?" }
  ]
}

Response 200:
{
  "reply": "1. 하단 가운데 보라색 동그란 버튼을 누르면 카메라가 열립니다.
2. ...",
  "model": "gemini-3.5-flash-lite"
}
```

Stateless — nothing is written, and no session is kept server-side. The client owns the
transcript and sends the whole visible conversation each turn, oldest first; the last
message must be `role: "user"` or the call is a 400. Only the last 12 turns reach the
model, and each message is capped at 500 characters.

The prompt contains a hand-maintained summary of the app's screens and flows
(`guide.py`'s `KNOWLEDGE`) and nothing else. **No contact, conversation or graph data is
ever put in it**, so the bot cannot answer "who in my network is a developer" — it is
told to say so and point at the 목록 tab instead. Keep `KNOWLEDGE` in sync with
`docs/ui-spec.md` when a flow changes, and with what the code actually does when the two
disagree.

Failures come back as 502 with the reason in `detail` (missing/rejected API key, quota,
repeated empty answers).

---

## Game

| Method | Path | Description |
|--------|------|------|
| `GET` | `/game/cards` | List of owned cards |
| `POST` | `/game/cards` | Create a battle card (called when a business card is registered) |
| `GET` | `/game/cards/{id}` | Card details |
| `GET` | `/game/deck` | Current deck configuration |
| `PUT` | `/game/deck` | Update deck configuration |
| `POST` | `/game/cards/{id}/flavor` | Regenerate flavor text |

### POST /game/cards

Generates a battle card based on person info.

```
Request:
{
  "person_id": 1
}

Response 201:
{
  "id": 10,
  "person_id": 1,
  "name": "Hong Gil-dong",
  "company": "Kakao",
  "job_class": "marketing",
  "job_label": "Influencer",
  "grade": 4,
  "grade_label": "Manager",
  "stars": 4,
  "cost": 4,
  "base_stats": { "atk": 7, "def": 3, "int": 6, "hp": 10 },
  "final_stats": { "atk": 9, "def": 4, "int": 8, "hp": 13 },
  "skill": {
    "name": "Campaign",
    "cost": 2,
    "description": "+2 ATK to all allies"
  },
  "passive": "Viral",
  "flavor_text": "Make the trend, ride the trend, get buried in the trend",
  "created_at": "2024-01-10T14:30:00Z"
}
```

### PUT /game/deck

```
Request:
{
  "card_ids": [10, 3, 7, 15, 22]  // max 8 cards
}

Response 200:
{
  "card_ids": [10, 3, 7, 15, 22],
  "count": 5,
  "max": 8,
  "avg_cost": 3.2
}
```

---

## Common Error Response

```
{
  "detail": "Error message",
  "code": "ERROR_CODE"
}
```

| Status | Code | Description |
|--------|------|------|
| 400 | `INVALID_REQUEST` | Invalid request |
| 401 | `UNAUTHORIZED` | Authentication required |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `DUPLICATE` | Duplicate (e.g., duplicate business card detected) |
| 413 | `FILE_TOO_LARGE` | File size exceeded |
| 422 | `VALIDATION_ERROR` | Validation failed |
| 500 | `INTERNAL_ERROR` | Internal server error |
