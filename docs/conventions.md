# Conventions

## Git Strategy: GitHub Flow

We use a single `main` branch plus a feature branch strategy.

```
main (always in a deployable state)
 ├── feat/scan-ocr-camera
 ├── feat/graph-node-visualization
 ├── fix/contacts-search-crash
 └── refactor/shared-button-component
```

### Branch Rules

**Naming**: `{type}/{feature}-{description}`

```
feat/scan-batch-mode          ← new feature
fix/graph-node-tap-crash      ← bug fix
refactor/game-engine-cleanup  ← refactoring
docs/api-spec-update          ← documentation
chore/ci-lint-setup           ← config/infra
```

**Rules**:
- No direct push to `main`. Always merge through a PR.
- Create branches from `main`, and merge back into `main` (Squash merge recommended).
- Delete the remote branch after merging.
- No long-lived branches. Aim to merge within 3 days at most.

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) format.

```
{type}({scope}): {subject}

{body (optional)}
```

**type**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`
**scope**: feature name (`scan`, `contacts`, `graph`, `conversation`, `game`, `shared`)

```
feat(scan): implement batch OCR capture mode
fix(graph): fix node overlap on small screens
refactor(game): extract battle engine to pure functions
docs(api): add conversation summary endpoint spec
test(contacts): add person search unit tests
chore(ci): add ESLint to GitHub Actions
```

**Rules**:
- Subject line under 50 characters, in English, lowercase start, no trailing period
- The body is optional, but it's good practice to explain "why" the change was made
- One change per commit

### Pull Request

**Title**: same format as commit messages

**Body template**:
```markdown
## What
Summary of the change (1-2 lines)

## Why
Why this change is needed

## How
Summary of the implementation approach

## Test
How to test, or screenshots

## Checklist
- [ ] Changes are confined to my own feature folder
- [ ] If shared/ was changed, 2+ reviewers assigned
- [ ] If the API changed, docs/api-spec.md was updated
- [ ] New UI components use only design-tokens.md tokens
```

**Review rules**:
- Regular PR: 1+ approval
- `shared/` changes: 2+ approvals
- `docs/` changes: can be merged without approval (but notify others)

**Merge method**: Squash and Merge (to keep commit history clean)

## Code Style

### Frontend (TypeScript / React Native)

```
- ESLint + Prettier (follow the project's config files)
- Components: PascalCase (PersonCard.tsx)
- Hooks: camelCase, use prefix (usePersonList.ts)
- Types: PascalCase, no suffix (Person, BattleCard)
- Constants: UPPER_SNAKE_CASE (MAX_DECK_SIZE = 8)
- Screen components: {Name}Screen.tsx (HomeScreen.tsx)
- Styles: use StyleSheet.create, avoid inline styles
- Design tokens: import from shared/theme, no hardcoding
  ✅ colors.primary
  ❌ '#6C5CE7'
```

**File structure (within a feature)**:
```
features/scan/
├── screens/
│   ├── ScanCameraScreen.tsx     ← screen (wired to navigation)
│   └── ScanResultScreen.tsx
├── components/
│   ├── ViewfinderOverlay.tsx    ← components used within the screen
│   ├── ConfidenceField.tsx
│   └── CardRevealAnimation.tsx
└── hooks/
    ├── useOcrScan.ts            ← business logic hook
    └── useBatchCapture.ts
```

### Backend (Python / FastAPI)

```
- Ruff (linter + formatter), configured in pyproject.toml
- Modules/files: snake_case (ocr_service.py)
- Classes: PascalCase (PersonService)
- Functions/variables: snake_case (get_person_by_id)
- Constants: UPPER_SNAKE_CASE (MAX_UPLOAD_SIZE)
- Pydantic models: PascalCase + purpose suffix
  - Request: CreatePersonRequest
  - Response: PersonResponse
  - DB Model: Person (no suffix)
- async functions by default. Use sync only when synchronous I/O is required.
- Type hints required (function signatures, return types)
```

**File structure (within a feature)**:
```
features/graph/
├── router.py       ← FastAPI router (endpoint definitions only)
├── service.py      ← business logic
├── queries.py      ← DB queries (Cypher / SQL)
└── schemas.py      ← Pydantic schemas specific to this feature (optional)
```

**Router ↔ Service separation principle**:
```python
# router.py — keep thin (HTTP concerns only)
@router.get("/{person_id}/connections")
async def get_connections(person_id: int, db=Depends(get_db)):
    return await GraphService(db).get_connections(person_id)

# service.py — keep thick (business logic)
class GraphService:
    async def get_connections(self, person_id: int) -> list[ConnectionResponse]:
        raw = await self.query_graph(person_id)
        return [self._to_response(r) for r in raw]
```

## Naming Guide Summary

| Target | Frontend (TS) | Backend (Python) |
|------|:---:|:---:|
| File | PascalCase.tsx / camelCase.ts | snake_case.py |
| Component/Class | PascalCase | PascalCase |
| Function/Variable | camelCase | snake_case |
| Constant | UPPER_SNAKE_CASE | UPPER_SNAKE_CASE |
| Type/Schema | PascalCase | PascalCase |
| CSS/Theme | camelCase (StyleSheet) | N/A |

## Environment Variables

Do not commit the `.env` file. Provide a `.env.example` instead.

```env
# .env.example
DATABASE_URL=mysql+asyncmy://cardn:cardn@localhost:3307/cardn_db
GOOGLE_VISION_API_KEY=
OPENAI_API_KEY=
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=
```
