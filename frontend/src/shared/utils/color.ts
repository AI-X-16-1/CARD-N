// design-tokens.md "Tint helper": use a token's hex at 16% alpha for badge/avatar
// backgrounds (e.g. rgba(108, 92, 231, 0.16) for the primary/dev tint). Some tokens
// (e.g. colors.textMuted, the Avatar/Badge default) are already rgba(...) strings
// rather than hex, so parse both — otherwise the hex path silently produces
// rgba(NaN, NaN, NaN, ...) for those defaults.
export function hexToRgba(color: string, alpha: number): string {
  const rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbaMatch) {
    const [, r, g, b] = rgbaMatch;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  let hex = color.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
