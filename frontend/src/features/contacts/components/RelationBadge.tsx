import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import { RELATION_LABELS } from '../jobLabels';

type Props = {
  relation: string;
};

export function RelationBadge({ relation }: Props) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{RELATION_LABELS[relation] ?? relation}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  text: {
    fontSize: typography.micro.fontSize,
    fontWeight: typography.micro.fontWeight,
    color: colors.textSecondary,
  },
});
