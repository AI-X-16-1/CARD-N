import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';
import { JOB_COLOR } from '@/features/game/constants';
import { StatRow } from '@/features/game/components/StatRow';
import type { BattleCard } from '@/features/game/engine/types';

type Props = {
  deckSlots: (number | null)[];
  collection: BattleCard[];
  /** Tap a filled slot → remove that card from the deck. */
  onRemove: (id: number) => void;
  /** Long-press a filled slot (optional) → e.g. open the card detail. */
  onLongPressCard?: (id: number) => void;
};

// The 8 fixed deck slots as a 4-column mini grid. Rendered both on the deck
// builder screen and inside the card-placement popup, so scrolling the list
// never hides the current deck.
export function DeckStrip({ deckSlots, collection, onRemove, onLongPressCard }: Props) {
  return (
    <View style={styles.grid}>
      {deckSlots.map((cardId, i) => {
        const card = cardId !== null ? collection.find((c) => c.id === cardId) : undefined;
        if (!card) {
          return (
            <View key={i} style={[styles.tile, styles.tileEmpty]}>
              <Text style={styles.tileEmptyText}>+</Text>
            </View>
          );
        }
        return (
          <Pressable
            key={i}
            style={[styles.tile, { borderColor: JOB_COLOR[card.jobClass] }]}
            onPress={() => onRemove(card.id)}
            onLongPress={onLongPressCard ? () => onLongPressCard(card.id) : undefined}
          >
            <Text style={styles.tileStars}>{'★'.repeat(card.grade)}</Text>
            <Text style={styles.tileName} numberOfLines={1}>
              {card.name}
            </Text>
            <Text style={styles.tileSkill} numberOfLines={1}>
              {card.skill.name}
            </Text>
            <StatRow stats={card.finalStats} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Percentage columns + space-between so the 8 slots always lay out 4-per-row
    // (2 rows), whether the container is the full screen or the narrow placement
    // popup. A fixed column `gap` overflows the popup and wraps to 3-per-row.
    justifyContent: 'space-between',
    rowGap: 8,
  },
  tile: {
    width: '23%',
    aspectRatio: 0.65,
    backgroundColor: colors.surface1,
    borderRadius: radius.gameCard,
    borderWidth: 2,
    borderColor: colors.borderMedium,
    padding: 6,
    justifyContent: 'center',
    gap: 2,
  },
  tileEmpty: {
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  tileEmptyText: {
    color: colors.textMuted,
    fontSize: 18,
  },
  tileStars: {
    color: colors.warning,
    fontSize: 7,
  },
  tileName: {
    color: colors.textPrimary,
    fontSize: typography.micro.fontSize,
    fontWeight: '800',
  },
  tileSkill: {
    color: colors.textQuaternary,
    fontSize: 8,
  },
});
