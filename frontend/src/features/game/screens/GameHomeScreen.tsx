import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, typography } from '@/shared/theme';
import { initBattle } from '@/features/game/engine/battle';
import { createStarterDeck } from '@/features/game/engine/starterDeck';
import type { BattleCard, BattleState, JobClass } from '@/features/game/engine/types';

// Dev-only screen: runs the battle engine directly so it can be tapped through
// on-device while playCard/attack/useSkill/endTurn are still unimplemented.
// Will be replaced by the real DeckBuilder/Battle screens (ui-spec §7-8).

const JOB_COLOR: Record<JobClass, string> = {
  dev: colors.jobDev,
  design: colors.jobDesign,
  hr: colors.jobHr,
  finance: colors.jobFinance,
  legal: colors.jobLegal,
  marketing: colors.jobMarketing,
  sales: colors.jobSales,
  pm: colors.jobPm,
};

export default function GameHomeScreen() {
  const [state, setState] = useState<BattleState | null>(null);

  function startBattle() {
    setState(initBattle(createStarterDeck()));
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>게임 엔진 테스트</Text>
        <Text style={styles.subtitle}>
          initBattle() 결과를 화면에 그대로 출력합니다. (playCard/attack/endTurn은 아직 미구현)
        </Text>

        <Pressable style={styles.button} onPress={startBattle}>
          <Text style={styles.buttonText}>{state ? '다시 섞기' : '새 배틀 시작'}</Text>
        </Pressable>

        {state && (
          <>
            <HeroSummary label="나" hp={state.myHp} deckCount={state.deck.length} handCount={state.hand.length} maxCost={state.maxCost} cost={state.cost} />
            <HandList title={`내 핸드 (${state.hand.length}장)`} cards={state.hand} />

            <HeroSummary label="상대" hp={state.eHp} deckCount={state.eDeck.length} handCount={state.eHand.length} maxCost={state.eMaxCost} />
            <HandList title={`상대 핸드 (${state.eHand.length}장)`} cards={state.eHand} />

            <View style={styles.metaRow}>
              <Text style={styles.metaText}>턴 {state.turnN}</Text>
              <Text style={styles.metaText}>결과: {state.over ?? '진행 중'}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function HeroSummary({
  label,
  hp,
  deckCount,
  handCount,
  maxCost,
  cost,
}: {
  label: string;
  hp: number;
  deckCount: number;
  handCount: number;
  maxCost: number;
  cost?: number;
}) {
  return (
    <View style={styles.heroRow}>
      <Text style={styles.heroLabel}>{label}</Text>
      <Text style={styles.metaText}>❤️ {hp}</Text>
      <Text style={styles.metaText}>덱 {deckCount}장</Text>
      <Text style={styles.metaText}>핸드 {handCount}장</Text>
      <Text style={styles.metaText}>
        코스트 {cost !== undefined ? `${cost}/${maxCost}` : maxCost}
      </Text>
    </View>
  );
}

function HandList({ title, cards }: { title: string; cards: BattleCard[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {cards.map((card, i) => (
        <View key={`${card.id}-${i}`} style={[styles.cardRow, { borderLeftColor: JOB_COLOR[card.jobClass] }]}>
          <Text style={styles.cardName}>
            ★{card.grade} {card.name}
          </Text>
          <Text style={styles.metaText}>
            {card.jobLabel} · cost {card.cost} · {card.finalStats.atk}/{card.finalStats.hp}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.screenTitle.fontSize,
    fontWeight: typography.screenTitle.fontWeight,
  },
  subtitle: {
    color: colors.textTertiary,
    fontSize: typography.meta.fontSize,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  heroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    padding: 12,
    alignItems: 'center',
  },
  heroLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    marginRight: 4,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: typography.meta.fontSize,
  },
  section: {
    gap: 6,
  },
  sectionLabel: {
    color: colors.textTertiary,
    fontSize: typography.sectionLabel.fontSize,
    fontWeight: typography.sectionLabel.fontWeight,
    letterSpacing: typography.sectionLabel.letterSpacing,
  },
  cardRow: {
    backgroundColor: colors.surface1,
    borderRadius: radius.gameCard,
    borderLeftWidth: 3,
    padding: 8,
    gap: 2,
  },
  cardName: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
