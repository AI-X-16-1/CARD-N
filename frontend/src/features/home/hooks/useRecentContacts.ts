import { useApi } from '@/shared/hooks/useApi';

import { fetchRecentContacts } from '../api';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_ROWS = 3;

export function useRecentContacts() {
  const { data, loading, error } = useApi(fetchRecentContacts, []);
  const items = data?.items ?? [];
  const now = Date.now();

  return {
    total: data?.total ?? 0,
    newThisWeek: items.filter((p) => now - new Date(p.created_at).getTime() < WEEK_MS).length,
    recent: items.slice(0, RECENT_ROWS),
    loading,
    error,
  };
}
