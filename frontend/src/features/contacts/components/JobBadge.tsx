import { StyleSheet, Text, View } from 'react-native';

import { radius, typography } from '@/shared/theme';

import { jobColor, jobLabel } from '../jobLabels';

type Props = {
  jobClass: string | null;
};

export function JobBadge({ jobClass }: Props) {
  const color = jobColor(jobClass);
  return (
    <View style={[styles.badge, { backgroundColor: `${color}29`, borderColor: `${color}55` }]}>
      <Text style={[styles.text, { color }]}>{jobLabel(jobClass)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  text: {
    fontSize: typography.micro.fontSize,
    fontWeight: typography.micro.fontWeight,
  },
});
