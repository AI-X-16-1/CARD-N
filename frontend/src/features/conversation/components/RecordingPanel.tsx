import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import { formatTime } from '../lib/format';

// ui-spec §6: 24-bar waveform in purple / cyan / lavender.
const BAR_COUNT = 24;
const BAR_COLORS = [colors.primary, colors.secondary, colors.primaryLight];

// Metering arrives as dBFS. Anything below the floor is silence as far as the bars care.
const DB_FLOOR = -50;
const MIN_LEVEL = 0.12;

/** dBFS -> 0..1, with a floor so silence still shows a resting bar rather than nothing. */
function levelFromMetering(metering: number | undefined): number {
  if (metering === undefined || !Number.isFinite(metering)) return MIN_LEVEL;
  const normalized = (metering - DB_FLOOR) / -DB_FLOOR;
  return Math.min(1, Math.max(MIN_LEVEL, normalized));
}

function RecordingDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.25,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return <Animated.View style={[styles.dot, { opacity }]} />;
}

type Props = {
  durationSeconds: number;
  metering: number | undefined;
  onStop: () => void;
};

export function RecordingPanel({ durationSeconds, metering, onStop }: Props) {
  const level = levelFromMetering(metering);

  // The bars scroll left as new samples arrive, so the waveform reads as a history of
  // the last few seconds rather than 24 copies of the current volume.
  const [history, setHistory] = useState<number[]>(() => Array(BAR_COUNT).fill(MIN_LEVEL));
  useEffect(() => {
    setHistory((prev) => [...prev.slice(1), level]);
  }, [level, durationSeconds]);

  return (
    <View style={styles.panel}>
      <View style={styles.pill}>
        <RecordingDot />
        <Text style={styles.pillText}>녹음 중</Text>
      </View>

      <Text style={styles.timer}>{formatTime(durationSeconds)}</Text>

      <View style={styles.waveform}>
        {history.map((value, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              {
                height: `${Math.round(value * 100)}%`,
                backgroundColor: BAR_COLORS[index % BAR_COLORS.length],
              },
            ]}
          />
        ))}
      </View>

      <Pressable style={styles.stopButton} onPress={onStop} accessibilityLabel="녹음 중지">
        <View style={styles.stopIcon} />
      </Pressable>

      <Text style={styles.hint}>중지하면 바로 텍스트 변환이 시작돼요</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.gameAccent,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.gameAccent,
  },
  pillText: {
    fontSize: typography.micro.fontSize,
    fontWeight: typography.micro.fontWeight,
    color: colors.gameAccent,
  },
  timer: {
    fontSize: typography.timer.fontSize,
    fontWeight: typography.timer.fontWeight,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 56,
    width: '100%',
  },
  bar: {
    flex: 1,
    maxWidth: 6,
    borderRadius: radius.pill,
  },
  stopButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.gameAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: colors.textPrimary,
  },
  hint: {
    fontSize: typography.meta.fontSize,
    color: colors.textMuted,
  },
});
