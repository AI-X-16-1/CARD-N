import { Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, radius } from '@/shared/theme';

type Props = {
  onPress: () => void;
};

/**
 * Opens the incoming-call alert consent screen.
 *
 * Lives in the 관계도 header because the app has no settings screen yet and the other
 * plausible homes (홈, 목록) belong to another owner — see docs/call-alert-spec.md.
 * Worth moving once a settings screen exists.
 */
export function CallAlertButton({ onPress }: Props) {
  return (
    <Pressable
      style={styles.button}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="수신 전화 알림 설정"
    >
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M6.62 10.79C8.06 13.62 10.38 15.94 13.21 17.38L15.41 15.18C15.69 14.9 16.08 14.82 16.43 14.93C17.55 15.3 18.75 15.5 20 15.5C20.55 15.5 21 15.95 21 16.5V20C21 20.55 20.55 21 20 21C10.61 21 3 13.39 3 4C3 3.45 3.45 3 4 3H7.5C8.05 3 8.5 3.45 8.5 4C8.5 5.25 8.7 6.45 9.07 7.57C9.18 7.92 9.1 8.31 8.82 8.59L6.62 10.79Z"
          fill={colors.textSecondary}
        />
      </Svg>
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
});
