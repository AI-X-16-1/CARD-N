import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

// react-native-web's Alert.alert is a no-op (it never renders anything and never calls
// a button's onPress), so a destructive action gated behind Alert.alert silently does
// nothing on web. This renders a real Modal overlay on every platform instead.
export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = '삭제',
  cancelLabel = '취소',
  onCancel,
  onConfirm,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={onCancel}>
              <Text style={styles.secondaryButtonLabel}>{cancelLabel}</Text>
            </Pressable>
            <Pressable style={styles.dangerButton} onPress={onConfirm}>
              <Text style={styles.dangerButtonLabel}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,10,15,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface3,
    borderRadius: radius.card,
    padding: 20,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    marginBottom: 6,
  },
  message: {
    color: colors.textTertiary,
    fontSize: typography.meta.fontSize,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonLabel: {
    color: colors.textSecondary,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
  dangerButton: {
    flex: 1,
    backgroundColor: colors.gameAccent,
    borderRadius: radius.card,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerButtonLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
});
