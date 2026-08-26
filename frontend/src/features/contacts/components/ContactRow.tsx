import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import { CardThumbnail } from './CardThumbnail';
import { RelationBadge } from './RelationBadge';
import { formatRelativeTime } from '../formatRelativeTime';
import { jobLabel } from '../jobLabels';
import type { Person } from '../types';

type Props = {
  person: Person;
  onPress: (person: Person) => void;
};

export function ContactRow({ person, onPress }: Props) {
  const meta = [jobLabel(person.job_class), person.company].filter(Boolean).join(' · ');

  return (
    <Pressable style={styles.row} onPress={() => onPress(person)}>
      <CardThumbnail jobClass={person.job_class} />
      <View style={styles.body}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1}>
            {person.name}
          </Text>
          <RelationBadge relation={person.relation} />
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text style={styles.time}>{formatRelativeTime(person.last_contact ?? person.created_at)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    marginBottom: 8,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: typography.body.fontSize,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  meta: {
    fontSize: typography.meta.fontSize,
    color: colors.textQuaternary,
  },
  time: {
    fontSize: 11,
    color: colors.textSubtle,
  },
});
