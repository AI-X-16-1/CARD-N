import { useCallback, useState } from 'react';

import { findCallRecordingsForPhone, type CallRecordingMatch, type CallRecordingSearchResult } from '../lib/callRecordings';
import { summarizeCallRecording } from '../api';

type SummaryStatus = 'idle' | 'summarizing' | 'done' | 'error';

/**
 * Say which of the three requests failed, and how.
 *
 * summarizeCallRecording chains transcribe -> summarize -> save, so a bare
 * `e.message` ("Network Error") names neither the step nor the cause — and those read
 * very differently: ECONNABORTED is our own timeout firing, while a plain transport
 * error means the request never left the device.
 */
function describeFailure(e: unknown): string {
  const error = e as {
    code?: string;
    message?: string;
    config?: { url?: string };
    response?: { data?: { detail?: string } };
  };

  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail) return detail;

  const message = error?.message ?? '요약 생성에 실패했어요.';
  const where = [error?.config?.url, error?.code].filter(Boolean).join(', ');
  return where ? `${message} (${where})` : message;
}

export function useCallRecordingFinder(personId: number, phone: string | null) {
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<CallRecordingSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<Record<string, SummaryStatus>>({});
  const [summaryError, setSummaryError] = useState<Record<string, string>>({});

  const search = useCallback(async () => {
    if (!phone) return;
    setSearching(true);
    setSearchError(null);
    try {
      setResult(await findCallRecordingsForPhone(phone));
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : '통화 녹음을 검색하지 못했어요.');
    } finally {
      setSearching(false);
    }
  }, [phone]);

  // Per-match, not global — one failed summary shouldn't block the others from being retried.
  const generateSummary = useCallback(
    async (match: CallRecordingMatch) => {
      setSummaryStatus((prev) => ({ ...prev, [match.id]: 'summarizing' }));
      setSummaryError((prev) => {
        const { [match.id]: _drop, ...rest } = prev;
        return rest;
      });
      try {
        await summarizeCallRecording(personId, match);
        setSummaryStatus((prev) => ({ ...prev, [match.id]: 'done' }));
      } catch (e) {
        setSummaryStatus((prev) => ({ ...prev, [match.id]: 'error' }));
        setSummaryError((prev) => ({
          ...prev,
          [match.id]: describeFailure(e),
        }));
      }
    },
    [personId]
  );

  const dismissSearchError = useCallback(() => setSearchError(null), []);

  return {
    searching,
    result,
    searchError,
    search,
    dismissSearchError,
    summaryStatus,
    summaryError,
    generateSummary,
  };
}
