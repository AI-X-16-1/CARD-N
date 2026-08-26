export type JobClass = 'dev' | 'marketing' | 'design' | 'hr' | 'finance' | 'legal' | 'sales' | 'pm';

export type IntroductionRequestStatus = 'pending' | 'approved' | 'declined';

export type GraphNode = {
  id: number;
  type: 'me' | 'person';
  name: string;
  jobClass: JobClass | null;
  company?: string;
  title?: string;
  degree?: number;
  conversationCount?: number;
  mutualCount?: number;
  lastConversationLabel?: string;
  recentSummary?: string;
  /** My own outgoing introduction request toward this 1st-degree contact, if any. */
  introductionRequestStatus?: IntroductionRequestStatus;
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

export type IncomingIntroductionRequest = {
  personId: number;
  name: string;
  jobClass: JobClass | null;
  company?: string;
  requestedAt: string;
};
