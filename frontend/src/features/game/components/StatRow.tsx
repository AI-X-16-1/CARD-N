import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/shared/theme';
import type { Stats } from '@/features/game/engine/types';

// Compact ATK/DEF/INT/HP row for small card tiles (deck grid, compendium,
// hand/field cards) — same color mapping as CardDetailPanel's stat grid.
export function StatRow({ stats }: { stats: Stats }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.num, { color: colors.gameAccent }]}>{stats.atk}</Text>
      <Text style={[styles.num, { color: colors.secondary }]}>{stats.def}</Text>
      <Text style={[styles.num, { color: colors.primaryLight }]}>{stats.int}</Text>
      <Text style={[styles.num, { color: colors.jobHr }]}>{stats.hp}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
  },
  num: {
    fontSize: 9,
    fontWeight: '800',
  },
});
