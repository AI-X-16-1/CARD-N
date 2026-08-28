import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import { useGuideChat } from '../hooks/useGuideChat';
import type { GuideMessage } from '../types';

function Bubble({ message }: { message: GuideMessage }) {
  const mine = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleBot]}>
        <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{message.content}</Text>
      </View>
    </View>
  );
}

export function GuideChatPanel({ onClose }: { onClose: () => void }) {
  const { messages, pending, error, send, retry, suggestions } = useGuideChat();
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<GuideMessage>>(null);

  // A new answer lands at the bottom, which is off screen once the thread is a few
  // turns long. Without this the user has to scroll to find out they got a reply.
  useEffect(() => {
    if (messages.length > 1) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, pending]);

  const submit = () => {
    send(draft);
    setDraft('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.panel}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>사용법 도우미</Text>
          <Text style={styles.subtitle}>앱 사용법만 안내해요</Text>
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" hitSlop={8}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, index) => String(index)}
        renderItem={({ item }) => <Bubble message={item} />}
        contentContainerStyle={styles.thread}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          <View>
            {pending ? (
              <View style={styles.bubbleRow}>
                <View style={[styles.bubble, styles.bubbleBot]}>
                  <ActivityIndicator color={colors.primaryLight} />
                </View>
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={retry} accessibilityRole="button">
                  <Text style={styles.retry}>다시 시도</Text>
                </Pressable>
              </View>
            ) : null}

            {suggestions.length > 0 ? (
              <View style={styles.suggestions}>
                {suggestions.map((question) => (
                  <Pressable
                    key={question}
                    style={styles.chip}
                    accessibilityRole="button"
                    onPress={() => send(question)}
                  >
                    <Text style={styles.chipText}>{question}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        }
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="궁금한 걸 물어보세요"
          placeholderTextColor={colors.textMuted}
          returnKeyType="send"
          onSubmitEditing={submit}
          editable={!pending}
          multiline
        />
        <Pressable
          style={[styles.send, (!draft.trim() || pending) && styles.sendDisabled]}
          onPress={submit}
          disabled={!draft.trim() || pending}
          accessibilityRole="button"
          accessibilityLabel="보내기"
        >
          <Text style={styles.sendLabel}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: colors.surface1,
    borderTopLeftRadius: radius.bottomSheet,
    borderTopRightRadius: radius.bottomSheet,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  title: { ...typography.screenTitle, color: colors.textPrimary },
  subtitle: { ...typography.meta, color: colors.textTertiary, marginTop: 2 },
  close: { fontSize: 18, color: colors.textTertiary, paddingHorizontal: 4 },
  thread: { padding: 16, gap: 10 },
  bubbleRow: { flexDirection: 'row', marginBottom: 10 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.card },
  bubbleBot: { backgroundColor: colors.surface2 },
  bubbleMine: { backgroundColor: colors.primary },
  bubbleText: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },
  bubbleTextMine: { color: colors.textPrimary },
  errorBox: {
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    padding: 12,
    marginBottom: 10,
  },
  errorText: { ...typography.meta, color: colors.gameAccent },
  retry: { ...typography.meta, color: colors.primaryLight, marginTop: 6, fontWeight: '600' },
  suggestions: { gap: 8 },
  chip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.borderMedium,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: { ...typography.meta, color: colors.textSecondary },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  input: {
    flex: 1,
    maxHeight: 96,
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    ...typography.body,
  },
  send: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: colors.surface3 },
  sendLabel: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
});
