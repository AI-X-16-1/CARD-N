import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import { AddressSearchModal } from '@/shared/components/AddressSearchModal';
import type { ParsedPerson } from '../types';

type Props = {
  onBack: () => void;
  onSave: (person: ParsedPerson) => void;
  saving: boolean;
};

const FIELDS: { key: keyof ParsedPerson; label: string; placeholder: string }[] = [
  { key: 'name', label: '이름', placeholder: '홍길동' },
  { key: 'company', label: '회사', placeholder: '카카오' },
  { key: 'department', label: '부서', placeholder: '마케팅팀' },
  { key: 'title', label: '직함', placeholder: '매니저' },
  { key: 'phone', label: '휴대폰 번호', placeholder: '010-1234-5678' },
  { key: 'email', label: '이메일', placeholder: 'hong@kakao.com' },
];

export function ManualInputForm({ onBack, onSave, saving }: Props) {
  const [values, setValues] = useState<Partial<Record<keyof ParsedPerson, string>>>({});
  const [context, setContext] = useState('');
  const [addressSearchOpen, setAddressSearchOpen] = useState(false);

  const setField = (key: keyof ParsedPerson, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const canSave = (values.name ?? '').trim().length > 0 && !saving;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={onBack} hitSlop={8}>
        <Text style={styles.backLink}>‹ 카메라로</Text>
      </Pressable>

      <Text style={styles.title}>직접 입력</Text>
      <Text style={styles.subtitle}>명함 없이도 인물을 등록할 수 있어요</Text>

      {FIELDS.map(({ key, label, placeholder }) => (
        <View key={key} style={styles.field}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <TextInput
            style={styles.input}
            value={values[key] ?? ''}
            onChangeText={(text) => setField(key, text)}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
          />
        </View>
      ))}

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>주소</Text>
        <View style={styles.addressRow}>
          <TextInput
            style={styles.addressInput}
            value={values.address ?? ''}
            onChangeText={(text) => setField('address', text)}
            placeholder="주소를 검색하거나 직접 입력해주세요"
            placeholderTextColor={colors.textMuted}
          />
          <Pressable style={styles.addressButton} onPress={() => setAddressSearchOpen(true)}>
            <Text style={styles.addressButtonLabel}>주소 갱신</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.postalCodeInput}
          value={values.postal_code ?? ''}
          onChangeText={(text) => setField('postal_code', text)}
          placeholder="우편번호"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>만난 컨텍스트</Text>
        <TextInput
          style={styles.input}
          value={context}
          onChangeText={setContext}
          placeholder="어디서, 어떻게 만났는지 적어주세요"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <Pressable
        style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
        disabled={!canSave}
        onPress={() => onSave({ ...values, context })}
      >
        <Text style={styles.saveButtonLabel}>
          {saving ? '저장 중…' : '저장하고 카드 만들기'}
        </Text>
      </Pressable>

      <AddressSearchModal
        visible={addressSearchOpen}
        onClose={() => setAddressSearchOpen(false)}
        onSelect={(result) => {
          setField('address', result.address);
          setField('postal_code', result.postalCode);
          setAddressSearchOpen(false);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  backLink: {
    color: colors.textSecondary,
    fontSize: typography.body.fontSize,
    marginBottom: 12,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.screenTitle.fontSize,
    fontWeight: typography.screenTitle.fontWeight,
  },
  subtitle: {
    color: colors.textQuaternary,
    fontSize: typography.meta.fontSize,
    marginTop: 4,
    marginBottom: 16,
  },
  field: {
    marginBottom: 12,
  },
  fieldLabel: {
    color: colors.textTertiary,
    fontSize: typography.sectionLabel.fontSize,
    fontWeight: typography.sectionLabel.fontWeight,
    letterSpacing: typography.sectionLabel.letterSpacing,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
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
  postalCodeInput: {
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
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
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
});
