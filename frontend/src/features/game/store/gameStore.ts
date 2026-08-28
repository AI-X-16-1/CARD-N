import { create } from 'zustand';

import { fetchCards, fetchDeck, saveDeck } from '@/features/game/api';
import { buildCard, GRADES, JOB_CLASSES, JOB_LABEL } from '@/features/game/engine/cardData';
import { createMockCollection } from '@/features/game/engine/mockCollection';
import { createStarterDeck } from '@/features/game/engine/starterDeck';
import type { BattleCard } from '@/features/game/engine/types';

export const MAX_DECK_SIZE = 8;

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface GameStore {
  collection: BattleCard[];
  // Fixed-length, position-stable: removing a card clears only its own slot
  // instead of shifting the rest of the deck down (which previously made a
  // different card appear to take the tapped card's place).
  deckSlots: (number | null)[];
  status: LoadStatus;
  /** Hydrate collection + deck from the backend. Safe to call more than once. */
  load: () => Promise<void>;
  toggleSelected: (id: number) => void;
  /** Fill the empty deck slots with random owned cards not already in the deck. */
  randomFillDeck: () => void;
  /** Clear every deck slot. */
  clearDeck: () => void;
  /** Append one random card to the collection — a dev/test affordance for
   *  padding the collection before the backend can supply extra cards. */
  addTestCard: () => void;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function slotsToIds(slots: (number | null)[]): number[] {
  return slots.filter((id): id is number => id !== null);
}

function idsToSlots(ids: number[]): (number | null)[] {
  const slots: (number | null)[] = Array(MAX_DECK_SIZE).fill(null);
  ids.slice(0, MAX_DECK_SIZE).forEach((id, i) => {
    slots[i] = id;
  });
  return slots;
}

// Turn a backend response into the store's shape. A brand-new user — no cards
// and no saved deck — is seeded with the fixed starter deck: its 15 cards become
// the collection, and its first MAX_DECK_SIZE fill the editable deck slots
// (completeDeckTo15 rounds the rest back out at battle time).
function hydrate(cards: BattleCard[], deckIds: number[]): {
  collection: BattleCard[];
  deckSlots: (number | null)[];
} {
  if (cards.length === 0 && deckIds.length === 0) {
    const starter = createStarterDeck();
    return { collection: starter, deckSlots: idsToSlots(starter.map((c) => c.id)) };
  }
  return { collection: cards, deckSlots: idsToSlots(deckIds) };
}

// Deck edits are written back best-effort; a failed save leaves the local
// deck as-is rather than blocking the UI on the network.
function persist(slots: (number | null)[]): void {
  void saveDeck(slotsToIds(slots)).catch(() => undefined);
}

export const useGameStore = create<GameStore>((set, get) => ({
  collection: [],
  deckSlots: Array(MAX_DECK_SIZE).fill(null),
  status: 'idle',

  load: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading' });
    try {
      const [cards, deckIds] = await Promise.all([fetchCards(), fetchDeck()]);
      set({ ...hydrate(cards, deckIds), status: 'ready' });
    } catch {
      // No backend during local UI work: fall back to the starter deck (seeded
      // into the deck slots, like a new user) plus a fresh random mock
      // collection to test with. Re-rolled on every load; dev builds only — a
      // production build still surfaces the error state.
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[game] backend unavailable — starter deck + mock collection');
        const starter = createStarterDeck();
        set({
          collection: [...starter, ...createMockCollection()],
          deckSlots: idsToSlots(starter.map((c) => c.id)),
          status: 'ready',
        });
        return;
      }
      set({ status: 'error' });
    }
  },

  toggleSelected: (id) =>
    set((state) => {
      const ownIdx = state.deckSlots.indexOf(id);
      if (ownIdx !== -1) {
        const next = [...state.deckSlots];
        next[ownIdx] = null;
        persist(next);
        return { deckSlots: next };
      }

      const emptyIdx = state.deckSlots.indexOf(null);
      if (emptyIdx === -1) return state; // deck full

      const next = [...state.deckSlots];
      next[emptyIdx] = id;
      persist(next);
      return { deckSlots: next };
    }),

  randomFillDeck: () =>
    set((state) => {
      const inDeck = new Set(slotsToIds(state.deckSlots));
      const pool = shuffle(
        state.collection.map((c) => c.id).filter((id) => !inDeck.has(id)),
      );
      const next = [...state.deckSlots];
      for (let i = 0; i < next.length && pool.length > 0; i++) {
        if (next[i] === null) next[i] = pool.shift()!;
      }
      persist(next);
      return { deckSlots: next };
    }),

  clearDeck: () =>
    set(() => {
      const next = Array(MAX_DECK_SIZE).fill(null);
      persist(next);
      return { deckSlots: next };
    }),

  addTestCard: () =>
    set((state) => {
      const jobClass = JOB_CLASSES[Math.floor(Math.random() * JOB_CLASSES.length)];
      const grade = GRADES[Math.floor(Math.random() * GRADES.length)];
      const id = state.collection.reduce((max, c) => Math.max(max, c.id), 0) + 1;
      const testCard = buildCard({
        id,
        personId: id,
        jobClass,
        grade,
        name: `테스트 ${JOB_LABEL[jobClass]} ${id}`,
        company: 'TEST',
      });
      testCard.illustrationUrl = `https://picsum.photos/seed/cardn-${id}/240/320`;
      return { collection: [...state.collection, testCard] };
    }),
}));
