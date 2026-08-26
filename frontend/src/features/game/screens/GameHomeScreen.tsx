import { useState } from 'react';

import DeckBuilderScreen from '@/features/game/screens/DeckBuilderScreen';
import BattleScreen from '@/features/game/screens/BattleScreen';
import type { BattleCard } from '@/features/game/engine/types';

// Container for the "게임" tab: switches locally between the Deck Builder
// (ui-spec §7) and Battle (ui-spec §8) views without adding new navigation
// routes, since frontend/src/navigation/ requires a separate reviewed PR.
export default function GameHomeScreen() {
  const [mode, setMode] = useState<'deck' | 'battle'>('deck');
  const [battleDeck, setBattleDeck] = useState<BattleCard[] | null>(null);

  if (mode === 'battle') {
    return (
      <BattleScreen
        initialDeck={battleDeck ?? undefined}
        onExit={() => setMode('deck')}
      />
    );
  }

  return (
    <DeckBuilderScreen
      onStartBattle={(deck) => {
        setBattleDeck(deck);
        setMode('battle');
      }}
    />
  );
}
