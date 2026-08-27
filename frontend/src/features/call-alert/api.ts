import { apiClient } from '@/shared/api/client';

import { normalizePhone } from './lib/normalizePhone';

/**
 * Builds the phone -> contact snapshot the native receiver reads when a call arrives.
 *
 * Uses the existing contacts and conversation endpoints as they are — this feature adds
 * no backend surface, so it needs no other team's folder. See docs/call-alert-spec.md.
 */

// The contact list is one person's professional network; a single page covers it. The
// endpoint caps limit at 100.
const CONTACT_PAGE_SIZE = 100;

type ContactListItem = {
  id: number;
  name: string;
  phone: string | null;
};

type ConversationListItem = {
  one_liner: string;
};

export type ContactSnapshot = {
  phone: string;
  personId: number;
  name: string;
  summary: string | null;
};

async function fetchLatestSummary(personId: number): Promise<string | null> {
  try {
    const { data } = await apiClient.get<{ items: ConversationListItem[] }>('/conversations', {
      params: { person_id: personId, limit: 1 },
    });
    // Already ordered newest-first server-side.
    return data.items[0]?.one_liner ?? null;
  } catch {
    // A contact whose history can't be read still belongs in the cache — the alert just
    // falls back to "아직 대화 기록이 없어요" rather than not firing at all.
    return null;
  }
}

export async function fetchContactSnapshots(): Promise<ContactSnapshot[]> {
  const { data } = await apiClient.get<{ items: ContactListItem[] }>('/contacts', {
    params: { limit: CONTACT_PAGE_SIZE },
  });

  // Only contacts with a usable number can ever be matched against a caller.
  const reachable = data.items.filter((item) => normalizePhone(item.phone).length > 0);

  const summaries = await Promise.all(reachable.map((item) => fetchLatestSummary(item.id)));

  return reachable.map((item, index) => ({
    phone: item.phone as string,
    personId: item.id,
    name: item.name,
    summary: summaries[index],
  }));
}
