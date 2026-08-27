import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import CallDetector, { isCallAlertSupported } from '../../../../modules/call-detector';
import { fetchContactSnapshots } from '../api';

type SyncState = {
  cachedCount: number;
  syncing: boolean;
  error: string | null;
};

// Re-syncing on every foreground would hammer the API when the user is switching apps;
// once every few minutes is plenty for "who called and what did we last discuss".
const MIN_RESYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Keeps the native cache fresh while the app is open.
 *
 * The alert itself never runs through here — by the time a call arrives this JS is
 * usually gone, and the native receiver reads the cache on its own. All this does is
 * make sure the cache reflects the server.
 */
export function useCallAlertSync(enabled: boolean): SyncState & { sync: () => Promise<void> } {
  const [state, setState] = useState<SyncState>({
    cachedCount: 0,
    syncing: false,
    error: null,
  });
  const lastSyncedAt = useRef(0);
  const inFlight = useRef(false);

  const sync = useCallback(async () => {
    if (!isCallAlertSupported || !enabled) return;
    if (inFlight.current) return;

    inFlight.current = true;
    setState((prev) => ({ ...prev, syncing: true, error: null }));
    try {
      const snapshots = await fetchContactSnapshots();
      const cachedCount = CallDetector.setContacts(snapshots);
      lastSyncedAt.current = Date.now();
      setState({ cachedCount, syncing: false, error: null });
    } catch {
      // A failed sync leaves the previous cache in place, which is the useful
      // behaviour: a slightly stale alert beats no alert.
      setState((prev) => ({
        ...prev,
        syncing: false,
        error: '인맥 정보를 새로 받아오지 못했어요. 이전에 받아둔 정보로 알림이 표시됩니다.',
      }));
    } finally {
      inFlight.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!isCallAlertSupported) return;

    if (!enabled) {
      // Consent withdrawn (or never given): the local copy must not outlive it.
      CallDetector.clearCache();
      setState({ cachedCount: 0, syncing: false, error: null });
      return;
    }

    void sync();

    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') return;
      if (Date.now() - lastSyncedAt.current < MIN_RESYNC_INTERVAL_MS) return;
      void sync();
    });
    return () => subscription.remove();
  }, [enabled, sync]);

  return { ...state, sync };
}
