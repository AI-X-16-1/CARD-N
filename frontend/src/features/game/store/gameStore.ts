import { create } from 'zustand';

import { createMockCollection } from '@/features/game/engine/mockCollection';
import type { BattleCard } from '@/features/game/engine/types';

export const MAX_DECK_SIZE = 8;

interface GameStore {
  collection: BattleCard[];
  // Fixed-length, position-stable: removing a card clears only its own slot
  // instead of shifting the rest of the deck down (which previously made a
  // different card appear to take the tapped card's place).
  deckSlots: (number | null)[];
  toggleSelected: (id: number) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  collection: createMockCollection(),
  deckSlots: Array(MAX_DECK_SIZE).fill(null),
  toggleSelected: (id) =>
    set((state) => {
      const ownIdx = state.deckSlots.indexOf(id);
      if (ownIdx !== -1) {
        const next = [...state.deckSlots];
        next[ownIdx] = null;
        return { deckSlots: next };
      }

      const emptyIdx = state.deckSlots.indexOf(null);
      if (emptyIdx === -1) return state; // deck full

      const next = [...state.deckSlots];
      next[emptyIdx] = id;
      return { deckSlots: next };
    }),
}));
