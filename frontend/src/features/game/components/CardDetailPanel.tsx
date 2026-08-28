import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';
import { JOB_COLOR, PASSIVE_INFO } from '@/features/game/constants';
import { CardArt } from '@/features/game/components/CardArt';
import { hexToRgba } from '@/features/game/utils/color';
import type { BattleCard, Stats } from '@/features/game/engine/types';

type Props = {
  card: BattleCard;
  effStats: Stats;
  actions?: ReactNode;
};

// Shared "card detail" content: stars/name/company, class badge, ATK/DEF/INT/HP
// grid, skill + passive chips, flavor text. Reused by the in-battle long-press
// overlay and the Deck Builder's Card Detail Overlay (ui-spec §7).
export function CardDetailPanel({ card, effStats, actions }: Props) {
  const curHp = card.currentHp ?? effStats.hp;

  return (
    <>
      <CardArt uri={card.illustrationUrl} variant="detail" />
      <Text style={styles.stars}>{'★'.repeat(card.grade)}</Text>
      <Text style={styles.name}>{card.name}</Text>
      <Text style={styles.company}>{card.company}</Text>
      <View style={[styles.classBadge, { backgroundColor: hexToRgba(JOB_COLOR[card.jobClass], 0.16) }]}>
        <Text style={[styles.classText, { color: JOB_COLOR[card.jobClass] }]}>{card.jobLabel}</Text>
      </View>

      <View style={styles.statsGrid}>
        <StatCell label="ATK" value={effStats.atk} color={colors.gameAccent} />
        <StatCell label="DEF" value={effStats.def} color={colors.secondary} />
        <StatCell label="INT" value={effStats.int} color={colors.primaryLight} />
        <StatCell label="HP" value={`${curHp}/${effStats.hp}`} color={colors.jobHr} />
      </View>

      <View style={styles.chip}>
        <Text style={styles.chipTitle}>
          {card.skill.name} (cost {card.skill.cost})
        </Text>
        <Text style={styles.chipDesc}>{card.skill.description}</Text>
      </View>
      <View style={styles.chip}>
        <Text style={styles.chipTitle}>패시브 · {PASSIVE_INFO[card.jobClass].name}</Text>
        <Text style={styles.chipDesc}>{PASSIVE_INFO[card.jobClass].effect}</Text>
      </View>

      {!!card.flavorText && <Text style={styles.flavor}>“{card.flavorText}”</Text>}

      {actions}
    </>
  );
}

function StatCell({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stars: {
    color: colors.warning,
    fontSize: 14,
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.screenTitle.fontSize,
    fontWeight: '800',
  },
  company: {
    color: colors.textTertiary,
    fontSize: typography.meta.fontSize,
  },
  classBadge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  classText: {
    fontSize: typography.micro.fontSize,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface1,
    borderRadius: radius.gameCard,
    padding: 10,
    marginTop: 4,
  },
  statCell: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: typography.body.fontSize,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textQuaternary,
    fontSize: 9,
    fontWeight: '600',
  },
  chip: {
    backgroundColor: colors.surface1,
    borderRadius: radius.gameCard,
    padding: 10,
    gap: 2,
  },
  chipTitle: {
    color: colors.textPrimary,
    fontSize: typography.meta.fontSize,
    fontWeight: '700',
  },
  chipDesc: {
    color: colors.textSecondary,
    fontSize: typography.meta.fontSize,
  },
  flavor: {
    color: colors.textSubtle,
    fontSize: typography.meta.fontSize,
    fontStyle: 'italic',
  },
});
