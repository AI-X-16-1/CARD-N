import { checkSynergies, calcEffStats, checkGameOver, initBattle, playCard, attack, useSkill, endTurn } from './battle';
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

describe('playCard', () => {
  test('moves the card from hand to the given field slot and deducts its cost', () => {
    const card = makeCard('dev', 1, { cost: 2, finalStats: { atk: 7, def: 3, int: 7, hp: 8 } });
    const state = makeState({ hand: [card], cost: 2 });

    const next = playCard(state, 0, 0);

    expect(next.hand).toEqual([]);
    expect(next.field[0]).toMatchObject({ id: card.id, currentHp: 8, hasActed: false, justPlayed: true });
    expect(next.cost).toBe(0);
  });

  test('throws when the player cannot afford the card', () => {
    const card = makeCard('dev', 1, { cost: 3 });
    const state = makeState({ hand: [card], cost: 2 });

    expect(() => playCard(state, 0, 0)).toThrow();
  });

  test('throws when the target field slot is already occupied', () => {
    const card = makeCard('dev', 1, { cost: 1 });
    const occupied = makeCard('hr', 1);
    const state = makeState({ hand: [card], cost: 2, field: [occupied, null, null, null, null] });

    expect(() => playCard(state, 0, 0)).toThrow();
  });

  test('does not mutate the original state', () => {
    const card = makeCard('dev', 1, { cost: 1 });
    const state = makeState({ hand: [card], cost: 2 });

    playCard(state, 0, 0);

    expect(state.hand).toEqual([card]);
    expect(state.field).toEqual([null, null, null, null, null]);
    expect(state.cost).toBe(2);
  });

  test('clears turnEvents left over from a previous endTurn call', () => {
    const card = makeCard('dev', 1, { cost: 1 });
    const state = makeState({ hand: [card], cost: 2, turnEvents: [{ type: 'draw', who: 'me', cardId: 999 }] });

    const next = playCard(state, 0, 0);

    expect(next.turnEvents).toEqual([]);
  });
});

