import { SafeAreaView, StyleSheet, Text } from 'react-native';

import { colors, typography } from '@/shared/theme';

type Props = {
  title: string;
};

export function PlaceholderScreen({ title }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.screenTitle.fontSize,
    fontWeight: typography.screenTitle.fontWeight,
  },
});
