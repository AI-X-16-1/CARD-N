import type { BattleCard, BattleEvent, BattleState, EffectiveStats, Stats, Synergy } from './types';

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
    turnEvents: [],
  };
}

export function playCard(state: BattleState, handIdx: number, fieldSlot: number): BattleState {
  const card = state.hand[handIdx];
  if (!card) throw new Error(`playCard: no card in hand at index ${handIdx}`);
  if (fieldSlot < 0 || fieldSlot >= state.field.length) {
    throw new Error(`playCard: field slot ${fieldSlot} is out of range`);
  }
  if (state.field[fieldSlot] !== null) {
    throw new Error(`playCard: field slot ${fieldSlot} is already occupied`);
  }
  if (state.cost < card.cost) {
    throw new Error(`playCard: not enough cost (have ${state.cost}, need ${card.cost})`);
  }

  const placed: BattleCard = {
    ...card,
    currentHp: card.finalStats.hp,
    buffs: {},
    hasActed: false,
    justPlayed: true,
  };

  const field = [...state.field];
  field[fieldSlot] = placed;

  return {
    ...state,
    hand: state.hand.filter((_, i) => i !== handIdx),
    field,
    cost: state.cost - card.cost,
    log: [...state.log, `${card.name} 카드를 필드에 배치`],
    turnEvents: [],
  };
}

export function attack(
  state: BattleState,
  myFieldIdx: number,
  targetFieldIdx: number | 'hero',
): BattleState {
  const attacker = state.field[myFieldIdx];
  if (!attacker) throw new Error(`attack: no card in my field at index ${myFieldIdx}`);
  if (attacker.hasActed) throw new Error('attack: this card already acted this turn');
  if (attacker.justPlayed && attacker.grade !== 1) {
    throw new Error('attack: this card was just played and cannot attack yet ("commute time")');
  }
  if (targetFieldIdx === 'hero' && state.eField.some((c) => c !== null)) {
    throw new Error('attack: cannot attack the hero while the enemy field has a card');
  }
  if (targetFieldIdx === 'hero' && state.turnN === 1) {
    throw new Error('attack: cannot attack the hero on turn 1 ("no first-turn rush")');
  }

  const mySynergies = checkSynergies(state.field.filter((c): c is BattleCard => c !== null));
  const atkStats = calcEffStats(attacker, mySynergies);

  const field = [...state.field];
  const eField = [...state.eField];
  let eHp = state.eHp;
  const log = [...state.log];

  if (targetFieldIdx === 'hero') {
    const dmg = atkStats.atk;
    eHp -= dmg;
    field[myFieldIdx] = { ...attacker, hasActed: true };
    log.push(`${attacker.name} → 상대 히어로에게 ${dmg} 피해`);
  } else {
    const defender = state.eField[targetFieldIdx];
    if (!defender) throw new Error(`attack: no card in enemy field at index ${targetFieldIdx}`);

    const eSynergies = checkSynergies(state.eField.filter((c): c is BattleCard => c !== null));
    const defStats = calcEffStats(defender, eSynergies);

    const dmgToDefender = Math.max(1, atkStats.atk - Math.floor(defStats.def / 2));
    const dmgToAttacker = Math.max(1, Math.floor(defStats.atk / 2));

    const defenderHp = (defender.currentHp ?? defStats.hp) - dmgToDefender;
    const attackerHp = (attacker.currentHp ?? atkStats.hp) - dmgToAttacker;

    eField[targetFieldIdx] = defenderHp <= 0 ? null : { ...defender, currentHp: defenderHp };
    field[myFieldIdx] =
      attackerHp <= 0 ? null : { ...attacker, currentHp: attackerHp, hasActed: true };

    log.push(`${attacker.name} → ${defender.name}에게 ${dmgToDefender} 피해 (반격 ${dmgToAttacker})`);
  }

  const next: BattleState = {
    ...state,
    field,
    eField,
    eHp,
    log,
    selectedFieldIdx: null,
    turnEvents: [],
  };

  return { ...next, over: checkGameOver(next) };
}

const HAND_LIMIT = 7;
const MAX_COST_CAP = 10;

function ceilHalf(n: number): number {
  return Math.ceil(n / 2);
}

function drawUpTo(
  deck: BattleCard[],
  hand: BattleCard[],
  n: number,
): { deck: BattleCard[]; hand: BattleCard[] } {
  const room = Math.max(0, HAND_LIMIT - hand.length);
  const draws = Math.min(n, room, deck.length);
  return { deck: deck.slice(draws), hand: [...hand, ...deck.slice(0, draws)] };
}

function drawEvents(who: 'me' | 'enemy', before: BattleCard[], after: BattleCard[]): BattleEvent[] {
  return after.slice(before.length).map((card) => ({ type: 'draw', who, cardId: card.id }));
}

