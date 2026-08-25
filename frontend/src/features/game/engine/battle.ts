import type { BattleCard, BattleState, EffectiveStats, Stats, Synergy } from './types';

const SYNERGY_STAT_BONUS: Record<string, Partial<Stats>> = {
  'GTM Team': { atk: 2 },
  'Scrum Team': { int: 3 },
  'New Hire Cohort': { atk: 2 },
};

export function checkSynergies(field: BattleCard[]): Synergy[] {
  const synergies: Synergy[] = [];
  const jobClasses = field.map((card) => card.jobClass);

  if (jobClasses.includes('marketing') && jobClasses.includes('sales')) {
    synergies.push({ name: 'GTM Team', description: '+2 ATK to all allies' });
  }

  if (jobClasses.includes('dev') && jobClasses.includes('design') && jobClasses.includes('pm')) {
    synergies.push({ name: 'Scrum Team', description: '+3 INT to all allies' });
  }

  const lowGradeCount = field.filter((card) => card.grade <= 2).length;
  if (lowGradeCount >= 3) {
    synergies.push({ name: 'New Hire Cohort', description: '+2 ATK to all allies' });
  }

  return synergies;
}

export function calcEffStats(card: BattleCard, synergies: Synergy[]): EffectiveStats {
  const stats: Stats = { ...card.finalStats };

  const bonuses = [card.buffs, ...synergies.map((s) => SYNERGY_STAT_BONUS[s.name])];
  for (const bonus of bonuses) {
    if (!bonus) continue;
    for (const key of Object.keys(bonus) as (keyof Stats)[]) {
      stats[key] += bonus[key] ?? 0;
    }
  }

  return stats;
}

function isExhausted(deck: BattleCard[], hand: BattleCard[], field: (BattleCard | null)[]): boolean {
  return deck.length === 0 && hand.length === 0 && field.every((card) => card === null);
}

export function checkGameOver(state: BattleState): 'victory' | 'defeat' | null {
  if (state.myHp <= 0) return 'defeat';
  if (state.eHp <= 0) return 'victory';
  if (isExhausted(state.deck, state.hand, state.field)) return 'defeat';
  if (isExhausted(state.eDeck, state.eHand, state.eField)) return 'victory';
  return null;
}

const OPENING_HAND_SIZE = 4;
const STARTING_MAX_COST = 2;
const STARTING_HERO_HP = 30;

function shuffle(cards: BattleCard[]): BattleCard[] {
  const result = cards.map((card) => ({ ...card }));
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// TODO: the enemy currently plays a shuffled copy of the player's own deck as a
// test-only stand-in. Replace with a real opponent deck once matchmaking/fixed
// AI decks exist.
export function initBattle(deck: BattleCard[]): BattleState {
  const myShuffled = shuffle(deck);
  const eShuffled = shuffle(deck);

  return {
    hand: myShuffled.slice(0, OPENING_HAND_SIZE),
    deck: myShuffled.slice(OPENING_HAND_SIZE),
    field: [null, null, null, null, null],
    cost: STARTING_MAX_COST,
    maxCost: STARTING_MAX_COST,
    myHp: STARTING_HERO_HP,

    eHand: eShuffled.slice(0, OPENING_HAND_SIZE),
    eDeck: eShuffled.slice(OPENING_HAND_SIZE),
    eField: [null, null, null, null, null],
    eMaxCost: STARTING_MAX_COST,
    eHp: STARTING_HERO_HP,

    turnN: 1,
    log: [],
    over: null,
    selectedFieldIdx: null,
  };
}

export function playCard(_state: BattleState, _handIdx: number, _fieldSlot: number): BattleState {
  throw new Error('not implemented');
}

export function attack(
  _state: BattleState,
  _myFieldIdx: number,
  _targetFieldIdx: number | 'hero',
): BattleState {
  throw new Error('not implemented');
}

export function useSkill(_state: BattleState, _myFieldIdx: number): BattleState {
  throw new Error('not implemented');
}

export function endTurn(_state: BattleState): BattleState {
  throw new Error('not implemented');
}
