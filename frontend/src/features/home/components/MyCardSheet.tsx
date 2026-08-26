import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, typography } from '@/shared/theme';
import { CardFace } from './MyBusinessCard';
import type { MyCard } from '../types';

type Props = {
  visible: boolean;
  card: MyCard;
  onClose: () => void;
  onSave: (card: MyCard) => void;
};

const EDIT_FIELDS: { field: 'name' | 'company' | 'title' | 'phone'; placeholder: string }[] = [
  { field: 'name', placeholder: '이름' },
  { field: 'company', placeholder: '회사' },
  { field: 'title', placeholder: '직함' },
  { field: 'phone', placeholder: '연락처' },
];

export function MyCardSheet({ visible, card, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(card);

  // Drop any stale edits from the last time this was open.
  useEffect(() => {
    if (visible) setDraft(card);
  }, [visible, card]);

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.closeButton}>✕</Text>
          </Pressable>
          <Text style={styles.headerTitle}>내 명함 수정</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.cardFaceWrap}>
          <CardFace card={draft} />
        </View>

        {EDIT_FIELDS.map(({ field, placeholder }) => (
          <TextInput
            key={field}
            style={styles.editInput}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            value={draft[field]}
            onChangeText={(text) => setDraft((prev) => ({ ...prev, [field]: text }))}
          />
        ))}

        <Pressable style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonLabel}>저장</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  closeButton: {
    color: colors.textSecondary,
    fontSize: 18,
    width: 28,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: typography.screenTitle.fontSize,
    fontWeight: typography.screenTitle.fontWeight,
  },
  headerSpacer: {
    width: 28,
  },
  cardFaceWrap: {
    marginBottom: 20,
  },
  editInput: {
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    marginBottom: 10,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
});
