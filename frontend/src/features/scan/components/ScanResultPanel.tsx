import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import { OcrFieldList } from './OcrFieldList';
import type { OcrField } from '../hooks/useOcrScan';

type Props = {
  fields: OcrField[];
  onRetake: () => void;
  onClose: () => void;
  onSave: (values: Record<string, string>, context: string) => void;
  saving: boolean;
};

export function ScanResultPanel({ fields, onRetake, onClose, onSave, saving }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [context, setContext] = useState('');

  const handleFieldChange = (label: string, value: string) => {
    setValues((prev) => ({ ...prev, [label]: value }));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onRetake}>
          <Text style={styles.backLink}>‹ 다시 촬영</Text>
        </Pressable>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.closeButton}>✕</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.body}>
        <OcrFieldList fields={fields} values={values} onChangeValue={handleFieldChange} />

        <Text style={styles.fieldLabel}>만난 컨텍스트</Text>
        <TextInput
          style={styles.input}
          value={context}
          onChangeText={setContext}
          placeholder="어디서, 어떻게 만났는지 적어주세요"
          placeholderTextColor={colors.textMuted}
        />
      </ScrollView>

      <Pressable
        style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
        disabled={saving}
        onPress={() => onSave(values, context)}
      >
        <Text style={styles.primaryButtonLabel}>
          {saving ? '저장 중…' : '저장하고 카드 만들기'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  backLink: {
    color: colors.textSecondary,
    fontSize: typography.body.fontSize,
  },
  closeButton: {
    color: colors.textSecondary,
    fontSize: 18,
  },
  body: {
    flex: 1,
  },
  fieldLabel: {
    color: colors.textTertiary,
    fontSize: typography.sectionLabel.fontSize,
    fontWeight: typography.sectionLabel.fontWeight,
    letterSpacing: typography.sectionLabel.letterSpacing,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
});
