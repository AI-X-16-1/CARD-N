import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/shared/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

// design-tokens.md: Surface-3, radius 18px (top only), drag handle.
// e.g. GraphScreen's node-tap sheet, or an FAB action sheet (PersonDetail's "+" menu).
export function BottomSheet({ visible, onClose, children }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.dragHandle} />
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,10,15,0.6)',
  },
  sheet: {
    backgroundColor: colors.surface3,
    borderTopLeftRadius: radius.bottomSheet,
    borderTopRightRadius: radius.bottomSheet,
    padding: 20,
    paddingBottom: 32,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderMedium,
    marginBottom: 16,
  },
});
