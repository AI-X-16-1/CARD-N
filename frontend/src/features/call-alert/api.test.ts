// api.ts pulls in @/shared/api/client, which imports expo-constants for the LAN dev URL.
// Mocked out so this test drives the snapshot builder directly, without expo's ESM
// reaching jest's transform. Same approach as features/contacts/api.test.ts.
jest.mock('@/shared/api/client', () => ({
  apiClient: { get: jest.fn() },
}));

import { apiClient } from '@/shared/api/client';

import { fetchContactSnapshots } from './api';

const get = apiClient.get as unknown as jest.Mock;

type Contact = { id: number; name: string; phone: string | null };

/**
 * Routes /contacts and /conversations the way the real client does, so a test only
 * declares the contact list plus the newest one-liner per person id.
 */
function stubApi(contacts: Contact[], summaries: Record<number, string[]> = {}) {
  get.mockImplementation((path: string, config?: { params?: { person_id?: number } }) => {
    if (path === '/contacts') return Promise.resolve({ data: { items: contacts } });
    if (path === '/conversations') {
      const personId = config?.params?.person_id as number;
      const items = (summaries[personId] ?? []).map((one_liner) => ({ one_liner }));
      return Promise.resolve({ data: { items } });
    }
    throw new Error(`unexpected path ${path}`);
  });
}

beforeEach(() => {
  get.mockReset();
});

describe('fetchContactSnapshots', () => {
  it('pulls the contact list in a single page', async () => {
    stubApi([]);

    await fetchContactSnapshots();

    expect(get).toHaveBeenCalledWith('/contacts', { params: { limit: 100 } });
  });

  it('pairs each contact with that contact’s own newest one-liner', async () => {
    stubApi(
      [
        { id: 1, name: '김서연', phone: '010-1111-2222' },
        { id: 2, name: '박도윤', phone: '010-3333-4444' },
      ],
      { 1: ['커피챗에서 채용 얘기'], 2: ['데모데이 부스에서 인사'] }
    );

    await expect(fetchContactSnapshots()).resolves.toEqual([
      { phone: '010-1111-2222', personId: 1, name: '김서연', summary: '커피챗에서 채용 얘기' },
      { phone: '010-3333-4444', personId: 2, name: '박도윤', summary: '데모데이 부스에서 인사' },
    ]);
  });

  it('asks for only the newest conversation per contact', async () => {
    stubApi([{ id: 8, name: '이하준', phone: '01055556666' }], { 8: ['첫 미팅'] });

    await fetchContactSnapshots();

    expect(get).toHaveBeenCalledWith('/conversations', {
      params: { person_id: 8, limit: 1 },
    });
  });

  it('drops contacts whose number could never match a caller', async () => {
    stubApi([
      { id: 1, name: '번호 없음', phone: null },
      { id: 2, name: '구두점만', phone: '---' },
      { id: 3, name: '빈 문자열', phone: '' },
      { id: 4, name: '정상', phone: '010-9999-8888' },
    ]);

    const snapshots = await fetchContactSnapshots();

    expect(snapshots.map((s) => s.personId)).toEqual([4]);
  });

  it('keeps the phone number as written, since the native side normalizes', async () => {
    stubApi([{ id: 1, name: '김서연', phone: '+82 10-1111-2222' }]);

    const [snapshot] = await fetchContactSnapshots();

    expect(snapshot.phone).toBe('+82 10-1111-2222');
  });

  it('keeps a contact whose history is empty, with no summary', async () => {
    stubApi([{ id: 1, name: '김서연', phone: '010-1111-2222' }], { 1: [] });

    await expect(fetchContactSnapshots()).resolves.toEqual([
      { phone: '010-1111-2222', personId: 1, name: '김서연', summary: null },
    ]);
  });

  it('keeps a contact whose history fails to load, rather than losing the alert', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/contacts') {
        return Promise.resolve({
          data: { items: [{ id: 1, name: '김서연', phone: '010-1111-2222' }] },
        });
      }
      return Promise.reject(new Error('conversations service down'));
    });

    await expect(fetchContactSnapshots()).resolves.toEqual([
      { phone: '010-1111-2222', personId: 1, name: '김서연', summary: null },
    ]);
  });

  it('does not shift summaries onto the wrong person when an unreachable contact sits between', async () => {
    stubApi(
      [
        { id: 1, name: '김서연', phone: '010-1111-2222' },
        { id: 2, name: '번호 없음', phone: null },
        { id: 3, name: '이하준', phone: '010-3333-4444' },
      ],
      { 1: ['1번 요약'], 3: ['3번 요약'] }
    );

    const snapshots = await fetchContactSnapshots();

    expect(snapshots).toEqual([
      { phone: '010-1111-2222', personId: 1, name: '김서연', summary: '1번 요약' },
      { phone: '010-3333-4444', personId: 3, name: '이하준', summary: '3번 요약' },
    ]);
  });

  it('returns an empty snapshot for an empty contact list, without touching conversations', async () => {
    stubApi([]);

    await expect(fetchContactSnapshots()).resolves.toEqual([]);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
