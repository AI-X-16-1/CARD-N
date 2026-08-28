// api.ts pulls in @/shared/api/client, which imports expo-constants for the LAN dev URL —
// not needed for these pure-function tests, and expo's package ships ESM jest can't
// transform as-is. Mocked out so this test doesn't depend on Metro/jest's expo transform
// config (same reasoning as contacts/api.test.ts).
jest.mock('@/shared/api/client', () => ({ apiClient: {} }));
// useOcrScan.ts (which useBatchScan.ts imports for OcrField/CONFIDENCE_THRESHOLD) also
// pulls in react-native for Platform.OS — react-native's own entry point ships ESM jest
// can't parse either, and none of it is exercised by the pure functions under test here.
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import { hasName, needsReview } from './useBatchScan';
import type { OcrField } from './useOcrScan';

function field(label: string, value: string, confidence: number): OcrField {
  return { label, value, confidence };
}

describe('hasName', () => {
  it('is true when a non-empty Name field is present', () => {
    expect(hasName([field('Name', '홍길동', 0.98)])).toBe(true);
  });

  it('is false when Name is missing entirely', () => {
    expect(hasName([field('Company', 'Kakao', 0.95)])).toBe(false);
  });

  it('is false when Name is present but blank or whitespace-only', () => {
    expect(hasName([field('Name', '', 0.98)])).toBe(false);
    expect(hasName([field('Name', '   ', 0.98)])).toBe(false);
  });
});

describe('needsReview', () => {
  it('is false when every field meets the confidence threshold', () => {
    expect(needsReview([field('Name', '홍길동', 0.98), field('Company', 'Kakao', 0.955)])).toBe(false);
  });

  it('is true when any field falls below the confidence threshold', () => {
    expect(needsReview([field('Name', '홍길동', 0.98), field('Department', '마케팅팀', 0.4)])).toBe(true);
  });

  it('is true once the backend always includes unrecognized columns (empty value, 0 confidence)', () => {
    // scan/service.py's _to_field_responses now always emits every column, so a batch
    // shot missing e.g. postal_code/region is the common case, not an edge case.
    expect(needsReview([field('Name', '홍길동', 0.98), field('Postal Code', '', 0)])).toBe(true);
  });

  it('is false for an empty field list (nothing to flag)', () => {
    expect(needsReview([])).toBe(false);
  });
});
