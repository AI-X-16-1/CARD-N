import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { colors } from '@/shared/theme';
import DeckBuilderScreen from '@/features/game/screens/DeckBuilderScreen';
import BattleScreen from '@/features/game/screens/BattleScreen';
import type { BattleCard } from '@/features/game/engine/types';
import { useGameStore } from '@/features/game/store/gameStore';

// Container for the "게임" tab: switches locally between the Deck Builder
// (ui-spec §7) and Battle (ui-spec §8) views without adding new navigation
// routes, since frontend/src/navigation/ requires a separate reviewed PR.
export default function GameHomeScreen() {
  const [mode, setMode] = useState<'deck' | 'battle'>('deck');
  const [battleDeck, setBattleDeck] = useState<BattleCard[] | null>(null);

  // Hydrate the card collection + saved deck from the backend once, when the
  // game tab first opens.
  const load = useGameStore((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);

  const content =
    mode === 'battle' ? (
      <BattleScreen initialDeck={battleDeck ?? undefined} onExit={() => setMode('deck')} />
    ) : (
      <DeckBuilderScreen
        onStartBattle={(deck) => {
          setBattleDeck(deck);
          setMode('battle');
        }}
      />
    );

  // The app is Android-first and always fills a real phone's portrait
  // screen there. On web (used here only to preview this feature in a
  // browser) the window can be any shape, so lock a phone-ratio frame
  // to show the concept correctly.
  if (Platform.OS !== 'web') return content;

  return (
    <View style={styles.webBackdrop}>
      <View style={styles.phoneFrame}>{content}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  webBackdrop: {
    flex: 1,
    backgroundColor: colors.surface1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  phoneFrame: {
    width: '100%',
    height: '100%',
    maxWidth: 420,
    maxHeight: 860,
    aspectRatio: 9 / 19.5,
    backgroundColor: colors.canvas,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.borderMedium,
    overflow: 'hidden',
  },
});
