/**
 * How far along the transcription is, estimated from how long the audio runs.
 *
 * Whisper reports nothing until it is finished, so there is no real progress to read —
 * only the elapsed clock and an expectation. That makes the two clamps here the whole
 * point of the function rather than defensive trimming:
 *
 * - the bar stops short of full, because an estimate that reaches 100% while the work
 *   is still running reads as a stall rather than as an estimate;
 * - the countdown floors at zero, and the panel says "거의 다 됐어요" from there instead
 *   of counting into negative numbers when the audio takes longer than its length.
 */
export const MAX_ESTIMATED_PERCENT = 95;

export type TranscribeProgress = {
  percent: number;
  remainingSeconds: number;
};

export function transcribeProgress(
  elapsedSeconds: number,
  expectedSeconds: number,
): TranscribeProgress {
  if (!(expectedSeconds > 0) || !Number.isFinite(expectedSeconds)) {
    return { percent: 0, remainingSeconds: 0 };
  }

  const ratio = Math.max(0, elapsedSeconds) / expectedSeconds;
  return {
    percent: Math.min(ratio * 100, MAX_ESTIMATED_PERCENT),
    remainingSeconds: Math.max(0, expectedSeconds - elapsedSeconds),
  };
}
