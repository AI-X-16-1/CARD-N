import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

type Props = {
  label: string;
  active: boolean;
  onPress: () => void;
};

export function CategoryChip({ label, active, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
    >
      <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipInactive: {
    backgroundColor: colors.surface2,
  },
  label: {
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
  },
  labelActive: {
    color: colors.textPrimary,
  },
  labelInactive: {
    color: colors.textTertiary,
  },
});
