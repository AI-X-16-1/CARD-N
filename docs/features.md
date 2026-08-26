# Feature Ownership Table

5 people split the work by role.

## Team Members & Ownership Assignments

| Team member | Role | Frontend folder | Backend folder | Core tech |
|------|------|----------------|------------|----------|
| **강민구** | Business card scan + contacts + home | `features/scan/` `features/contacts/` `features/home/` | `features/scan/` `features/contacts/` | PaddleOCR (self-hosted, replaces Google Vision — see api-spec.md §Scan), NLP parsing, CRUD |
| **김민경** | Relationship graph | `features/graph/` | `features/graph/` | Neo4j, Cypher, SVG/Canvas graph visualization |
| **박재경** | Recording + summary | `features/conversation/` | `features/conversation/` | Whisper STT, LLM summary, audio recording |
| **이승환** | Game client | `features/game/` | `features/game/` | Battle engine, card UI, deck management |
| **문민재** | Graphic assets | — | — | ComfyUI, Krea2 (illustrations, icons) |

## Role Details

### 강민구 — Business card scan + contacts + home

**Screens**: HomeScreen, ScanCameraScreen, ScanResultScreen, CardRevealScreen, ManualInputScreen, ContactListScreen, PersonDetailScreen
**Backend**: OCR image analysis, business card text parsing, person CRUD, search, my business card management

강민구 owns both the app's data entry point (scan) and the main data (contacts), so he is responsible for the single source of truth for person data. When other team members need person data, they use 강민구's API.

**Deliverables**:
- The full flow from business card OCR to person registration
- Person list/detail/search
- Home screen (my business card, recently registered)
- `POST /api/v1/contacts` — the core API that other features depend on

