import { apiClient } from '@/shared/api/client';

import type { RecentPerson } from './types';

// Fetched wider than the 3 actually shown so "이번 주 새로운 인연" (new this week) can be
// counted client-side from real data instead of a guess — there's no dedicated stats
// endpoint for that yet. Assumes the contact list stays small (local dev, no deployment).
const FETCH_LIMIT = 50;

export async function fetchRecentContacts(): Promise<{ total: number; items: RecentPerson[] }> {
  const response = await apiClient.get<{ total: number; items: RecentPerson[] }>('/contacts', {
    params: { limit: FETCH_LIMIT },
  });
  return response.data;
}
