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
