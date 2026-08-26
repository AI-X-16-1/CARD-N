import { useApi } from '@/shared/hooks/useApi';

import { fetchConversations } from '../api';

export function useConversations(personId: number) {
  const { data, loading, error, refetch } = useApi(() => fetchConversations(personId), [personId]);

  return { conversations: data ?? [], loading, error, refetch };
}
