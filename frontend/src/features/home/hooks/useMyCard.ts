import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MyCard } from '../types';

const STORAGE_KEY = 'cardn-my-card';

const EMPTY_CARD: MyCard = { name: '', company: '', title: '', phone: '', email: '' };

export function useMyCard() {
  const [card, setCard] = useState<MyCard>(EMPTY_CARD);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setCard(JSON.parse(raw));
      })
      .finally(() => setLoaded(true));
  }, []);

  const save = useCallback(async (next: MyCard) => {
    setCard(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  return { card, loaded, save };
}
