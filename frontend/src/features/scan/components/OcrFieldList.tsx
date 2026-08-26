import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';
import type { OcrField } from '@/features/scan/hooks/useOcrScan';

const CONFIDENCE_THRESHOLD = 0.9;

type Props = {
  fields: OcrField[];
  values: Record<string, string>;
  onChangeValue: (label: string, value: string) => void;
};

export function OcrFieldList({ fields, values, onChangeValue }: Props) {
  const needsReviewCount = fields.filter((f) => f.confidence < CONFIDENCE_THRESHOLD).length;

  return (
    <View>
      <Text style={styles.summary}>
        {fields.length}개 항목 인식{needsReviewCount > 0 ? ` · ${needsReviewCount}개 확인 필요` : ''}
      </Text>
      {fields.map((field) => {
        const ok = field.confidence >= CONFIDENCE_THRESHOLD;
        return (
          <View
            key={field.label}
            style={[styles.card, !ok && styles.cardWarning]}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.label}>{field.label}</Text>
              <Text style={[styles.confidence, ok ? styles.confidenceOk : styles.confidenceWarning]}>
                {ok ? `${Math.round(field.confidence * 100)}%` : '확인 필요'}
              </Text>
            </View>
            <TextInput
              style={styles.input}
              value={values[field.label] ?? field.value}
              onChangeText={(text) => onChangeValue(field.label, text)}
              placeholderTextColor={colors.textMuted}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    color: colors.secondary,
    fontSize: typography.body.fontSize,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 12,
    marginBottom: 8,
  },
  cardWarning: {
    borderColor: colors.warning,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    color: colors.textTertiary,
    fontSize: typography.sectionLabel.fontSize,
    fontWeight: typography.sectionLabel.fontWeight,
    letterSpacing: typography.sectionLabel.letterSpacing,
  },
  confidence: {
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
  },
  confidenceOk: {
    color: colors.secondary,
  },
  confidenceWarning: {
    color: colors.warning,
  },
  input: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    padding: 0,
  },
});
