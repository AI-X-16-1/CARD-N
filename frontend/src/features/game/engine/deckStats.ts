import type { CompendiumSlot } from './mockCollection';
import type { BattleCard } from './types';

export function averageCost(cards: BattleCard[]): number {
  if (cards.length === 0) return 0;
  return cards.reduce((sum, c) => sum + c.cost, 0) / cards.length;
}

export function compendiumCompletion(slots: CompendiumSlot[]): number {
  if (slots.length === 0) return 0;
  const ownedCount = slots.filter((s) => s.owned.length > 0).length;
  return Math.round((ownedCount / slots.length) * 100);
}
