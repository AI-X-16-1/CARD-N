import { apiClient } from '@/shared/api/client';

import type { Conversation, ConversationSummaryResult, Person, PersonListResponse, RelationFilter } from './types';
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

export async function deleteContact(personId: number): Promise<void> {
  await apiClient.delete(`/contacts/${personId}`);
}

// --- Call recording import (see features/contacts/components/CallRecordingFinder.tsx) ---
//
// These call the conversation feature's endpoints directly (docs/api-spec.md's "Conversation"
// section) rather than importing anything from features/conversation/ — cross-feature
// communication stays at the API boundary per frontend/CLAUDE.md §2.
//
// ⚠️ Dependency: /conversations/transcribe, /conversations/summarize, and /conversations are
// implemented on 박재경's in-progress branch (feat/conversation-stt-summary), not yet on main
// as of this branch. This compiles and type-checks against the documented contract but can't
// be exercised end-to-end until that branch merges.

type TranscribeResponse = {
  text: string;
  duration_seconds: number;
};

type SummarizeResponse = {
  result: ConversationSummaryResult;
};

export async function fetchConversations(personId: number): Promise<Conversation[]> {
  const response = await apiClient.get<Conversation[]>('/conversations', {
    params: { person_id: personId },
  });
  return response.data;
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

  const transcribed = await apiClient.post<TranscribeResponse>('/conversations/transcribe', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const { text: transcript, duration_seconds } = transcribed.data;

  const summarized = await apiClient.post<SummarizeResponse>('/conversations/summarize', {
    transcript,
    person_id: personId,
    duration_seconds,
  });

  const saved = await apiClient.post<Conversation>('/conversations', {
    person_id: personId,
    transcript,
    summary: summarized.data.result,
    duration_seconds,
    recorded_at: match.creationTime ? new Date(match.creationTime).toISOString() : undefined,
  });
  return saved.data;
}
