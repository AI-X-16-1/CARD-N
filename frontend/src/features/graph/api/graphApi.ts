import axios from 'axios';

import type {
  GraphData,
  GraphNode,
  IncomingIntroductionRequest,
  IntroductionRequestStatus,
  JobClass,
} from '../types';

// Android emulator can't reach the host machine via localhost — point
// EXPO_PUBLIC_API_BASE_URL at http://10.0.2.2:8000/api/v1 when running there.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';

const client = axios.create({ baseURL: `${API_BASE_URL}/graph` });

type GraphNodeApiResponse = {
  id: number;
  type: 'me' | 'person';
  name: string;
  job_class: JobClass | null;
  company: string | null;
  degree: number | null;
  conversation_count: number | null;
  last_conversation: string | null;
  introduction_request_status: IntroductionRequestStatus | null;
};

type GraphEdgeApiResponse = {
  source: number;
  target: number;
  weight: number;
  last_interaction: string | null;
};

type GraphApiResponse = {
  nodes: GraphNodeApiResponse[];
  edges: GraphEdgeApiResponse[];
  stats: { degree_1_count: number; degree_2_count: number };
};

/** "2024-03-15T14:00:00Z" -> "6일 전" */
function formatRelativeKorean(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diffDays <= 0) return '오늘';
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}개월 전`;
  return `${Math.floor(diffDays / 365)}년 전`;
}

function toGraphNode(node: GraphNodeApiResponse): GraphNode {
  return {
    id: node.id,
    type: node.type,
    name: node.name,
    jobClass: node.job_class,
    company: node.company ?? undefined,
    degree: node.degree ?? undefined,
    conversationCount: node.conversation_count ?? undefined,
    lastConversationLabel: formatRelativeKorean(node.last_conversation),
    introductionRequestStatus: node.introduction_request_status ?? undefined,
  };
}

/** Fetches the full graph (me + 1st/2nd-degree, already privacy-filtered server-side). */
export async function fetchGraph(): Promise<GraphData> {
  const { data } = await client.get<GraphApiResponse>('', {
    params: { depth: 2, job_filter: 'all' },
  });

  return {
    nodes: data.nodes.map(toGraphNode),
    edges: data.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      weight: edge.weight,
    })),
    stats: { degree1Count: data.stats.degree_1_count },
  };
}

type IntroductionRequestApiResponse = {
  person_id: number;
  status: IntroductionRequestStatus;
  requested_at: string | null;
  responded_at: string | null;
};

type IncomingIntroductionRequestApiResponse = {
  person_id: number;
  name: string;
  job_class: JobClass | null;
  company: string | null;
  requested_at: string;
};

function toIncomingRequest(
  request: IncomingIntroductionRequestApiResponse
): IncomingIntroductionRequest {
  return {
    personId: request.person_id,
    name: request.name,
    jobClass: request.job_class,
    company: request.company ?? undefined,
    requestedAt: request.requested_at,
  };
}

/** Asks a 1st-degree contact to introduce me to their own network. */
export async function requestIntroduction(personId: number): Promise<IntroductionRequestStatus> {
  const { data } = await client.post<IntroductionRequestApiResponse>(
    `/${personId}/introduction-requests`
  );
  return data.status;
}

/** Incoming requests from people who want me to introduce them to my network. */
export async function fetchIncomingIntroductionRequests(): Promise<IncomingIntroductionRequest[]> {
  const { data } = await client.get<{ requests: IncomingIntroductionRequestApiResponse[] }>(
    '/introduction-requests'
  );
  return data.requests.map(toIncomingRequest);
}

export async function approveIntroductionRequest(personId: number): Promise<void> {
  await client.post(`/introduction-requests/${personId}/approve`);
}

export async function declineIntroductionRequest(personId: number): Promise<void> {
  await client.post(`/introduction-requests/${personId}/decline`);
}

type MutualConnectionsApiResponse = {
  person_id: number;
  mutual_connections: unknown[];
};

/** People I already know who also know `personId` — used for the bottom sheet's stat tile. */
export async function fetchMutualConnectionCount(personId: number): Promise<number> {
  const { data } = await client.get<MutualConnectionsApiResponse>(`/${personId}/mutual`);
  return data.mutual_connections.length;
}
