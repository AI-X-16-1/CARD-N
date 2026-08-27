import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { useApi } from '@/shared/hooks/useApi';

import { fetchRecentContacts } from '../api';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_ROWS = 3;

// Home is the first screen shown on a cold app start, so this can fire before the
// backend (Docker) has finished coming up — a brief silent retry absorbs that instead
// of surfacing a network error the user can do nothing about but wait a second.
const RETRY_DELAYS_MS = [800, 1600, 3200];

async function fetchRecentContactsWithRetry() {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchRecentContacts();
    } catch (error) {
      if (attempt >= RETRY_DELAYS_MS.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}

export function useRecentContacts() {
  const { data, loading, error, refetch } = useApi(fetchRecentContactsWithRetry, []);

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
