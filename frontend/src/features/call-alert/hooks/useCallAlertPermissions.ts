import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import CallDetector, {
  isCallAlertSupported,
  type CallAlertPermissions,
} from '../../../../modules/call-detector';

const NONE: CallAlertPermissions = { phone: false, callLog: false, notifications: false };

export function useCallAlertPermissions() {
  const [permissions, setPermissions] = useState<CallAlertPermissions>(NONE);

  const refresh = useCallback(() => {
    setPermissions(isCallAlertSupported ? CallDetector.getPermissionStatus() : NONE);
  }, []);

  const request = useCallback(async () => {
    if (!isCallAlertSupported) return;
    await CallDetector.requestPermissions();
    // The OS dialog resolves on the Activity, not through the promise above, so the
    // answer is picked up when the app comes back to the foreground.
  }, []);

  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  // READ_CALL_LOG is not optional: without it Android hands the receiver a blank number
  // (API 28+), so the feature cannot match anyone.
  const granted = permissions.phone && permissions.callLog && permissions.notifications;

  return { permissions, granted, request, refresh, supported: isCallAlertSupported };
}
