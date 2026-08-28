import type { BattleCard } from './types';

// Role passives — always-on effects keyed off a card's jobClass (the
// PASSIVE map name is 1:1 with jobClass). These are small pure helpers;
// the state mutation they imply happens in battle.ts where the field
// arrays live. Each helper that fires also contributes a Korean log line
// via the PASSIVE_LOG label so the battle log can show it.

export const PASSIVE_LABEL: Record<string, string> = {
  dev: '밤샘코딩',
  design: '디테일광',
  hr: '복지왕',
  finance: '짠돌이',
  legal: '빈틈없음',
  marketing: '트렌드세터',
  sales: '영업왕',
  pm: '일정관리',
};

function line(jobClass: string, body: string): string {
  return `패시브 · ${PASSIVE_LABEL[jobClass]} — ${body}`;
}

// dev — 밤샘코딩: this card's attacks only contend with half of the
// target's DEF (mitigation uses floor(DEF/4) instead of floor(DEF/2)).
export function defMitigationDivisor(attacker: BattleCard): number {
  return attacker.jobClass === 'dev' ? 4 : 2;
}

export function devPierceLog(): string {
  return line('dev', '방어력 절반 무시');
}

// finance — 짠돌이: this card shrugs off 1 extra damage from every hit it
// takes (as defender, and as an attacker eating a counterattack).
export function extraDamageReduction(card: BattleCard): number {
  return card.jobClass === 'finance' ? 1 : 0;
}

export function financeReduceLog(): string {
  return line('finance', '피해 -1');
}

// legal — 빈틈없음: takes no counterattack damage when it attacks.
export function ignoresCounter(attacker: BattleCard): boolean {
  return attacker.jobClass === 'legal';
}

export function legalNoCounterLog(): string {
  return line('legal', '반격 무효');
}

// sales — 영업왕: +2 damage when this card attacks the enemy hero.
export function heroAttackBonus(attacker: BattleCard): number {
  return attacker.jobClass === 'sales' ? 2 : 0;
}

export function salesHeroLog(): string {
  return line('sales', '히어로 피해 +2');
}

// design — 디테일광: an attacker that strikes this card permanently loses 1 ATK.
export function retaliatesWithAtkDebuff(defender: BattleCard): boolean {
  return defender.jobClass === 'design';
}

export function designDebuffLog(attackerName: string): string {
  return line('design', `${attackerName} ATK -1 (영구)`);
}

// marketing — 트렌드세터: placing this card grants every OTHER ally already
// on the field a permanent +1 ATK (one-time, on enter).
export function marketingEntryLog(): string {
  return line('marketing', '다른 아군 전체 ATK +1');
}

// hr — 복지왕: at the start of the turn, heals the allies in the two
// adjacent field slots by 1 (up to their max HP).
export function hrRegenLog(allyName: string): string {
  return line('hr', `${allyName} HP +1`);
}

// pm — 일정관리: at turn start, if this side's hand is down to 2 or fewer,
// draw 1 extra card.
export function pmDrawLog(): string {
  return line('pm', '카드 1장 드로우');
}
