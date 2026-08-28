import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  onDismiss: () => void;
};

// Single-button counterpart to ConfirmModal — react-native-web's Alert.alert is a no-op
// (never renders, never calls a button's onPress), so a single-OK notice alert both
// hides its message and drops whatever the OK button was supposed to do on web.
export function NoticeModal({ visible, title, message, onDismiss }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <Pressable style={styles.button} onPress={onDismiss}>
            <Text style={styles.buttonLabel}>확인</Text>
          </Pressable>
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
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
});
