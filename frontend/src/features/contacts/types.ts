export type RelationCategory = 'client' | 'partner' | 'networking' | 'other';
export type RelationFilter = 'all' | RelationCategory;

export type Person = {
  id: number;
  name: string;
  company: string | null;
  department: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  job_class: string | null;
  relation: RelationCategory;
  context: string | null;
  address: string | null;
  postal_code: string | null;
  last_contact: string | null;
  conversation_count: number;
  created_at: string;
  has_image: boolean;
};

export type PersonListResponse = {
  total: number;
  items: Person[];
};

// Matches docs/api-spec.md's "Graph" section (introduction_request_status on a graph node) —
// owned by the graph feature (김민경), consumed here as a cross-feature API call.
export type IntroductionRequestStatus = 'pending' | 'approved' | 'declined' | null;

// Matches docs/api-spec.md's "Conversation" section (POST /conversations response) —
// owned by the conversation feature (박재경), consumed here as a cross-feature API call.
export type ConversationSummaryResult = {
  one_line: string;
  key_points: string[];
  mentioned_people: { name: string; relation: string; confidence: number }[];
  keywords: string[];
};

export type Conversation = {
  id: number;
  person_id: number;
  one_liner: string;
  summary: ConversationSummaryResult;
  duration_seconds: number | null;
  recorded_at: string | null;
  created_at: string;
};