function readyField(field: (BattleCard | null)[]): (BattleCard | null)[] {
  return field.map((card) => (card ? { ...card, hasActed: false, justPlayed: false } : card));
}

function addBuff(card: BattleCard, buff: Partial<Stats>): BattleCard {
  const buffs = { ...card.buffs };
  for (const key of Object.keys(buff) as (keyof Stats)[]) {
    buffs[key] = (buffs[key] ?? 0) + (buff[key] ?? 0);
  }
  return { ...card, buffs };
}

function applyBuffToAll(field: (BattleCard | null)[], buff: Partial<Stats>): (BattleCard | null)[] {
  return field.map((card) => (card ? addBuff(card, buff) : card));
}

export function useSkill(state: BattleState, myFieldIdx: number): BattleState {
  const caster = state.field[myFieldIdx];
  if (!caster) throw new Error(`useSkill: no card in my field at index ${myFieldIdx}`);
  if (caster.hasActed) throw new Error('useSkill: this card already acted this turn');
  if (state.cost < caster.skill.cost) {
    throw new Error(`useSkill: not enough cost (have ${state.cost}, need ${caster.skill.cost})`);
  }

  const mySynergies = checkSynergies(state.field.filter((c): c is BattleCard => c !== null));
  const casterStats = calcEffStats(caster, mySynergies);

  let field = [...state.field];
  let eField = [...state.eField];
  let hand = state.hand;
  let deck = state.deck;
  let eHp = state.eHp;
  const log = [...state.log];

  switch (caster.jobClass) {
    case 'dev': {
      const heal = ceilHalf(casterStats.int);
      field = field.map((card) => {
        if (!card) return card;
        const maxHp = calcEffStats(card, mySynergies).hp;
        const currentHp = Math.min(maxHp, (card.currentHp ?? maxHp) + heal);
        return { ...card, currentHp };
      });
      log.push(`${caster.name}의 핫픽스 — 아군 전체 HP ${heal} 회복`);
      break;
    }
    case 'design': {
      const eSynergies = checkSynergies(eField.filter((c): c is BattleCard => c !== null));
      let targetIdx = -1;
      let highestAtk = -Infinity;
      eField.forEach((card, i) => {
        if (!card) return;
        const atk = calcEffStats(card, eSynergies).atk;
        if (atk > highestAtk) {
          highestAtk = atk;
          targetIdx = i;
        }
      });
      if (targetIdx !== -1) {
        const reduction = ceilHalf(casterStats.int);
        eField[targetIdx] = addBuff(eField[targetIdx]!, { atk: -reduction });
        log.push(`${caster.name}의 UI 개편 — 적 최고 ATK 카드 ATK ${reduction} 감소`);
      }
      break;
    }
    case 'hr': {
      field = applyBuffToAll(field, { hp: 2 });
      ({ deck, hand } = drawUpTo(deck, hand, 1));
      log.push(`${caster.name}의 복지 포인트 — 아군 전체 HP +2, 카드 1장 드로우`);
      break;
    }
    case 'finance': {
      field = applyBuffToAll(field, { def: 3 });
      log.push(`${caster.name}의 긴축 예산 — 아군 전체 DEF +3`);
      break;
    }
    case 'legal': {
      const dmg = casterStats.int;
      eHp -= dmg;
      log.push(`${caster.name}의 소송 — 적 히어로에게 ${dmg} 직접 피해`);
      break;
    }
    case 'marketing': {
      field = applyBuffToAll(field, { atk: 2 });
      log.push(`${caster.name}의 캠페인 — 아군 전체 ATK +2`);
      break;
    }
    case 'sales': {
      const aliveIdx = eField.reduce<number[]>((acc, c, i) => (c ? [...acc, i] : acc), []);
      if (aliveIdx.length > 0) {
        const targetIdx = aliveIdx[Math.floor(Math.random() * aliveIdx.length)];
        const target = eField[targetIdx]!;
        const dmg = casterStats.int + 3;
        const hp = (target.currentHp ?? target.finalStats.hp) - dmg;
        eField[targetIdx] = hp <= 0 ? null : { ...target, currentHp: hp };
        log.push(`${caster.name}의 콜드콜 — 적 필드 무작위 카드에게 ${dmg} 피해`);
      }
      break;
    }
    case 'pm': {
      ({ deck, hand } = drawUpTo(deck, hand, 2));
      log.push(`${caster.name}의 로드맵 — 카드 2장 드로우`);
      break;
    }
  }

  const updatedCaster = field[myFieldIdx];
  if (updatedCaster) field[myFieldIdx] = { ...updatedCaster, hasActed: true };

  const next: BattleState = {
    ...state,
    field,
    eField,
    hand,
    deck,
    eHp,
    cost: state.cost - caster.skill.cost,
    log,
    turnEvents: drawEvents('me', state.hand, hand),
  };

  return { ...next, over: checkGameOver(next) };
}

