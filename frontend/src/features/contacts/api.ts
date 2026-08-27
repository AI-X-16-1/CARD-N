import { apiClient } from '@/shared/api/client';

import type {
  Conversation,
  ConversationSummaryResult,
  IntroductionRequestStatus,
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

// GET /contacts/{id}/image serves the corrected card image directly (FileResponse on
// the backend) — a plain URL for an <Image> source, not a JSON-returning apiClient call.
// Only meaningful when person.has_image is true.
export function personImageUrl(personId: number): string {
  return `${apiClient.defaults.baseURL}/contacts/${personId}/image`;
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

// --- Introduction requests (see ui-spec.md §5 "Introduction Request") ---
//
// Every contact reachable from PersonDetailScreen is already a 1st-degree connection (they're
// in this feature's own contacts db), so unlike the graph sheet's row this never needs a
// degree check. Calls the graph feature's endpoints directly rather than importing anything
// from features/graph/ — same cross-feature-at-the-API-boundary rule as the conversation calls
// above. No dedicated "status for one person" endpoint exists, so this reads it off the depth-1
// graph fetch, same as GraphScreen does.

type GraphNodeStatusResponse = {
  id: number;
  type: 'me' | 'person';
  introduction_request_status: IntroductionRequestStatus;
};

export async function fetchIntroductionRequestStatus(
  personId: number,
): Promise<IntroductionRequestStatus> {
  const response = await apiClient.get<{ nodes: GraphNodeStatusResponse[] }>('/graph', {
    params: { depth: 1 },
  });
  const node = response.data.nodes.find((n) => n.type === 'person' && n.id === personId);
  return node?.introduction_request_status ?? null;
}

export async function requestIntroduction(personId: number): Promise<IntroductionRequestStatus> {
  const response = await apiClient.post<{ status: IntroductionRequestStatus }>(
    `/graph/${personId}/introduction-requests`,
  );
  return response.data.status;
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

export type ConversationPage = { total: number; items: Conversation[] };

const CONVERSATIONS_PAGE_SIZE = 10;

export async function fetchConversations(
  personId: number,
  limit: number = CONVERSATIONS_PAGE_SIZE,
  offset: number = 0,
): Promise<ConversationPage> {
  const response = await apiClient.get<ConversationPage>('/conversations', {
    params: { person_id: personId, limit, offset },
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
