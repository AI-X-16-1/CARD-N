import { checkSynergies, calcEffStats, checkGameOver, initBattle } from './battle';
import { createStarterDeck } from './starterDeck';
import type { BattleCard, BattleState, JobClass } from './types';

function makeCard(jobClass: JobClass, grade: number, overrides: Partial<BattleCard> = {}): BattleCard {
  return {
    id: Math.random(),
    personId: 1,
    name: 'Test',
    company: 'Test Co',
    jobClass,
    jobLabel: jobClass,
    grade,
    cost: grade,
    baseStats: { atk: 1, def: 1, int: 1, hp: 1 },
    finalStats: { atk: 1, def: 1, int: 1, hp: 1 },
    skill: { name: 'Skill', cost: 1, description: '' },
    passive: '',
    flavorText: '',
    ...overrides,
  };
}

function makeState(overrides: Partial<BattleState> = {}): BattleState {
  return {
    deck: [makeCard('dev', 1)],
    hand: [],
    field: [null, null, null, null, null],
    cost: 2,
    maxCost: 2,
    myHp: 30,

    eDeck: [makeCard('dev', 1)],
    eHand: [],
    eField: [null, null, null, null, null],
    eMaxCost: 2,
    eHp: 30,

    turnN: 1,
    log: [],
    over: null,
    selectedFieldIdx: null,
    ...overrides,
  };
}

describe('checkSynergies', () => {
  test('returns no synergies for an empty field', () => {
    expect(checkSynergies([])).toEqual([]);
  });

  test('triggers GTM Team when field has Marketing + Sales', () => {
    const field = [makeCard('marketing', 1), makeCard('sales', 1)];

    const synergies = checkSynergies(field);

    expect(synergies).toContainEqual({ name: 'GTM Team', description: '+2 ATK to all allies' });
  });

  test('does not trigger GTM Team with Marketing alone', () => {
    const field = [makeCard('marketing', 1)];

    expect(checkSynergies(field)).toEqual([]);
  });

  test('triggers Scrum Team when field has Development + Designer + PM', () => {
    const field = [makeCard('dev', 1), makeCard('design', 1), makeCard('pm', 1)];

    const synergies = checkSynergies(field);

    expect(synergies).toContainEqual({ name: 'Scrum Team', description: '+3 INT to all allies' });
  });

  test('triggers New Hire Cohort with 3+ cards at grade 2 or below', () => {
    const field = [makeCard('dev', 1), makeCard('hr', 2), makeCard('legal', 2)];

    const synergies = checkSynergies(field);

    expect(synergies).toContainEqual({ name: 'New Hire Cohort', description: '+2 ATK to all allies' });
  });

  test('does not trigger New Hire Cohort with only 2 low-grade cards', () => {
    const field = [makeCard('dev', 1), makeCard('hr', 2), makeCard('legal', 5)];

    expect(checkSynergies(field)).not.toContainEqual(
      expect.objectContaining({ name: 'New Hire Cohort' }),
    );
  });

  test('can trigger multiple synergies at once', () => {
    const field = [makeCard('marketing', 1), makeCard('sales', 1), makeCard('dev', 1), makeCard('design', 1), makeCard('pm', 1)];

    const synergies = checkSynergies(field);

    expect(synergies).toContainEqual({ name: 'GTM Team', description: '+2 ATK to all allies' });
    expect(synergies).toContainEqual({ name: 'Scrum Team', description: '+3 INT to all allies' });
  });
});

