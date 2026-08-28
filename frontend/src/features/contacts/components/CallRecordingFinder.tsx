// Finds the device's call recordings for a contact's phone number and turns a match into a
// saved conversation summary — and, on request, lets the found file be played back directly
// (see AudioPlayButton's own comment: this was originally left out on purpose for privacy
// reasons, re-added deliberately afterwards).
//
// The "요약 생성" action is gated behind an explicit consent confirmation, mirroring the
// recording-consent notice ui-spec.md §6 requires for the live-recording flow — this pulls in
// a pre-existing recording instead of recording live, but processes the counterpart's voice
// the same way (STT + LLM + a stored summary), so it needs the same notice.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import { AudioPlayButton, AudioPlayButtonBoundary } from './AudioPlayButton';
import { ConfirmModal } from './ConfirmModal';
import { NoticeModal } from './NoticeModal';
import type { CallRecordingMatch } from '../lib/callRecordings';
import { useCallRecordingFinder } from '../hooks/useCallRecordingFinder';

const PAGE_SIZE = 5;

function formatDate(ts: number | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString('ko-KR');
}

function summaryLabel(status: 'idle' | 'summarizing' | 'done' | 'error' | undefined): string {
  switch (status) {
    case 'summarizing':
      return '요약 생성 중…';
    case 'done':
      return '✓ 요약 완료 · 기록에 저장됨';
    case 'error':
      return '실패 · 다시 시도';
    default:
      return '요약 생성';
  }
}

type Props = {
  personId: number;
  phone: string | null;
  onSummarySaved?: () => void;
};

