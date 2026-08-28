import { useCallAlertPermissions } from '../hooks/useCallAlertPermissions';
import { useCallAlertSync } from '../hooks/useCallAlertSync';

/**
 * Keeps the native call-alert cache fresh for as long as the app is running.
 *
 * Mounted once at the app root, and renders nothing. It has to live above the navigator
 * rather than on a screen: the alert is read by a Kotlin BroadcastReceiver at ring time,
 * long after any screen has been unmounted and usually after the process itself is gone,
 * so the cache is only ever written while the app happens to be open. Hanging that off a
 * screen nobody visits would leave the cache empty and the feature silently inert.
 *
 * On iOS `useCallAlertSync` no-ops, so this costs nothing there.
 */
export function CallAlertSync() {
  const { granted } = useCallAlertPermissions();
  useCallAlertSync(granted);
  return null;
}
