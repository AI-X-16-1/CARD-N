import { useState } from 'react';

import { useApi } from '@/shared/hooks/useApi';

import { fetchContacts } from '../api';
import type { RelationFilter } from '../types';

export function useContactList() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<RelationFilter>('all');

  const { data, loading, error, refetch } = useApi(
    () => fetchContacts(query, category),
    [query, category],
  );

  return {
    total: data?.total ?? 0,
    contacts: data?.items ?? [],
    loading,
    error,
    query,
    setQuery,
    category,
    setCategory,
    refetch,
  };
}
