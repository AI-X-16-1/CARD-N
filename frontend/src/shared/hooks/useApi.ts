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
  // Guards against a stale response overwriting a newer one — e.g. PersonDetail
  // navigating A -> B re-triggers this hook for each id, and if A's request
  // resolves after B's (ordinary network timing variance), A's data must not
  // clobber the screen that's already showing B.
  const requestIdRef = useRef(0);

  const refetch = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetcherRef
      .current()
      .then((data) => {
        if (requestIdRef.current === requestId) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (requestIdRef.current === requestId) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : '요청에 실패했어요',
          });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { ...state, refetch };
}
