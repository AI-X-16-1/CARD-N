# Feature Ownership Table

5 people split the work by role.

## Team Members & Ownership Assignments

| Team member | Role | Frontend folder | Backend folder | Core tech |
|------|------|----------------|------------|----------|
| **강민구** | Business card scan + contacts + home | `features/scan/` `features/contacts/` `features/home/` | `features/scan/` `features/contacts/` | PaddleOCR (self-hosted, replaces Google Vision — see api-spec.md §Scan), NLP parsing, CRUD |
| **김민경** | Relationship graph + incoming call alert | `features/graph/` `features/call-alert/` `modules/call-detector/` | `features/graph/` | Neo4j, Cypher, SVG/Canvas graph visualization, Android native module |
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
- ← 박재경: Receives edge weight updates when a conversation is saved. Built as
  `features/graph/conversation_sync.py` — `bump_conversation_weight(driver, person_id=...)`
  strengthens the existing (me)-[:MET_AT]-(person) edge. It is a direct import (no
  graph-owned HTTP endpoint yet, same trade-off as 강민구's `graph_sync.py`) —
  `ConversationService.save` calls it best-effort (catch and log), after it commits,
  **only on the branch that creates a new Conversation row**. `save` upserts on
  `(person_id, transcript_hash)`, so calling it on a re-summarize (row overwrite) would
  double-count the same conversation into `weight`/`conversation_count`.
  **A conversation never creates a relationship.** `ConversationSummary.mentioned_people`
  used to be resolved against contact names and turned into MET_AT edges; that was removed.
  An LLM hearing a name is not evidence two people know each other, and a wrong guess became
  a permanent edge the user was never shown and could not undo. The field stays in
  `summary_json` as inert data — do not wire it back into the graph without a UI where the
  user confirms the relationship first.

**Where contact-to-contact edges come from — open, and deliberately so**:
`contacts/graph_sync.py` writes `(me)-[MET_AT]-(contact)` and nothing else, so no edge
exists between two of my contacts, or between a contact and a non-contact. Two features
read those edges and are therefore empty:

- **공통 인맥 / mutual connections** — `_MUTUAL_CONNECTIONS_QUERY` needs
  `(mutual)-[MET_AT]-(target)`. The mention-inferred path was its only supplier, so this
  goes to zero when that is removed. A replacement is wanted.
- **2촌 / 2nd-degree** — `_SECOND_DEGREE_QUERY` additionally requires the person *not* be
  one of my own contacts, so the mention path never fed it either (it could only ever
  match people already synced from contacts). This has been structurally empty since it
  was built; the `INTRO_CONSENT` request/approve/decline endpoints and their UI all work,
  but nothing produces the underlying edge. Removing the mention path did not change this.

Any replacement supplier **must be consent-gated, not inferred**. `INTRO_CONSENT` exists
so a person chooses who sees them through whom; a mutual-connections list built without
that choice exposes the same thing the 2nd-degree privacy rule protects, via a different
screen. Design it in a PR and get it reviewed before building — "we know both of them" is
not permission to link them, which is exactly what the removed version assumed.
- Navigation: Bottom sheet "Profile" → pushes to PersonDetailScreen (강민구's screen)
- → 강민구: PersonDetailScreen needs the same "소개 요청" action as GraphScreen's 1st-degree
  bottom sheet (see `ui-spec.md` §5 and `api-spec.md` "Introduction Requests"). The
  `POST/GET /graph/.../introduction-requests` endpoints are already built — this is a UI-only
  addition on 강민구's side, no new graph API needed.

**Also owns: incoming call alert** (assigned 2026-08-27) — `features/call-alert/` and
the `modules/call-detector/` local Expo module. Picked up because the graph feature was
feature-complete and this machine already had the Android native toolchain the feature
needs. Full design in `docs/call-alert-spec.md`.
- No other feature folder changes. The alert has to work with the backend unreachable, so
  caller lookup runs on-device against a cache prefetched while the app is open — built
  from `GET /contacts` and `GET /conversations?person_id=&limit=1` exactly as they are.
- Blocked on `src/navigation/`: the consent screen and the notification's deep link both
  need routes, which is shared ground requiring its own branch and 2+ approvals.

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
- → 김민경: `ConversationService.save` calls `features/graph/conversation_sync.py`'s
  `bump_conversation_weight` after committing (best-effort — catch and log, don't fail the
  save), **only when `save` creates a new Conversation row**, not when it overwrites an
  existing one on re-summarize (same `person_id` + `transcript_hash`) — otherwise the same
  conversation gets double-counted. `summary.mentioned_people` is deliberately not passed to
  the graph; see 김민경's touchpoints above for why.
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

## Cross-cutting Proposals

Features that don't fit inside a single owner's folder go here until the team assigns
them and approves a branch/PR (same review bar as `shared/`, below).

| Proposal | Touches | Status |
|------|------|------|
| Incoming call alert — identify the caller and notify with their last conversation summary | `features/call-alert/` + `modules/call-detector/` (김민경 only — no other feature folder changes) | Assigned to 김민경 2026-08-27, implemented. Device verification and navigation wiring still open. See `docs/call-alert-spec.md`. |

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
