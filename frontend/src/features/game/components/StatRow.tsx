import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/shared/theme';
import type { Stats } from '@/features/game/engine/types';

// Compact ATK/DEF/INT/HP row for small card tiles (deck grid, compendium,
// hand/field cards) — same color mapping as CardDetailPanel's stat grid. Each
// stat carries its name above the number so a first-time reader isn't left
// guessing which coloured digit is which. `size="md"` is for the roomier
// battle hand/field cards where "sm" is too small to read on a phone.
export function StatRow({ stats, size = 'sm' }: { stats: Stats; size?: 'sm' | 'md' }) {
  const labelSize = size === 'md' ? 8 : 6;
  const numSize = size === 'md' ? 12 : 9;
  return (
    <View style={styles.row}>
      <StatCell label="ATK" value={stats.atk} color={colors.gameAccent} labelSize={labelSize} numSize={numSize} />
      <StatCell label="DEF" value={stats.def} color={colors.secondary} labelSize={labelSize} numSize={numSize} />
      <StatCell label="INT" value={stats.int} color={colors.primaryLight} labelSize={labelSize} numSize={numSize} />
      <StatCell label="HP" value={stats.hp} color={colors.jobHr} labelSize={labelSize} numSize={numSize} />
    </View>
  );
}

function StatCell({
  label,
  value,
  color,
  labelSize,
  numSize,
}: {
  label: string;
  value: number;
  color: string;
  labelSize: number;
  numSize: number;
}) {
  return (
    <View style={styles.cell}>
      <Text style={[styles.label, { fontSize: labelSize }]}>{label}</Text>
      <Text style={[styles.num, { color, fontSize: numSize }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Cards can carry a full-bleed illustration, so the stats sit on their own
  // translucent dark strip and the label is white (the old muted grey washed
  // out over art). The strip keeps both readable over any image.
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(10,10,15,0.5)',
    borderRadius: 4,
    paddingVertical: 1,
    paddingHorizontal: 3,
  },
  cell: {
    alignItems: 'center',
  },
  label: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  num: {
    fontWeight: '800',
  },
});
