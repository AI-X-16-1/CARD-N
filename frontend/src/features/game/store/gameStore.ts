import { create } from 'zustand';

import { fetchCards, fetchDeck, saveDeck } from '@/features/game/api';
import { createMockCollection } from '@/features/game/engine/mockCollection';
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
}

function slotsToIds(slots: (number | null)[]): number[] {
  return slots.filter((id): id is number => id !== null);
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
      const slots: (number | null)[] = Array(MAX_DECK_SIZE).fill(null);
      deckIds.slice(0, MAX_DECK_SIZE).forEach((id, i) => {
        slots[i] = id;
      });
      set({ collection: cards, deckSlots: slots, status: 'ready' });
    } catch {
      // No backend during local UI work: fall back to a fresh random mock
      // collection so the deck builder stays usable offline. Re-rolled on
      // every load; dev builds only — a production build still surfaces the
      // error state.
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[game] backend unavailable — using mock collection');
        set({
          collection: createMockCollection(),
          deckSlots: Array(MAX_DECK_SIZE).fill(null),
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
}));
