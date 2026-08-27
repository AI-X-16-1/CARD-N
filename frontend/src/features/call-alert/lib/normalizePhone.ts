/**
 * Reduce a phone number to comparable digits.
 *
 * Mirrored in `modules/call-detector/android/.../PhoneNumbers.kt`. This copy normalizes
 * the contact numbers that become cache keys; the Kotlin copy normalizes the number the
 * telephony API reports at ring time, when no JS runtime is running. The two must agree
 * — change them together. The tests for both live next to this file.
 */

// Every domestic Korean number starts with 0, so digits that begin with a country code
// and continue with something else are unambiguous.
const COUNTRY_PREFIXES = ['0082', '82'];

export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';

  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0') && !digits.startsWith('0082')) return digits;

  for (const prefix of COUNTRY_PREFIXES) {
    if (!digits.startsWith(prefix)) continue;
    const national = digits.slice(prefix.length);
    // Only a country code if a national number follows. If what remains already starts
    // with 0 it never was one, so leave the digits alone rather than guess.
    if (national && !national.startsWith('0')) return `0${national}`;
    break;
  }

  return digits;
}
