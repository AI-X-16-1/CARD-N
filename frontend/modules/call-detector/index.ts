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
 * Used when the native side is not there — on iOS, which exposes call state to CallKit
 * extensions only, and in any build that leaves the module out of autolinking (the
 * default; see package.json's expo.autolinking.exclude). Keeps callers from having to
 * branch on either.
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

function resolveNativeModule(): CallDetectorModuleType | null {
  if (Platform.OS !== 'android') return null;
  try {
    return requireNativeModule<CallDetectorModuleType>('CallDetector');
  } catch {
    // Not linked into this build. The Play Store build excludes it on purpose — its
    // manifest declares READ_CALL_LOG, a restricted permission — so this is the normal
    // path there, not an error. requireNativeModule throws rather than returning null,
    // hence the catch.
    return null;
  }
}

const nativeModule = resolveNativeModule();

const CallDetector = nativeModule ?? stub;

/**
 * False on iOS, and false in any build the module was excluded from. Callers use it to
 * skip the feature entirely: `shouldShowCallAlertConsent` returns false, so the consent
 * screen never opens, and the contact sync no-ops.
 */
export const isCallAlertSupported = nativeModule !== null;

export default CallDetector;
