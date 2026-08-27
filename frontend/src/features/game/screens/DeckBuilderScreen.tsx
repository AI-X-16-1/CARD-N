import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, radius, typography } from '@/shared/theme';
import { JOB_COLOR } from '@/features/game/constants';
import { StatRow } from '@/features/game/components/StatRow';
import { averageCost, compendiumCompletion } from '@/features/game/engine/deckStats';
import { JOB_CLASSES, JOB_LABEL, SKILL } from '@/features/game/engine/cardData';
import { completeDeckTo15, groupCompendium, type CompendiumSlot } from '@/features/game/engine/mockCollection';
import type { BattleCard, JobClass } from '@/features/game/engine/types';
import { MAX_DECK_SIZE, useGameStore } from '@/features/game/store/gameStore';
import type { GameStackParamList } from '@/navigation/RootNavigator';

type Props = {
  onStartBattle: (deck: BattleCard[]) => void;
};

type FilterKey = 'all' | 'grade3minus' | 'grade4plus' | JobClass;

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'grade3minus', label: '★3 이하' },
  { key: 'grade4plus', label: '★4 이상' },
  ...JOB_CLASSES.map((jc) => ({ key: jc as FilterKey, label: JOB_LABEL[jc] })),
];

const FILTER_LABEL = FILTER_OPTIONS.reduce<Record<string, string>>((acc, o) => {
  acc[o.key] = o.label;
  return acc;
}, {});

function matchesFilter(slot: CompendiumSlot, filter: FilterKey): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'grade3minus':
      return slot.grade <= 3;
    case 'grade4plus':
      return slot.grade >= 4;
    default:
      return slot.jobClass === filter;
  }
}

// 획득 / 미획득 are independent toggles rather than dropdown entries: a slot
// shows when its ownership state is still enabled. Both off => nothing.
function matchesOwnership(slot: CompendiumSlot, showOwned: boolean, showNotOwned: boolean): boolean {
  return slot.owned.length > 0 ? showOwned : showNotOwned;
}