**Touchpoints with other team members**:
- → 이승환: On business card registration, calls `POST /api/v1/game/cards` to request battle card creation
- → 김민경: When a person is created, the Neo4j node needs to be synced (calls 김민경's graph service)
- ← 박재경: Provides the conversation summary save API (`POST /api/v1/contacts/{id}/conversations`)
- Uses the card reveal illustrations made by 문민재 in CardRevealScreen

### 김민경 — Relationship graph

**Screens**: GraphScreen (node graph + bottom sheet)
**Backend**: Neo4j Cypher queries, N-degree relationship traversal, mutual contacts analysis, edge weight management

**Deliverables**:
- Neo4j connection setup (`backend/app/neo4j_driver.py` — a shared module, so open a PR after initial setup)
- Interactive relationship graph visualization (react-native-svg or Canvas)
- Node tap → bottom sheet (person summary + mutual contacts)
- Filtering by role, search, 1st-degree/2nd-degree display

**Touchpoints with other team members**:
- ← 강민구: Receives Neo4j node sync when a person is created/updated
- ← 박재경: Receives edge weight updates when a conversation is saved
- Navigation: Bottom sheet "Profile" → pushes to PersonDetailScreen (강민구's screen)
- → 강민구: PersonDetailScreen needs the same "소개 요청" action as GraphScreen's 1st-degree
  bottom sheet (see `ui-spec.md` §5 and `api-spec.md` "Introduction Requests"). The
  `POST/GET /graph/.../introduction-requests` endpoints are already built — this is a UI-only
  addition on 강민구's side, no new graph API needed.

**Neo4j notes**:
- Neo4j Community Edition 5.x, run locally via Docker
- Python driver: `neo4j` package (supports async)
- Keep Cypher queries centralized in `features/graph/queries.py`
- Refer to the Graph data model in `architecture.md`

### 박재경 — Recording + summary

**Screens**: ConversationRecordScreen (3 phases: record → analyze → summarize)
**Backend**: Receive audio → STT (Whisper) → LLM summary (one-liner + bullets + to-dos)

**Deliverables**:
- Real-time recording UI (waveform animation, timer, keyword chips)
- STT + LLM summary pipeline
- Summary result screen (one-line summary + key points + to-dos)

**Touchpoints with other team members**:
- → 강민구: Calls `POST /api/v1/contacts/{id}/conversations` when saving a summary
- → 김민경: Notifies Neo4j edge weight update when a conversation is saved
- Navigation: Entered from the FAB on PersonDetailScreen (강민구's screen), pops back on completion

**Privacy rule**: Raw audio must never be persisted. Delete immediately after processing.

### 이승환 — Game client

**Screens**: DeckBuilderScreen (Collection tab), BattleScreen (Battle tab), CardDetailOverlay
**Backend**: Battle card generation (stat calculation + LLM flavor text), deck management API

**Deliverables**:
- Deck builder UI (4-column grid, card detail overlay)
- Battle UI (field, hand, cost, HP bar, turn progression)
- Battle engine — implemented as pure functions in `features/game/engine/` (supports offline play)
- Enemy AI logic
- Card generation API (see `game-rules.md` for stat calculation)

**Touchpoints with other team members**:
- ← 강민구: Receives card creation requests on business card registration
- ← 문민재: Applies role-specific card illustrations to the card UI
- Battle engine rules must follow `docs/game-rules.md` exactly

### 문민재 — Graphic assets

**Work area**: Owns the `assets/` directory exclusively. Does not write code.
**Tools**: ComfyUI (card illustration generation), Krea2 (icons, UI assets)

**Deliverables**:
- 8 role-specific card illustrations (Development/Design/HR/Finance/Legal/Marketing/Sales/PM)
- 6 card-tier backgrounds/frames (★1–★6)
- App icon, tab bar icons, logo assets
- Assets for VICTORY/DEFEAT effects (optional)
- Card back pattern

**Asset delivery rules**:
- `assets/card-illustrations/` — card illustrations (used by 이승환)
- `assets/icons/` — app icons (강민구, shared)
- `assets/README.md` — write the asset naming, sizing, and format guide here
- File naming: `{job_class}_{usage}_{size}.png` (e.g. `dev_card_250.png`)
- Format: PNG (transparent background); card illustrations recommended at 250×250px

**Design token reference**: Be sure to reference the role colors in `docs/design-tokens.md` to match illustration tone

## Feature Dependency Diagram

```
       ┌──────────────┐
       │ 강민구: Scan  │
       └──────┬───────┘
              │ POST /contacts
              │ POST /game/cards
              ▼
     ┌────────────────┐         ┌───────────────────┐
     │ 강민구:         │◄────────│ 박재경:            │
     │ Contacts+Home  │ POST    │ Conversation       │
     └───────┬────────┘ /convs  └────────────────────┘
             │                           │
      GET    │                           │ edge update
      /persons                           │
             ▼                           ▼
     ┌────────────────┐         ┌────────────────┐
     │ 김민경: Graph  │◄────────│ 김민경: Graph   │
     │ (Neo4j)        │         │                │
     └────────────────┘         └────────────────┘
             ▲
      GET    │
      /cards │
     ┌───────┴────────┐         ┌────────────────┐
     │ 이승환: Game   │◄────────│ 문민재: Assets  │
     └────────────────┘ illustrations └────────────────┘
```

## Ownership of Shared Modules (shared/)

The initial setup of the shared/ directory is done by **강민구** (since he owns the most screens).
After that, any changes are proposed by any team member via PR, and merged after 2+ approvals.

### shared/ Initial Setup Checklist

- [ ] `theme/colors.ts` — based on design-tokens.md
- [ ] `theme/typography.ts` — font family, size scale
- [ ] `theme/spacing.ts` — margin/padding constants
- [ ] `components/Button.tsx` — Primary, Outline, Text variants
- [ ] `components/Avatar.tsx` — role color ring + initials
- [ ] `components/Card.tsx` — Surface-1 background, 12px radius
- [ ] `components/BottomSheet.tsx` — Surface-2/3, drag handle
- [ ] `components/Chip.tsx` — filter chip (active/inactive)
- [ ] `components/Badge.tsx` — role badge, relationship badge
- [ ] `types/person.ts` — Person, BattleCard, Conversation types
- [ ] `hooks/useApi.ts` — shared API call hook
- [ ] `utils/jobTheme.ts` — role name → color mapping utility

## Recommended Development Order

### Phase 1: Foundation (Week 1)

| Owner | Task |
|------|------|
| 강민구 | Monorepo setup, Docker Compose, initial shared/ setup, navigation structure |
| 김민경 | Neo4j Docker setup, driver connection (`neo4j_driver.py`), basic Cypher queries |
| 박재경 | STT/LLM API key setup, summary prompt design |
| 이승환 | Battle engine pure-function scaffolding (`features/game/engine/`) |
| 문민재 | Draft 8 role-specific card illustrations, write asset guide |

### Phase 2: Core Features (Weeks 2-3)

| Owner | Task |
|------|------|
| 강민구 | Camera + OCR integration + result screen + person CRUD + home screen |
| 김민경 | Relationship graph visualization + Neo4j queries (1st/2nd degree) + bottom sheet |
| 박재경 | Audio recording UI + STT integration + LLM summary pipeline |
| 이승환 | Complete battle engine + collection screen + deck builder |
| 문민재 | Card-tier frames, app icon, tab icons |

### Phase 3: Integration & Game (Weeks 4-5)

| Owner | Task |
|------|------|
| 강민구 | Batch scan, manual input, card reveal (applying 문민재's assets), search |
| 김민경 | Node interaction, filters, edge weights, mutual contacts |
| 박재경 | Real-time keywords, LLM prompt optimization, conversation-to-graph integration |
| 이승환 | Complete battle UI, enemy AI, synergy, result screen, apply assets |
| 문민재 | Final asset polish, VICTORY/DEFEAT effects |

### Phase 4: Polishing (Week 6)

| Owner | Task |
|------|------|
| Everyone | Animation polish, empty state handling, error handling |
| Everyone | Integration testing, performance optimization, presentation prep |
