import { apiClient } from '@/shared/api/client';

import type { OcrField } from './hooks/useOcrScan';
import type { CreatedPerson, ParsedPerson } from './types';

export async function parseOcrFields(
  fields: OcrField[],
  context?: string,
): Promise<ParsedPerson> {
  const response = await apiClient.post<{ person: ParsedPerson }>('/scan/parse', {
    fields: fields.map((f) => ({ label: f.label, value: f.value })),
    context,
  });
  return response.data.person;
}

export async function createPerson(person: ParsedPerson): Promise<CreatedPerson> {
  const response = await apiClient.post<CreatedPerson>('/contacts', person);
  return response.data;
}
