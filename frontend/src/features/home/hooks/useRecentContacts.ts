import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { useApi } from '@/shared/hooks/useApi';

import { fetchRecentContacts } from '../api';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_ROWS = 3;

export function useRecentContacts() {
  const { data, loading, error, refetch } = useApi(fetchRecentContacts, []);

  // Home stays mounted once visited (bottom tabs keep screens alive), so without this
  // a contact saved via the Scan modal never shows up here until the app restarts.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

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
