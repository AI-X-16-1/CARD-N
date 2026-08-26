import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '@/shared/theme';
import { formatRelativeTime } from '../formatRelativeTime';
import { jobColor, jobLabel } from '../jobTint';
import type { RecentPerson } from '../types';

type Props = {
  person: RecentPerson;
  onPress: (person: RecentPerson) => void;
};

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function RecentContactRow({ person, onPress }: Props) {
  const ringColor = jobColor(person.job_class);
  const initial = person.name.slice(0, 1);

  return (
    <Pressable style={styles.row} onPress={() => onPress(person)}>
      <View
        style={[
          styles.avatar,
          { backgroundColor: hexToRgba(ringColor, 0.16), borderColor: ringColor },
        ]}
      >
        <Text style={[styles.avatarLabel, { color: ringColor }]}>{initial}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{person.name}</Text>
        <Text style={styles.meta}>
          {jobLabel(person.job_class)} · {person.title ?? ''} · {person.company ?? ''}
        </Text>
      </View>
      <Text style={styles.time}>{formatRelativeTime(person.created_at)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    color: colors.textQuaternary,
    fontSize: typography.meta.fontSize,
  },
  time: {
    color: colors.textSubtle,
    fontSize: 11,
  },
});
