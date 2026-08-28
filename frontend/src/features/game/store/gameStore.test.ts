import { MAX_DECK_SIZE, useGameStore } from './gameStore';
import * as api from '@/features/game/api';
import type { BattleCard } from '@/features/game/engine/types';

// The real client pulls in axios + react-native, which this bare jest config
// can't transform; the game tests never make a real request anyway.
jest.mock('@/shared/api/client', () => ({ apiClient: { get: jest.fn(), put: jest.fn(), post: jest.fn() } }));
jest.mock('@/features/game/api');

const mockedApi = api as jest.Mocked<typeof api>;

function card(id: number, over: Partial<BattleCard> = {}): BattleCard {
  return {
    id,
    personId: id,
    name: `card${id}`,
    company: 'Co',
    jobClass: 'pm',
    jobLabel: '기획/PM',
    grade: 1,
    cost: 1,
    baseStats: { atk: 6, def: 6, int: 6, hp: 10 },
    finalStats: { atk: 6, def: 6, int: 6, hp: 10 },
    skill: { name: '로드맵', cost: 2, description: '카드 2장 드로우' },
    passive: '일정관리',
    flavorText: '',
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.saveDeck.mockResolvedValue(undefined);
  useGameStore.setState({
    collection: [],
    deckSlots: Array(MAX_DECK_SIZE).fill(null),
    status: 'idle',
  });
});

describe('load', () => {
  test('hydrates the collection and maps the saved deck into fixed slots', async () => {
    mockedApi.fetchCards.mockResolvedValue([card(10), card(20), card(30)]);
    mockedApi.fetchDeck.mockResolvedValue([30, 10]);

    await useGameStore.getState().load();

    const state = useGameStore.getState();
    expect(state.status).toBe('ready');
    expect(state.collection.map((c) => c.id)).toEqual([10, 20, 30]);
    expect(state.deckSlots).toEqual([30, 10, null, null, null, null, null, null]);
  });

  test('sets status "error" and leaves the collection empty when the request fails', async () => {
    mockedApi.fetchCards.mockRejectedValue(new Error('network'));
    mockedApi.fetchDeck.mockResolvedValue([]);

    await useGameStore.getState().load();

    expect(useGameStore.getState().status).toBe('error');
    expect(useGameStore.getState().collection).toEqual([]);
  });
});

describe('clearDeck', () => {
  test('empties every deck slot and persists the empty list', () => {
    useGameStore.getState().toggleSelected(10);
    useGameStore.getState().toggleSelected(20);

    useGameStore.getState().clearDeck();

    expect(useGameStore.getState().deckSlots).toEqual(Array(MAX_DECK_SIZE).fill(null));
    expect(mockedApi.saveDeck).toHaveBeenLastCalledWith([]);
  });
});

describe('randomFillDeck', () => {
  test('fills only the empty slots, leaving an already-placed card where it is', () => {
    useGameStore.setState({ collection: Array.from({ length: 12 }, (_, i) => card(i + 1)) });
    useGameStore.getState().toggleSelected(3); // slot 0

    useGameStore.getState().randomFillDeck();

    const slots = useGameStore.getState().deckSlots;
    expect(slots[0]).toBe(3);
    expect(slots.every((id) => id !== null)).toBe(true);
  });

  test('never places a card that is already in the deck', () => {
    useGameStore.setState({ collection: [card(1), card(2), card(3)] });
    useGameStore.getState().toggleSelected(2);

    useGameStore.getState().randomFillDeck();

    const ids = useGameStore.getState().deckSlots.filter((id): id is number => id !== null);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(2);
  });

  test('leaves the remaining slots null when the owned pool runs out', () => {
    useGameStore.setState({ collection: [card(1), card(2), card(3)] });

    useGameStore.getState().randomFillDeck();

    const slots = useGameStore.getState().deckSlots;
    expect([...slots.filter((id): id is number => id !== null)].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(slots.filter((id) => id === null)).toHaveLength(MAX_DECK_SIZE - 3);
  });

  test('persists the filled deck to the backend', () => {
    useGameStore.setState({ collection: [card(1), card(2)] });

    useGameStore.getState().randomFillDeck();

    const lastArg = mockedApi.saveDeck.mock.calls.at(-1)?.[0] ?? [];
    expect([...lastArg].sort((a, b) => a - b)).toEqual([1, 2]);
  });
});

describe('toggleSelected', () => {
  test('adds a card id into the first empty slot', () => {
    useGameStore.getState().toggleSelected(10);

    expect(useGameStore.getState().deckSlots[0]).toBe(10);
  });

  test('removing a card clears only its own slot, leaving other slots in place', () => {
    useGameStore.getState().toggleSelected(10);
    useGameStore.getState().toggleSelected(20);
    useGameStore.getState().toggleSelected(30);

    useGameStore.getState().toggleSelected(20); // remove the middle card

    const slots = useGameStore.getState().deckSlots;
    expect(slots[0]).toBe(10);
    expect(slots[1]).toBeNull(); // its own slot goes empty
    expect(slots[2]).toBe(30); // not shifted into slot 1
  });

  test('adding after a removal fills the freed slot rather than appending at the end', () => {
    useGameStore.getState().toggleSelected(10);
    useGameStore.getState().toggleSelected(20);
    useGameStore.getState().toggleSelected(20); // frees slot 1

    useGameStore.getState().toggleSelected(30);

    expect(useGameStore.getState().deckSlots[1]).toBe(30);
  });

  test('does not add past MAX_DECK_SIZE cards', () => {
    for (let i = 1; i <= MAX_DECK_SIZE; i++) {
      useGameStore.getState().toggleSelected(i);
    }

    useGameStore.getState().toggleSelected(999);

    const slots = useGameStore.getState().deckSlots;
    expect(slots).not.toContain(999);
    expect(slots.every((id) => id !== null)).toBe(true);
  });

  test('persists the compacted id list to the backend on every change', () => {
    useGameStore.getState().toggleSelected(10);
    useGameStore.getState().toggleSelected(20);
    useGameStore.getState().toggleSelected(10); // remove

    expect(mockedApi.saveDeck).toHaveBeenLastCalledWith([20]);
  });
});
