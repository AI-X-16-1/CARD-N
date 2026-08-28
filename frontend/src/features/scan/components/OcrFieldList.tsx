import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';
import { CONFIDENCE_THRESHOLD, type OcrField } from '@/features/scan/hooks/useOcrScan';
import { formatPhoneNumber } from '../lib/formatPhone';

type Props = {
  fields: OcrField[];
  values: Record<string, string>;
  onChangeValue: (label: string, value: string) => void;
};

export function OcrFieldList({ fields, values, onChangeValue }: Props) {
  // The backend always sends every known column now (see scan/service.py's
  // _to_field_responses), including ones it found nothing for, so the user can fill
  // them in by hand instead of the column just being absent. fields.length is the
  // fixed total either way, so the "인식" count has to come from which ones actually
  // have a value, not from how many entries are in the array.
  const recognizedCount = fields.filter((f) => f.value.trim().length > 0).length;
  const needsReviewCount = fields.filter((f) => f.confidence < CONFIDENCE_THRESHOLD).length;

  return (
    <View>
      <Text style={styles.summary}>
        {recognizedCount}개 항목 인식{needsReviewCount > 0 ? ` · ${needsReviewCount}개 확인 필요` : ''}
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
              onChangeText={(text) =>
                onChangeValue(field.label, field.label === 'Mobile' ? formatPhoneNumber(text) : text)
              }
              placeholder="직접 입력"
              placeholderTextColor={colors.textMuted}
              keyboardType={field.label === 'Mobile' ? 'phone-pad' : undefined}
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
