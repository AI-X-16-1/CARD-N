import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/shared/theme';
import { hexToRgba } from '@/shared/utils/color';

type Props = {
  initials: string;
  color?: string;
  size?: number;
};

// design-tokens.md: role tint background (16% alpha) + role color ring + initials.
// Pass a job-theme color (see shared/utils/jobTheme) for role avatars, or omit it for
// a neutral avatar (e.g. the current user's own initials in the Home header).
export function Avatar({ initials, color = colors.textMuted, size = 40 }: Props) {
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: hexToRgba(color, 0.16),
          borderColor: color,
        },
      ]}
    >
      <Text style={[styles.label, { color, fontSize: size * 0.35 }]}>{initials.slice(0, 1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '700',
  },
});
