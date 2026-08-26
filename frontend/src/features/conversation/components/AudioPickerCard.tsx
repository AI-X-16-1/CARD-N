import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import { formatSize, formatTime } from '../lib/format';
import type { PickedAudio } from '../types';

type Props = {
  audio: PickedAudio | null;
  durationSeconds?: number | null;
  disabled?: boolean;
  onPick: () => void;
};

export function AudioPickerCard({ audio, durationSeconds, disabled, onPick }: Props) {
  if (!audio) {
    return (
      <Pressable style={styles.dropzone} onPress={onPick} disabled={disabled}>
        <Text style={styles.dropIcon}>📁</Text>
        <Text style={styles.dropTitle}>녹음 파일 올리기</Text>
        <Text style={styles.dropHint}>m4a · mp3 · wav · webm · ogg</Text>
      </Pressable>
    );
  }

  const meta = [formatSize(audio.size), durationSeconds ? formatTime(durationSeconds) : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.card}>
      <View style={styles.fileRow}>
        <Text style={styles.fileIcon}>🎧</Text>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>
            {audio.name}
          </Text>
          {meta ? <Text style={styles.fileMeta}>{meta}</Text> : null}
        </View>
        <Pressable onPress={onPick} disabled={disabled} hitSlop={8}>
          <Text style={[styles.change, disabled && styles.changeDisabled]}>변경</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dropzone: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderMedium,
    borderRadius: radius.card,
    paddingVertical: 32,
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface1,
  },
  dropIcon: {
    fontSize: 28,
  },
  dropTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  dropHint: {
    fontSize: typography.meta.fontSize,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    padding: 14,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fileIcon: {
    fontSize: 20,
  },
  fileInfo: {
    flex: 1,
    gap: 2,
  },
  fileName: {
    fontSize: typography.body.fontSize,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  fileMeta: {
    fontSize: typography.meta.fontSize,
    color: colors.textQuaternary,
  },
  change: {
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
    color: colors.secondary,
  },
  changeDisabled: {
    color: colors.textMuted,
  },
});
