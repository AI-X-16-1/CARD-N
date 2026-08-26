import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, radius, typography } from '@/shared/theme';

type Props = {
  count: number;
  onPress: () => void;
};

export function IntroductionBell({ count, onPress }: Props) {
  if (count <= 0) return null;

  return (
    <Pressable style={styles.button} onPress={onPress}>
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 2C10.34 2 9 3.34 9 5V5.29C6.67 6.17 5 8.39 5 11V15L3 18V19H21V18L19 15V11C19 8.39 17.33 6.17 15 5.29V5C15 3.34 13.66 2 12 2Z"
          fill={colors.textSecondary}
        />
        <Path
          d="M10 20C10 21.1 10.9 22 12 22C13.1 22 14 21.1 14 20H10Z"
          fill={colors.textSecondary}
        />
      </Svg>
      <View style={styles.badge}>
        <Text style={styles.badgeLabel}>{count > 9 ? '9+' : count}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.card,
    backgroundColor: colors.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.gameAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    color: colors.textPrimary,
    fontSize: typography.micro.fontSize,
    fontWeight: '700',
  },
});
