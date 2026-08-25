# API Specification

Base URL: `/api/v1`
Authentication: Bearer token (JWT) — required for all endpoints (may be simplified for MVP)

---

## Scan

| Method | Path | Description |
|--------|------|------|
| `POST` | `/scan/ocr` | Analyze a business card image via OCR |
| `POST` | `/scan/ocr/batch` | Batch OCR for business card images |
| `POST` | `/scan/parse` | Parse OCR results into person info via NLP |

### POST /scan/ocr

Extracts OCR text from a business card image.

```
Request: multipart/form-data
  - image: File (JPEG/PNG)

Response 200:
{
  "fields": [
    { "label": "Name", "value": "Hong Gil-dong", "confidence": 0.97 },
    { "label": "Company", "value": "Kakao", "confidence": 0.95 },
    { "label": "Title", "value": "Marketing Team, Manager", "confidence": 0.92 },
    { "label": "Mobile", "value": "010-1234-5678", "confidence": 0.61 },
    { "label": "Email", "value": "hong@kakao.com", "confidence": 0.98 }
  ],
  "raw_text": "Kakao Marketing Team Manager Hong Gil-dong ..."
}
```

### POST /scan/parse

Parses OCR fields into structured person info.

```
Request:
{
  "fields": [ ... ],  // OCR results (after user edits)
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
    "job_class": "marketing",
    "grade": 4,
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
      "last_conversation": "2024-03-15T14:00:00Z"
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
