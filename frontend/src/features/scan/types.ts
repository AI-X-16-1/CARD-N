export type ParsedPerson = {
  name?: string;
  company?: string;
  department?: string;
  title?: string;
  phone?: string;
  email?: string;
  address?: string;
  address_detail?: string;
  postal_code?: string;
  context?: string;
};

export type CreatedPerson = {
  id: number;
  name: string;
  company: string | null;
  title: string | null;
  has_image: boolean;
};
