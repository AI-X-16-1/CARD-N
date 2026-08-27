import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, typography } from '@/shared/theme';
import { CardFace } from './MyBusinessCard';
import type { MyCard } from '../types';

type Props = {
  visible: boolean;
  card: MyCard;
  onClose: () => void;
  // Now a real network call (GET/PUT /api/v1/contacts/me), so it can fail — the caller
  // must be awaited so this sheet can stay open and tell the user, instead of closing
  // on a save that never actually happened.
  onSave: (card: MyCard) => Promise<void>;
};

const EDIT_FIELDS: { field: keyof MyCard; placeholder: string }[] = [
  { field: 'name', placeholder: '이름' },
  { field: 'company', placeholder: '회사' },
  { field: 'department', placeholder: '부서' },
  { field: 'grade', placeholder: '직급' },
  { field: 'job_function', placeholder: '직무' },
  { field: 'phone', placeholder: '연락처' },
  { field: 'email', placeholder: '이메일' },
  { field: 'address', placeholder: '주소' },
];

export function MyCardSheet({ visible, card, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(card);
  const [saving, setSaving] = useState(false);

  // Drop any stale edits from the last time this was open.
  useEffect(() => {
    if (visible) setDraft(card);
  }, [visible, card]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } catch {
      Alert.alert('오류', '저장하지 못했어요. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
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

        <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveButtonLabel}>{saving ? '저장 중…' : '저장'}</Text>
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
