import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, typography } from '@/shared/theme';
import { JOB_COLOR } from '@/features/game/constants';
import { CardDetailPanel } from '@/features/game/components/CardDetailPanel';
import { StatRow } from '@/features/game/components/StatRow';
import { attack, calcEffStats, checkSynergies, endTurn, initBattle, playCard, useSkill } from '@/features/game/engine/battle';
import { createStarterDeck } from '@/features/game/engine/starterDeck';
import type { BattleCard, BattleState, Synergy } from '@/features/game/engine/types';

type Props = {
  initialDeck?: BattleCard[];
  onExit?: () => void;
};

function isReady(card: BattleCard): boolean {
  return !card.hasActed && (!card.justPlayed || card.grade === 1);
}

export default function BattleScreen({ initialDeck, onExit }: Props) {
  // Coming from the Deck Builder means a deck was already chosen, so start
  // immediately instead of making the player tap "새 배틀 시작" a second time.
  const [state, setState] = useState<BattleState | null>(() => (initialDeck ? initBattle(initialDeck) : null));
  const [selectedHandIdx, setSelectedHandIdx] = useState<number | null>(null);
  const [selectedAttackerIdx, setSelectedAttackerIdx] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewingCard, setViewingCard] = useState<{ card: BattleCard; mine: boolean } | null>(null);

  // Hearthstone-style "flies from hand to the target slot" placement animation.
  const [flying, setFlying] = useState<{ card: BattleCard; handIdx: number } | null>(null);
  const handRefs = useRef<Record<number, View | null>>({});
  const fieldRefs = useRef<Record<number, View | null>>({});
  const flyX = useSharedValue(0);
  const flyY = useSharedValue(0);
  const flyW = useSharedValue(0);
  const flyH = useSharedValue(0);
  const flyOpacity = useSharedValue(0);
  const flyingStyle = useAnimatedStyle(() => ({
    left: flyX.value,
    top: flyY.value,
    width: flyW.value,
    height: flyH.value,
    opacity: flyOpacity.value,
  }));

  // Hearthstone-style "bumps into the target once, then returns" attack animation.
  const [attacking, setAttacking] = useState<{ card: BattleCard; myIdx: number } | null>(null);
  const enemyFieldRefs = useRef<Record<number, View | null>>({});
  const enemyHeroRef = useRef<View | null>(null);
  const atkX = useSharedValue(0);
  const atkY = useSharedValue(0);
  const atkW = useSharedValue(0);
  const atkH = useSharedValue(0);
  const atkOpacity = useSharedValue(0);
  const atkStyle = useAnimatedStyle(() => ({
    left: atkX.value,
    top: atkY.value,
    width: atkW.value,
    height: atkH.value,
    opacity: atkOpacity.value,
  }));

  function startBattle() {
    setState(initBattle(initialDeck ?? createStarterDeck()));
    setSelectedHandIdx(null);
    setSelectedAttackerIdx(null);
    setErrorMsg(null);
    setViewingCard(null);
    setFlying(null);
    setAttacking(null);
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
    if (selectedHandIdx !== null) playCardWithFlight(selectedHandIdx, idx);
  }

  function playCardWithFlight(handIdx: number, slotIdx: number) {
    if (!state) return;
    const card = state.hand[handIdx];
    const handEl = handRefs.current[handIdx];
    const slotEl = fieldRefs.current[slotIdx];
    setSelectedHandIdx(null);

    if (!card || !handEl || !slotEl) {
      run((s) => playCard(s, handIdx, slotIdx));
      return;
    }

    handEl.measureInWindow((hx, hy, hw, hh) => {
      slotEl.measureInWindow((sx, sy, sw, sh) => {
        flyX.value = hx;
        flyY.value = hy;
        flyW.value = hw;
        flyH.value = hh;
        flyOpacity.value = 1;
        setFlying({ card, handIdx });

        const config = { duration: 320, easing: Easing.out(Easing.cubic) };
        flyX.value = withTiming(sx, config);
        flyY.value = withTiming(sy, config);
        flyW.value = withTiming(sw, config);
        flyH.value = withTiming(sh, config, (finished) => {
          if (finished) runOnJS(commitPlay)(handIdx, slotIdx);
        });
      });
    });
  }

  function commitPlay(handIdx: number, slotIdx: number) {
    setFlying(null);
    run((s) => playCard(s, handIdx, slotIdx));
  }

  function tapEnemySlot(idx: number) {
    if (selectedAttackerIdx !== null) attackWithBump(selectedAttackerIdx, idx);
  }

  function tapEnemyHero() {
    if (selectedAttackerIdx !== null) attackWithBump(selectedAttackerIdx, 'hero');
  }

  function attackWithBump(myIdx: number, target: number | 'hero') {
    if (!state) return;
    const attacker = state.field[myIdx];
    const myEl = fieldRefs.current[myIdx];
    const targetEl = target === 'hero' ? enemyHeroRef.current : enemyFieldRefs.current[target];

    if (!attacker || !myEl || !targetEl) {
      run((s) => attack(s, myIdx, target));
      return;
    }

    myEl.measureInWindow((ax, ay, aw, ah) => {
      targetEl.measureInWindow((bx, by) => {
        const bumpX = ax + (bx - ax) * 0.6;
        const bumpY = ay + (by - ay) * 0.6;

        atkX.value = ax;
        atkY.value = ay;
        atkW.value = aw;
        atkH.value = ah;
        atkOpacity.value = 1;
        setAttacking({ card: attacker, myIdx });

        const outCfg = { duration: 150, easing: Easing.out(Easing.quad) };
        const backCfg = { duration: 150, easing: Easing.in(Easing.quad) };
        atkX.value = withSequence(withTiming(bumpX, outCfg), withTiming(ax, backCfg));
        atkY.value = withSequence(
          withTiming(bumpY, outCfg),
          withTiming(ay, backCfg, (finished) => {
            if (finished) runOnJS(commitAttack)(myIdx, target);
          }),
        );
      });
    });
  }

  function commitAttack(myIdx: number, target: number | 'hero') {
    setAttacking(null);
    run((s) => attack(s, myIdx, target));
  }

  function useSkillOnSelected() {
    if (selectedAttackerIdx !== null) run((s) => useSkill(s, selectedAttackerIdx));
  }

  if (!state) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.title}>명함 배틀</Text>
          <Pressable style={styles.primaryButton} onPress={startBattle}>
            <Text style={styles.buttonText}>새 배틀 시작</Text>
          </Pressable>
          {onExit && (
            <Pressable onPress={onExit}>
              <Text style={styles.resetLink}>덱 빌더로 돌아가기</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const mySynergies = checkSynergies(state.field.filter((c): c is BattleCard => c !== null));
  const eSynergies = checkSynergies(state.eField.filter((c): c is BattleCard => c !== null));
  const selectedCard = selectedAttackerIdx !== null ? state.field[selectedAttackerIdx] : null;
  const canUseSkill = !!selectedCard && !selectedCard.hasActed && state.cost >= selectedCard.skill.cost;

  return (
    <View style={styles.root}>
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.metaText}>턴 {state.turnN}</Text>
          <View style={styles.topRowLinks}>
            {onExit && (
              <Pressable onPress={onExit}>
                <Text style={styles.resetLink}>덱 빌더로</Text>
              </Pressable>
            )}
            <Pressable onPress={startBattle}>
              <Text style={styles.resetLink}>다시 시작</Text>
            </Pressable>
          </View>
        </View>

        {errorMsg && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        <HeroRow
          label="상대"
          hp={state.eHp}
          deckCount={state.eDeck.length}
          handCount={state.eHand.length}
          maxCost={state.eMaxCost}
          onPress={tapEnemyHero}
          registerRef={(el) => {
            enemyHeroRef.current = el;
          }}
        />
        <EnemyHandBackRow count={state.eHand.length} />
        <SynergyRow synergies={eSynergies} />
        <FieldRow
          cards={state.eField}
          mine={false}
          synergies={eSynergies}
          canTarget={selectedAttackerIdx !== null}
          onPressSlot={tapEnemySlot}
          onInfoPress={(card) => openDetail(card, false)}
          registerSlotRef={(idx, el) => {
            enemyFieldRefs.current[idx] = el;
          }}
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
          hiddenIdx={attacking?.myIdx ?? null}
          onPressSlot={tapMySlot}
          onInfoPress={(card) => openDetail(card, true)}
          registerSlotRef={(idx, el) => {
            fieldRefs.current[idx] = el;
          }}
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
            <Text style={styles.skillDesc}>{selectedCard.skill.description}</Text>
          </Pressable>
        )}

        <View style={styles.handRow}>
          {state.hand.map((card, i) => (
            <Pressable
              key={`${card.id}-${i}`}
              ref={(el) => {
                handRefs.current[i] = el;
              }}
              onPress={() => tapHand(i)}
              onLongPress={() => openDetail(card, true)}
              style={[
                styles.handCard,
                { borderTopColor: JOB_COLOR[card.jobClass] },
                card.cost > state.cost && styles.unaffordable,
                selectedHandIdx === i && styles.selectedSlot,
                flying?.handIdx === i && styles.hiddenCard,
              ]}
            >
              <View style={[styles.infoBadge, styles.noPointerEvents]}>
                <Text style={styles.infoBadgeText}>i</Text>
              </View>
              <Text style={styles.costBadge}>{card.cost}</Text>
              <Text style={styles.cardName}>
                ★{card.grade} {card.name}
              </Text>
              <StatRow stats={card.finalStats} />
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
          {onExit && (
            <Pressable onPress={onExit}>
              <Text style={styles.resetLink}>덱 빌더로 돌아가기</Text>
            </Pressable>
          )}
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
            <CardDetailPanel
              card={viewingCard.card}
              effStats={calcEffStats(viewingCard.card, viewingCard.mine ? mySynergies : eSynergies)}
            />
          </Pressable>
        </Pressable>
      )}
    </SafeAreaView>

    {flying && (
      <Animated.View
        pointerEvents="none"
        style={[styles.flyingCard, { borderColor: JOB_COLOR[flying.card.jobClass] }, flyingStyle]}
      >
        <Text style={styles.cardName} numberOfLines={1}>
          ★{flying.card.grade} {flying.card.name}
        </Text>
      </Animated.View>
    )}

    {attacking && (
      <Animated.View
        pointerEvents="none"
        style={[styles.flyingCard, { borderColor: JOB_COLOR[attacking.card.jobClass] }, atkStyle]}
      >
        <Text style={styles.cardName} numberOfLines={1}>
          ★{attacking.card.grade} {attacking.card.name}
        </Text>
      </Animated.View>
    )}
    </View>
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
  registerRef,
}: {
  label: string;
  hp: number;
  deckCount: number;
  handCount: number;
  maxCost: number;
  cost?: number;
  onPress?: () => void;
  registerRef?: (el: View | null) => void;
}) {
  return (
    <Pressable style={styles.heroRow} onPress={onPress} ref={registerRef}>
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
  hiddenIdx,
  onPressSlot,
  onInfoPress,
  registerSlotRef,
}: {
  cards: (BattleCard | null)[];
  mine: boolean;
  synergies: Synergy[];
  selectedIdx?: number | null;
  canTarget?: boolean;
  hiddenIdx?: number | null;
  onPressSlot: (idx: number, card: BattleCard | null) => void;
  onInfoPress: (card: BattleCard) => void;
  registerSlotRef?: (idx: number, el: View | null) => void;
}) {
  return (
    <View style={styles.fieldRow}>
      {cards.map((card, i) => {
        if (!card) {
          return (
            <Pressable
              key={i}
              ref={registerSlotRef ? (el) => registerSlotRef(i, el) : undefined}
              style={[styles.slot, styles.emptySlot]}
              onPress={() => onPressSlot(i, null)}
            >
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
            ref={registerSlotRef ? (el) => registerSlotRef(i, el) : undefined}
            onPress={() => onPressSlot(i, card)}
            onLongPress={() => onInfoPress(card)}
            style={[
              styles.slot,
              { borderColor: JOB_COLOR[card.jobClass] },
              selectedIdx === i && styles.selectedSlot,
              mine && !ready && styles.notReadySlot,
              mine && hiddenIdx === i && styles.hiddenCard,
            ]}
          >
            <View style={[styles.infoBadge, styles.noPointerEvents]}>
              <Text style={styles.infoBadgeText}>i</Text>
            </View>
            <Text style={styles.cardName}>
              ★{card.grade} {card.name}
            </Text>
            <StatRow stats={{ ...eff, hp: card.currentHp ?? eff.hp }} />
            {caption ? <Text style={styles.captionText}>{caption}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  hiddenCard: {
    opacity: 0,
  },
  flyingCard: {
    position: 'absolute',
    backgroundColor: colors.surface1,
    borderRadius: radius.gameCard,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    zIndex: 50,
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
  topRowLinks: {
    flexDirection: 'row',
    gap: 14,
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
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 2,
  },
  skillDesc: {
    color: colors.textPrimary,
    fontSize: typography.micro.fontSize,
    fontWeight: '500',
    textAlign: 'center',
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
});
