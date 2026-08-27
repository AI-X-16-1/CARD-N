import { useCallback, useEffect, useState } from 'react';

import { fetchMyCard, updateMyCard } from '../api';
import type { MyCard } from '../types';

const EMPTY_CARD: MyCard = {
  name: '',
  company: '',
  department: '',
  grade: '',
  job_function: '',
  phone: '',
  email: '',
  address: '',
};

// Backed by GET/PUT /api/v1/contacts/me (a single-row `my_card` table — there's only
// ever one owner in this app) rather than local device storage, so the card survives a
// reinstall and stays in sync if it's ever edited from more than one device.
export function useMyCard() {
  const [card, setCard] = useState<MyCard>(EMPTY_CARD);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchMyCard()
      .then(setCard)
      .catch(() => {
        // Home is the first screen on a cold start and this can race the backend still
        // coming up (same window useRecentContacts guards against) — fall back to the
        // empty card rather than blocking the screen on a retry loop; the next save
        // attempt (or a later refetch) will surface a real, actionable error instead.
      })
      .finally(() => setLoaded(true));
  }, []);

  const save = useCallback(async (next: MyCard) => {
    const saved = await updateMyCard(next);
    setCard(saved);
  }, []);

  return { card, loaded, save };
}
