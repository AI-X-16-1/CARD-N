# Game Rules — Business Card Battle: Business Wars

Detailed rules for implementing the battle engine.
Battle logic is implemented as **pure functions on the frontend** (enables offline play).
Write it in the `features/game/engine/` folder, separated from the UI.

## Base Stats

| Stat | Key | Description |
|------|-----|------|
| 💪 Execution | `atk` | Attack damage |
| 🛡 Stability | `def` | Reduces damage taken |
| 🧠 Strategy | `int` | Skill effect multiplier |
| ❤️ Health | `hp` | Removed from play when it reaches 0 |

## Base Stats by Role

| Role | ATK | DEF | INT | HP |
|------|:---:|:---:|:---:|:---:|
| Development Team (dev) | 7 | 3 | 7 | 8 |
| Designer (design) | 4 | 5 | 9 | 8 |
| HR Team (hr) | 4 | 5 | 6 | 10 |
| Finance Team (finance) | 4 | 9 | 6 | 8 |
| Legal Team (legal) | 6 | 8 | 7 | 6 |
| Marketing Team (marketing) | 7 | 3 | 6 | 10 |
| Sales Team (sales) | 9 | 3 | 4 | 10 |
| Planning/PM (pm) | 6 | 6 | 6 | 10 |

## Grade & Multiplier by Position

| Position | Grade (★) | Cost | Multiplier |
|------|:---:|:---:|:---:|
| Intern | ★1 | 1 | ×1.0 |
| Staff | ★2 | 2 | ×1.1 |
| Assistant Manager/Senior | ★3 | 3 | ×1.2 |
| Manager | ★4 | 4 | ×1.35 |
| Department Head/Director | ★5 | 5 | ×1.5 |
| CEO/President | ★6 | 7 | ×1.7 |

**Final stat calculation**: `floor(base stat × position multiplier)`

Example: Marketing Team Manager → ATK = floor(7 × 1.35) = 9

## Skills (One per role, consumes an action)

| Role | Skill Name | Cost | Effect |
|------|--------|:---:|------|
| Development Team | Hotfix | 2 | Restore HP + `ceil(INT/2)` to all allies |
| Designer | UI Overhaul | 2 | Reduce ATK of the highest-ATK card on the enemy field by `ceil(INT/2)` |
| HR Team | Benefits Points | 2 | +2 HP to all allies, draw 1 card |
| Finance Team | Austerity Budget | 2 | +3 DEF to all allies (permanent) |
| Legal Team | Lawsuit | 3 | Deal direct damage equal to INT to the enemy hero |
| Marketing Team | Campaign | 2 | +2 ATK to all allies (permanent) |
| Sales Team | Cold Call | 3 | Deal `INT + 3` damage to a random card on the enemy field |
| Planning/PM | Roadmap | 2 | Draw 2 cards |

## Synergies (Auto-triggered on your field)

| Name | Condition | Effect |
|------|------|------|
| ⚡ GTM Team | Marketing + Sales | +2 ATK to all allies |
| 🧠 Scrum Team | Development + Designer + PM | +3 INT to all allies |
| 🌱 New Hire Cohort | 3 or more cards at ★2 or below | +2 ATK to all allies |

Synergies are shown with a mint-colored pill badge.

## Deck Composition

- Full deck: 15 cards (up to 8 selected + remainder filled randomly)
- Opening hand: 4 cards
- Hand limit: 7 cards (draws beyond this are ignored)
- Both heroes' HP: 30

## Turn Progression

```
1. Max cost +1 (starts at 2, capped at 10)
2. Fully refill cost
3. Draw 1 card (only if hand has fewer than 7 cards)
4. Free actions:
   - Play a card (consumes cost, field limit 5)
   - Declare an attack
   - Use a skill
5. "End Turn" button
```

## Card Placement Rules

- Cannot attack on the turn it's played ("Commute time")
- **Exception**: ★1 Interns can attack immediately after being played ("Enthusiasm")

## Combat (Attack)

```
1. Tap a card in ready state → select it
2. Select a target:
   - Tap an enemy field card → attack the card
   - Tap the enemy hero header → attack the hero (only when the enemy field is empty,
     and never on turn 1 — see "No First-Turn Rush" below)
3. Damage calculation:
   - To the target: max(1, effATK − floor(effDEF / 2))
   - Counterattack (to the attacker): max(1, floor(targetATK / 2))
4. HP at 0 or below → removed from the field ("Clock out")
```

`effATK`, `effDEF` = base stats + combined synergy/skill buffs.

## No First-Turn Rush

Neither side may attack the enemy hero directly on turn 1 (`turnN === 1`), even if the
enemy field is empty. This closes the ★1 Intern "Enthusiasm" exploit, where a card that
can attack the same turn it's played would otherwise burst the enemy hero for free before
they've had a single turn. Field-card-vs-field-card attacks are unaffected.

## Enemy AI (runs at end of turn)

```
1. Max cost +1, refill cost, draw a card
2. Play up to 2 cards, starting with the most expensive, as cost allows
3. For each card in ready state:
   - If there are cards on my field → attack my card with the lowest HP
   - If my field is empty → attack my hero
```

## Difficulty Settings

Multiplier applied to enemy stats:
- Easy: ×0.8
- Normal: ×1.0
- Hard: ×1.2

## Win/Loss Conditions

| Condition | Result |
|------|------|
| Enemy hero HP ≤ 0 | VICTORY |
| My hero HP ≤ 0 | DEFEAT |
| One side's field + deck + hand are all exhausted | That side loses (resource exhaustion) |

## Effects

| Effect | Timing | Description |
|--------|--------|------|
| BATTLE START banner | Game start | 1.1s fade in/out |
| YOUR TURN banner | Start of each turn | 1.1s fade in/out |
| Hit flash | On attack hit | 400ms coral overlay |
| Result overlay | Game end | VICTORY (mint glow) / DEFEAT (coral glow) |

## State Structure

```typescript
interface BattleState {
  deck: BattleCard[];
  hand: BattleCard[];
  field: (BattleCard | null)[]; // length 5
  cost: number;
  maxCost: number;
  myHp: number;

  eDeck: BattleCard[];
  eHand: BattleCard[];
  eField: (BattleCard | null)[]; // length 5
  eMaxCost: number;
  eHp: number;

  turnN: number;
  log: string[];
  over: 'victory' | 'defeat' | null;
  selectedFieldIdx: number | null;
}
```

## Engine Pure Function Interface (Recommended)

```typescript
// engine/battle.ts
function initBattle(deck: BattleCard[]): BattleState;
function playCard(state: BattleState, handIdx: number, fieldSlot: number): BattleState;
function attack(state: BattleState, myFieldIdx: number, targetFieldIdx: number | 'hero'): BattleState;
function useSkill(state: BattleState, myFieldIdx: number): BattleState;
function endTurn(state: BattleState): BattleState; // includes enemy AI turn
function calcEffStats(card: BattleCard, synergies: Synergy[]): EffectiveStats;
function checkSynergies(field: BattleCard[]): Synergy[];
function checkGameOver(state: BattleState): 'victory' | 'defeat' | null;
```
