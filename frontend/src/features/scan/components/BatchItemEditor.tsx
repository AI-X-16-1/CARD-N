import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import { OcrFieldList } from './OcrFieldList';
import type { BatchItem } from '../hooks/useBatchScan';
import type { OcrField } from '../hooks/useOcrScan';

type Props = {
  item: BatchItem;
  onCancel: () => void;
  onSave: (fields: OcrField[], context: string) => void;
};

// Batch mode's per-card review step (ui-spec.md §3-4's tray, extended so a shot can be
// opened and corrected instead of only shown/removed) — same field list + photo as
// ScanResultPanel, but committing here writes back into that one BatchItem in the tray
// instead of creating a contact, since batch mode saves happen later via a multi-select.
export function BatchItemEditor({ item, onCancel, onSave }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [context, setContext] = useState(item.context);

  const handleFieldChange = (label: string, value: string) => {
    setValues((prev) => ({ ...prev, [label]: value }));
  };

  const handleSave = () => {
    const updatedFields = item.fields.map((field) => ({
      ...field,
      value: values[field.label] ?? field.value,
    }));
    onSave(updatedFields, context);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onCancel}>
          <Text style={styles.backLink}>‹ 목록으로</Text>
        </Pressable>
        <Text style={styles.title}>카드 수정</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body}>
        <Image source={{ uri: item.photoUri }} style={styles.photo} resizeMode="contain" />
        <OcrFieldList fields={item.fields} values={values} onChangeValue={handleFieldChange} />

        <Text style={styles.fieldLabel}>만난 컨텍스트</Text>
        <TextInput
          style={styles.input}
          value={context}
          onChangeText={setContext}
          placeholder="어디서, 어떻게 만났는지 적어주세요"
          placeholderTextColor={colors.textMuted}
        />
      </ScrollView>

      <Pressable style={styles.primaryButton} onPress={handleSave}>
        <Text style={styles.primaryButtonLabel}>저장</Text>
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
  title: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 62,
  },
  body: {
    flex: 1,
  },
  photo: {
    width: '100%',
    aspectRatio: 1.7,
    borderRadius: radius.card,
    backgroundColor: colors.surface1,
    marginBottom: 16,
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
  primaryButtonLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
});
