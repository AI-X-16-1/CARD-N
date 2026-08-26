import { apiClient } from '@/shared/api/client';

import type { Person, PersonListResponse, RelationFilter } from './types';

export async function fetchContacts(
  q: string,
  category: RelationFilter,
): Promise<PersonListResponse> {
  const response = await apiClient.get<PersonListResponse>('/contacts', {
    params: { q: q || undefined, category },
  });
  return response.data;
}

export async function fetchPerson(personId: number): Promise<Person> {
  const response = await apiClient.get<Person>(`/contacts/${personId}`);
  return response.data;
}
