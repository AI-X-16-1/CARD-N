import axios from 'axios';

import type { GraphData, GraphNode, JobClass } from '../types';

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
    conversationCount: node.conversation_count ?? undefined,
    lastConversationLabel: formatRelativeKorean(node.last_conversation),
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
