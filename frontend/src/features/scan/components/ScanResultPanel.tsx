import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import { AddressSearchModal } from '@/shared/components/AddressSearchModal';

import { OcrFieldList } from './OcrFieldList';
import type { OcrField } from '../hooks/useOcrScan';
import { extractFloorDetail } from '../lib/extractFloorDetail';

type Props = {
  fields: OcrField[];
  // The just-taken photo, still local (see ScanCameraScreen) — shown alongside the
  // fields so the user can compare against the card itself while correcting a
  // misread or filling in a column OCR found nothing for.
  photoUri: string | null;
  onRetake: () => void;
  onClose: () => void;
  onSave: (values: Record<string, string>, context: string, addressDetail: string) => void;
  saving: boolean;
};

export function ScanResultPanel({ fields, photoUri, onRetake, onClose, onSave, saving }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [context, setContext] = useState('');
  // No OCR field label maps to this (a card never states "which floor/unit was this
  // printed for" — see AddressSearchModal's own comment), so unlike Address/Postal Code
  // it can't live in `values` — there's nothing in `fields` for it to fall back to.
  const [addressDetail, setAddressDetail] = useState('');
  const [addressSearchOpen, setAddressSearchOpen] = useState(false);

  const handleFieldChange = (label: string, value: string) => {
    setValues((prev) => ({ ...prev, [label]: value }));
  };

  // Address/Postal Code get their own dedicated row below (editable input + "주소 갱신"
  // button) instead of OcrFieldList's generic one — a single place to see/edit each,
  // not a duplicate of what the button already updates.
  const ocrOnlyFields = fields.filter((f) => f.label !== 'Address' && f.label !== 'Postal Code');
  const address = values['Address'] ?? fields.find((f) => f.label === 'Address')?.value ?? '';
  const postalCode =
    values['Postal Code'] ?? fields.find((f) => f.label === 'Postal Code')?.value ?? '';

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
        {photoUri && <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="contain" />}
        <OcrFieldList fields={ocrOnlyFields} values={values} onChangeValue={handleFieldChange} />

        <Text style={styles.fieldLabel}>주소</Text>
        <View style={styles.addressRow}>
          <TextInput
            style={styles.addressInput}
            value={address}
            onChangeText={(text) => handleFieldChange('Address', text)}
            placeholder="주소를 검색하거나 직접 입력해주세요"
            placeholderTextColor={colors.textMuted}
          />
          <Pressable style={styles.addressButton} onPress={() => setAddressSearchOpen(true)}>
            <Text style={styles.addressButtonLabel}>주소 갱신</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.addressDetailInput}
          value={addressDetail}
          onChangeText={setAddressDetail}
          placeholder="상세 주소 (동/층/호수)"
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          style={styles.postalCodeInput}
          value={postalCode}
          onChangeText={(text) => handleFieldChange('Postal Code', text)}
          placeholder="우편번호"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
        />

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
        onPress={() => onSave(values, context, addressDetail)}
      >
        <Text style={styles.primaryButtonLabel}>
          {saving ? '저장 중…' : '저장하고 카드 만들기'}
        </Text>
      </Pressable>

      <AddressSearchModal
        visible={addressSearchOpen}
        initialQuery={address}
        onClose={() => setAddressSearchOpen(false)}
        onSelect={(result) => {
          const floorDetail = extractFloorDetail(address);
          handleFieldChange('Address', result.address);
          handleFieldChange('Postal Code', result.postalCode);
          const detail = [result.buildingName, floorDetail].filter(Boolean).join(' ');
          if (detail) setAddressDetail(detail);
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
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  addressInput: {
    flex: 1,
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
  },
  addressDetailInput: {
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    marginBottom: 8,
  },
  postalCodeInput: {
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    marginBottom: 16,
    width: 140,
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
