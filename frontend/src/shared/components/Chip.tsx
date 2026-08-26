import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

type Props = {
  label: string;
  active: boolean;
  onPress: () => void;
};

// design-tokens.md: filter chip, single-select, active = primary fill.
export function Chip({ label, active, onPress }: Props) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface1,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  label: {
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  labelActive: {
    color: colors.textPrimary,
  },
});
