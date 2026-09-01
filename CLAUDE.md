# CLAUDE.md — CARD:N: Business Networking App

## ⚠️ Always confirm this first when a session starts

**This project is built by 5 people, each owning a separate feature.**
**Before starting any work, you must ask the user the following (in Korean, since that's how the team communicates):**

```
안녕하세요! 작업을 시작하기 전에 확인이 필요합니다.
아래 팀원 중 누구신가요?

1. 김민경 — 관계도 (Graph)
2. 박재경 — 녹음/요약 (Conversation)
3. 강민구 — 명함 인식 + 연락처 (Scan & Contacts)
4. 문민재 — 그래픽 에셋 (ComfyUI & Krea2)
5. 이승환 — 게임 클라이언트 (Game)

번호 또는 이름으로 알려주세요.
```

**Once the team member is identified, apply the rules below:**

| Member | Editable folders (FE) | Editable folders (BE) | Required reading |
|------|---------------------|---------------------|---------------|
| 김민경 (Kim Min-kyung) | `features/graph/` | `features/graph/` | architecture, design-tokens, ui-spec §4 |
| 박재경 (Park Jae-kyung) | `features/conversation/` | `features/conversation/` | ui-spec §6, api-spec §Conversation |
| 강민구 (Kang Min-gu) | `features/scan/`, `features/contacts/`, `features/home/` | `features/scan/`, `features/contacts/` | ui-spec §1-3, api-spec §Scan/Contacts |
| 문민재 (Moon Min-jae) | `assets/` | — | design-tokens (role colors, card style) |
| 이승환 (Lee Seung-hwan) | `features/game/` | `features/game/` | ui-spec §7-8, game-rules, api-spec §Game |

**Do not modify feature folders outside your own assignment.**
If a change to `shared/` is needed, open a separate branch and PR, and get approval from 2 or more people.
The same rule applies to `frontend/src/navigation/`: no single member owns it, but every member needs to touch it to register their screen, so changes there also require a separate branch/PR with approval from 2 or more people.

---

## Language Policy

- **Conversation with the team**: Korean. Always respond to the user in Korean, even though every reference document below is written in English.
- **Reference documents** (this file, `frontend/CLAUDE.md`, `backend/CLAUDE.md`, `docs/*.md`): English.
- **App UI** (what CARD:N's end users see): Korean.
- **Code, comments, identifiers**: English.

## Project Overview

**CARD:N** — From one business card to N relationships: a professional networking app combining AI business card scanning, conversation summaries, relationship graph visualization, and a card battle game.

CARD:N is a business-card-based professional networking app combined with a card battle game.
The flow: business card OCR → contact registration → conversation recording/summary → relationship graph visualization → card battle game.

## Tech Stack

- **Frontend**: React Native (Android-first), TypeScript
- **Backend**: FastAPI (Python 3.11+), async
- **Database**: MySQL (main) + Neo4j Community Edition (relationship graph)
- **AI/ML**: self-hosted PaddleOCR (business card scan; see `docs/api-spec.md`'s Scan section for why this replaced the originally-planned Google Vision API), faster-whisper STT, Google Gemini for conversation summaries and game flavor text (`google-genai`)
- **Asset**: ComfyUI, Krea2 (game card illustrations, icons)
- **Infra**: Docker Compose (local development only, no deployment)

## Monorepo Structure

```
/
├── CLAUDE.md              ← this file (AI agent entry point)
├── docs/                  ← project documentation (see below)
├── frontend/              ← React Native app
│   └── CLAUDE.md          ← frontend-specific agent instructions
├── backend/               ← FastAPI server
│   └── CLAUDE.md          ← backend-specific agent instructions
└── assets/                ← graphic assets (owned by 문민재)
    ├── card-illustrations/ ← role-based card illustrations
    ├── icons/              ← app icons, tab icons
    └── README.md           ← asset naming rules, size guide
```

## Documentation Index

Always read the relevant document before starting work.

| Document | Path | Description |
|------|------|------|
| Architecture | `docs/architecture.md` | Monorepo structure, feature folders, Neo4j setup |
| Conventions | `docs/conventions.md` | Git flow, branch/commit/PR rules, code style |
| UI Spec | `docs/ui-spec.md` | UI specification per screen |
| Design Tokens | `docs/design-tokens.md` | Color, typography, spacing, motion tokens |
| API Spec | `docs/api-spec.md` | REST API endpoints, request/response schemas |
| Feature Ownership | `docs/features.md` | 5-person role split, feature boundaries, dependencies |
| Game Rules | `docs/game-rules.md` | Card battle rules, stats, skills, AI logic |

## Working Rules

1. **Always confirm the team member at the start of a session. Do not write code without confirming.**
2. **Do not modify files outside your own feature folder.** `shared/` requires a PR review.
3. **Follow the commit message format in `docs/conventions.md` before committing.**
4. **When changing an API, update `docs/api-spec.md` in the same change.**
5. **When writing a new component, use only the tokens defined in `docs/design-tokens.md`.** No hardcoding.
6. **No deployment.** The app only needs to run in the local Docker Compose environment.
