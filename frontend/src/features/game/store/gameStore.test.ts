import { MAX_DECK_SIZE, useGameStore } from './gameStore';

beforeEach(() => {
  useGameStore.setState({ deckSlots: Array(MAX_DECK_SIZE).fill(null) });
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
});
