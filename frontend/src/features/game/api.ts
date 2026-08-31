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
  illustration_url: string | null;
  created_at: string;
}

interface ApiDeck {
  card_ids: number[];
  count: number;
  max: number;
  avg_cost: number;
}

// The backend stores illustration_url as a bare filename ("1.png") served by
// GET /game/cards/{id}/illustration, but a value set via PUT /art can also be a
// full URL (e.g. a dev picsum placeholder). Pass full URLs through; turn a bare
// filename into the served endpoint.
function resolveArtUrl(raw: string | null, cardId: number): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  return `${apiClient.defaults?.baseURL ?? ''}/game/cards/${cardId}/illustration`;
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
    illustrationUrl: resolveArtUrl(c.illustration_url, c.id),
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

// Card-art generation via the cardcreate module (ComfyUI). Renders the
// illustration from the contact's saved business-card photo and attaches it to
// the card server-side, so callers should re-fetch the collection afterwards.
// The ComfyUI pipeline takes seconds-to-minutes, well past the client's default
// timeout, so give this call its own generous one.
export async function generateCardArt(cardId: number): Promise<void> {
  await apiClient.post(`/game/cards/${cardId}/illustration`, undefined, { timeout: 300_000 });
}
