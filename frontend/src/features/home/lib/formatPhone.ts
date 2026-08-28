// Live-formats digits into a Korean phone number ("010-1234-5678") as the user types.
// Runs on every keystroke against the full current value (not just the new character),
// so pasting or typing a number with other separators (spaces, dots, parens, ...) also
// normalizes to '-' instead of keeping whatever was typed.
//
// Duplicated in features/contacts/lib/formatPhone.ts and features/scan/lib/formatPhone.ts
// — frontend/CLAUDE.md's feature-folder boundary rule (no cross-feature imports outside
// shared/).
export function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  const len = digits.length;

  if (digits.startsWith('02')) {
    if (len < 3) return digits;
    if (len < 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (len < 10) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }

  if (len < 4) return digits;
  if (len < 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (len < 11) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}
