import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, radius, typography } from '@/shared/theme';
import { JOB_COLOR } from '@/features/game/constants';
import { DeckStrip } from '@/features/game/components/DeckStrip';
import { StatRow } from '@/features/game/components/StatRow';
import { averageCost, compendiumCompletion } from '@/features/game/engine/deckStats';
import { JOB_CLASSES, JOB_LABEL, SKILL } from '@/features/game/engine/cardData';
import { completeDeckTo15, groupCompendium, type CompendiumSlot } from '@/features/game/engine/mockCollection';
import { createStarterDeck } from '@/features/game/engine/starterDeck';
import type { BattleCard, JobClass } from '@/features/game/engine/types';
import { MAX_DECK_SIZE, useGameStore } from '@/features/game/store/gameStore';
import type { GameStackParamList } from '@/navigation/RootNavigator';

type Props = {
  onStartBattle: (deck: BattleCard[]) => void;
};

// Dev-only affordances (e.g. the "+ 테스트 카드" button) — a production build
// never shows them.
const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;

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
  const randomFillDeck = useGameStore((s) => s.randomFillDeck);
  const clearDeck = useGameStore((s) => s.clearDeck);
  const addTestCard = useGameStore((s) => s.addTestCard);
  const status = useGameStore((s) => s.status);
  const reload = useGameStore((s) => s.load);

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
    // No cards picked (new user, or deck cleared) → the fixed starter deck.
    // Otherwise round the picks out to a full 15-card battle deck.
    onStartBattle(deckCards.length === 0 ? createStarterDeck() : completeDeckTo15(deckCards, collection));
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

      {IS_DEV && (
        <View style={styles.devBar}>
          <Pressable style={styles.devBtn} onPress={addTestCard}>
            <Text style={styles.devBtnText}>+ 테스트 카드</Text>
          </Pressable>
        </View>
      )}

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
        <View style={styles.deckActionsRow}>
          <Pressable
            style={[styles.deckActionBtn, styles.deckActionFill]}
            onPress={randomFillDeck}
          >
            <Text style={styles.deckActionFillText}>랜덤 편성</Text>
          </Pressable>
          <Pressable
            style={[styles.deckActionBtn, styles.deckActionReset]}
            onPress={clearDeck}
          >
            <Text style={styles.deckActionResetText}>초기화</Text>
          </Pressable>
        </View>
        {status === 'loading' && <Text style={styles.metaText}>카드 컬렉션 불러오는 중…</Text>}
        {status === 'error' && (
          <Pressable onPress={() => reload()}>
            <Text style={[styles.metaText, styles.reloadText]}>
              컬렉션을 불러오지 못했어요. 다시 시도 ↻
            </Text>
          </Pressable>
        )}

        <DeckStrip
          deckSlots={deckSlots}
          collection={collection}
          onRemove={toggleSelected}
          onLongPressCard={goToCardDetail}
        />

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

            <Text style={styles.instanceDeckLabel}>
              내 덱 {selectedIds.length} / {MAX_DECK_SIZE}
            </Text>
            <DeckStrip deckSlots={deckSlots} collection={collection} onRemove={toggleSelected} />

            <Text style={styles.instanceTitle}>
              ★{viewingSlot.grade} {viewingSlot.owned[0]?.jobLabel} · 보유 {viewingSlot.owned.length}장
            </Text>
            <Text style={styles.instanceHint}>탭해서 덱에 추가/제외 · 길게 누르면 상세정보</Text>
            {/* Fixed-height slot so showing/hiding the message never resizes the popup. */}
            <View style={styles.errorSlot}>
              {listError && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{listError}</Text>
                </View>
              )}
            </View>
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

            <Pressable style={styles.instanceConfirmBtn} onPress={closeSlot}>
              <Text style={styles.instanceConfirmText}>확인</Text>
            </Pressable>
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
  devBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    alignItems: 'flex-start',
  },
  devBtn: {
    borderWidth: 1,
    borderColor: colors.borderMedium,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  devBtnText: {
    color: colors.textTertiary,
    fontSize: typography.meta.fontSize,
    fontWeight: '700',
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
  reloadText: {
    color: colors.primaryLight,
    fontWeight: '700',
  },
  deckActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  deckActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  deckActionFill: {
    backgroundColor: colors.gameAccent,
  },
  deckActionFillText: {
    color: colors.canvas,
    fontSize: typography.meta.fontSize,
    fontWeight: '800',
  },
  deckActionReset: {
    borderWidth: 1,
    borderColor: colors.borderMedium,
  },
  deckActionResetText: {
    color: colors.textSecondary,
    fontSize: typography.meta.fontSize,
    fontWeight: '700',
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
    maxHeight: '85%',
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
  instanceDeckLabel: {
    color: colors.textSecondary,
    fontSize: typography.meta.fontSize,
    fontWeight: '700',
    paddingRight: 24,
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
  instanceConfirmBtn: {
    backgroundColor: colors.gameAccent,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  instanceConfirmText: {
    color: colors.canvas,
    fontSize: typography.body.fontSize,
    fontWeight: '800',
  },
  errorSlot: {
    minHeight: 34,
    justifyContent: 'center',
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
    // Keep at least ~3 owned rows visible before the list itself scrolls, so the
    // deck strip above never squeezes it down to one.
    minHeight: 168,
    flexGrow: 0,
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
