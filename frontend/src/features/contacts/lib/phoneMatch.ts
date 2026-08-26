// Pure matching logic for the call-recording-import feature, deliberately kept free of any
// expo-contacts/expo-media-library import so it stays unit-testable without mocking native
// modules (run: node --experimental-strip-types phoneMatch.test.ts).

export const PHONE_NUMBER_SUFFIX_LEN = 8;
// Below this length a suffix match is too ambiguous — a short normalized number would match
// almost any filename containing those digits anywhere.
export const MIN_RELIABLE_PHONE_DIGITS = 7;

export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('82')) digits = `0${digits.slice(2)}`;
  return digits;
}

function filenameDigits(filename: string): string {
  return filename.replace(/\D/g, '');
}

export function filenameMatchesNumber(filename: string, normalizedNumber: string): boolean {
  if (!normalizedNumber || normalizedNumber.length < MIN_RELIABLE_PHONE_DIGITS) return false;
  const suffix = normalizedNumber.slice(-PHONE_NUMBER_SUFFIX_LEN);
  return filenameDigits(filename).includes(suffix);
}

export function filenameMatchesName(filename: string, name: string | null | undefined): boolean {
  const trimmedName = name?.trim();
  if (!trimmedName) return false;
  return filename.toLowerCase().includes(trimmedName.toLowerCase());
}
