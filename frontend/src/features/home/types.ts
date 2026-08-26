export type MyCard = {
  name: string;
  company: string;
  title: string;
  phone: string;
  email: string;
};

export type RecentPerson = {
  id: number;
  name: string;
  company: string | null;
  title: string | null;
  job_class: string | null;
  created_at: string;
};