export function endTurn(state: BattleState): BattleState {
  const log = [...state.log];
  const events: BattleEvent[] = [];

  // --- Enemy AI turn ---
  const eMaxCost = Math.min(MAX_COST_CAP, state.eMaxCost + 1);
  let eCost = eMaxCost;
  let { deck: eDeck, hand: eHand } = drawUpTo(state.eDeck, state.eHand, 1);
  events.push(...drawEvents('enemy', state.eHand, eHand));
  const eField = readyField(state.eField);
  let field = [...state.field];
  let myHp = state.myHp;

  // Play up to 2 cards, most expensive first, as cost allows.
  const playOrder = [...eHand].sort((a, b) => b.cost - a.cost);
  let played = 0;
  for (const card of playOrder) {
    if (played >= 2) break;
    const slot = eField.findIndex((c) => c === null);
    if (slot === -1) break;
    if (card.cost > eCost) continue;

    eCost -= card.cost;
    eField[slot] = {
      ...card,
      currentHp: card.finalStats.hp,
      buffs: {},
      hasActed: false,
      justPlayed: true,
    };
    eHand = eHand.filter((c) => c.id !== card.id);
    played += 1;
    events.push({ type: 'play', who: 'enemy', cardId: card.id, slot });
    log.push(`상대가 ${card.name} 카드를 배치`);
  }

  // Each ready enemy card attacks.
  for (let i = 0; i < eField.length; i++) {
    const attacker = eField[i];
    if (!attacker || attacker.hasActed) continue;
    if (attacker.justPlayed && attacker.grade !== 1) continue;

    const eSynergies = checkSynergies(eField.filter((c): c is BattleCard => c !== null));
    const atkStats = calcEffStats(attacker, eSynergies);

    const myAliveIdx = field.reduce<number[]>((acc, c, idx) => (c ? [...acc, idx] : acc), []);

    if (myAliveIdx.length === 0) {
      if (state.turnN === 1) continue; // no first-turn rush
      myHp -= atkStats.atk;
      eField[i] = { ...attacker, hasActed: true };
      events.push({
        type: 'attack',
        who: 'enemy',
        attackerSlot: i,
        target: 'hero',
        myHp,
        eHp: state.eHp,
        attackerHp: attacker.currentHp ?? atkStats.hp,
        targetHp: null,
      });
      log.push(`상대의 ${attacker.name} → 내 히어로에게 ${atkStats.atk} 피해`);
      continue;
    }

    const targetIdx = myAliveIdx.reduce((lowest, idx) => {
      const lowestHp = field[lowest]!.currentHp ?? field[lowest]!.finalStats.hp;
      const idxHp = field[idx]!.currentHp ?? field[idx]!.finalStats.hp;
      return idxHp < lowestHp ? idx : lowest;
    }, myAliveIdx[0]);

    const mySynergies = checkSynergies(field.filter((c): c is BattleCard => c !== null));
    const defender = field[targetIdx]!;
    const defStats = calcEffStats(defender, mySynergies);

    const dmgToDefender = Math.max(1, atkStats.atk - Math.floor(defStats.def / 2));
    const dmgToAttacker = Math.max(1, Math.floor(defStats.atk / 2));

    const defenderHp = (defender.currentHp ?? defStats.hp) - dmgToDefender;
    const attackerHp = (attacker.currentHp ?? atkStats.hp) - dmgToAttacker;

    field[targetIdx] = defenderHp <= 0 ? null : { ...defender, currentHp: defenderHp };
    eField[i] = attackerHp <= 0 ? null : { ...attacker, currentHp: attackerHp, hasActed: true };

    events.push({
      type: 'attack',
      who: 'enemy',
      attackerSlot: i,
      target: targetIdx,
      myHp,
      eHp: state.eHp,
      attackerHp: attackerHp <= 0 ? null : attackerHp,
      targetHp: defenderHp <= 0 ? null : defenderHp,
    });
    log.push(`상대의 ${attacker.name} → ${defender.name}에게 ${dmgToDefender} 피해 (반격 ${dmgToAttacker})`);
  }

  // --- My new turn setup ---
  const maxCost = Math.min(MAX_COST_CAP, state.maxCost + 1);
  const { deck, hand } = drawUpTo(state.deck, state.hand, 1);
  events.push(...drawEvents('me', state.hand, hand));
  field = readyField(field);

  const next: BattleState = {
    ...state,
    field,
    hand,
    deck,
    cost: maxCost,
    maxCost,

    eField,
    eHand,
    eDeck,
    eMaxCost,
    myHp,

    turnN: state.turnN + 1,
    log,
    selectedFieldIdx: null,
    turnEvents: events,
  };

  return { ...next, over: checkGameOver(next) };
}
