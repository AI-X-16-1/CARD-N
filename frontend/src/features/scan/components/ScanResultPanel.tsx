import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import { AddressSearchModal } from './AddressSearchModal';
import { OcrFieldList } from './OcrFieldList';
import type { OcrField } from '../hooks/useOcrScan';

type Props = {
  fields: OcrField[];
  onRetake: () => void;
  onClose: () => void;
  onSave: (values: Record<string, string>, context: string, postalCode: string) => void;
  saving: boolean;
};

export function ScanResultPanel({ fields, onRetake, onClose, onSave, saving }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [context, setContext] = useState('');
  // OCR's own "Address"/"Postal Code" guesses (if any) already live in `values` via
  // OcrFieldList like every other field — this only tracks the postal code once the
  // search widget below has actually resolved one, since OCR essentially never finds it
  // (postal_code recognized on only 3/16 real cards — see scan/service.py's
  // FIELD_CONFIDENCE comment).
  const [postalCode, setPostalCode] = useState('');
  const [addressSearchOpen, setAddressSearchOpen] = useState(false);

  const handleFieldChange = (label: string, value: string) => {
    setValues((prev) => ({ ...prev, [label]: value }));
  };

  // CreatePersonRequest.name is required server-side, but OCR won't always find a
  // "Name" field (low-contrast text, an unusual card layout, ...) — without this, a
  // card with no recognized name has no name input anywhere and save fails with a
  // raw validation error the user can't act on. 0 confidence renders it in the same
  // "needs review" styling as a low-confidence OCR read.
  const displayFields = fields.some((f) => f.label === 'Name')
    ? fields
    : [{ label: 'Name', value: '', confidence: 0 }, ...fields];

  const address = values['Address'] ?? displayFields.find((f) => f.label === 'Address')?.value ?? '';

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
        <OcrFieldList fields={displayFields} values={values} onChangeValue={handleFieldChange} />

        <Text style={styles.fieldLabel}>주소</Text>
        <View style={styles.addressRow}>
          <View style={styles.addressText}>
            <Text style={address ? styles.addressValue : styles.addressPlaceholder} numberOfLines={2}>
              {address || '주소를 검색해주세요'}
            </Text>
            {postalCode ? <Text style={styles.postalCodeValue}>{postalCode}</Text> : null}
          </View>
          <Pressable style={styles.addressButton} onPress={() => setAddressSearchOpen(true)}>
            <Text style={styles.addressButtonLabel}>주소 갱신</Text>
          </Pressable>
        </View>

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
        onPress={() => onSave(values, context, postalCode)}
      >
        <Text style={styles.primaryButtonLabel}>
          {saving ? '저장 중…' : '저장하고 카드 만들기'}
        </Text>
      </Pressable>

      <AddressSearchModal
        visible={addressSearchOpen}
        onClose={() => setAddressSearchOpen(false)}
        onSelect={(result) => {
          handleFieldChange('Address', result.address);
          setPostalCode(result.postalCode);
          setAddressSearchOpen(false);
        }}
      />
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
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  addressText: {
    flex: 1,
    gap: 2,
  },
  addressValue: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
  },
  addressPlaceholder: {
    color: colors.textMuted,
    fontSize: typography.body.fontSize,
  },
  postalCodeValue: {
    color: colors.textQuaternary,
    fontSize: typography.meta.fontSize,
  },
  addressButton: {
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addressButtonLabel: {
    color: colors.secondary,
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
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
