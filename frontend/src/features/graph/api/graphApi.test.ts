import axios from 'axios';

// babel-preset-expo rewrites `process.env.EXPO_PUBLIC_*` into an import from
// expo/virtual/env, which ships as ESM jest can't transform as-is. Same shape as the
// mock in features/contacts/api.test.ts, kept local so no jest config change is needed.
jest.mock('expo/virtual/env', () => ({ env: process.env }));

// graphApi builds its own axios instance at module load. The factory hands back one
// shared client object, so calling create() again here returns the very instance the
// module is talking to.
jest.mock('axios', () => {
  const client = { get: jest.fn(), post: jest.fn() };
  return { __esModule: true, default: { create: jest.fn(() => client) } };
});

import {
  approveIntroductionRequest,
  declineIntroductionRequest,
  fetchAcquaintances,
  fetchGraph,
  fetchIncomingIntroductionRequests,
  recordAcquaintanceConsent,
  requestIntroduction,
} from './graphApi';

const client = (axios.create as unknown as jest.Mock)() as {
  get: jest.Mock;
  post: jest.Mock;
};

const NOW = new Date('2026-09-05T00:00:00Z').getTime();

/** An ISO timestamp `days` before the frozen "now". */
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

function graphResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: {
      nodes: [],
      edges: [],
      stats: { degree_1_count: 0, degree_2_count: 0 },
      ...overrides,
    },
  };
}

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  client.get.mockReset();
  client.post.mockReset();
});

describe('fetchGraph', () => {
  it('asks for the full 2-degree graph unfiltered', async () => {
    client.get.mockResolvedValue(graphResponse());

    await fetchGraph();

    expect(client.get).toHaveBeenCalledWith('', { params: { depth: 2, job_filter: 'all' } });
  });

  it('renames the API snake_case fields to the app-side camelCase node', async () => {
    client.get.mockResolvedValue(
      graphResponse({
        nodes: [
          {
            id: 7,
            type: 'person',
            name: '김서연',
            job_class: 'design',
            company: '토스',
            degree: 1,
            conversation_count: 4,
            last_conversation: daysAgo(3),
            introduction_request_status: 'pending',
          },
        ],
      })
    );

    const { nodes } = await fetchGraph();

    expect(nodes[0]).toEqual({
      id: 7,
      type: 'person',
      name: '김서연',
      jobClass: 'design',
      company: '토스',
      degree: 1,
      conversationCount: 4,
      lastConversationLabel: '3일 전',
      introductionRequestStatus: 'pending',
    });
  });

  it('turns the API nulls into absent fields, not null values', async () => {
    client.get.mockResolvedValue(
      graphResponse({
        nodes: [
          {
            id: 1,
            type: 'me',
            name: '나',
            job_class: null,
            company: null,
            degree: null,
            conversation_count: null,
            last_conversation: null,
            introduction_request_status: null,
          },
        ],
      })
    );

    const { nodes } = await fetchGraph();

    // jobClass is deliberately nullable on GraphNode; the rest are optional.
    expect(nodes[0]).toEqual({ id: 1, type: 'me', name: '나', jobClass: null });
  });

  it.each([
    [0, '오늘'],
    [1, '1일 전'],
    [6, '6일 전'],
    [7, '1주 전'],
    [29, '4주 전'],
    [30, '1개월 전'],
    // The month bucket runs right up to 365 days, so day 364 reads "12개월 전", not "1년 전".
    [364, '12개월 전'],
    [365, '1년 전'],
  ])('labels a conversation %i days old as "%s"', async (days, expected) => {
    client.get.mockResolvedValue(
      graphResponse({
        nodes: [
          {
            id: 1,
            type: 'person',
            name: 'n',
            job_class: null,
            company: null,
            degree: 1,
            conversation_count: 1,
            last_conversation: daysAgo(days),
            introduction_request_status: null,
          },
        ],
      })
    );

    const { nodes } = await fetchGraph();

    expect(nodes[0].lastConversationLabel).toBe(expected);
  });

  it('keeps only the edge fields the canvas draws with', async () => {
    client.get.mockResolvedValue(
      graphResponse({
        edges: [{ source: 1, target: 2, weight: 3, last_interaction: daysAgo(1) }],
        stats: { degree_1_count: 12, degree_2_count: 5 },
      })
    );

    const { edges, stats } = await fetchGraph();

    expect(edges).toEqual([{ source: 1, target: 2, weight: 3 }]);
    expect(stats).toEqual({ degree1Count: 12, degree2Count: 5 });
  });
});

describe('introduction requests', () => {
  it('posts a request under the target person and returns the resulting status', async () => {
    client.post.mockResolvedValue({ data: { person_id: 9, status: 'pending' } });

    await expect(requestIntroduction(9)).resolves.toBe('pending');
    expect(client.post).toHaveBeenCalledWith('/9/introduction-requests');
  });

  it('maps incoming requests and drops a null company', async () => {
    client.get.mockResolvedValue({
      data: {
        requests: [
          {
            person_id: 3,
            name: '박도윤',
            job_class: 'dev',
            company: null,
            requested_at: daysAgo(2),
          },
        ],
      },
    });

    const [request] = await fetchIncomingIntroductionRequests();

    expect(request).toEqual({
      personId: 3,
      name: '박도윤',
      jobClass: 'dev',
      requestedAt: daysAgo(2),
    });
  });

  it.each([
    [approveIntroductionRequest, '/introduction-requests/4/approve'],
    [declineIntroductionRequest, '/introduction-requests/4/decline'],
  ])('routes the decision to %p', async (respond, path) => {
    client.post.mockResolvedValue({ data: {} });

    await respond(4);

    expect(client.post).toHaveBeenCalledWith(path);
  });
});

describe('acquaintances', () => {
  it('maps the list under the contact who knows them', async () => {
    client.get.mockResolvedValue({
      data: {
        acquaintances: [{ id: -12, name: '이하준', job_class: 'pm', status: 'pending' }],
      },
    });

    await expect(fetchAcquaintances(5)).resolves.toEqual([
      { id: -12, name: '이하준', jobClass: 'pm', status: 'pending' },
    ]);
    expect(client.get).toHaveBeenCalledWith('/5/acquaintances');
  });

  it('records consent against the acquaintance, not the contact', async () => {
    client.post.mockResolvedValue({
      data: { id: -12, name: '이하준', job_class: 'pm', status: 'approved' },
    });

    const result = await recordAcquaintanceConsent(-12);

    expect(client.post).toHaveBeenCalledWith('/acquaintances/-12/consent');
    expect(result.status).toBe('approved');
  });
});
