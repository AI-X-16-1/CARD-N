import Svg, { Circle } from 'react-native-svg';

import { colors } from '@/shared/theme';

type Props = {
  size?: number;
};

export function Logo({ size = 26 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Circle
        cx={60}
        cy={60}
        r={40}
        fill="none"
        stroke={colors.textPrimary}
        strokeWidth={13}
        strokeLinecap="round"
        strokeDasharray="188.5 62.83"
        strokeDashoffset={31.42}
        transform="rotate(90 60 60)"
      />
      <Circle cx={101} cy={60} r={13} fill={colors.primary} />
    </Svg>
  );
}
