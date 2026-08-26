// Mirrors docs/api-spec.md's Contacts/Game/Conversation response shapes.
// Feature-local copies exist too (e.g. features/contacts/types.ts) because
// features/* -> features/* imports are forbidden (docs/architecture.md) — this is the
// canonical shape for other features (game, graph, conversation) to import instead.

export type RelationCategory = 'client' | 'partner' | 'networking' | 'other';

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

export type BattleCardStats = {
  atk: number;
  def: number;
  int: number;
  hp: number;
};

export type BattleCard = {
  id: number;
  person_id: number;
  name: string;
  company: string;
  job_class: string;
  job_label: string;
  grade: number;
  grade_label: string;
  stars: number;
  cost: number;
  base_stats: BattleCardStats;
  final_stats: BattleCardStats;
  skill: { name: string; cost: number; description: string };
  passive: string;
  flavor_text: string;
  created_at: string;
};

export type Conversation = {
  id: number;
  person_id: number;
  one_liner: string;
  bullets: string[];
  todos: string[];
  duration_seconds: number;
  recorded_at: string;
  created_at: string;
};
