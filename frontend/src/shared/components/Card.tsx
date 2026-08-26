import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/shared/theme';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

// design-tokens.md: Surface-1 background, standard 12px radius.
export function Card({ children, style }: Props) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    padding: 16,
  },
});
