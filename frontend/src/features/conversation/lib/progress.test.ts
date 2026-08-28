import { formatDuration } from './format';
import { MAX_ESTIMATED_PERCENT, transcribeProgress } from './progress';

describe('transcribeProgress', () => {
  it('reports how far along a transcription of known length is', () => {
    expect(transcribeProgress(0, 60)).toEqual({ percent: 0, remainingSeconds: 60 });
    expect(transcribeProgress(30, 60)).toEqual({ percent: 50, remainingSeconds: 30 });
  });

  it('holds the bar short of full while the work is still running', () => {
    // Whisper reports nothing until it finishes, so a full bar would be a claim the
    // estimate cannot make — it reads as a stall rather than as an estimate.
    expect(transcribeProgress(60, 60).percent).toBe(MAX_ESTIMATED_PERCENT);
    expect(transcribeProgress(600, 60).percent).toBe(MAX_ESTIMATED_PERCENT);
  });

  it('never counts past zero when the audio outlasts its own length', () => {
    // The panel switches to "거의 다 됐어요" here rather than showing "약 -20초 남음".
    expect(transcribeProgress(80, 60).remainingSeconds).toBe(0);
  });

  it('gives up rather than dividing by an unknown length', () => {
    // The file picker reports a name and a size but never a duration, and the probe
    // that fills that in is allowed to fail.
    expect(transcribeProgress(10, 0)).toEqual({ percent: 0, remainingSeconds: 0 });
    expect(transcribeProgress(10, Number.NaN)).toEqual({ percent: 0, remainingSeconds: 0 });
  });
});

describe('formatDuration', () => {
  it('reads as prose, not as a stopwatch', () => {
    expect(formatDuration(45)).toBe('45초');
    expect(formatDuration(80)).toBe('1분 20초');
    expect(formatDuration(120)).toBe('2분');
  });

  it('has nothing to say about a duration it does not have', () => {
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(Number.NaN)).toBe('');
  });
});