describe('attack', () => {
  test('deals damage to the target card and counter-damage to the attacker', () => {
    const attacker = makeCard('sales', 3, { finalStats: { atk: 9, def: 3, int: 4, hp: 10 }, currentHp: 10, hasActed: false, justPlayed: false });
    const defender = makeCard('finance', 3, { finalStats: { atk: 4, def: 9, int: 6, hp: 8 }, currentHp: 8, hasActed: false, justPlayed: false });
    const state = makeState({
      field: [attacker, null, null, null, null],
      eField: [defender, null, null, null, null],
    });

    const next = attack(state, 0, 0);

    // dmg to defender: max(1, 9 - floor(9/2)) = max(1, 9-4) = 5
    expect(next.eField[0]).toMatchObject({ currentHp: 3 });
    // counter to attacker: max(1, floor(4/2)) = 2
    expect(next.field[0]).toMatchObject({ currentHp: 8, hasActed: true });
  });

  test('clamps damage to a minimum of 1 against very high DEF', () => {
    const attacker = makeCard('dev', 1, { finalStats: { atk: 2, def: 1, int: 1, hp: 5 }, currentHp: 5 });
    const defender = makeCard('finance', 6, { finalStats: { atk: 1, def: 50, int: 1, hp: 20 }, currentHp: 20 });
    const state = makeState({
      field: [attacker, null, null, null, null],
      eField: [defender, null, null, null, null],
    });

    const next = attack(state, 0, 0);

    expect(next.eField[0]).toMatchObject({ currentHp: 19 });
  });

  test('removes the target card from the field when its hp drops to 0', () => {
    const attacker = makeCard('sales', 3, { finalStats: { atk: 20, def: 3, int: 4, hp: 10 }, currentHp: 10 });
    const defender = makeCard('finance', 1, { finalStats: { atk: 1, def: 0, int: 6, hp: 5 }, currentHp: 5 });
    const state = makeState({
      field: [attacker, null, null, null, null],
      eField: [defender, null, null, null, null],
    });

    const next = attack(state, 0, 0);

    expect(next.eField[0]).toBeNull();
  });

  test('removes the attacker from the field when counter-damage kills it', () => {
    const attacker = makeCard('dev', 1, { finalStats: { atk: 3, def: 1, int: 1, hp: 1 }, currentHp: 1 });
    const defender = makeCard('sales', 3, { finalStats: { atk: 9, def: 3, int: 4, hp: 10 }, currentHp: 10 });
    const state = makeState({
      field: [attacker, null, null, null, null],
      eField: [defender, null, null, null, null],
    });

    const next = attack(state, 0, 0);

    expect(next.field[0]).toBeNull();
  });

  test('throws when the attacking slot has no card', () => {
    const state = makeState({ eField: [makeCard('dev', 1), null, null, null, null] });

    expect(() => attack(state, 0, 0)).toThrow();
  });

  test('throws when the card already acted this turn', () => {
    const attacker = makeCard('dev', 1, { currentHp: 8, hasActed: true });
    const defender = makeCard('hr', 1, { currentHp: 10 });
    const state = makeState({ field: [attacker, null, null, null, null], eField: [defender, null, null, null, null] });

    expect(() => attack(state, 0, 0)).toThrow();
  });

  test('throws when a just-played card (not grade 1) tries to attack ("commute time")', () => {
    const attacker = makeCard('dev', 2, { currentHp: 8, justPlayed: true });
    const defender = makeCard('hr', 1, { currentHp: 10 });
    const state = makeState({ field: [attacker, null, null, null, null], eField: [defender, null, null, null, null] });

    expect(() => attack(state, 0, 0)).toThrow();
  });

  test('allows a grade-1 Intern to attack the same turn it was played ("Enthusiasm")', () => {
    const attacker = makeCard('dev', 1, { finalStats: { atk: 7, def: 3, int: 7, hp: 8 }, currentHp: 8, justPlayed: true });
    const defender = makeCard('hr', 1, { finalStats: { atk: 4, def: 5, int: 6, hp: 10 }, currentHp: 10 });
    const state = makeState({ field: [attacker, null, null, null, null], eField: [defender, null, null, null, null] });

    expect(() => attack(state, 0, 0)).not.toThrow();
  });

  test('attacking the hero deals full ATK with no mitigation and no counter-damage', () => {
    const attacker = makeCard('sales', 3, { finalStats: { atk: 9, def: 3, int: 4, hp: 10 }, currentHp: 10 });
    const state = makeState({ turnN: 2, field: [attacker, null, null, null, null], eField: [null, null, null, null, null], eHp: 30 });

    const next = attack(state, 0, 'hero');

    expect(next.eHp).toBe(21);
    expect(next.field[0]).toMatchObject({ currentHp: 10 });
  });

  test('marks the attacker as having acted after attacking the hero (cannot hero-attack twice in one turn)', () => {
    const attacker = makeCard('sales', 3, { finalStats: { atk: 9, def: 3, int: 4, hp: 10 }, currentHp: 10 });
    const state = makeState({ turnN: 2, field: [attacker, null, null, null, null], eField: [null, null, null, null, null], eHp: 30 });

    const next = attack(state, 0, 'hero');

    expect(next.field[0]).toMatchObject({ hasActed: true });
    expect(() => attack(next, 0, 'hero')).toThrow();
  });

  test('throws when attacking the hero while the enemy field still has a card', () => {
    const attacker = makeCard('sales', 3, { currentHp: 10 });
    const defender = makeCard('hr', 1, { currentHp: 10 });
    const state = makeState({ turnN: 2, field: [attacker, null, null, null, null], eField: [defender, null, null, null, null] });

    expect(() => attack(state, 0, 'hero')).toThrow();
  });

  test('throws when attacking the hero on turn 1 ("no first-turn rush")', () => {
    const attacker = makeCard('dev', 1, { finalStats: { atk: 7, def: 3, int: 7, hp: 8 }, currentHp: 8, justPlayed: true });
    const state = makeState({ turnN: 1, field: [attacker, null, null, null, null], eField: [null, null, null, null, null], eHp: 30 });

    expect(() => attack(state, 0, 'hero')).toThrow();
  });

  test('sets state.over to victory once attack drops the enemy hero to 0', () => {
    const attacker = makeCard('sales', 3, { finalStats: { atk: 40, def: 3, int: 4, hp: 10 }, currentHp: 10 });
    const state = makeState({ turnN: 2, field: [attacker, null, null, null, null], eField: [null, null, null, null, null], eHp: 30 });

    const next = attack(state, 0, 'hero');

    expect(next.over).toBe('victory');
  });

  test('does not mutate the original state', () => {
    const attacker = makeCard('sales', 3, {
      finalStats: { atk: 9, def: 3, int: 4, hp: 10 },
      currentHp: 10,
      hasActed: false,
    });
    const defender = makeCard('finance', 3, { finalStats: { atk: 4, def: 9, int: 6, hp: 8 }, currentHp: 8 });
    const state = makeState({
      field: [attacker, null, null, null, null],
      eField: [defender, null, null, null, null],
    });

    attack(state, 0, 0);

    expect(state.field[0]).toMatchObject({ currentHp: 10, hasActed: false });
    expect(state.eField[0]).toMatchObject({ currentHp: 8 });
  });

  test('clears turnEvents left over from a previous endTurn call', () => {
    const attacker = makeCard('sales', 3, { finalStats: { atk: 9, def: 3, int: 4, hp: 10 }, currentHp: 10 });
    const state = makeState({
      field: [attacker, null, null, null, null],
      eField: [null, null, null, null, null],
      turnN: 2,
      turnEvents: [{ type: 'draw', who: 'me', cardId: 999 }],
    });

    const next = attack(state, 0, 'hero');

    expect(next.turnEvents).toEqual([]);
  });
});

