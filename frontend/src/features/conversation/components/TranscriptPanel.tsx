import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import { formatTime } from '../lib/format';
import type { TranscribeResult } from '../types';

type Props = {
  transcript: string;
  onChange: (text: string) => void;
  meta: TranscribeResult | null;
  editable: boolean;
};

export function TranscriptPanel({ transcript, onChange, meta, editable }: Props) {
  const [showSegments, setShowSegments] = useState(false);

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.sectionLabel}>인식된 텍스트</Text>
        {meta ? (
          <Text style={styles.headerMeta}>
            {formatTime(meta.duration_seconds)} · {meta.model}
          </Text>
        ) : null}
      </View>

      <TextInput
        style={styles.input}
        value={transcript}
        onChangeText={onChange}
        editable={editable}
        multiline
        textAlignVertical="top"
        placeholder="인식된 텍스트가 여기에 표시돼요"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.hint}>
        잘못 들린 부분을 고쳐두면 요약 품질이 올라가요. 특히 사람 이름.
      </Text>

      {meta && meta.segments.length > 0 ? (
        <>
          <Pressable onPress={() => setShowSegments((v) => !v)} hitSlop={8}>
            <Text style={styles.toggle}>
              {showSegments ? '▾' : '▸'} 구간별 보기 ({meta.segments.length})
            </Text>
          </Pressable>

          {showSegments ? (
            <View style={styles.segments}>
              {meta.segments.map((segment, index) => (
                <View key={index} style={styles.segmentRow}>
                  <Text style={styles.segmentTime}>{formatTime(segment.start)}</Text>
                  <Text style={styles.segmentText}>{segment.text}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    padding: 14,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: typography.sectionLabel.fontSize,
    fontWeight: typography.sectionLabel.fontWeight,
    letterSpacing: typography.sectionLabel.letterSpacing,
    color: colors.textTertiary,
  },
  headerMeta: {
    fontSize: typography.meta.fontSize,
    color: colors.textQuaternary,
  },
  input: {
    minHeight: 120,
    maxHeight: 260,
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    padding: 12,
    fontSize: typography.body.fontSize,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  hint: {
    fontSize: typography.meta.fontSize,
    color: colors.textMuted,
  },
  toggle: {
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
    color: colors.secondary,
  },
  segments: {
    gap: 6,
    paddingTop: 2,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  segmentTime: {
    width: 46,
    fontSize: typography.meta.fontSize,
    color: colors.textMuted,
  },
  segmentText: {
    flex: 1,
    fontSize: typography.meta.fontSize,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
