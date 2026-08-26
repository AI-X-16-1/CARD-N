export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export type TranscribeResult = {
  text: string;
  segments: TranscriptSegment[];
  duration_seconds: number;
  language: string;
  model: string;
};

export type ActionItem = {
  content: string;
  due_date: string;
  owner: 'me' | 'them' | string;
};

/** A third party named in the conversation — a candidate edge for the relationship graph. */
export type MentionedPerson = {
  name: string;
  relation: string;
  confidence: number;
};

export type ConversationSummary = {
  one_line: string;
  key_points: string[];
  action_items: ActionItem[];
  mentioned_people: MentionedPerson[];
  next_hints: string[];
  keywords: string[];
};

/** What the server actually put in the prompt, echoed back so the UI can show it. */
export type SummaryContextPerson = {
  id: number;
  name: string;
  company: string | null;
  title: string | null;
  meet_count: number;
};

export type SummarizeResult = {
  model: string;
  prompt_version: string;
  result: ConversationSummary;
  person: SummaryContextPerson | null;
  history_used: number;
};

export type SavedConversation = {
  id: number;
  person_id: number;
  one_liner: string;
  summary: ConversationSummary;
  duration_seconds: number | null;
  recorded_at: string | null;
  created_at: string;
};

export type PickedAudio = {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  /** Web only — DocumentPicker hands back a real File, which FormData prefers. */
  file?: unknown;
};

/** Where the flow currently is. Drives which panel the screen renders. */
export type FlowPhase =
  | 'idle'
  | 'uploading'
  | 'transcribing'
  | 'transcribed'
  | 'summarizing'
  | 'done'
  | 'error';
