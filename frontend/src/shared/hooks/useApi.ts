import { useCallback, useEffect, useRef, useState } from 'react';

type ApiState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<ApiState<T>>({ data: null, loading: true, error: null });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetcherRef
      .current()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) =>
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : '요청에 실패했어요',
        }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { ...state, refetch };
}