describe('calcEffStats', () => {
  test('equals finalStats when there are no buffs or synergies', () => {
    const card = makeCard('dev', 1, { finalStats: { atk: 7, def: 3, int: 7, hp: 8 } });

    expect(calcEffStats(card, [])).toEqual({ atk: 7, def: 3, int: 7, hp: 8 });
  });

  test('adds permanent skill buffs on top of finalStats', () => {
    const card = makeCard('finance', 1, {
      finalStats: { atk: 4, def: 9, int: 6, hp: 8 },
      buffs: { def: 3 },
    });

    expect(calcEffStats(card, [])).toEqual({ atk: 4, def: 12, int: 6, hp: 8 });
  });

  test('adds GTM Team synergy bonus (+2 ATK)', () => {
    const card = makeCard('sales', 1, { finalStats: { atk: 9, def: 3, int: 4, hp: 10 } });
    const synergies = [{ name: 'GTM Team', description: '+2 ATK to all allies' }];

    expect(calcEffStats(card, synergies)).toEqual({ atk: 11, def: 3, int: 4, hp: 10 });
  });

  test('stacks buffs and multiple synergies together', () => {
    const card = makeCard('sales', 1, {
      finalStats: { atk: 9, def: 3, int: 4, hp: 10 },
      buffs: { atk: 2 },
    });
    const synergies = [
      { name: 'GTM Team', description: '+2 ATK to all allies' },
      { name: 'New Hire Cohort', description: '+2 ATK to all allies' },
    ];

    expect(calcEffStats(card, synergies)).toEqual({ atk: 15, def: 3, int: 4, hp: 10 });
  });
});

describe('checkGameOver', () => {
  test('returns null when both sides still have hp and resources', () => {
    expect(checkGameOver(makeState())).toBeNull();
  });

  test('returns defeat when my hero hp drops to 0', () => {
    expect(checkGameOver(makeState({ myHp: 0 }))).toBe('defeat');
  });

  test('returns defeat when my hero hp drops below 0', () => {
    expect(checkGameOver(makeState({ myHp: -3 }))).toBe('defeat');
  });

  test('returns victory when enemy hero hp drops to 0', () => {
    expect(checkGameOver(makeState({ eHp: 0 }))).toBe('victory');
  });

  test('returns defeat when my field, deck, and hand are all exhausted', () => {
    const state = makeState({ deck: [], hand: [], field: [null, null, null, null, null] });

    expect(checkGameOver(state)).toBe('defeat');
  });

  test('returns victory when enemy field, deck, and hand are all exhausted', () => {
    const state = makeState({ eDeck: [], eHand: [], eField: [null, null, null, null, null] });

    expect(checkGameOver(state)).toBe('victory');
  });

  test('does not trigger resource exhaustion while a field card remains', () => {
    const state = makeState({ deck: [], hand: [], field: [makeCard('dev', 1), null, null, null, null] });

    expect(checkGameOver(state)).toBeNull();
  });
});

describe('initBattle', () => {
  function idSet(cards: BattleCard[]): number[] {
    return cards.map((c) => c.id).sort((a, b) => a - b);
  }

  test('deals a 4-card opening hand and keeps the remaining 11 in the deck', () => {
    const state = initBattle(createStarterDeck());

    expect(state.hand).toHaveLength(4);
    expect(state.deck).toHaveLength(11);
  });

  test('sets turn 1 starting values (cost 2, both heroes at 30 hp, empty fields)', () => {
    const state = initBattle(createStarterDeck());

    expect(state.cost).toBe(2);
    expect(state.maxCost).toBe(2);
    expect(state.myHp).toBe(30);
    expect(state.eHp).toBe(30);
    expect(state.eMaxCost).toBe(2);
    expect(state.field).toEqual([null, null, null, null, null]);
    expect(state.eField).toEqual([null, null, null, null, null]);
    expect(state.turnN).toBe(1);
    expect(state.log).toEqual([]);
    expect(state.over).toBeNull();
    expect(state.selectedFieldIdx).toBeNull();
  });

  test('my hand + deck together are exactly the 15 cards passed in', () => {
    const deck = createStarterDeck();

    const state = initBattle(deck);

    expect(idSet([...state.hand, ...state.deck])).toEqual(idSet(deck));
  });

  test('enemy gets a 4-card hand and 11-card deck, copied from my deck (test-only stand-in)', () => {
    const deck = createStarterDeck();

    const state = initBattle(deck);

    expect(state.eHand).toHaveLength(4);
    expect(state.eDeck).toHaveLength(11);
    expect(idSet([...state.eHand, ...state.eDeck])).toEqual(idSet(deck));
  });

  test('does not mutate the deck passed in', () => {
    const deck = createStarterDeck();
    const originalIds = idSet(deck);

    initBattle(deck);

    expect(idSet(deck)).toEqual(originalIds);
  });
});