export default function DeckBuilderScreen({ onStartBattle }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<GameStackParamList>>();
  const collection = useGameStore((s) => s.collection);
  const deckSlots = useGameStore((s) => s.deckSlots);
  const toggleSelected = useGameStore((s) => s.toggleSelected);

  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [showOwned, setShowOwned] = useState(true);
  const [showNotOwned, setShowNotOwned] = useState(true);
  const [viewingSlot, setViewingSlot] = useState<CompendiumSlot | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const slots = useMemo(() => groupCompendium(collection), [collection]);
  const completion = compendiumCompletion(slots);
  const selectedIds = useMemo(() => deckSlots.filter((id): id is number => id !== null), [deckSlots]);
  const deckCards = useMemo(
    () => selectedIds.map((id) => collection.find((c) => c.id === id)).filter((c): c is BattleCard => !!c),
    [selectedIds, collection],
  );
  const avgCost = averageCost(deckCards);
  const visibleSlots = slots.filter(
    (s) => matchesFilter(s, activeFilter) && matchesOwnership(s, showOwned, showNotOwned),
  );

  function goToCardDetail(cardId: number) {
    navigation.navigate('CardDetail', { cardId });
  }

  // 획득 / 미획득 must never both be off (that would hide every card). Turning
  // off the only one that's still on flips the selection to the other side.
  function toggleOwned() {
    if (showOwned && !showNotOwned) {
      setShowOwned(false);
      setShowNotOwned(true);
    } else {
      setShowOwned((v) => !v);
    }
  }

  function toggleNotOwned() {
    if (showNotOwned && !showOwned) {
      setShowNotOwned(false);
      setShowOwned(true);
    } else {
      setShowNotOwned((v) => !v);
    }
  }

  function startBattle() {
    onStartBattle(completeDeckTo15(deckCards, collection));
  }

  function openSlot(slot: CompendiumSlot) {
    setListError(null);
    setViewingSlot(slot);
  }

  function closeSlot() {
    setListError(null);
    setViewingSlot(null);
  }

  function toggleInList(card: BattleCard) {
    const inDeck = selectedIds.includes(card.id);
    if (!inDeck && selectedIds.length >= MAX_DECK_SIZE) {
      setListError(`덱이 가득 찼어요 (${MAX_DECK_SIZE}/${MAX_DECK_SIZE})`);
      return;
    }
    setListError(null);
    toggleSelected(card.id);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>명함 배틀</Text>
        <View style={styles.segment}>
          <Pressable style={[styles.segmentBtn, styles.segmentBattle]} onPress={startBattle}>
            <Text style={styles.segmentBattleText}>배틀</Text>
          </Pressable>
          <View style={[styles.segmentBtn, styles.segmentCollection]}>
            <Text style={styles.segmentCollectionText}>도감</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>내 덱</Text>
          <View style={styles.deckCountBadge}>
            <Text style={styles.deckCountText}>
              {deckCards.length} / {MAX_DECK_SIZE}
            </Text>
          </View>
        </View>
        <View style={styles.deckStatsRow}>
          <Text style={styles.metaText}>
            보유 {collection.length}장 · 도감 완성도 {completion}%
          </Text>
          <Text style={styles.metaText}>평균 코스트 {avgCost.toFixed(1)}</Text>
        </View>

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
                onPress={() => toggleSelected(card.id)}
                onLongPress={() => goToCardDetail(card.id)}
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

        <View style={styles.filterRow}>
          <Text style={styles.filterCaption}>필터</Text>
          <Pressable style={styles.dropdown} onPress={() => setFilterOpen(true)}>
            <Text style={styles.dropdownText}>{FILTER_LABEL[activeFilter]}</Text>
            <Text style={styles.dropdownCaret}>▼</Text>
          </Pressable>
        </View>
        <View style={styles.checkboxRow}>
          <Pressable style={styles.checkbox} onPress={toggleOwned}>
            <View style={[styles.checkboxBox, showOwned && styles.checkboxBoxChecked]}>
              {showOwned && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>획득</Text>
          </Pressable>
          <Pressable style={styles.checkbox} onPress={toggleNotOwned}>
            <View style={[styles.checkboxBox, showNotOwned && styles.checkboxBoxChecked]}>
              {showNotOwned && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>미획득</Text>
          </Pressable>
        </View>

        <View style={styles.grid}>
          {visibleSlots.map((slot) => {
            const owned = slot.owned.length > 0;
            const key = `${slot.jobClass}-${slot.grade}`;

            if (!owned) {
              // Not owned yet: show the same card info minus the stat line,
              // in a disabled (dimmed, non-interactive) state.
              return (
                <View key={key} style={[styles.tile, styles.tileDisabled]}>
                  <Text style={styles.tileStars}>{'★'.repeat(slot.grade)}</Text>
                  <Text style={styles.tileName} numberOfLines={1}>
                    {JOB_LABEL[slot.jobClass]}
                  </Text>
                  <Text style={styles.tileSkill} numberOfLines={1}>
                    {SKILL[slot.jobClass].name}
                  </Text>
                  <Text style={styles.lockedText}>미획득</Text>
                </View>
              );
            }

            const inDeck = slot.owned.some((c) => selectedIds.includes(c.id));
            const sample = slot.owned[0];

            return (
              <Pressable
                key={key}
                style={[styles.tile, { borderColor: JOB_COLOR[slot.jobClass] }, inDeck && styles.tileInDeck]}
                onPress={() => openSlot(slot)}
              >
                {inDeck && <Text style={styles.checkMark}>✓</Text>}
                {slot.owned.length > 1 && <Text style={styles.ownedCount}>×{slot.owned.length}</Text>}
                <Text style={styles.tileStars}>{'★'.repeat(slot.grade)}</Text>
                <Text style={styles.tileName} numberOfLines={1}>
                  {sample.jobLabel}
                </Text>
                <Text style={styles.tileSkill} numberOfLines={1}>
                  {sample.skill.name}
                </Text>
                <StatRow stats={sample.finalStats} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Pressable style={styles.bottomCta} onPress={startBattle}>
        <Text style={styles.bottomCtaText}>🛡 배틀 시작</Text>
      </Pressable>

      {filterOpen && (
        <Pressable style={styles.backdrop} onPress={() => setFilterOpen(false)}>
          <Pressable style={styles.filterSheet} onPress={() => {}}>
            <Pressable style={styles.closeBadge} hitSlop={8} onPress={() => setFilterOpen(false)}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
            <Text style={styles.instanceTitle}>필터</Text>
            <ScrollView>
              {FILTER_OPTIONS.map((o) => {
                const active = o.key === activeFilter;
                return (
                  <Pressable
                    key={o.key}
                    style={[styles.filterOption, active && styles.filterOptionActive]}
                    onPress={() => {
                      setActiveFilter(o.key);
                      setFilterOpen(false);
                    }}
                  >
                    <Text style={[styles.filterOptionText, active && styles.filterOptionTextActive]}>
                      {o.label}
                    </Text>
                    {active && <Text style={styles.filterOptionCheck}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}

      {viewingSlot && (
        <Pressable style={styles.backdrop} onPress={closeSlot}>
          <Pressable style={styles.instanceCard} onPress={() => {}}>
            <Pressable style={styles.closeBadge} hitSlop={8} onPress={closeSlot}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
            <Text style={styles.instanceTitle}>
              ★{viewingSlot.grade} {viewingSlot.owned[0]?.jobLabel} · 보유 {viewingSlot.owned.length}장
            </Text>
            <Text style={styles.instanceHint}>탭해서 덱에 추가/제외 · 길게 누르면 상세정보</Text>
            {listError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{listError}</Text>
              </View>
            )}
            <ScrollView style={styles.instanceList}>
              {viewingSlot.owned.map((card) => {
                const inDeck = selectedIds.includes(card.id);
                return (
                  <Pressable
                    key={card.id}
                    style={[styles.instanceRow, inDeck && styles.instanceRowInDeck]}
                    onPress={() => toggleInList(card)}
                    onLongPress={() => {
                      closeSlot();
                      goToCardDetail(card.id);
                    }}
                  >
                    <View>
                      <Text style={styles.instanceName}>{card.name}</Text>
                      <Text style={styles.instanceCompany}>{card.company}</Text>
                    </View>
                    {inDeck && <Text style={styles.instanceInDeck}>✓ 덱</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.screenTitle.fontSize,
    fontWeight: typography.screenTitle.fontWeight,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface1,
    borderRadius: radius.pill,
    padding: 2,
    gap: 2,
  },
  segmentBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  segmentBattle: {
    backgroundColor: colors.gameAccent,
  },
  segmentBattleText: {
    color: colors.canvas,
    fontSize: typography.meta.fontSize,
    fontWeight: '700',
  },
  segmentCollection: {
    backgroundColor: colors.primary,
  },
  segmentCollectionText: {
    color: colors.textPrimary,
    fontSize: typography.meta.fontSize,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    paddingBottom: 96,
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  sectionLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  deckCountBadge: {
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  deckCountText: {
    color: colors.primaryLight,
    fontSize: typography.meta.fontSize,
    fontWeight: '700',
  },
  deckStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaText: {
    color: colors.textTertiary,
    fontSize: typography.meta.fontSize,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
    position: 'relative',
  },
  tileEmpty: {
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileEmptyText: {
    color: colors.textMuted,
    fontSize: 18,
  },
  tileDisabled: {
    borderStyle: 'dashed',
    opacity: 0.4,
  },
  lockedText: {
    color: colors.textMuted,
    fontSize: typography.micro.fontSize,
  },
  tileInDeck: {
    borderColor: colors.primaryLight,
  },
  checkMark: {
    position: 'absolute',
    top: 2,
    left: 4,
    color: colors.primaryLight,
    fontSize: 10,
    fontWeight: '800',
  },
  ownedCount: {
    position: 'absolute',
    top: 2,
    right: 4,
    color: colors.textQuaternary,
    fontSize: 9,
    fontWeight: '700',
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
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  filterCaption: {
    color: colors.textSecondary,
    fontSize: typography.meta.fontSize,
    fontWeight: '700',
  },
  dropdown: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface1,
    borderRadius: radius.gameCard,
    borderWidth: 1,
    borderColor: colors.borderMedium,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dropdownText: {
    color: colors.textPrimary,
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
  },
  dropdownCaret: {
    color: colors.textTertiary,
    fontSize: 10,
  },
  checkboxRow: {
    flexDirection: 'row',
    gap: 20,
    paddingVertical: 2,
    paddingLeft: 2,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkboxBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.borderMedium,
    backgroundColor: colors.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: colors.gameAccent,
    borderColor: colors.gameAccent,
  },
  checkboxMark: {
    color: colors.canvas,
    fontSize: 10,
    fontWeight: '800',
  },
  checkboxLabel: {
    color: colors.textSecondary,
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
  },
  filterSheet: {
    width: '100%',
    maxWidth: 320,
    maxHeight: '70%',
    backgroundColor: colors.surface3,
    borderRadius: radius.card,
    padding: 20,
    gap: 12,
  },
  filterOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface1,
    borderRadius: radius.gameCard,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  filterOptionActive: {
    borderColor: colors.gameAccent,
  },
  filterOptionText: {
    color: colors.textSecondary,
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
  },
  filterOptionTextActive: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  filterOptionCheck: {
    color: colors.gameAccent,
    fontSize: typography.micro.fontSize,
    fontWeight: '800',
  },
  bottomCta: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: colors.gameAccent,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  bottomCtaText: {
    color: colors.canvas,
    fontSize: typography.body.fontSize,
    fontWeight: '800',
  },
  backdrop: {
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
  instanceCard: {
    width: '100%',
    maxWidth: 320,
    maxHeight: '70%',
    backgroundColor: colors.surface3,
    borderRadius: radius.card,
    padding: 20,
    gap: 12,
  },
  closeBadge: {
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
  closeText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  instanceTitle: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '800',
    paddingRight: 24,
  },
  instanceHint: {
    color: colors.textTertiary,
    fontSize: typography.micro.fontSize,
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
  instanceList: {
    gap: 8,
  },
  instanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface1,
    borderRadius: radius.gameCard,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: 10,
    marginBottom: 8,
  },
  instanceRowInDeck: {
    borderColor: colors.primaryLight,
  },
  instanceName: {
    color: colors.textPrimary,
    fontSize: typography.meta.fontSize,
    fontWeight: '700',
  },
  instanceCompany: {
    color: colors.textTertiary,
    fontSize: typography.micro.fontSize,
  },
  instanceInDeck: {
    color: colors.primaryLight,
    fontSize: typography.micro.fontSize,
    fontWeight: '700',
  },
});
