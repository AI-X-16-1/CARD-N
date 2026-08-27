import { Component, type ReactNode } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

function formatTime(sec: number | undefined): string {
  if (!sec || Number.isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type Props = { uri: string };

// Re-added on request after CallRecordingFinder originally shipped without playback
// (a deliberate privacy choice — see git history / api-spec.md's Conversation section
// notes on the recording-consent gate this screen already requires before generating a
// summary). Playing a match back is still gated by that same consent flow being run
// first in practice, since this button only ever appears next to a match a person chose
// to act on there.
export function AudioPlayButton({ uri }: Props) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  const handlePress = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.currentTime >= status.duration && status.duration > 0) {
      player.seekTo(0);
    }
    player.play();
  };

  return (
    <Pressable style={styles.wrap} onPress={handlePress}>
      <Text style={styles.icon}>{status.playing ? '⏸' : '▶️'}</Text>
      <Text style={styles.label}>
        {formatTime(status.currentTime)} / {formatTime(status.duration)}
      </Text>
    </Pressable>
  );
}

// One bad file (unreadable URI, revoked storage permission mid-session, ...) must not
// take down the rest of the match list with it — only a class component can catch a
// render error here, hence the older component-class API instead of a hook.
export class AudioPlayButtonBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('AudioPlayButton crashed:', error);
  }

  render() {
    if (this.state.failed) {
      return <Text style={styles.errorLabel}>⚠️ 이 파일은 재생할 수 없어요</Text>;
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  icon: { fontSize: 12 },
  label: { fontSize: typography.micro.fontSize, fontWeight: '600', color: colors.textSecondary },
  errorLabel: { fontSize: typography.micro.fontSize, color: colors.textMuted },
});
