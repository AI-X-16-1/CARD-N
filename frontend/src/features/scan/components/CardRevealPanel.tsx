import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import type { CreatedPerson } from '../types';

type Props = {
  person: CreatedPerson;
  onDone: () => void;
};

function initialsOf(name: string): string {
  return name.trim().slice(0, 2);
}

export function CardRevealPanel({ person, onDone }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsOf(person.name)}</Text>
        </View>
        <Text style={styles.name}>{person.name}</Text>
        {person.company || person.title ? (
          <Text style={styles.meta}>
            {[person.title, person.company].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        <Text style={styles.battleNote}>배틀 카드는 아직 준비 중이에요</Text>
      </View>

      <Text style={styles.savedNote}>연락처에 저장됐어요</Text>

      <Pressable style={styles.doneButton} onPress={onDone}>
        <Text style={styles.doneButtonLabel}>완료</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface1,
    borderRadius: radius.myCard,
    borderWidth: 1,
    borderColor: colors.borderMedium,
    paddingVertical: 32,
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.cardName.fontSize,
    fontWeight: typography.cardName.fontWeight,
  },
  meta: {
    color: colors.primaryLight,
    fontSize: typography.meta.fontSize,
  },
  battleNote: {
    color: colors.textMuted,
    fontSize: typography.meta.fontSize,
    marginTop: 8,
  },
  savedNote: {
    color: colors.secondary,
    fontSize: typography.body.fontSize,
  },
  doneButton: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
});
