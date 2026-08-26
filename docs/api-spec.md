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
| `GET` | `/contacts/{id}/conversations` | Retrieve conversation history |
| `POST` | `/contacts/{id}/conversations` | Save conversation history |
| `DELETE` | `/contacts/{id}/conversations/{conv_id}` | Delete conversation history |
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

### POST /contacts/{id}/conversations

Saves a conversation summary to the contact's timeline.

```
Request:
{
  "one_liner": "Discussed Q4 marketing budget and influencer campaign direction",
  "bullets": [
    "Reviewing a 15% increase to the Q4 budget",
    "Recruiting 3 influencers in progress",
    "Confirmed November launch schedule"
  ],
  "todos": [
    "Deliver proposal draft by Friday"
  ],
  "duration_seconds": 1800,
  "recorded_at": "2024-03-15T14:00:00Z"
}

Response 201:
{
  "id": 15,
  "person_id": 1,
  "one_liner": "...",
  "bullets": [...],
  "todos": [...],
  "duration_seconds": 1800,
  "recorded_at": "...",
  "created_at": "..."
}
```

---

## Graph

| Method | Path | Description |
|--------|------|------|
| `GET` | `/graph` | Full relationship graph data |
| `GET` | `/graph/{person_id}/connections` | Connections for a specific person |
| `GET` | `/graph/{person_id}/mutual` | Retrieve mutual connections |
| `GET` | `/graph/stats` | Relationship graph statistics (1st-degree/2nd-degree counts, etc.) |
| `POST` | `/graph/{person_id}/introduction-requests` | Request a 1st-degree contact's permission to be shown as a 2nd-degree connection to their network |
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
| `POST` | `/conversations/upload` | Upload recording file → STT + summary |
| `POST` | `/conversations/summarize` | Direct text input → summary |

### POST /conversations/upload

Receives an audio file, converts it via STT, then generates an LLM summary.

```
Request: multipart/form-data
  - audio: File (WAV/M4A/OGG)
  - person_id: int

Response 200:
{
  "transcript": "...",  // STT result (for client display only, not stored)
  "summary": {
    "one_liner": "Discussed Q4 marketing budget and influencer campaign direction",
    "bullets": [
      "Reviewing a 15% increase to the Q4 budget",
      "Recruiting 3 influencers in progress",
      "Confirmed November launch schedule"
    ],
    "todos": [
      "Deliver proposal draft by Friday"
    ],
    "keywords": ["Q4 budget", "proposal request", "November launch", "influencer recruitment"]
  },
  "duration_seconds": 1800
}
```

**Note**: Audio files are deleted immediately after processing. They are not persisted on the server.

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
