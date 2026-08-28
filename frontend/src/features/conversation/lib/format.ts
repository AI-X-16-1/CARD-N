/** Seconds as mm:ss. */
export function formatTime(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Seconds as "1분 20초" / "45초" — for prose, where mm:ss reads like a stopwatch. */
export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '';
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}초`;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

/** Bytes as MB. */
export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '';
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

/** "2026-08-26T14:03:00" -> "2026년 8월 26일". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}
