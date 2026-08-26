// Mirrors features/contacts/formatRelativeTime.ts — not imported directly since
// features/* -> features/* imports are forbidden (docs/architecture.md).
export function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return '';

  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 30) return `${days}일 전`;
  return new Date(isoDate).toLocaleDateString('ko-KR');
}
