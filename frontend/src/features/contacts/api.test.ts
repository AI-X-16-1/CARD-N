import axios from 'axios';

// api.ts pulls in @/shared/api/client, which imports expo-constants for the LAN dev URL —
// not needed for this pure-function test, and expo's package ships ESM jest can't transform
// as-is. Mocked out so this test doesn't depend on Metro/jest's expo transform config.
jest.mock('@/shared/api/client', () => ({ apiClient: {} }));

import { isNotFirstDegreeError } from './api';

function fakeAxiosError(status: number, detail: unknown) {
  return Object.assign(new Error('request failed'), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}

describe('isNotFirstDegreeError', () => {
  it('is true for the exact 404 NOT_FIRST_DEGREE shape', () => {
    expect(isNotFirstDegreeError(fakeAxiosError(404, 'NOT_FIRST_DEGREE'))).toBe(true);
  });

  it('is false for a different 404 detail', () => {
    expect(isNotFirstDegreeError(fakeAxiosError(404, 'REQUEST_NOT_FOUND'))).toBe(false);
  });

  it('is false for a non-404 axios error', () => {
    expect(isNotFirstDegreeError(fakeAxiosError(500, 'NOT_FIRST_DEGREE'))).toBe(false);
  });

  it('is false for a non-axios error', () => {
    expect(isNotFirstDegreeError(new Error('offline'))).toBe(false);
  });

  it('agrees with axios.isAxiosError on what counts as an axios error', () => {
    const error = fakeAxiosError(404, 'NOT_FIRST_DEGREE');
    expect(axios.isAxiosError(error)).toBe(true);
  });
});
