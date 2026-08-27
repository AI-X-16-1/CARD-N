import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import { GuideChatPanel } from './GuideChatPanel';

/**
 * The floating help button banking apps put in the corner, plus the sheet it opens.
 *
 * Self-contained on purpose: the screen that hosts it only has to render it. That keeps
 * the footprint in someone else's feature folder to a single line (CLAUDE.md).
 */
export function GuideChatFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        style={styles.fab}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="사용법 도우미 열기"
      >
        <Text style={styles.icon}>?</Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
        // Android's hardware back closes the sheet rather than leaving the screen.
      >
        <View style={styles.backdrop}>
          <Pressable
            style={styles.dismissArea}
            accessibilityRole="button"
            accessibilityLabel="사용법 도우미 닫기"
            onPress={() => setOpen(false)}
          />
          <View style={styles.sheet}>
            <GuideChatPanel onClose={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    // Sits clear of the tab bar: this renders inside the tab screen, so 0 is already
    // the top of the bar, and 16 keeps it off the edge the way the right inset does.
    bottom: 16,
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // Android needs elevation to lift it above the ScrollView; iOS uses the shadow.
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  icon: { ...typography.cardName, color: colors.textPrimary },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  // Leaves the top of the screen visible so the sheet reads as a sheet, not a screen.
  dismissArea: { height: 88 },
  sheet: { flex: 1 },
});