export default function CallRecordingFinder({ personId, phone, onSummarySaved }: Props) {
  const {
    searching,
    result,
    searchError,
    search,
    dismissSearchError,
    summaryStatus,
    summaryError,
    generateSummary,
  } = useCallRecordingFinder(personId, phone);
  const [page, setPage] = useState(0);
  // react-native-web's Alert.alert is a no-op, so the consent gate below needs a real
  // Modal — the match awaiting confirmation lives here rather than as a bare boolean so
  // "안내했어요, 계속" knows which one to actually summarize.
  const [pendingGenerate, setPendingGenerate] = useState<CallRecordingMatch | null>(null);

  // A fresh search result replaces the whole match list — start back on page 1 rather
  // than stranding the view on a page index that may no longer exist.
  useEffect(() => setPage(0), [result]);

  const handleFind = async () => {
    await search();
  };

  const handleGenerate = (match: CallRecordingMatch) => {
    if (summaryStatus[match.id] === 'summarizing') return;
    setPendingGenerate(match);
  };

  const confirmGenerate = () => {
    const match = pendingGenerate;
    setPendingGenerate(null);
    if (match) generateSummary(match).then(() => onSummarySaved?.());
  };

  return (
    <View>
      <Pressable style={styles.findButton} onPress={handleFind} disabled={searching || !phone}>
        <Text style={styles.findIcon}>{searching ? '🔄' : '📼'}</Text>
        <Text style={styles.findLabel}>{searching ? '검색 중…' : '휴대폰에서 통화 녹음 찾기'}</Text>
      </Pressable>

      {!phone && (
        <Text style={styles.hintMuted}>이 연락처에 전화번호가 없어서 통화 녹음을 찾을 수 없어요.</Text>
      )}

      {result?.permissionDenied && (
        <Text style={styles.hintMuted}>연락처/미디어 접근 권한을 허용해야 통화 녹음을 찾을 수 있어요.</Text>
      )}

      {result && !result.permissionDenied && result.matches.length === 0 && (
        <Text style={styles.hintMuted}>
          {result.matchedBy === 'name'
            ? `저장된 연락처 이름("${result.contactName}")으로도 일치하는 녹음 파일이 없어요.`
            : '이 번호와 일치하는 녹음 파일이 없어요.'}
        </Text>
      )}

      {result && result.matches.length > 0 && (
        <View style={styles.matchList}>
          <Text style={styles.hint}>
            {result.matchedBy === 'name'
              ? `저장된 연락처 이름("${result.contactName}") 기준으로 찾았어요`
              : '연락처에 없는 번호라 전화번호 기준으로 찾았어요'}
          </Text>
          {result.truncated && <Text style={styles.hintMuted}>녹음이 너무 많아 최신 일부만 검색했어요.</Text>}
          <Text style={styles.privacyNote}>
            녹음 원본은 저장되지 않아요 — 요약본만 기록에 저장돼요. 통화 상대방에게도 안내해주세요.
          </Text>
          {result.matches.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).map((match) => {
            const status = summaryStatus[match.id];
            return (
              <View key={match.id} style={styles.matchRow}>
                <View style={styles.matchTopRow}>
                  <View style={styles.matchInfo}>
                    <Text style={styles.filename} numberOfLines={1}>
                      {match.filename}
                    </Text>
                    <Text style={styles.matchMeta}>{formatDate(match.creationTime)}</Text>
                  </View>
                  <AudioPlayButtonBoundary>
                    <AudioPlayButton uri={match.uri} />
                  </AudioPlayButtonBoundary>
                </View>
                <Pressable
                  style={[styles.summaryButton, status === 'done' && styles.summaryButtonDone]}
                  onPress={() => handleGenerate(match)}
                  disabled={status === 'summarizing' || status === 'done'}
                >
                  <Text style={styles.summaryButtonLabel}>{summaryLabel(status)}</Text>
                </Pressable>
                {status === 'error' && summaryError[match.id] && (
                  <Text style={styles.errorText}>{summaryError[match.id]}</Text>
                )}
              </View>
            );
          })}
          {result.matches.length > PAGE_SIZE ? (
            <View style={styles.pager}>
              <Pressable
                style={[styles.pagerButton, page === 0 && styles.pagerButtonDisabled]}
                onPress={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <Text style={styles.pagerButtonLabel}>‹ 이전</Text>
              </Pressable>
              <Text style={styles.pagerLabel}>
                {page + 1} / {Math.ceil(result.matches.length / PAGE_SIZE)}
              </Text>
              <Pressable
                style={[
                  styles.pagerButton,
                  (page + 1) * PAGE_SIZE >= result.matches.length && styles.pagerButtonDisabled,
                ]}
                onPress={() => setPage((p) => p + 1)}
                disabled={(page + 1) * PAGE_SIZE >= result.matches.length}
              >
                <Text style={styles.pagerButtonLabel}>다음 ›</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}

      <ConfirmModal
        visible={pendingGenerate !== null}
        title="통화 요약 생성 전 확인"
        message={
          '이 통화의 원본 파일은 저장되지 않고, 생성된 요약만 기록에 저장돼요.\n\n통화 상대방에게 이 사실을 안내하셨나요?'
        }
        confirmLabel="안내했어요, 계속"
        onCancel={() => setPendingGenerate(null)}
        onConfirm={confirmGenerate}
      />
      <NoticeModal
        visible={!!searchError}
        title="오류"
        message={`통화 녹음을 검색하는 중 문제가 발생했어요.\n${searchError ?? ''}`}
        onDismiss={dismissSearchError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  findButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 12,
  },
  findIcon: { fontSize: 14 },
  findLabel: { fontSize: typography.body.fontSize, fontWeight: '600', color: colors.textPrimary },
  hint: { fontSize: typography.meta.fontSize, color: colors.textQuaternary, marginBottom: 8 },
  hintMuted: { fontSize: typography.meta.fontSize, color: colors.textMuted, marginTop: 4 },
  privacyNote: { fontSize: typography.meta.fontSize, color: colors.textMuted, marginTop: 4, marginBottom: 4 },
  matchList: { gap: 8 },
  matchRow: {
    gap: 8,
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  matchTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  matchInfo: { flex: 1, gap: 2 },
  filename: { fontSize: typography.body.fontSize, color: colors.textPrimary, fontWeight: '600' },
  matchMeta: { fontSize: typography.meta.fontSize, color: colors.textQuaternary },
  summaryButton: {
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  summaryButtonDone: { backgroundColor: 'transparent' },
  summaryButtonLabel: { fontSize: typography.meta.fontSize, fontWeight: '600', color: colors.secondary },
  errorText: { fontSize: typography.meta.fontSize, color: colors.gameAccent },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 4,
  },
  pagerButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pagerButtonDisabled: {
    opacity: 0.35,
  },
  pagerButtonLabel: { fontSize: typography.meta.fontSize, fontWeight: '600', color: colors.secondary },
  pagerLabel: { fontSize: typography.meta.fontSize, color: colors.textQuaternary },
});
