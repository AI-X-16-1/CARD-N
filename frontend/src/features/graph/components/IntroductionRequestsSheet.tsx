import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, typography } from '@/shared/theme';

import type { IncomingIntroductionRequest } from '../types';

type Props = {
  visible: boolean;
  requests: IncomingIntroductionRequest[];
  onClose: () => void;
  onApprove: (personId: number) => void;
  onDecline: (personId: number) => void;
};

const SHEET_HIDDEN_OFFSET = 500;

export function IntroductionRequestsSheet({
  visible,
  requests,
  onClose,
  onApprove,
  onDecline,
}: Props) {
  const [isMounted, setIsMounted] = useState(false);
  const translateY = useSharedValue(SHEET_HIDDEN_OFFSET);
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      translateY.value = withTiming(0, { duration: 260 });
      overlayOpacity.value = withTiming(1, { duration: 260 });
    } else if (isMounted) {
      translateY.value = withTiming(SHEET_HIDDEN_OFFSET, { duration: 200 }, (finished) => {
        if (finished) runOnJS(setIsMounted)(false);
      });
      overlayOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  if (!isMounted) return null;

  return (
    <>
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sheet, sheetStyle]}>
        <View style={styles.dragHandle} />
        <Text style={styles.title}>소개 요청</Text>

        {requests.length === 0 ? (
          <Text style={styles.emptyText}>받은 소개 요청이 없어요</Text>
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {requests.map((request) => (
              <View key={request.personId} style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarLabel}>{request.name.slice(0, 1)}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{request.name}</Text>
                  <Text style={styles.rowMeta}>{request.company ?? ''}</Text>
                </View>
                <View style={styles.rowActions}>
                  <Pressable
                    style={styles.declineButton}
                    onPress={() => onDecline(request.personId)}
                  >
                    <Text style={styles.declineButtonLabel}>거절</Text>
                  </Pressable>
                  <Pressable
                    style={styles.approveButton}
                    onPress={() => onApprove(request.personId)}
                  >
                    <Text style={styles.approveButtonLabel}>승인</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
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
    maxHeight: '70%',
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
  title: {
    color: colors.textPrimary,
    fontSize: typography.personName.fontSize,
    fontWeight: typography.personName.fontWeight,
  },
  emptyText: {
    color: colors.textTertiary,
    fontSize: typography.body.fontSize,
    paddingVertical: 24,
    textAlign: 'center',
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.card,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
  rowMeta: {
    color: colors.textTertiary,
    fontSize: typography.micro.fontSize,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
  },
  declineButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.card,
    backgroundColor: colors.surface1,
  },
  declineButtonLabel: {
    color: colors.textSecondary,
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
  },
  approveButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.card,
    backgroundColor: colors.primary,
  },
  approveButtonLabel: {
    color: colors.textPrimary,
    fontSize: typography.meta.fontSize,
    fontWeight: '700',
  },
});