describe('useSkill', () => {
  test('throws when the card already acted this turn', () => {
    const caster = makeCard('pm', 3, { hasActed: true, skill: { name: 'Roadmap', cost: 2, description: '' } });
    const state = makeState({ field: [caster, null, null, null, null], cost: 5 });

    expect(() => useSkill(state, 0)).toThrow();
  });

  test('throws when the player cannot afford the skill', () => {
    const caster = makeCard('legal', 3, { skill: { name: 'Lawsuit', cost: 3, description: '' } });
    const state = makeState({ field: [caster, null, null, null, null], cost: 1 });

    expect(() => useSkill(state, 0)).toThrow();
  });

  test('deducts the skill cost and marks the caster as having acted', () => {
    const caster = makeCard('pm', 3, { skill: { name: 'Roadmap', cost: 2, description: '' } });
    const state = makeState({ field: [caster, null, null, null, null], cost: 5, deck: [makeCard('dev', 1)] });

    const next = useSkill(state, 0);

    expect(next.cost).toBe(3);
    expect(next.field[0]).toMatchObject({ hasActed: true });
  });

  test('Hotfix (dev): heals all allies by ceil(INT/2), capped at max hp', () => {
    const caster = makeCard('dev', 3, {
      finalStats: { atk: 7, def: 3, int: 9, hp: 12 },
      currentHp: 12,
      skill: { name: 'Hotfix', cost: 2, description: '' },
    });
    const ally = makeCard('hr', 1, { finalStats: { atk: 4, def: 5, int: 6, hp: 10 }, currentHp: 4 });
    const state = makeState({ field: [caster, ally, null, null, null], cost: 2 });

    const next = useSkill(state, 0);

    // ceil(9/2) = 5
    expect(next.field[1]).toMatchObject({ currentHp: 9 });
    expect(next.field[0]).toMatchObject({ currentHp: 12 }); // already at max, no overheal
  });

  test('UI Overhaul (design): reduces ATK of the highest-ATK enemy card by ceil(INT/2)', () => {
    const caster = makeCard('design', 3, {
      finalStats: { atk: 4, def: 5, int: 10, hp: 8 },
      skill: { name: 'UI Overhaul', cost: 2, description: '' },
    });
    const weakEnemy = makeCard('hr', 1, { finalStats: { atk: 4, def: 5, int: 6, hp: 10 } });
    const strongEnemy = makeCard('sales', 3, { finalStats: { atk: 9, def: 3, int: 4, hp: 10 } });
    const state = makeState({
      field: [caster, null, null, null, null],
      eField: [weakEnemy, strongEnemy, null, null, null],
      cost: 2,
    });

    const next = useSkill(state, 0);

    // ceil(10/2) = 5, applied to the higher-ATK card (strongEnemy, atk 9)
    expect(next.eField[1]?.buffs?.atk).toBe(-5);
    expect(next.eField[0]?.buffs?.atk ?? 0).toBe(0);
  });

  test('Benefits Points (hr): +2 max HP buff + heal 2 to all allies, and draws 1 card', () => {
    const caster = makeCard('hr', 3, {
      skill: { name: 'Benefits Points', cost: 2, description: '' },
      finalStats: { atk: 4, def: 5, int: 6, hp: 10 },
      currentHp: 10,
    });
    const hurtAlly = makeCard('dev', 1, { finalStats: { atk: 4, def: 5, int: 6, hp: 10 }, currentHp: 3 });
    const drawCard = makeCard('pm', 1);
    const state = makeState({ field: [caster, hurtAlly, null, null, null], deck: [drawCard], hand: [], cost: 2 });

    const next = useSkill(state, 0);

    expect(next.field[0]?.buffs?.hp).toBe(2);
    expect(next.field[1]?.buffs?.hp).toBe(2);
    expect(next.field[0]?.currentHp).toBe(12); // was full (10/10) -> tops up to the new max
    expect(next.field[1]?.currentHp).toBe(5); // was 3 -> +2, still below the new max of 12
    expect(next.hand).toEqual([drawCard]);
    expect(next.deck).toEqual([]);
    expect(next.turnEvents).toEqual([{ type: 'draw', who: 'me', cardId: drawCard.id }]);
  });

  test('Austerity Budget (finance): +3 DEF buff to all allies', () => {
    const caster = makeCard('finance', 3, { skill: { name: 'Austerity Budget', cost: 2, description: '' } });
    const ally = makeCard('dev', 1);
    const state = makeState({ field: [caster, ally, null, null, null], cost: 2 });

    const next = useSkill(state, 0);

    expect(next.field[0]?.buffs?.def).toBe(3);
    expect(next.field[1]?.buffs?.def).toBe(3);
  });

  test('Lawsuit (legal): deals direct INT damage to the enemy hero', () => {
    const caster = makeCard('legal', 3, {
      finalStats: { atk: 6, def: 8, int: 9, hp: 6 },
      skill: { name: 'Lawsuit', cost: 3, description: '' },
    });
    const state = makeState({ field: [caster, null, null, null, null], cost: 3, eHp: 30 });

    const next = useSkill(state, 0);

    expect(next.eHp).toBe(21);
  });

  test('Campaign (marketing): +2 ATK buff to all allies', () => {
    const caster = makeCard('marketing', 3, { skill: { name: 'Campaign', cost: 2, description: '' } });
    const ally = makeCard('dev', 1);
    const state = makeState({ field: [caster, ally, null, null, null], cost: 2 });

    const next = useSkill(state, 0);

    expect(next.field[0]?.buffs?.atk).toBe(2);
    expect(next.field[1]?.buffs?.atk).toBe(2);
  });

  test('Cold Call (sales): deals INT+3 damage to a random enemy field card', () => {
    const caster = makeCard('sales', 3, {
      finalStats: { atk: 9, def: 3, int: 5, hp: 10 },
      skill: { name: 'Cold Call', cost: 3, description: '' },
    });
    const onlyEnemy = makeCard('hr', 1, { finalStats: { atk: 4, def: 5, int: 6, hp: 10 }, currentHp: 10 });
    const state = makeState({ field: [caster, null, null, null, null], eField: [onlyEnemy, null, null, null, null], cost: 3 });

    const next = useSkill(state, 0);

    // INT(5) + 3 = 8 damage
    expect(next.eField[0]).toMatchObject({ currentHp: 2 });
  });

  test('Roadmap (pm): draws 2 cards', () => {
    const caster = makeCard('pm', 3, { skill: { name: 'Roadmap', cost: 2, description: '' } });
    const [c1, c2, c3] = [makeCard('dev', 1), makeCard('hr', 1), makeCard('sales', 1)];
    const state = makeState({ field: [caster, null, null, null, null], deck: [c1, c2, c3], hand: [], cost: 2 });

    const next = useSkill(state, 0);

    expect(next.hand).toEqual([c1, c2]);
    expect(next.deck).toEqual([c3]);
    expect(next.turnEvents).toEqual([
      { type: 'draw', who: 'me', cardId: c1.id },
      { type: 'draw', who: 'me', cardId: c2.id },
    ]);
  });

  test('draws never exceed the 7-card hand limit', () => {
    const caster = makeCard('pm', 3, { skill: { name: 'Roadmap', cost: 2, description: '' } });
    const fullHand = Array.from({ length: 6 }, () => makeCard('dev', 1));
    const deck = [makeCard('hr', 1), makeCard('sales', 1)];
    const state = makeState({ field: [caster, null, null, null, null], deck, hand: fullHand, cost: 2 });

    const next = useSkill(state, 0);

    expect(next.hand).toHaveLength(7);
    expect(next.deck).toHaveLength(1);
  });

  test('does not mutate the original state', () => {
    const caster = makeCard('finance', 3, { skill: { name: 'Austerity Budget', cost: 2, description: '' } });
    const state = makeState({ field: [caster, null, null, null, null], cost: 2 });

    useSkill(state, 0);

    expect(state.field[0]?.buffs).toBeUndefined();
    expect(state.cost).toBe(2);
  });
});

