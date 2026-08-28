import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useRef, useState } from 'react';

import { saveConversation, summarizeTranscript, transcribeAudio } from '../api';
import { readAudioDuration } from '../lib/audioDuration';
import type {
  ConversationSummary,
  FlowPhase,
  PickedAudio,
  SummaryContextPerson,
  TranscribeResult,
} from '../types';

const BUSY_PHASES: FlowPhase[] = ['uploading', 'transcribing', 'summarizing'];

/**
 * Whisper on a CPU transcribes at roughly the length of the audio, which is what the
 * progress estimate is built on. It is a rough figure and deliberately treated as one:
 * the panel keeps the bar short of full and stops naming a number once the estimate is
 * spent, rather than counting down to a zero that the transcription then runs past.
 */
const SECONDS_OF_WORK_PER_SECOND_OF_AUDIO = 1;

function messageOf(error: unknown, fallback: string): string {
  // FastAPI puts its message in {detail: "..."}; axios buries that under response.data.
  const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * Drives one upload -> transcribe -> summarize -> save pass.
 *
 * The transcript is editable between the two AI steps on purpose: fixing a misheard
 * word before summarizing is by far the cheapest way to improve the result.
 */
export function useConversationFlow(personId: number | undefined) {
  const [phase, setPhase] = useState<FlowPhase>('idle');
  const [audio, setAudio] = useState<PickedAudio | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [sttMeta, setSttMeta] = useState<TranscribeResult | null>(null);
  const [summary, setSummary] = useState<ConversationSummary | null>(null);
  const [summaryContext, setSummaryContext] = useState<SummaryContextPerson | null>(null);
  const [historyUsed, setHistoryUsed] = useState(0);
  const [model, setModel] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [audioSeconds, setAudioSeconds] = useState<number | null>(null);
  const [sttElapsed, setSttElapsed] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Elapsed time only runs while something is actually in flight.
  useEffect(() => {
    const busy = BUSY_PHASES.includes(phase);
    if (busy && timerRef.current === null) {
      const start = Date.now();
      timerRef.current = setInterval(() => setElapsed((Date.now() - start) / 1000), 100);
    }
    if (!busy && timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [phase]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    },
    [],
  );

  // `elapsed` runs from the start of the upload, but the estimate is about Whisper
  // alone — mixing the upload into it would report a job that is further along than it
  // is, by however long the file took to reach the server.
  useEffect(() => {
    if (phase !== 'transcribing') return;
    const start = Date.now();
    setSttElapsed(0);
    const id = setInterval(() => setSttElapsed((Date.now() - start) / 1000), 100);
    return () => clearInterval(id);
  }, [phase]);

  const reset = useCallback(() => {
    setPhase('idle');
    setAudio(null);
    setUploadPercent(0);
    setTranscript('');
    setSttMeta(null);
    setSummary(null);
    setSummaryContext(null);
    setHistoryUsed(0);
    setElapsed(0);
    setError('');
    setSaved(false);
    setSaving(false);
    setAudioSeconds(null);
    setSttElapsed(0);
  }, []);

  /**
   * Upload one audio file and run STT on it.
   *
   * Both entry points land here — the file picker and the microphone — so the rest of
   * the flow never has to know where the audio came from.
   */
  const transcribe = useCallback(
    async (file: PickedAudio) => {
      reset();
      setAudio(file);
      setPhase('uploading');

      if (file.durationSeconds != null && file.durationSeconds > 0) {
        setAudioSeconds(file.durationSeconds);
      } else {
        // Deliberately not awaited. The estimate is a nicety; making the upload wait on
        // it would trade something the user needs for something they merely like.
        readAudioDuration(file.uri)
          .then((seconds) => {
            if (seconds != null && seconds > 0) setAudioSeconds(seconds);
          })
          .catch(() => {});
      }

      try {
        const result = await transcribeAudio(file, 'ko', (percent) => {
          setUploadPercent(percent);
          // Upload finished; the server is now busy with Whisper.
          if (percent >= 100) setPhase('transcribing');
        });
        setSttMeta(result);
        setTranscript(result.text);
        setPhase(result.text.trim() ? 'transcribed' : 'error');
        if (!result.text.trim()) {
          setError('음성에서 텍스트를 찾지 못했어요. 다시 녹음하거나 다른 파일로 시도해 보세요.');
        }
      } catch (e) {
        setError(messageOf(e, '음성 인식에 실패했어요.'));
        setPhase('error');
      }
    },
    [reset],
  );

  /** Open the system file picker and run STT on whatever comes back. */
  const pickAndTranscribe = useCallback(async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    await transcribe({
      uri: asset.uri,
      name: asset.name ?? 'recording.m4a',
      mimeType: asset.mimeType ?? null,
      size: asset.size ?? null,
      file: (asset as { file?: unknown }).file,
    });
  }, [transcribe]);

  /** Summarize the (possibly hand-corrected) transcript. */
  const runSummary = useCallback(async () => {
    if (!transcript.trim()) return;
    setPhase('summarizing');
    setError('');

    try {
      const data = await summarizeTranscript(
        transcript,
        personId ?? null,
        sttMeta ? Math.round(sttMeta.duration_seconds) : undefined,
      );
      setSummary(data.result);
      setSummaryContext(data.person);
      setHistoryUsed(data.history_used);
      setModel(data.model);
      setPhase('done');
    } catch (e) {
      setError(messageOf(e, '요약에 실패했어요.'));
      setPhase('error');
    }
  }, [transcript, personId, sttMeta]);

  /**
   * Persist the summary to the contact's timeline. The audio is already gone.
   *
   * Reports whether it landed so the screen can leave for the contact's records only
   * on success — a failure has to stay put, with the summary still on screen to retry.
   */
  const save = useCallback(async (): Promise<boolean> => {
    if (personId === undefined || !summary) return false;
    setSaving(true);
    setError('');
    try {
      await saveConversation({
        personId,
        transcript,
        summary,
        durationSeconds: sttMeta ? Math.round(sttMeta.duration_seconds) : undefined,
      });
      setSaved(true);
      return true;
    } catch (e) {
      setError(messageOf(e, '저장에 실패했어요.'));
      return false;
    } finally {
      setSaving(false);
    }
  }, [personId, summary, transcript, sttMeta]);

  return {
    phase,
    busy: BUSY_PHASES.includes(phase),
    audio,
    uploadPercent,
    transcript,
    setTranscript,
    sttMeta,
    summary,
    summaryContext,
    historyUsed,
    model,
    elapsed,
    error,
    saved,
    saving,
    /** Time spent in Whisper alone, which is what the estimate below is measured against. */
    sttElapsed,
    /** How long the transcription should take, or null when the audio's length is unknown. */
    expectedSttSeconds:
      audioSeconds == null ? null : audioSeconds * SECONDS_OF_WORK_PER_SECOND_OF_AUDIO,
    transcribe,
    pickAndTranscribe,
    runSummary,
    save,
    reset,
  };
}
