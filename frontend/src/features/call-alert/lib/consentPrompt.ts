import CallDetector, { isCallAlertSupported } from '../../../../modules/call-detector';

/**
 * Whether the app should open on the call-alert consent screen.
 *
 * Synchronous so the navigator can pick its initial route on the first render — an async
 * read would show a blank frame, or worse, flash the tabs before replacing them.
 *
 * The flag is only ever set by the consent screen itself, and survives `clearCache()`:
 * withdrawing permission turns the feature off but does not re-ask on the next launch.
 */
export function shouldShowCallAlertConsent(): boolean {
  if (!isCallAlertSupported) return false;
  try {
    return !CallDetector.getConsentPromptSeen();
  } catch {
    // A missing/older native module must not keep the app out of its own home screen.
    return false;
  }
}