describe('endTurn', () => {
  test('advances the turn counter and refills/increments my cost (capped at 10)', () => {
    const state = makeState({ turnN: 1, cost: 0, maxCost: 2 });

    const next = endTurn(state);

    expect(next.turnN).toBe(2);
    expect(next.maxCost).toBe(3);
    expect(next.cost).toBe(3);
  });

  test('caps my maxCost at 10', () => {
    const state = makeState({ maxCost: 10, cost: 0 });

    const next = endTurn(state);

    expect(next.maxCost).toBe(10);
  });

  test('draws 1 card for me, respecting the 7-card hand limit', () => {
    const drawCard = makeCard('dev', 1);
    const state = makeState({ deck: [drawCard], hand: [] });

    const next = endTurn(state);

    expect(next.hand).toEqual([drawCard]);
    expect(next.deck).toEqual([]);
  });

  test('resets hasActed/justPlayed on my surviving field cards for the next turn', () => {
    const mine = makeCard('dev', 1, { hasActed: true, justPlayed: true, currentHp: 8 });
    const state = makeState({ field: [mine, null, null, null, null] });

    const next = endTurn(state);

    expect(next.field[0]).toMatchObject({ hasActed: false, justPlayed: false });
  });

  test('increments eMaxCost and draws a card for the enemy', () => {
    // cost 5 so the AI can't afford to auto-play it; isolates the draw itself.
    const eDrawCard = makeCard('dev', 1, { cost: 5 });
    const state = makeState({ eMaxCost: 2, eDeck: [eDrawCard], eHand: [] });

    const next = endTurn(state);

    expect(next.eMaxCost).toBe(3);
    expect(next.eHand).toEqual([eDrawCard]);
  });

  test('AI plays up to 2 cards from hand, most expensive first, as cost allows', () => {
    const cheap = makeCard('dev', 1, { cost: 1 });
    const mid = makeCard('hr', 2, { cost: 2 });
    const expensive = makeCard('legal', 3, { cost: 3 });
    const state = makeState({ eMaxCost: 3, eHand: [cheap, mid, expensive], eField: [null, null, null, null, null] });

    const next = endTurn(state);

    // eMaxCost becomes 4 after +1; AI plays expensive (3) then can't afford mid+cheap together, so only 1 more up to 2 total
    const playedIds = next.eField.filter((c): c is BattleCard => c !== null).map((c) => c.id);
    expect(playedIds).toContain(expensive.id);
    expect(playedIds.length).toBeLessThanOrEqual(2);
  });

  test('AI card attacks my lowest-HP field card when my field is not empty', () => {
    const eAttacker = makeCard('sales', 3, {
      finalStats: { atk: 9, def: 3, int: 4, hp: 10 },
      currentHp: 10,
      hasActed: false,
      justPlayed: false,
    });
    const lowHp = makeCard('hr', 1, { finalStats: { atk: 4, def: 5, int: 6, hp: 10 }, currentHp: 3 });
    const highHp = makeCard('finance', 3, { finalStats: { atk: 4, def: 9, int: 6, hp: 8 }, currentHp: 8 });
    const state = makeState({
      field: [lowHp, highHp, null, null, null],
      eField: [eAttacker, null, null, null, null],
      eDeck: [], // avoid an extra auto-played/auto-attacking draw interfering
    });

    const next = endTurn(state);

    // dmg to lowHp: max(1, 9 - floor(5/2)) = max(1, 9-2) = 7 -> 3-7 <= 0, removed
    expect(next.field[0]).toBeNull();
    expect(next.field[1]).toMatchObject({ currentHp: 8 });
  });

  test('AI attacks my hero directly when my field is empty', () => {
    const eAttacker = makeCard('sales', 3, {
      finalStats: { atk: 9, def: 3, int: 4, hp: 10 },
      currentHp: 10,
      hasActed: false,
      justPlayed: false,
    });
    const state = makeState({
      turnN: 2,
      field: [null, null, null, null, null],
      eField: [eAttacker, null, null, null, null],
      eDeck: [],
      myHp: 30,
    });

    const next = endTurn(state);

    expect(next.myHp).toBe(21);
  });

  test('AI does not attack my hero on turn 1, even when my field is empty ("no first-turn rush")', () => {
    const eAttacker = makeCard('sales', 3, {
      finalStats: { atk: 9, def: 3, int: 4, hp: 10 },
      currentHp: 10,
      hasActed: false,
      justPlayed: false,
    });
    const state = makeState({
      turnN: 1,
      field: [null, null, null, null, null],
      eField: [eAttacker, null, null, null, null],
      eDeck: [],
      myHp: 30,
    });

    const next = endTurn(state);

    expect(next.myHp).toBe(30);
  });

  test('an enemy card played this turn cannot attack unless it is grade 1 ("commute time")', () => {
    // Not pre-placed on the field: it must be freshly played *during this same*
    // AI turn (via eHand) to actually exercise the justPlayed check, since
    // cards already on the field at turn start are made ready again.
    const nonInternCard = makeCard('hr', 2, {
      finalStats: { atk: 4, def: 5, int: 6, hp: 10 },
      cost: 2,
    });
    const state = makeState({
      field: [null, null, null, null, null],
      eField: [null, null, null, null, null],
      eHand: [nonInternCard],
      eDeck: [],
      eMaxCost: 2,
      myHp: 30,
    });

    const next = endTurn(state);

    expect(next.eField.some((c) => c?.id === nonInternCard.id)).toBe(true);
    expect(next.myHp).toBe(30);
  });

  test('sets state.over to defeat when the AI drops my hero hp to 0', () => {
    const lethal = makeCard('sales', 6, {
      finalStats: { atk: 40, def: 3, int: 4, hp: 10 },
      currentHp: 10,
      hasActed: false,
      justPlayed: false,
    });
    const state = makeState({
      turnN: 2,
      field: [null, null, null, null, null],
      eField: [lethal, null, null, null, null],
      eDeck: [],
      myHp: 30,
    });

    const next = endTurn(state);

    expect(next.over).toBe('defeat');
  });

  test('does not mutate the original state', () => {
    const mine = makeCard('dev', 1, { hasActed: true, justPlayed: true });
    const state = makeState({ field: [mine, null, null, null, null], turnN: 1, cost: 0, maxCost: 2 });

    endTurn(state);

    expect(state.turnN).toBe(1);
    expect(state.cost).toBe(0);
    expect(state.field[0]).toMatchObject({ hasActed: true, justPlayed: true });
  });

  describe('turnEvents', () => {
    test('records a play event with the card id and slot when the AI plays a card', () => {
      const eCard = makeCard('dev', 1, { cost: 1 });
      const state = makeState({
        turnN: 2,
        eMaxCost: 2,
        eHand: [eCard],
        eField: [null, null, null, null, null],
        eDeck: [],
      });

      const next = endTurn(state);

      expect(next.turnEvents).toContainEqual({ type: 'play', who: 'enemy', cardId: eCard.id, slot: 0 });
    });

    test('records an attack event with the attacker slot and target slot when the AI attacks my card', () => {
      const eAttacker = makeCard('sales', 3, {
        finalStats: { atk: 9, def: 3, int: 4, hp: 10 },
        currentHp: 10,
        hasActed: false,
        justPlayed: false,
      });
      const myCard = makeCard('hr', 1, { finalStats: { atk: 4, def: 5, int: 6, hp: 10 }, currentHp: 10 });
      const state = makeState({
        turnN: 2,
        field: [myCard, null, null, null, null],
        eField: [eAttacker, null, null, null, null],
        eDeck: [],
      });

      const next = endTurn(state);

      // dmg to myCard: max(1, 9 - floor(5/2)) = 7 -> 10-7=3; counter to eAttacker: max(1, floor(4/2)) = 2 -> 10-2=8
      expect(next.turnEvents).toContainEqual({
        type: 'attack',
        who: 'enemy',
        attackerSlot: 0,
        target: 0,
        myHp: 30,
        eHp: 30,
        attackerHp: 8,
        targetHp: 3,
      });
    });

    test('records targetHp as null when the attack kills the target', () => {
      const eAttacker = makeCard('sales', 1, {
        finalStats: { atk: 20, def: 3, int: 4, hp: 10 },
        currentHp: 10,
        hasActed: false,
        justPlayed: false,
      });
      const myCard = makeCard('hr', 1, { finalStats: { atk: 1, def: 0, int: 6, hp: 5 }, currentHp: 5 });
      const state = makeState({
        turnN: 2,
        field: [myCard, null, null, null, null],
        eField: [eAttacker, null, null, null, null],
        eDeck: [],
      });

      const next = endTurn(state);

      expect(next.turnEvents).toContainEqual(
        expect.objectContaining({ type: 'attack', attackerSlot: 0, target: 0, targetHp: null, attackerHp: 9 }),
      );
    });

    test('records an attack event targeting the hero when the AI attacks my hero', () => {
      const eAttacker = makeCard('sales', 3, {
        finalStats: { atk: 9, def: 3, int: 4, hp: 10 },
        currentHp: 10,
        hasActed: false,
        justPlayed: false,
      });
      const state = makeState({
        turnN: 2,
        field: [null, null, null, null, null],
        eField: [eAttacker, null, null, null, null],
        eDeck: [],
      });

      const next = endTurn(state);

      expect(next.turnEvents).toContainEqual({
        type: 'attack',
        who: 'enemy',
        attackerSlot: 0,
        target: 'hero',
        myHp: 21,
        eHp: 30,
        attackerHp: 10,
        targetHp: null,
      });
    });

    test('records a draw event for me and for the enemy when each draws a card', () => {
      const myDraw = makeCard('dev', 1);
      const eDraw = makeCard('pm', 1);
      const state = makeState({ deck: [myDraw], hand: [], eDeck: [eDraw], eHand: [] });

      const next = endTurn(state);

      expect(next.turnEvents).toContainEqual({ type: 'draw', who: 'me', cardId: myDraw.id });
      expect(next.turnEvents).toContainEqual({ type: 'draw', who: 'enemy', cardId: eDraw.id });
    });

    test('does not record a draw event when there is no card left to draw', () => {
      const state = makeState({ deck: [], hand: [], eDeck: [], eHand: [] });

      const next = endTurn(state);

      expect(next.turnEvents?.some((e) => e.type === 'draw')).toBe(false);
    });
  });
});
