import { apiClient } from '@/shared/api/client';

import type { BattleCard, JobClass } from './engine/types';

// Wire shapes from /api/v1/game (docs/api-spec.md §Game) — snake_case.
interface ApiCard {
  id: number;
  person_id: number;
  name: string;
  company: string | null;
  job_class: string;
  job_label: string;
  grade: number;
  grade_label: string;
  stars: number;
  cost: number;
  base_stats: { atk: number; def: number; int: number; hp: number };
  final_stats: { atk: number; def: number; int: number; hp: number };
  skill: { name: string; cost: number; description: string };
  passive: string;
  flavor_text: string;
  created_at: string;
}

interface ApiDeck {
  card_ids: number[];
  count: number;
  max: number;
  avg_cost: number;
}

export function toBattleCard(c: ApiCard): BattleCard {
  return {
    id: c.id,
    personId: c.person_id,
    name: c.name,
    company: c.company ?? '',
    jobClass: c.job_class as JobClass,
    jobLabel: c.job_label,
    grade: c.grade,
    cost: c.cost,
    baseStats: c.base_stats,
    finalStats: c.final_stats,
    skill: c.skill,
    passive: c.passive,
    flavorText: c.flavor_text,
  };
}

export async function fetchCards(): Promise<BattleCard[]> {
  const { data } = await apiClient.get<ApiCard[]>('/game/cards');
  return data.map(toBattleCard);
}

export async function fetchDeck(): Promise<number[]> {
  const { data } = await apiClient.get<ApiDeck>('/game/deck');
  return data.card_ids;
}

export async function saveDeck(cardIds: number[]): Promise<void> {
  await apiClient.put('/game/deck', { card_ids: cardIds });
}

export async function regenerateFlavor(cardId: number): Promise<BattleCard> {
  const { data } = await apiClient.post<ApiCard>(`/game/cards/${cardId}/flavor`);
  return toBattleCard(data);
}
