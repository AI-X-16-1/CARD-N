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
  last_contact: string | null;
  conversation_count: number;
  created_at: string;
};

export type PersonListResponse = {
  total: number;
  items: Person[];
};

// Matches docs/api-spec.md's "Conversation" section (POST /conversations response) —
// owned by the conversation feature (박재경), consumed here as a cross-feature API call.
export type ConversationSummaryResult = {
  one_line: string;
  key_points: string[];
  action_items: { content: string; due_date: string; owner: string }[];
  mentioned_people: { name: string; relation: string; confidence: number }[];
  next_hints: string[];
  keywords: string[];
};

export type Conversation = {
  id: number;
  person_id: number;
  one_liner: string;
  summary: ConversationSummaryResult;
  duration_seconds: number;
  recorded_at: string;
  created_at: string;
};
