import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MyCard } from '../types';

const STORAGE_KEY = 'cardn-my-card';

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

export function useMyCard() {
  const [card, setCard] = useState<MyCard>(EMPTY_CARD);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        // Merged onto EMPTY_CARD rather than used as-is: a card saved before
        // department/grade/job_function/address (or the old title field) existed is
        // missing those keys entirely, and an undefined value on a controlled
        // TextInput reads as a crash risk waiting to happen.
        if (raw) setCard((prev) => ({ ...prev, ...JSON.parse(raw) }));
      })
      .finally(() => setLoaded(true));
  }, []);

  const save = useCallback(async (next: MyCard) => {
    setCard(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  return { card, loaded, save };
}
