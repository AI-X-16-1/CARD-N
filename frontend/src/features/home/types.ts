export type MyCard = {
  name: string;
  company: string;
  department: string;
  grade: string;
  job_function: string;
  phone: string;
  email: string;
  address: string;
};

export type RecentPerson = {
  id: number;
  name: string;
  company: string | null;
  title: string | null;
  job_class: string | null;
  created_at: string;
};
