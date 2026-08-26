import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';
import { hexToRgba } from '@/shared/utils/color';

type Props = {
  label: string;
  color?: string;
};

// design-tokens.md tint helper: same hex at 16% alpha for badge backgrounds.
// Used for both role badges (shared/utils/jobTheme colors) and relationship badges
// (pass any design-tokens.md color, e.g. colors.secondary).
export function Badge({ label, color = colors.textMuted }: Props) {
  return (
    <View style={[styles.badge, { backgroundColor: hexToRgba(color, 0.16) }]}>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  label: {
    fontSize: typography.micro.fontSize,
    fontWeight: '700',
  },
});
