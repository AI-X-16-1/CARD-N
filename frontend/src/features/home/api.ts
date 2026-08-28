import { apiClient } from '@/shared/api/client';

import type { MyCard, RecentPerson } from './types';

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

// GET /contacts/{id}/image serves the corrected card image directly (FileResponse on
// the backend) — a plain URL for an <Image> source. Only meaningful when has_image is true.
export function personImageUrl(personId: number): string {
  return `${apiClient.defaults.baseURL}/contacts/${personId}/image`;
}

// The backend's MyCard fields are all nullable (a fresh card starts empty); MyCard's own
// fields are non-nullable strings so every screen's controlled <TextInput> can bind to
// `card.field` directly without an `?? ''` at each call site — the null/'' translation
// happens once here instead.
type MyCardApiResponse = {
  name: string;
  company: string | null;
  department: string | null;
  grade: string | null;
  job_function: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  updated_at: string;
};

function toMyCard(response: MyCardApiResponse): MyCard {
  return {
    name: response.name,
    company: response.company ?? '',
    department: response.department ?? '',
    grade: response.grade ?? '',
    job_function: response.job_function ?? '',
    phone: response.phone ?? '',
    email: response.email ?? '',
    address: response.address ?? '',
  };
}

export async function fetchMyCard(): Promise<MyCard> {
  const response = await apiClient.get<MyCardApiResponse>('/contacts/me');
  return toMyCard(response.data);
}

export async function updateMyCard(card: MyCard): Promise<MyCard> {
  const response = await apiClient.put<MyCardApiResponse>('/contacts/me', card);
  return toMyCard(response.data);
}
