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

export type CreatePersonInput = ParsedPerson & {
  // The OcrResponse.image_token from the scan this contact came from (see useOcrScan) —
  // claims that staged corrected-card image for this new contact. Omitted entirely for
  // contacts created via ManualInputForm (no scan, nothing to claim).
  image_token?: string | null;
};

export async function createPerson(person: CreatePersonInput): Promise<CreatedPerson> {
  const response = await apiClient.post<CreatedPerson>('/contacts', person);
  return response.data;
}
