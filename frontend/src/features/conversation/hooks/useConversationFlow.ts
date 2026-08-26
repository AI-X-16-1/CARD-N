import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useRef, useState } from 'react';

import { saveConversation, summarizeTranscript, transcribeAudio } from '../api';
import type {
  ConversationSummary,
  FlowPhase,
  PickedAudio,
  SummaryContextPerson,
  TranscribeResult,
} from '../types';

const BUSY_PHASES: FlowPhase[] = ['uploading', 'transcribing', 'summarizing'];

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
  }, []);

  /** Open the system file picker and run STT on whatever comes back. */
  const pickAndTranscribe = useCallback(async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    const file: PickedAudio = {
      uri: asset.uri,
      name: asset.name ?? 'recording.m4a',
      mimeType: asset.mimeType ?? null,
      size: asset.size ?? null,
      file: (asset as { file?: unknown }).file,
    };

    reset();
    setAudio(file);
    setPhase('uploading');

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
        setError('음성에서 텍스트를 찾지 못했어요. 다른 파일로 시도해 보세요.');
      }
    } catch (e) {
      setError(messageOf(e, '음성 인식에 실패했어요.'));
      setPhase('error');
    }
  }, [reset]);

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

  /** Persist the summary to the contact's timeline. The audio is already gone. */
  const save = useCallback(async () => {
    if (personId === undefined || !summary) return;
    try {
      await saveConversation({
        personId,
        transcript,
        summary,
        durationSeconds: sttMeta ? Math.round(sttMeta.duration_seconds) : undefined,
      });
      setSaved(true);
    } catch (e) {
      setError(messageOf(e, '저장에 실패했어요.'));
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
    pickAndTranscribe,
    runSummary,
    save,
    reset,
  };
}
