// Conversation history timeline for PersonDetailScreen (ui-spec.md §5).
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import type { Conversation } from '../types';
import { useConversations } from '../hooks/useConversations';
import { deleteConversation } from '../api';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

type RowProps = {
  conversation: Conversation;
  onDeleted: () => void;
};

function ConversationRow({ conversation, onDeleted }: RowProps) {
  const handleDelete = () => {
    Alert.alert('대화 기록 삭제', '이 요약을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteConversation(conversation.id);
            onDeleted();
          } catch {
            Alert.alert('오류', '삭제하지 못했어요. 다시 시도해주세요.');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.row}>
      <View style={styles.timelineRail}>
        <View style={styles.dot} />
        <View style={styles.line} />
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.date}>{formatDate(conversation.recorded_at)}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeLabel}>🎙 요약</Text>
          </View>
        </View>
        <Text style={styles.oneLiner}>{conversation.one_liner}</Text>
        {conversation.summary.key_points.slice(0, 3).map((point, i) => (
          <Text key={i} style={styles.bullet}>
            · {point}
          </Text>
        ))}
        <Pressable onPress={handleDelete} hitSlop={8}>
          <Text style={styles.deleteLabel}>삭제</Text>
        </Pressable>
      </View>
    </View>
  );
}

type Props = { personId: number };

export function ConversationTimeline({ personId }: Props) {
  const { conversations, loading, error, refetch } = useConversations(personId);

  if (loading) return <Text style={styles.stateText}>불러오는 중…</Text>;
  if (error) return <Text style={styles.stateText}>불러오지 못했어요</Text>;
  if (conversations.length === 0) return <Text style={styles.stateText}>아직 대화 기록이 없어요</Text>;

  return (
    <View>
      {conversations.map((conversation) => (
        <ConversationRow key={conversation.id} conversation={conversation} onDeleted={refetch} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stateText: { fontSize: typography.body.fontSize, color: colors.textMuted },
  row: { flexDirection: 'row', gap: 10 },
  timelineRail: { alignItems: 'center', width: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primaryLight, marginTop: 4 },
  line: { flex: 1, width: 1, backgroundColor: colors.borderMedium, marginTop: 2 },
  card: { flex: 1, gap: 6, paddingBottom: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: typography.meta.fontSize, color: colors.textMuted },
  badge: {
    backgroundColor: 'rgba(108,92,231,0.16)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeLabel: { fontSize: typography.micro.fontSize, color: colors.primaryLight, fontWeight: '600' },
  oneLiner: { fontSize: typography.body.fontSize, fontWeight: '700', color: colors.textPrimary },
  bullet: { fontSize: typography.body.fontSize, color: colors.textSecondary, lineHeight: 20 },
  deleteLabel: { fontSize: typography.meta.fontSize, color: colors.gameAccent, marginTop: 4 },
});
