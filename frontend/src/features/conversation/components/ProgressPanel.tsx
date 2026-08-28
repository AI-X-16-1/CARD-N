import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import { formatDuration } from '../lib/format';
import { transcribeProgress } from '../lib/progress';
import type { FlowPhase } from '../types';

const PHASE_LABELS: Partial<Record<FlowPhase, string>> = {
  uploading: '녹음 파일 올리는 중…',
  transcribing: '음성 인식 중…',
  summarizing: '요약 생성 중…',
};

const PHASE_HINTS: Partial<Record<FlowPhase, string>> = {
  uploading: '파일은 변환이 끝나면 서버에서 바로 삭제돼요',
  transcribing: '녹음 길이만큼 걸려요. 처음 한 번은 모델을 내려받느라 더 느립니다',
  summarizing: '상대 정보와 지난 대화를 함께 넣어 정리하고 있어요',
};

type Props = {
  phase: FlowPhase;
  uploadPercent: number;
  elapsed: number;
  /** Seconds spent transcribing, which is what `expectedSttSeconds` is measured against. */
  sttElapsed: number;
  /** Roughly how long transcribing should take, or null when the audio length is unknown. */
  expectedSttSeconds: number | null;
};

export function ProgressPanel({
  phase,
  uploadPercent,
  elapsed,
  sttElapsed,
  expectedSttSeconds,
}: Props) {
  const label = PHASE_LABELS[phase];
  if (!label) return null;

  // Whisper reports nothing until it is finished, so the only honest progress here is
  // against how long the audio runs. Without that length there is nothing to divide by
  // and the panel falls back to the elapsed clock alone.
  const estimating = phase === 'transcribing' && expectedSttSeconds !== null;
  const estimate = estimating ? transcribeProgress(sttElapsed, expectedSttSeconds) : null;

  const percent = estimate ? estimate.percent : uploadPercent;
  const showBar = estimate !== null || (phase === 'uploading' && uploadPercent > 0);

  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <ActivityIndicator color={colors.primaryLight} />
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.elapsed}>
          {estimate
            ? estimate.remainingSeconds > 0
              ? `약 ${formatDuration(estimate.remainingSeconds)} 남음`
              : '거의 다 됐어요'
            : `${elapsed.toFixed(1)}초`}
        </Text>
      </View>

      {showBar ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${percent}%` }]} />
        </View>
      ) : null}

      <Text style={styles.hint}>{PHASE_HINTS[phase]}</Text>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    flex: 1,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  elapsed: {
    fontSize: typography.meta.fontSize,
    color: colors.textQuaternary,
  },
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  hint: {
    fontSize: typography.meta.fontSize,
    color: colors.textMuted,
  },
});
