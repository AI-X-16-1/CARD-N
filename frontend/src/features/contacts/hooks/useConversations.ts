import { useCallback, useEffect, useState } from 'react';

import { fetchConversations } from '../api';
import type { Conversation } from '../types';

const PAGE_SIZE = 10;

export function useConversations(personId: number) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (offset: number, append: boolean) => {
      (append ? setLoadingMore : setLoading)(true);
      setError(null);
      try {
        const page = await fetchConversations(personId, PAGE_SIZE, offset);
        setConversations((prev) => (append ? [...prev, ...page.items] : page.items));
        setTotal(page.total);
      } catch (e) {
        setError(e instanceof Error ? e.message : '불러오지 못했어요');
      } finally {
        (append ? setLoadingMore : setLoading)(false);
      }
    },
    [personId],
  );

  useEffect(() => {
    load(0, false);
  }, [load]);

  const loadMore = useCallback(() => load(conversations.length, true), [load, conversations.length]);
  const refetch = useCallback(() => load(0, false), [load]);

  return {
    conversations,
    loading,
    loadingMore,
    error,
    hasMore: conversations.length < total,
    loadMore,
    refetch,
  };
}
