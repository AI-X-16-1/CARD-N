import { useApi } from '@/shared/hooks/useApi';

import { fetchPerson } from '../api';

export function usePersonDetail(personId: number) {
  const { data, loading, error, refetch } = useApi(() => fetchPerson(personId), [personId]);

  return { person: data, loading, error, refetch };
}
