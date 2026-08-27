# Game DB — design

Persist the card battle feature: a card collection derived from contacts,
a saved deck, and flavor-text regeneration. Backend owns card generation
and stores a snapshot; the frontend stops using `createMockCollection()`.

## Decisions (agreed 2026-08-27)

1. **Backend computes and snapshots** each card's grade/stats/skill/passive
   into `battle_cards` (JSON columns). A later edit to the person's title
   does not silently re-roll the card.
2. **Collection = my contacts.** Every `persons` row gets exactly one
   `battle_cards` row, created lazily on first `GET /game/cards`.
3. **All 6 api-spec endpoints** are implemented.

No auth in this project → collection and deck are global (single player).

## Schema

### `battle_cards`
| column | type | notes |
|---|---|---|
| `id` | INT PK autoinc | |
| `person_id` | INT, FK `persons.id`, **UNIQUE**, `ON DELETE CASCADE` | one card per contact |
| `job_class` | VARCHAR(20) | snapshot; one of the 8, `pm` if the person's `job_class` is null/unknown |
| `grade` | INT (1–6) | derived from `persons.title` at creation (see map); `1` if unknown |
| `cost` | INT | from `GRADE_TABLE[grade]` |
| `base_stats` | JSON | `{atk,def,int,hp}` — `BASE_STATS[job_class]` |
| `final_stats` | JSON | `floor(base * multiplier)` |
| `skill` | JSON | `{name,cost,description}` — `SKILL[job_class]` |
| `passive` | VARCHAR(50) | `PASSIVE[job_class]` name |
| `flavor_text` | TEXT | starts as `FLAVOR_TEXT[job_class]`; `POST .../flavor` replaces it |
| `created_at` | DATETIME | `server_default=now()` |

### `game_deck`
Single row, `id = 1`.
| column | type | notes |
|---|---|---|
| `id` | INT PK | always 1 |
| `card_ids` | JSON | ordered list of `battle_cards.id`, length ≤ 8; position-stable |
| `updated_at` | DATETIME | |

`PUT /game/deck` overwrites `card_ids`. Frontend `deckSlots` (8 fixed slots)
maps to this list left-to-right; trailing `null`s are dropped on save.

## Grade from title (`grade_from_title`)

Case-insensitive substring match, first hit wins, checked ★6 → ★1.
Unknown / null title → **★1**.

| ★ | Korean keywords | English keywords |
|---|---|---|
| 6 | 대표, 사장, 회장, 총괄, 창업 | ceo, founder, president, owner |
| 5 | 부사장, 전무, 상무, 이사, 본부장, 실장 | cto, cfo, coo, vp, vice president, director, head of |
| 4 | 부장, 팀장, 파트장, 그룹장 | manager, lead, principal |
| 3 | 차장, 과장, 대리, 선임, 책임 | senior, staff engineer |
| 2 | 사원, 주임, 전임 | associate, junior, member |
| 1 | 인턴, 수습, 사원(only if nothing above) | intern, trainee |

(Table lives in `card_builder.py` as an ordered list of `(grade, [keywords])`.)

## Card generation — `app/features/game/card_builder.py`

Python port of `frontend/src/features/game/engine/cardData.ts`:
`BASE_STATS`, `GRADE_TABLE` (cost + multiplier), `SKILL`, `PASSIVE`,
`FLAVOR_TEXT`, `JOB_CLASSES`. Pure functions:
- `resolve_job_class(person.job_class) -> str`
- `grade_from_title(title) -> int`
- `scale_stats(base, multiplier) -> dict`  (`floor`, matches TS)
- `build_snapshot(person) -> dict`  → the column values above

These constants are duplicated from the TS engine on purpose (the two
runtimes can't share code); a comment in each file points at the other.

## Endpoints (`/api/v1/game`)

| Method | Path | Behaviour |
|---|---|---|
| `GET` | `/cards` | For every `persons` row lacking a `battle_cards` row, build + insert one. Return all cards (newest person first). |
| `POST` | `/cards` | Body `{person_id}`. 404 if no such person. Create the card if missing, else return the existing one. `201`. |
| `GET` | `/cards/{id}` | One card. `404` if missing. |
| `GET` | `/deck` | `{card_ids, count, max: 8, avg_cost}`. `avg_cost` = mean `cost` over the deck's cards, `0.0` if empty, rounded to 1 dp. |
| `PUT` | `/deck` | Body `{card_ids}`. Reject (`422`) if `len > 8`, duplicates, or any id missing from `battle_cards`. Overwrite row 1. Return the `GET /deck` shape. |
| `POST` | `/cards/{id}/flavor` | Regenerate `flavor_text` via Gemini in the card's persona (name/company/job_label/grade). `404` if missing. On LLM failure → `503` (mirrors `conversation`'s `SummaryUnavailable`). |

Response body per card = api-spec §Game shape (snake_case, includes
`job_label`, `grade_label`, `stars`, `base_stats`, `final_stats`, `skill`,
`passive`, `flavor_text`, `created_at`).

`grade_label` / `stars`: `stars = grade`; `grade_label` from a static
`GRADE_LABEL[grade]` ("인턴"…"대표").

## Files

**Backend** (`app/features/game/`)
- `models.py` — `BattleCard`, `GameDeck` (registered on `Base.metadata`; add to `tests/conftest.py` import + alembic autogenerate)
- `card_builder.py` — constants + pure derivation
- `schemas.py` — `BattleCardResponse`, `CreateCardRequest`, `DeckResponse`, `UpdateDeckRequest`
- `service.py` — `GameService(db)` with the six operations
- `router.py` — replace the `/ping` stub with the six routes (keep `/ping`)
- `flavor.py` — `regenerate_flavor(card) -> str`, Gemini call modelled on `conversation/summarizer.py::_call_llm`
- alembic: `alembic revision --autogenerate -m "add battle_cards and game_deck"`

**Frontend** (`src/features/game/`)
- `api.ts` — `fetchCards`, `createCard(personId)`, `fetchDeck`, `saveDeck(cardIds)`, `regenerateFlavor(cardId)`; uses `@/shared/api/client`. Maps snake_case → `BattleCard`.
- `store/gameStore.ts` — `collection` + `deckSlots` now hydrate from the API;
  `load()` on first mount; `toggleSelected` updates local state then
  `saveDeck` (fire-and-forget, revert on failure). Add `status: 'idle' | 'loading' | 'ready' | 'error'`.
- `mockCollection.ts` — unchanged; still used by engine tests and `starterDeck`.

## Tests

**Backend** `tests/test_game.py`
- `grade_from_title`: one case per tier + null + unrecognised → ★1
- `resolve_job_class`: known passes through, unknown/null → `pm`
- `GET /cards` creates one row per person; second call creates nothing new
- `POST /cards` on a fresh person → 201 with a full body; again → same card
- `POST /cards` unknown person → 404
- `GET /cards/{id}` 200 / 404
- `PUT /deck` happy path; rejects >8, duplicate ids, unknown id
- `GET /deck` avg_cost math (incl. empty → 0.0)
- `POST /cards/{id}/flavor` with the Gemini call stubbed → persists the new text; stub raising → 503

**Frontend** `store/gameStore.test.ts` (updated), `api.test.ts` (new)
- api mapping: snake_case JSON → `BattleCard` (finalStats etc.)
- `toggleSelected` calls `saveDeck` with the compacted id list
- load failure sets `status: 'error'` and leaves collection empty

## Out of scope

- Auth / per-user collections (no auth in the project)
- Backfilling cards on `POST /contacts` (the lazy `GET /cards` covers it;
  a scan-time hook can be added later with 강민구)
- Persisting battle results / match history
