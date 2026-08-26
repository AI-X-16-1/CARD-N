import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import type { PickedAudio } from '../types';

// Metering drives the waveform; without it the bars have nothing to react to.
const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

// Poll fast enough that the timer ticks smoothly and the bars move with the voice.
const STATE_POLL_MS = 100;

/** What the recorder produced on each platform, mapped to an upload-ready name/type. */
function describeRecording(uri: string, blobType?: string): { name: string; mimeType: string } {
  const type = blobType || (Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a');
  // MediaRecorder reports things like "audio/webm;codecs=opus" — the backend only
  // cares about the extension, so take the subtype before any parameters.
  const subtype = type.split(';')[0].split('/')[1] ?? 'm4a';
  const fromUri = uri.split('?')[0].split('.').pop();
  const extension =
    fromUri && fromUri.length <= 4 && !uri.startsWith('blob:') ? fromUri : subtype;
  return { name: `recording.${extension}`, mimeType: type };
}

/**
 * Microphone recording for the conversation screen.
 *
 * Hands back a `PickedAudio` on stop, the same shape the file picker produces, so
 * everything downstream (upload, STT, summary) is unaware of where the audio came from.
 */
export function useRecorder() {
  const recorder = useAudioRecorder(OPTIONS);
  const state = useAudioRecorderState(recorder, STATE_POLL_MS);
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);

  const start = useCallback(async (): Promise<boolean> => {
    setError('');
    setPreparing(true);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError(
          '마이크 권한이 필요해요. 브라우저나 기기 설정에서 마이크 접근을 허용한 뒤 다시 시도해 주세요.',
        );
        return false;
      }

      // iOS silences recording unless the session is explicitly put in recording mode.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '녹음을 시작하지 못했어요.');
      return false;
    } finally {
      setPreparing(false);
    }
  }, [recorder]);

  /** Stop and return the recording, or null if nothing usable came out. */
  const stop = useCallback(async (): Promise<PickedAudio | null> => {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        setError('녹음 파일을 찾지 못했어요.');
        return null;
      }

      if (Platform.OS === 'web') {
        // Web hands back a blob: URL, which FormData cannot read. Pull the bytes out
        // and rebuild a File so the upload path matches the file picker exactly.
        const blob = await fetch(uri).then((res) => res.blob());
        const { name, mimeType } = describeRecording(uri, blob.type);
        return {
          uri,
          name,
          mimeType,
          size: blob.size,
          file: new File([blob], name, { type: mimeType }),
        };
      }

      const { name, mimeType } = describeRecording(uri);
      return { uri, name, mimeType, size: null };
    } catch (e) {
      setError(e instanceof Error ? e.message : '녹음을 저장하지 못했어요.');
      return null;
    } finally {
      // Release the mic so the browser tab indicator goes away.
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    }
  }, [recorder]);

  return {
    isRecording: state.isRecording,
    preparing,
    durationSeconds: state.durationMillis / 1000,
    /** dBFS, roughly -160 (silence) to 0 (clipping). Undefined until the first sample. */
    metering: state.metering,
    error,
    start,
    stop,
  };
}
