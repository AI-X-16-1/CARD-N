import { Platform } from 'react-native';

import { apiClient } from '@/shared/api/client';
import type { Person } from '@/shared/types/person';

import type {
  ConversationSummary,
  PickedAudio,
  SavedConversation,
  SummarizeResult,
  TranscribeResult,
} from './types';

/** Whisper on a CPU runs at roughly real time, so a long recording needs a long leash. */
const STT_TIMEOUT_MS = 15 * 60 * 1000;
const LLM_TIMEOUT_MS = 3 * 60 * 1000;

function toFormPart(audio: PickedAudio): unknown {
  // On web DocumentPicker gives us a real File; FormData handles it directly and
  // fetching the blob ourselves would only add a copy. On native there is no File —
  // React Native's FormData takes {uri, name, type} and streams from disk.
  if (Platform.OS === 'web' && audio.file) return audio.file;
  return {
    uri: audio.uri,
    name: audio.name,
    type: audio.mimeType ?? 'audio/m4a',
  };
}

/** Upload a recording and get the transcript back. The server deletes the audio afterwards. */
export async function transcribeAudio(
  audio: PickedAudio,
  language = 'ko',
  onUploadProgress?: (percent: number) => void,
): Promise<TranscribeResult> {
  const form = new FormData();
  form.append('audio', toFormPart(audio) as Blob);
  form.append('language', language);

  const { data } = await apiClient.post<TranscribeResult>('/conversations/transcribe', form, {
    timeout: STT_TIMEOUT_MS,
    // Let the platform set the multipart boundary; naming it ourselves breaks RN.
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (!onUploadProgress || !event.total) return;
      onUploadProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
  return data;
}

/**
 * Summarize a transcript.
 *
 * Only `person_id` goes over the wire — the server looks up who that is and what was
 * discussed last time, and decides what belongs in the prompt. Conversation history
 * never passes through the client.
 */
export async function summarizeTranscript(
  transcript: string,
  personId: number | null,
  durationSeconds?: number,
): Promise<SummarizeResult> {
  const { data } = await apiClient.post<SummarizeResult>(
    '/conversations/summarize',
    { transcript, person_id: personId, duration_seconds: durationSeconds ?? null },
    { timeout: LLM_TIMEOUT_MS },
  );
  return data;
}

export async function saveConversation(params: {
  personId: number;
  transcript: string;
  summary: ConversationSummary;
  durationSeconds?: number;
}): Promise<SavedConversation> {
  const { data } = await apiClient.post<SavedConversation>('/conversations', {
    person_id: params.personId,
    transcript: params.transcript,
    summary: params.summary,
    duration_seconds: params.durationSeconds ?? null,
  });
  return data;
}

export async function listConversations(
  personId: number,
): Promise<{ total: number; items: SavedConversation[] }> {
  const { data } = await apiClient.get('/conversations', { params: { person_id: personId } });
  return data;
}

/**
 * Read a contact through the contacts API rather than importing its hooks — features
 * talk to each other over HTTP, not across folder boundaries (CLAUDE.md).
 */
export async function fetchPerson(personId: number): Promise<Person> {
  const { data } = await apiClient.get<Person>(`/contacts/${personId}`);
  return data;
}
