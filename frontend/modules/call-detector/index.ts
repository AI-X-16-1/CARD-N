import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

export type CachedContact = {
  /** Any format; the native side normalizes it into the cache key. */
  phone: string;
  personId: number;
  name: string;
  /** Latest conversation one-liner, or null when the contact has no history yet. */
  summary: string | null;
};

export type CallAlertPermissions = {
  phone: boolean;
  callLog: boolean;
  notifications: boolean;
};

type CallDetectorModuleType = {
  getPermissionStatus(): CallAlertPermissions;
  requestPermissions(): Promise<void>;
  /** Replaces the cached snapshot wholesale; returns how many entries were stored. */
  setContacts(contacts: CachedContact[]): number;
  getCachedCount(): number;
  clearCache(): void;
  /** True once the consent screen has been answered, either way. Survives restarts. */
  getConsentPromptSeen(): boolean;
  markConsentPromptSeen(): void;
};

/**
 * Android-only: iOS exposes call state to CallKit extensions only, which this app has no
 * path to. The stub keeps callers from having to branch on Platform.OS.
 */
const stub: CallDetectorModuleType = {
  getPermissionStatus: () => ({ phone: false, callLog: false, notifications: false }),
  requestPermissions: async () => {},
  setContacts: () => 0,
  getCachedCount: () => 0,
  clearCache: () => {},
  // Reported as already seen so unsupported platforms never open the consent screen.
  getConsentPromptSeen: () => true,
  markConsentPromptSeen: () => {},
};

const CallDetector =
  Platform.OS === 'android' ? requireNativeModule<CallDetectorModuleType>('CallDetector') : stub;

export const isCallAlertSupported = Platform.OS === 'android';

export default CallDetector;
