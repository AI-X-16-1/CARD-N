export type ParsedPerson = {
  name?: string;
  company?: string;
  department?: string;
  title?: string;
  phone?: string;
  email?: string;
  context?: string;
};

export type CreatedPerson = {
  id: number;
  name: string;
  company: string | null;
  title: string | null;
  has_image: boolean;
};
