import { useCallback, useState } from 'react';

import { findCallRecordingsForPhone, type CallRecordingMatch, type CallRecordingSearchResult } from '../lib/callRecordings';
import { summarizeCallRecording } from '../api';

type SummaryStatus = 'idle' | 'summarizing' | 'done' | 'error';

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
          [match.id]: e instanceof Error ? e.message : '요약 생성에 실패했어요.',
        }));
      }
    },
    [personId]
  );

  return { searching, result, searchError, search, summaryStatus, summaryError, generateSummary };
}
