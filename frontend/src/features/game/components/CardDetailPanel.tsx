import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';
import { JOB_COLOR, PASSIVE_INFO } from '@/features/game/constants';
import { CardArt } from '@/features/game/components/CardArt';
import { hexToRgba } from '@/features/game/utils/color';
import type { BattleCard, Stats } from '@/features/game/engine/types';

type Props = {
  card: BattleCard;
  effStats: Stats;
  actions?: ReactNode;
  /** When set, shows a "generate / regenerate art" button (cardcreate, ~3 min). */
  onGenerateArt?: () => void;
  artBusy?: boolean;
  artError?: boolean;
};

// Shared "card detail" content. When the card has generated art (with its stats
// baked in) the image fills the popup and the text block is behind a checkbox;
// otherwise the text block shows outright. Reused by the in-battle long-press
// overlay and the Deck Builder's Card Detail Overlay (ui-spec §7).
export function CardDetailPanel({ card, effStats, actions, onGenerateArt, artBusy, artError }: Props) {
  const curHp = card.currentHp ?? effStats.hp;
  const hasArt = !!card.illustrationUrl;
  const [showText, setShowText] = useState(false);

  const artButton = onGenerateArt ? (
    <>
      <Pressable
        style={[styles.artButton, artBusy && styles.artButtonBusy]}
        onPress={onGenerateArt}
        disabled={artBusy}
      >
        <Text style={styles.artButtonText}>
          {artBusy ? '이미지 생성 중… (약 3분)' : hasArt ? '이미지 다시 생성' : '이미지 생성'}
        </Text>
      </Pressable>
      {artError && <Text style={styles.artError}>이미지 생성에 실패했어요</Text>}
    </>
  ) : null;

  const textBlock = (
    <>
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
    </>
  );

  return (
    <>
      {hasArt ? (
        <>
          <View>
            <CardArt uri={card.illustrationUrl} variant="detail" />
            {showText && (
              <ScrollView style={styles.textOverlay} contentContainerStyle={styles.textOverlayContent}>
                {textBlock}
              </ScrollView>
            )}
          </View>
          <Pressable style={styles.textToggle} onPress={() => setShowText((v) => !v)}>
            <View style={[styles.checkbox, showText && styles.checkboxOn]}>
              {showText && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <Text style={styles.textToggleLabel}>카드 정보 텍스트로 보기</Text>
          </Pressable>
        </>
      ) : (
        textBlock
      )}

      {artButton}
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
  textOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,10,15,0.82)',
    borderRadius: radius.gameCard,
  },
  textOverlayContent: {
    padding: 14,
    gap: 6,
  },
  textToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.borderMedium,
    backgroundColor: colors.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.gameAccent,
    borderColor: colors.gameAccent,
  },
  checkboxMark: {
    color: colors.canvas,
    fontSize: 11,
    fontWeight: '800',
  },
  textToggleLabel: {
    color: colors.textSecondary,
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
  },
  artButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  artButtonBusy: {
    opacity: 0.5,
  },
  artButtonText: {
    color: colors.textPrimary,
    fontSize: typography.meta.fontSize,
    fontWeight: '800',
  },
  artError: {
    color: colors.gameAccent,
    fontSize: typography.micro.fontSize,
  },
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
