// design-tokens.md "Tint helper": use a token's hex at 16% alpha for badge/avatar
// backgrounds (e.g. rgba(108, 92, 231, 0.16) for the primary/dev tint).
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
