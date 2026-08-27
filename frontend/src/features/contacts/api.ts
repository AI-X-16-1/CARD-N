import { apiClient } from '@/shared/api/client';

import type {
  Conversation,
  ConversationSummaryResult,
  Person,
  PersonListResponse,
  RelationCategory,
  RelationFilter,
} from './types';
import type { CallRecordingMatch } from './lib/callRecordings';

export async function fetchContacts(
  q: string,
  category: RelationFilter,
): Promise<PersonListResponse> {
  const response = await apiClient.get<PersonListResponse>('/contacts', {
    params: { q: q || undefined, category },
  });
  return response.data;
}

export async function fetchPerson(personId: number): Promise<Person> {
  const response = await apiClient.get<Person>(`/contacts/${personId}`);
  return response.data;
}

export type UpdatePersonInput = {
  name?: string;
  company?: string | null;
  department?: string | null;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
  relation?: RelationCategory;
  context?: string | null;
};

export async function updatePerson(personId: number, data: UpdatePersonInput): Promise<Person> {
  const response = await apiClient.put<Person>(`/contacts/${personId}`, data);
  return response.data;
}

export async function deleteContact(personId: number): Promise<void> {
  await apiClient.delete(`/contacts/${personId}`);
}

// --- Call recording import (see features/contacts/components/CallRecordingFinder.tsx) ---
//
// These call the conversation feature's endpoints directly (docs/api-spec.md's "Conversation"
// section, backend/app/features/conversation/{router,schemas}.py) rather than importing
// anything from features/conversation/ — cross-feature communication stays at the API
// boundary per frontend/CLAUDE.md §2.

type TranscribeResponse = {
  text: string;
  duration_seconds: number;
};

type SummarizeResponse = {
  result: ConversationSummaryResult;
};

export async function fetchConversations(personId: number): Promise<Conversation[]> {
  const response = await apiClient.get<{ total: number; items: Conversation[] }>('/conversations', {
    params: { person_id: personId },
  });
  return response.data.items;
}

export async function deleteConversation(conversationId: number): Promise<void> {
  await apiClient.delete(`/conversations/${conversationId}`);
}

// Finds a call recording via CallRecordingFinder, transcribes it, summarizes it, and saves
// the summary to the contact's timeline. The raw audio and transcript are never stored —
// only `match.uri` (a device file reference) leaves this function's scope, and only the
// summary is persisted server-side.
export async function summarizeCallRecording(personId: number, match: CallRecordingMatch): Promise<Conversation> {
  const form = new FormData();
  // React Native's FormData accepts this {uri, name, type} shape for file fields.
  form.append('audio', {
    uri: match.uri,
    name: match.filename,
    type: 'audio/mpeg',
  } as unknown as Blob);

  // No explicit Content-Type here: a multipart boundary must be generated per-request,
  // and hardcoding 'multipart/form-data' without one produces a malformed body (see
  // features/scan/hooks/useOcrScan.ts, which hit this exact issue first).
  const transcribed = await apiClient.post<TranscribeResponse>('/conversations/transcribe', form);
  const { text: transcript } = transcribed.data;
  // Whisper reports fractional seconds; SummarizeRequest/SaveConversationRequest both type
  // this field as `int | None`, and pydantic v2 rejects a non-integer float there.
  const durationSeconds = Math.round(transcribed.data.duration_seconds);

  const summarized = await apiClient.post<SummarizeResponse>('/conversations/summarize', {
    transcript,
    person_id: personId,
    duration_seconds: durationSeconds,
  });

  const saved = await apiClient.post<Conversation>('/conversations', {
    person_id: personId,
    transcript,
    summary: summarized.data.result,
    duration_seconds: durationSeconds,
    recorded_at: match.creationTime ? new Date(match.creationTime).toISOString() : undefined,
  });
  return saved.data;
}
