# Design Tokens

These are the tokens finalized from the design prototype. Use only these tokens for all UI implementation.
On the frontend, define them in `shared/theme/` and import them for use.

## Colors (Dark Mode fixed)

### Surface (background layers)

| Token | HEX | Usage |
|--------|-----|------|
| `canvas` | `#0A0A0F` | App's bottom-most background (blue-tinted near-black) |
| `surface1` | `#14141F` | Cards, list rows, input fields |
| `surface2` | `#1E1E2E` | Chips, hand cards, hover/selected state |
| `surface3` | `#2A2A3C` | Bottom sheets, modals |

### Brand & Accent

| Token | HEX | Usage |
|--------|-----|------|
| `primary` | `#6C5CE7` | Brand, buttons, FAB, active tab |
| `primaryLight` | `#A29BFE` | Highlights, purple text, cost numbers |
| `secondary` | `#00D2D3` | Relationship graph edges, contact info, success state |
| `gameAccent` | `#FD7272` | Coral — battle-only (enemy, end turn, game tab) |
| `warning` | `#FECA57` | Yellow — stars, reminders, targeting highlight |

### Text Opacity

| Token | Value | Usage |
|--------|-----|------|
| `textPrimary` | `rgba(255,255,255,1.0)` | Titles, emphasis |
| `textSecondary` | `rgba(255,255,255,0.75)` | Subtitles |
| `textTertiary` | `rgba(255,255,255,0.50)` | Section labels |
| `textQuaternary` | `rgba(255,255,255,0.45)` | Meta information |
| `textMuted` | `rgba(255,255,255,0.35)` | Disabled text |
| `textSubtle` | `rgba(255,255,255,0.30)` | Flavor text |

### Borders

| Token | Value | Usage |
|--------|-----|------|
| `borderLight` | `rgba(255,255,255,0.06)` | Standard divider |
| `borderMedium` | `rgba(255,255,255,0.12)` | Emphasized divider |

### Job Theme Colors

Applied consistently to graph nodes, avatar rings, badges, and card borders.

| Role | HEX | Token |
|------|-----|--------|
| Development team | `#6C5CE7` | `jobDev` |
| Designer | `#FDA7DF` | `jobDesign` |
| HR team | `#55E6C1` | `jobHr` |
| Finance team | `#F8B739` | `jobFinance` |
| Legal team | `#778BEB` | `jobLegal` |
| Marketing team | `#FD7272` | `jobMarketing` |
| Sales team | `#FF6348` | `jobSales` |
| Planning/PM | `#7ED6DF` | `jobPm` |

**Tint helper**: Use the same hex at 16% alpha for badge/avatar backgrounds.
Example: `rgba(108, 92, 231, 0.16)` (development team badge background)

## Typography

### Font Family

| Usage | Typeface | weight |
|------|------|------|
| Korean UI | Pretendard Variable | 400 (Regular), 600 (SemiBold), 700 (Bold), 800 (ExtraBold) |
| Numbers/stats | Space Grotesk | 500 (Medium), 700 (Bold) |

### Size Scale

| Token | size / weight | Usage |
|--------|--------------|------|
| `screenTitle` | 20px / 700 | Screen title |
| `greeting` | 22px / 700 | Home greeting |
| `personName` | 19px / 800 | Person name (detail view) |
| `cardName` | 21px / 800 | My business card name |
| `sectionLabel` | 12px / 600, letter-spacing 0.08em | Section label (50% white) |
| `body` | 13–14px / 400 | Body text |
| `meta` | 11–12px / 400 | Meta information (45% white) |
| `micro` | 8–11px / 500–700 | Card stats, badges |
| `tabLabel` | 9.5px / 600 | Bottom tab label |
| `timer` | 44px / Space Grotesk 500 | Recording timer |
| `battleResult` | 34px / Space Grotesk 700 | VICTORY / DEFEAT |

## Shape

| Token | Value | Usage |
|--------|-----|------|
| `radiusCard` | 12px | Standard cards, inputs |
| `radiusGameCard` | 8px | Game cards (sharper) |
| `radiusPill` | 99px | Chips, pills |
| `radiusMyCard` | 14px | My business card |
| `radiusBottomSheet` | 18px (top only) | Bottom sheet |
| `radiusFab` | 18px | Central FAB button |

## Elevation & Glow

Flat design (no shadows). Layering is conveyed through surface color differences.
Only glow effects are used:

| Token | Value | Usage |
|--------|-----|------|
| `glowPurple` | `0 0 34px rgba(108,92,231,0.28)` | Card reveal |
| `glowFab` | `0 8px 24px rgba(108,92,231,0.5)` | FAB button |
| `glowNode` | 3s infinite pulse animation | Relationship graph node |

## Motion

| Area | duration | easing | Description |
|------|----------|--------|------|
| Main app transition | 250ms | ease-out | Screen fade + slide |
| Tab response | 200ms | ease-out | scale 0.97 → 1.0 |
| List appearance | 200–300ms | ease-out | Stagger animation |
| Card rise-in | 300ms | ease-out | Game card appearance |
| Card reveal flip | 450–500ms | ease-in-out | rotateY (business card → battle card) |
| Hit flash | 400ms | — | Coral overlay |
| YOUR TURN banner | ~1100ms | fade in/out | Battle turn notice |
| HP bar | 400ms | ease-out | width transition |

**Principle**: Animations must never block user input.

## Navigation

Bottom tab bar (fixed, `rgba(20,20,31,0.92)` + blur, 1px hairline on top).

| Order | Label | Icon | Active Color |
|------|------|--------|----------|
| 1 | Home | house | `primaryLight` |
| 2 | List | list | `primaryLight` |
| 3 | (FAB) | camera | `primary` (52px, 18px radius, raised -18px) |
| 4 | Relationship Graph | network/graph | `primaryLight` |
| 5 | Game | crossed-swords | `gameAccent` (#FD7272) |

Inactive icons: 1.6px stroke, 21px, white 42% opacity.
Label: 9.5px / 600.
