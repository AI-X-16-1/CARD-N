import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';

import { colors, radius, typography } from '@/shared/theme';
import { JOB_COLOR } from '@/features/game/constants';
import { CardDetailPanel } from '@/features/game/components/CardDetailPanel';
import { useGameStore } from '@/features/game/store/gameStore';
import type { GameStackParamList } from '@/navigation/RootNavigator';

export default function CardDetailOverlay() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<GameStackParamList, 'CardDetail'>>();
  const collection = useGameStore((s) => s.collection);
  const deckSlots = useGameStore((s) => s.deckSlots);
  const toggleSelected = useGameStore((s) => s.toggleSelected);

  const card = collection.find((c) => c.id === route.params.cardId);

  if (!card) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.notFoundText}>카드를 찾을 수 없어요</Text>
          <Pressable style={styles.closeLink} onPress={() => navigation.goBack()}>
            <Text style={styles.closeLinkText}>닫기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const inDeck = deckSlots.includes(card.id);
  const deckFull = !inDeck && deckSlots.every((id) => id !== null);

  return (
    <SafeAreaView style={styles.container}>
      <Pressable style={styles.closeBadge} hitSlop={8} onPress={() => navigation.goBack()}>
        <Text style={styles.closeText}>✕</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { borderColor: JOB_COLOR[card.jobClass] }]}>
          <CardDetailPanel card={card} effStats={card.finalStats} />
        </View>
      </ScrollView>

      <Pressable
        style={[styles.cta, inDeck ? styles.ctaRemove : styles.ctaAdd, deckFull && styles.ctaDisabled]}
        disabled={deckFull}
        onPress={() => toggleSelected(card.id)}
      >
        <Text style={[styles.ctaText, inDeck && styles.ctaRemoveText]}>
          {deckFull ? '덱이 가득 찼어요' : inDeck ? '덱에서 빼기' : '덱에 넣기'}
        </Text>
      </Pressable>
    </SafeAreaView>
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
    gap: 12,
  },
  notFoundText: {
    color: colors.textSecondary,
    fontSize: typography.body.fontSize,
  },
  closeLink: {
    padding: 8,
  },
  closeLinkText: {
    color: colors.primaryLight,
    fontSize: typography.meta.fontSize,
    fontWeight: '700',
  },
  closeBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  content: {
    padding: 20,
    paddingTop: 56,
    paddingBottom: 96,
  },
  card: {
    backgroundColor: colors.surface3,
    borderRadius: radius.card,
    borderWidth: 2,
    padding: 20,
    gap: 10,
  },
  cta: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaAdd: {
    backgroundColor: colors.gameAccent,
  },
  ctaRemove: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderMedium,
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    color: colors.canvas,
    fontSize: typography.body.fontSize,
    fontWeight: '800',
  },
  ctaRemoveText: {
    color: colors.textSecondary,
  },
});
