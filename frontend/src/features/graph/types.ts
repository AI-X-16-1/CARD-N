export type JobClass = 'dev' | 'marketing' | 'design' | 'hr' | 'finance' | 'legal' | 'sales' | 'pm';

export type GraphNode = {
  id: number;
  type: 'me' | 'person';
  name: string;
  jobClass: JobClass | null;
  company?: string;
  title?: string;
  conversationCount?: number;
  mutualCount?: number;
  lastConversationLabel?: string;
  recentSummary?: string;
};

export type GraphEdge = {
  source: number;
  target: number;
  weight: number;
};

export type GraphStats = {
  degree1Count: number;
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
};

export type JobFilter = 'all' | JobClass;
