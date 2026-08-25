import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, typography } from '@/shared/theme';

import type { GraphNode } from '../types';

type Props = {
  person: GraphNode | null;
  onClose: () => void;
  onViewProfile: (person: GraphNode) => void;
  onViewMutual: (person: GraphNode) => void;
};

const SHEET_HIDDEN_OFFSET = 500;

export function PersonBottomSheet({ person, onClose, onViewProfile, onViewMutual }: Props) {
  const [displayPerson, setDisplayPerson] = useState<GraphNode | null>(null);
  const translateY = useSharedValue(SHEET_HIDDEN_OFFSET);
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    if (person) {
      setDisplayPerson(person);
      translateY.value = withTiming(0, { duration: 260 });
      overlayOpacity.value = withTiming(1, { duration: 260 });
    } else if (displayPerson) {
      translateY.value = withTiming(SHEET_HIDDEN_OFFSET, { duration: 200 }, (finished) => {
        if (finished) runOnJS(setDisplayPerson)(null);
      });
      overlayOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [person]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  if (!displayPerson) return null;

  return (
    <>
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sheet, sheetStyle]}>
        <View style={styles.dragHandle} />

        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLabel}>{displayPerson.name.slice(0, 1)}</Text>
          </View>
          <View style={styles.headerText}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{displayPerson.name}</Text>
              <View style={styles.degreeBadge}>
                <Text style={styles.degreeBadgeLabel}>1촌</Text>
              </View>
            </View>
            <Text style={styles.subtitle}>
              {displayPerson.title ?? ''} · {displayPerson.company ?? ''}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{displayPerson.conversationCount ?? 0}</Text>
            <Text style={styles.statLabel}>대화</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{displayPerson.mutualCount ?? 0}</Text>
            <Text style={styles.statLabel}>공통 인맥</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={[styles.statValue, styles.statValueHighlight]}>
              {displayPerson.lastConversationLabel ?? '-'}
            </Text>
            <Text style={styles.statLabel}>마지막 대화</Text>
          </View>
        </View>

        {displayPerson.recentSummary && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>최근 대화 요약</Text>
            <Text style={styles.summaryText}>{displayPerson.recentSummary}</Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          <Pressable style={styles.profileButton} onPress={() => onViewProfile(displayPerson)}>
            <Text style={styles.profileButtonLabel}>프로필</Text>
          </Pressable>
          <Pressable style={styles.mutualButton} onPress={() => onViewMutual(displayPerson)}>
            <Text style={styles.mutualButtonLabel}>공동 인맥 보기</Text>
          </Pressable>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface2,
    borderTopLeftRadius: radius.bottomSheet,
    borderTopRightRadius: radius.bottomSheet,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 34,
    gap: 16,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderMedium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.card,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: {
    color: colors.textPrimary,
    fontSize: typography.personName.fontSize,
    fontWeight: '700',
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.personName.fontSize,
    fontWeight: typography.personName.fontWeight,
  },
  degreeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
  },
  degreeBadgeLabel: {
    color: colors.textSecondary,
    fontSize: typography.micro.fontSize,
    fontWeight: '600',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.meta.fontSize,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radius.card,
    backgroundColor: colors.surface1,
    gap: 4,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  statValueHighlight: {
    color: colors.warning,
  },
  statLabel: {
    color: colors.textTertiary,
    fontSize: typography.micro.fontSize,
  },
  summaryCard: {
    padding: 12,
    borderRadius: radius.card,
    backgroundColor: colors.surface1,
    gap: 6,
  },
  summaryLabel: {
    color: colors.textTertiary,
    fontSize: typography.sectionLabel.fontSize,
    fontWeight: typography.sectionLabel.fontWeight,
    letterSpacing: typography.sectionLabel.letterSpacing,
  },
  summaryText: {
    color: colors.textSecondary,
    fontSize: typography.body.fontSize,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  profileButton: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileButtonLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
  mutualButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.card,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutualButtonLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
});
