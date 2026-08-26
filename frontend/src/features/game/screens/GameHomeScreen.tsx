import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, typography } from '@/shared/theme';
import { attack, calcEffStats, checkSynergies, endTurn, initBattle, playCard, useSkill } from '@/features/game/engine/battle';
import { createStarterDeck } from '@/features/game/engine/starterDeck';
import type { BattleCard, BattleState, JobClass, Synergy } from '@/features/game/engine/types';

// Dev-only screen: drives the battle engine directly so it can be played
// through on-device. Will be replaced by the real DeckBuilder/Battle screens
// (ui-spec §7-8).

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

function isReady(card: BattleCard): boolean {
  return !card.hasActed && (!card.justPlayed || card.grade === 1);
}

// Tint helper from design-tokens.md: same hex at a given alpha, e.g. 16% for badge backgrounds.
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function GameHomeScreen() {
  const [state, setState] = useState<BattleState | null>(null);
  const [selectedHandIdx, setSelectedHandIdx] = useState<number | null>(null);
  const [selectedAttackerIdx, setSelectedAttackerIdx] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewingCard, setViewingCard] = useState<{ card: BattleCard; mine: boolean } | null>(null);

  function startBattle() {
    setState(initBattle(createStarterDeck()));
    setSelectedHandIdx(null);
    setSelectedAttackerIdx(null);
    setErrorMsg(null);
    setViewingCard(null);
  }

  function openDetail(card: BattleCard, mine: boolean) {
    setViewingCard({ card, mine });
  }

  function run(fn: (s: BattleState) => BattleState) {
    if (!state) return;
    try {
      setState(fn(state));
      setSelectedHandIdx(null);
      setSelectedAttackerIdx(null);
      setErrorMsg(null);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  function tapHand(idx: number) {
    setErrorMsg(null);
    setSelectedAttackerIdx(null);
    setSelectedHandIdx((prev) => (prev === idx ? null : idx));
  }

  function tapMySlot(idx: number, card: BattleCard | null) {
    if (card) {
      if (!isReady(card)) return;
      setErrorMsg(null);
      setSelectedHandIdx(null);
      setSelectedAttackerIdx((prev) => (prev === idx ? null : idx));
      return;
    }
    if (selectedHandIdx !== null) run((s) => playCard(s, selectedHandIdx, idx));
  }

  function tapEnemySlot(idx: number) {
    if (selectedAttackerIdx !== null) run((s) => attack(s, selectedAttackerIdx, idx));
  }

  function tapEnemyHero() {
    if (selectedAttackerIdx !== null) run((s) => attack(s, selectedAttackerIdx, 'hero'));
  }

  function useSkillOnSelected() {
    if (selectedAttackerIdx !== null) run((s) => useSkill(s, selectedAttackerIdx));
  }

  if (!state) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.title}>게임 엔진 테스트</Text>
          <Pressable style={styles.primaryButton} onPress={startBattle}>
            <Text style={styles.buttonText}>새 배틀 시작</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const mySynergies = checkSynergies(state.field.filter((c): c is BattleCard => c !== null));
  const eSynergies = checkSynergies(state.eField.filter((c): c is BattleCard => c !== null));
  const selectedCard = selectedAttackerIdx !== null ? state.field[selectedAttackerIdx] : null;
  const canUseSkill = !!selectedCard && !selectedCard.hasActed && state.cost >= selectedCard.skill.cost;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.metaText}>턴 {state.turnN}</Text>
          <Pressable onPress={startBattle}>
            <Text style={styles.resetLink}>다시 시작</Text>
          </Pressable>
        </View>

        {errorMsg && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        <HeroRow label="상대" hp={state.eHp} deckCount={state.eDeck.length} handCount={state.eHand.length} maxCost={state.eMaxCost} onPress={tapEnemyHero} />
        <EnemyHandBackRow count={state.eHand.length} />
        <SynergyRow synergies={eSynergies} />
        <FieldRow
          cards={state.eField}
          mine={false}
          synergies={eSynergies}
          canTarget={selectedAttackerIdx !== null}
          onPressSlot={tapEnemySlot}
          onInfoPress={(card) => openDetail(card, false)}
        />

        <Text style={styles.hintText}>
          {selectedHandIdx !== null && '빈 자리를 탭해서 카드를 배치하세요'}
          {selectedAttackerIdx !== null && '상대 카드나 히어로를 탭해서 공격, 또는 스킬 사용'}
          {selectedHandIdx === null && selectedAttackerIdx === null && '핸드 카드나 내 필드 카드를 탭하세요'}
        </Text>
        <Text style={styles.hintText}>카드를 길게 누르면 상세정보를 볼 수 있어요</Text>

        <FieldRow
          cards={state.field}
          mine
          synergies={mySynergies}
          selectedIdx={selectedAttackerIdx}
          onPressSlot={tapMySlot}
          onInfoPress={(card) => openDetail(card, true)}
        />
        <SynergyRow synergies={mySynergies} />
        <HeroRow label="나" hp={state.myHp} deckCount={state.deck.length} handCount={state.hand.length} maxCost={state.maxCost} cost={state.cost} />

        {selectedCard && (
          <Pressable
            style={[styles.skillButton, !canUseSkill && styles.disabledButton]}
            onPress={useSkillOnSelected}
            disabled={!canUseSkill}
          >
            <Text style={styles.buttonText}>
              {selectedCard.skill.name} 사용 (cost {selectedCard.skill.cost})
            </Text>
          </Pressable>
        )}

        <View style={styles.handRow}>
          {state.hand.map((card, i) => (
            <Pressable
              key={`${card.id}-${i}`}
              onPress={() => tapHand(i)}
              onLongPress={() => openDetail(card, true)}
              style={[
                styles.handCard,
                { borderTopColor: JOB_COLOR[card.jobClass] },
                card.cost > state.cost && styles.unaffordable,
                selectedHandIdx === i && styles.selectedSlot,
              ]}
            >
              <View style={[styles.infoBadge, styles.noPointerEvents]}>
                <Text style={styles.infoBadgeText}>i</Text>
              </View>
              <Text style={styles.costBadge}>{card.cost}</Text>
              <Text style={styles.cardName}>
                ★{card.grade} {card.name}
              </Text>
              <Text style={styles.metaText}>
                {card.jobLabel} · {card.finalStats.atk}/{card.finalStats.hp}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.primaryButton} onPress={() => run(endTurn)}>
          <Text style={styles.buttonText}>턴 종료</Text>
        </Pressable>

        <View style={styles.logBox}>
          {state.log.slice(-6).map((line, i) => (
            <Text key={i} style={styles.logText}>
              {line}
            </Text>
          ))}
        </View>
      </ScrollView>

      {state.over && (
        <View style={styles.overlay}>
          <Text style={[styles.overlayTitle, state.over === 'victory' ? styles.victoryText : styles.defeatText]}>
            {state.over === 'victory' ? 'VICTORY' : 'DEFEAT'}
          </Text>
          <Pressable style={styles.primaryButton} onPress={startBattle}>
            <Text style={styles.buttonText}>다시 대전</Text>
          </Pressable>
        </View>
      )}

      {viewingCard && (
        <Pressable style={styles.detailBackdrop} onPress={() => setViewingCard(null)}>
          <Pressable
            style={[styles.detailCard, { borderColor: JOB_COLOR[viewingCard.card.jobClass] }]}
            onPress={() => {}}
          >
            <Pressable style={styles.detailCloseBadge} hitSlop={8} onPress={() => setViewingCard(null)}>
              <Text style={styles.detailCloseText}>✕</Text>
            </Pressable>

            <Text style={styles.detailStars}>{'★'.repeat(viewingCard.card.grade)}</Text>
            <Text style={styles.detailName}>{viewingCard.card.name}</Text>
            <Text style={styles.detailCompany}>{viewingCard.card.company}</Text>
            <View
              style={[
                styles.detailClassBadge,
                { backgroundColor: hexToRgba(JOB_COLOR[viewingCard.card.jobClass], 0.16) },
              ]}
            >
              <Text style={[styles.detailClassText, { color: JOB_COLOR[viewingCard.card.jobClass] }]}>
                {viewingCard.card.jobLabel} · {viewingCard.mine ? '내 카드' : '적 카드'}
              </Text>
            </View>

            {(() => {
              const synergies = viewingCard.mine ? mySynergies : eSynergies;
              const eff = calcEffStats(viewingCard.card, synergies);
              const curHp = viewingCard.card.currentHp ?? eff.hp;
              return (
                <View style={styles.detailStatsGrid}>
                  <StatCell label="ATK" value={eff.atk} color={colors.gameAccent} />
                  <StatCell label="DEF" value={eff.def} color={colors.secondary} />
                  <StatCell label="INT" value={eff.int} color={colors.primaryLight} />
                  <StatCell label="HP" value={`${curHp}/${eff.hp}`} color={colors.jobHr} />
                </View>
              );
            })()}

            <View style={styles.detailChip}>
              <Text style={styles.detailChipTitle}>
                {viewingCard.card.skill.name} (cost {viewingCard.card.skill.cost})
              </Text>
              <Text style={styles.detailChipDesc}>{viewingCard.card.skill.description}</Text>
            </View>
            <View style={styles.detailChip}>
              <Text style={styles.detailChipTitle}>패시브 · {viewingCard.card.jobLabel}</Text>
              <Text style={styles.detailChipDesc}>{viewingCard.card.passive}</Text>
            </View>

            {!!viewingCard.card.flavorText && (
              <Text style={styles.detailFlavor}>“{viewingCard.card.flavorText}”</Text>
            )}
          </Pressable>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

function HeroRow({
  label,
  hp,
  deckCount,
  handCount,
  maxCost,
  cost,
  onPress,
}: {
  label: string;
  hp: number;
  deckCount: number;
  handCount: number;
  maxCost: number;
  cost?: number;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.heroRow} onPress={onPress}>
      <Text style={styles.heroLabel}>{label}</Text>
      <Text style={styles.metaText}>❤️ {hp}</Text>
      <Text style={styles.metaText}>덱 {deckCount}장</Text>
      <Text style={styles.metaText}>핸드 {handCount}장</Text>
      <Text style={styles.metaText}>코스트 {cost !== undefined ? `${cost}/${maxCost}` : maxCost}</Text>
    </Pressable>
  );
}

function SynergyRow({ synergies }: { synergies: Synergy[] }) {
  if (synergies.length === 0) return null;
  return (
    <View style={styles.synergyRow}>
      {synergies.map((s) => (
        <View key={s.name} style={styles.synergyPill}>
          <Text style={styles.synergyText}>{s.name}</Text>
        </View>
      ))}
    </View>
  );
}

function EnemyHandBackRow({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View style={styles.enemyHandRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.cardBack}>
          <Text style={styles.cardBackMark}>◆</Text>
        </View>
      ))}
    </View>
  );
}

function FieldRow({
  cards,
  mine,
  synergies,
  selectedIdx,
  canTarget,
  onPressSlot,
  onInfoPress,
}: {
  cards: (BattleCard | null)[];
  mine: boolean;
  synergies: Synergy[];
  selectedIdx?: number | null;
  canTarget?: boolean;
  onPressSlot: (idx: number, card: BattleCard | null) => void;
  onInfoPress: (card: BattleCard) => void;
}) {
  return (
    <View style={styles.fieldRow}>
      {cards.map((card, i) => {
        if (!card) {
          return (
            <Pressable key={i} style={[styles.slot, styles.emptySlot]} onPress={() => onPressSlot(i, null)}>
              <Text style={styles.emptySlotText}>빈 자리</Text>
            </Pressable>
          );
        }

        const ready = isReady(card);
        const eff = calcEffStats(card, synergies);
        let caption = '';
        if (mine) {
          if (card.hasActed) caption = '행동 완료';
          else if (card.justPlayed && card.grade !== 1) caption = '출근 중…';
          else caption = '⚡ 탭하여 선택';
        } else if (canTarget) {
          caption = '대상 선택!';
        }

        return (
          <Pressable
            key={i}
            onPress={() => onPressSlot(i, card)}
            onLongPress={() => onInfoPress(card)}
            style={[
              styles.slot,
              { borderColor: JOB_COLOR[card.jobClass] },
              selectedIdx === i && styles.selectedSlot,
              mine && !ready && styles.notReadySlot,
            ]}
          >
            <View style={styles.infoBadge} pointerEvents="none">
              <Text style={styles.infoBadgeText}>i</Text>
            </View>
            <Text style={styles.cardName}>
              ★{card.grade} {card.name}
            </Text>
            <Text style={styles.metaText}>
              {eff.atk} / {card.currentHp ?? eff.hp}
            </Text>
            {caption ? <Text style={styles.captionText}>{caption}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function StatCell({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={styles.detailStatCell}>
      <Text style={[styles.detailStatValue, { color }]}>{value}</Text>
      <Text style={styles.detailStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  content: {
    padding: 16,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.screenTitle.fontSize,
    fontWeight: typography.screenTitle.fontWeight,
  },
  resetLink: {
    color: colors.primaryLight,
    fontSize: typography.meta.fontSize,
    fontWeight: '700',
  },
  errorBanner: {
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.gameAccent,
    padding: 8,
  },
  errorText: {
    color: colors.gameAccent,
    fontSize: typography.meta.fontSize,
  },
  hintText: {
    color: colors.textTertiary,
    fontSize: typography.meta.fontSize,
    textAlign: 'center',
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
  synergyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  synergyPill: {
    backgroundColor: colors.secondary,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  synergyText: {
    color: colors.canvas,
    fontSize: typography.micro.fontSize,
    fontWeight: '700',
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 6,
  },
  slot: {
    flex: 1,
    minHeight: 64,
    backgroundColor: colors.surface1,
    borderRadius: radius.gameCard,
    borderWidth: 2,
    borderColor: colors.borderMedium,
    padding: 6,
    justifyContent: 'center',
    gap: 2,
    position: 'relative',
  },
  emptySlot: {
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlotText: {
    color: colors.textMuted,
    fontSize: typography.micro.fontSize,
  },
  selectedSlot: {
    borderColor: colors.warning,
  },
  notReadySlot: {
    opacity: 0.5,
  },
  cardName: {
    color: colors.textPrimary,
    fontSize: typography.micro.fontSize,
    fontWeight: '700',
  },
  captionText: {
    color: colors.textQuaternary,
    fontSize: 9,
  },
  handRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  handCard: {
    width: 84,
    backgroundColor: colors.surface1,
    borderRadius: radius.gameCard,
    borderTopWidth: 3,
    padding: 8,
    gap: 2,
    position: 'relative',
  },
  infoBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPointerEvents: {
    pointerEvents: 'none',
  },
  infoBadgeText: {
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: '700',
  },
  enemyHandRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  cardBack: {
    width: 28,
    height: 40,
    backgroundColor: colors.surface2,
    borderRadius: radius.gameCard,
    borderWidth: 1,
    borderColor: colors.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBackMark: {
    color: colors.textMuted,
    fontSize: 12,
  },
  unaffordable: {
    opacity: 0.38,
  },
  costBadge: {
    color: colors.warning,
    fontSize: typography.micro.fontSize,
    fontWeight: '800',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  skillButton: {
    backgroundColor: colors.secondary,
    borderRadius: radius.pill,
    paddingVertical: 10,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.4,
  },
  buttonText: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  logBox: {
    gap: 2,
  },
  logText: {
    color: colors.textMuted,
    fontSize: typography.micro.fontSize,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,10,15,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  overlayTitle: {
    fontSize: typography.battleResult.fontSize,
    fontWeight: typography.battleResult.fontWeight,
  },
  victoryText: {
    color: colors.secondary,
  },
  defeatText: {
    color: colors.gameAccent,
  },
  detailBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,10,15,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  detailCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surface3,
    borderRadius: radius.card,
    borderWidth: 2,
    padding: 20,
    gap: 10,
  },
  detailCloseBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCloseText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  detailStars: {
    color: colors.warning,
    fontSize: 14,
  },
  detailName: {
    color: colors.textPrimary,
    fontSize: typography.screenTitle.fontSize,
    fontWeight: '800',
  },
  detailCompany: {
    color: colors.textTertiary,
    fontSize: typography.meta.fontSize,
  },
  detailClassBadge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  detailClassText: {
    fontSize: typography.micro.fontSize,
    fontWeight: '700',
  },
  detailStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface1,
    borderRadius: radius.gameCard,
    padding: 10,
    marginTop: 4,
  },
  detailStatCell: {
    alignItems: 'center',
    gap: 2,
  },
  detailStatValue: {
    fontSize: typography.body.fontSize,
    fontWeight: '800',
  },
  detailStatLabel: {
    color: colors.textQuaternary,
    fontSize: 9,
    fontWeight: '600',
  },
  detailChip: {
    backgroundColor: colors.surface1,
    borderRadius: radius.gameCard,
    padding: 10,
    gap: 2,
  },
  detailChipTitle: {
    color: colors.textPrimary,
    fontSize: typography.meta.fontSize,
    fontWeight: '700',
  },
  detailChipDesc: {
    color: colors.textSecondary,
    fontSize: typography.meta.fontSize,
  },
  detailFlavor: {
    color: colors.textSubtle,
    fontSize: typography.meta.fontSize,
    fontStyle: 'italic',
  },
});
