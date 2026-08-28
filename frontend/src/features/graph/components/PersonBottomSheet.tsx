import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, typography } from '@/shared/theme';

import {
  addAcquaintance,
  fetchAcquaintances,
  recordAcquaintanceConsent,
  type Acquaintance,
} from '../api/graphApi';
import type { GraphNode, IntroductionRequestStatus } from '../types';

type Props = {
  person: GraphNode | null;
  onClose: () => void;
  onViewProfile: (person: GraphNode) => void;
  onRequestIntroduction: (person: GraphNode) => void;
};

const SHEET_HIDDEN_OFFSET = 500;

function getIntroductionRow(status: IntroductionRequestStatus | undefined) {
  switch (status) {
    case 'pending':
      return { label: '소개 요청 보냄 · 승인 대기중', disabled: true };
    case 'approved':
      return { label: '소개 승인됨 · 2촌에게 노출 중', disabled: true };
    case 'declined':
      return { label: '다시 요청하기', disabled: false };
    default:
      return { label: '이 사람의 인맥에게 내 프로필 소개 요청', disabled: false };
  }
}

export function PersonBottomSheet({
  person,
  onClose,
  onViewProfile,
  onRequestIntroduction,
}: Props) {
  const [displayPerson, setDisplayPerson] = useState<GraphNode | null>(null);
  const [acquaintances, setAcquaintances] = useState<Acquaintance[]>([]);
  const [draftName, setDraftName] = useState('');

  // Only 1st-degree contacts can vouch for someone, so this is the only case worth loading.
  const personId = person?.degree === 1 ? person.id : null;
  useEffect(() => {
    if (personId === null) {
      setAcquaintances([]);
      return;
    }
    let cancelled = false;
    fetchAcquaintances(personId)
      .then((list) => {
        if (!cancelled) setAcquaintances(list);
      })
      .catch(() => {
        // Non-critical — the section just stays empty.
      });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  const add = useCallback(async () => {
    const name = draftName.trim();
    if (personId === null || !name) return;
    try {
      const created = await addAcquaintance(personId, name);
      setAcquaintances((current) => [created, ...current]);
      setDraftName('');
    } catch {
      // Leave the draft in place so it can be retried.
    }
  }, [personId, draftName]);

  const consent = useCallback(async (acquaintanceId: number) => {
    try {
      const updated = await recordAcquaintanceConsent(acquaintanceId);
      setAcquaintances((current) =>
        current.map((a) => (a.id === updated.id ? updated : a))
      );
    } catch {
      // Leave the row as-is — it can be tapped again.
    }
  }, []);
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

  const introRow = getIntroductionRow(displayPerson.introductionRequestStatus);

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
                <Text style={styles.degreeBadgeLabel}>
                  {displayPerson.degree === 2 ? '2촌' : '1촌'}
                </Text>
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
        </View>

        {displayPerson.degree === 1 && (
          <>
            <Pressable
              disabled={introRow.disabled}
              onPress={() => onRequestIntroduction(displayPerson)}
              style={styles.introRow}
            >
              <Text
                style={[styles.introRowLabel, introRow.disabled && styles.introRowLabelDisabled]}
              >
                {introRow.label}
              </Text>
            </Pressable>

            <View style={styles.acqSection}>
              <Text style={styles.acqTitle}>이 사람이 아는 사람</Text>

              {acquaintances.map((a) => (
                <View key={a.id} style={styles.acqRow}>
                  <Text style={styles.acqName}>{a.name}</Text>
                  {a.status === 'approved' ? (
                    <Text style={styles.acqApproved}>2촌으로 표시 중</Text>
                  ) : (
                    <Pressable style={styles.acqConsentButton} onPress={() => consent(a.id)}>
                      <Text style={styles.acqConsentLabel}>본인 동의 기록</Text>
                    </Pressable>
                  )}
                </View>
              ))}

              <View style={styles.acqAddRow}>
                <TextInput
                  style={styles.acqInput}
                  value={draftName}
                  onChangeText={setDraftName}
                  placeholder="이름"
                  placeholderTextColor={colors.textMuted}
                />
                <Pressable
                  style={styles.acqAddButton}
                  disabled={!draftName.trim()}
                  onPress={add}
                >
                  <Text style={styles.acqAddLabel}>추가</Text>
                </Pressable>
              </View>

              <Text style={styles.acqHint}>
                추가해도 본인이 동의하기 전까지는 관계도에 나타나지 않아요.
              </Text>
            </View>
          </>
        )}
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
  // Sole action in the sheet now that "공통 인맥 보기" is gone, so it takes the row and
  // the Primary fill that button used to carry.
  profileButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.card,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileButtonLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  acqSection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  acqTitle: {
    color: colors.textSecondary,
    fontSize: typography.meta.fontSize,
    fontWeight: '700',
    marginBottom: 10,
  },
  acqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  acqName: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
  },
  acqApproved: {
    color: colors.secondary,
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
  },
  acqConsentButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.card,
    backgroundColor: colors.surface1,
  },
  acqConsentLabel: {
    color: colors.textSecondary,
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
  },
  acqAddRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  acqInput: {
    flex: 1,
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
  },
  acqAddButton: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: radius.card,
    backgroundColor: colors.primary,
  },
  acqAddLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  acqHint: {
    color: colors.textMuted,
    fontSize: typography.meta.fontSize,
    marginTop: 10,
  },
  introRow: {
    paddingVertical: 12,
    borderRadius: radius.card,
    alignItems: 'center',
    backgroundColor: colors.surface1,
  },
  introRowLabel: {
    color: colors.primaryLight,
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
  },
  introRowLabelDisabled: {
    color: colors.textTertiary,
    fontWeight: '500',
  },
});
