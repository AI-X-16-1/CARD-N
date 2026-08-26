import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/shared/components/Button';
import { colors, radius, typography } from '@/shared/theme';
import type { Person } from '@/shared/types/person';

import { fetchPerson } from '../api';
import { AudioPickerCard } from '../components/AudioPickerCard';
import { ProgressPanel } from '../components/ProgressPanel';
import { RecordingPanel } from '../components/RecordingPanel';
import { SummaryPanel } from '../components/SummaryPanel';
import { TranscriptPanel } from '../components/TranscriptPanel';
import { useConversationFlow } from '../hooks/useConversationFlow';
import { useRecorder } from '../hooks/useRecorder';

/**
 * Which action sheet item got us here. Mirrors the route in
 * navigation/RootNavigator.tsx, where `mode` is likewise optional — anything that
 * navigates without it lands on the recording-first layout, which is the default.
 */
type ConversationStackParamList = {
  ConversationRecord: { personId: number; mode?: 'record' | 'upload' };
};

export default function ConversationRecordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ConversationStackParamList>>();
  const route = useRoute<RouteProp<ConversationStackParamList, 'ConversationRecord'>>();
  const personId = route.params?.personId;
  const mode = route.params?.mode ?? 'record';

  const [person, setPerson] = useState<Person | null>(null);
  const flow = useConversationFlow(personId);
  const recorder = useRecorder();

  const handleStopRecording = async () => {
    const file = await recorder.stop();
    if (file) await flow.transcribe(file);
  };

  useEffect(() => {
    if (personId === undefined) return;
    let active = true;
    fetchPerson(personId)
      .then((data) => {
        if (active) setPerson(data);
      })
      .catch(() => {
        // The name in the header is a nicety; the flow works without it.
      });
    return () => {
      active = false;
    };
  }, [personId]);

  const subtitle = person ? [person.title, person.company].filter(Boolean).join(' · ') : '';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>‹ 뒤로</Text>
        </Pressable>
        <Text style={styles.title}>대화 기록</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {person ? (
          <View style={styles.personRow}>
            <Text style={styles.personName}>{person.name}</Text>
            {subtitle ? <Text style={styles.personMeta}>{subtitle}</Text> : null}
          </View>
        ) : null}

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            녹음은 상대방의 동의를 받은 뒤 진행해 주세요. 녹음한 음성과 올린 파일 모두 텍스트 변환이
            끝나면 서버에서 바로 삭제되고, 기록에는 요약본만 저장됩니다.
          </Text>
        </View>

        {recorder.isRecording ? (
          <RecordingPanel
            durationSeconds={recorder.durationSeconds}
            metering={recorder.metering}
            onStop={handleStopRecording}
          />
        ) : (
          <>
            {/* Whichever action sheet item was tapped goes first. Tapping "업로드" and
                landing on a screen led by a record button reads like a mis-tap. */}
            {mode === 'upload' ? (
              <>
                <AudioPickerCard
                  audio={flow.audio}
                  durationSeconds={flow.sttMeta?.duration_seconds}
                  disabled={flow.busy}
                  onPick={flow.pickAndTranscribe}
                />
                {flow.audio === null ? (
                  <Button
                    label="🎙  대신 지금 녹음하기"
                    variant="outline"
                    onPress={recorder.start}
                    loading={recorder.preparing}
                    disabled={flow.busy}
                  />
                ) : null}
              </>
            ) : (
              <>
                {flow.audio === null ? (
                  <Button
                    label="🎙  지금 녹음 시작"
                    onPress={recorder.start}
                    loading={recorder.preparing}
                    disabled={flow.busy}
                  />
                ) : null}
                <AudioPickerCard
                  audio={flow.audio}
                  durationSeconds={flow.sttMeta?.duration_seconds}
                  disabled={flow.busy}
                  onPick={flow.pickAndTranscribe}
                />
              </>
            )}
          </>
        )}

        <ProgressPanel
          phase={flow.phase}
          uploadPercent={flow.uploadPercent}
          elapsed={flow.elapsed}
        />

        {recorder.error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{recorder.error}</Text>
          </View>
        ) : null}

        {flow.error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{flow.error}</Text>
          </View>
        ) : null}

        {flow.transcript ? (
          <TranscriptPanel
            transcript={flow.transcript}
            onChange={flow.setTranscript}
            meta={flow.sttMeta}
            editable={!flow.busy}
          />
        ) : null}

        {flow.transcript && !flow.summary ? (
          <Button
            label="AI 요약 만들기"
            onPress={flow.runSummary}
            loading={flow.phase === 'summarizing'}
            disabled={flow.busy}
          />
        ) : null}

        {flow.summary ? (
          <>
            <SummaryPanel
              summary={flow.summary}
              person={flow.summaryContext}
              historyUsed={flow.historyUsed}
              model={flow.model}
              elapsed={flow.elapsed}
            />

            <Text style={styles.footnote}>
              녹음 원본은 저장되지 않아요 — 요약본만 기록에 저장됩니다
            </Text>

            {flow.saved ? (
              <View style={styles.savedBox}>
                <Text style={styles.savedText}>기록에 저장했어요</Text>
                <Button label="새 녹음 올리기" variant="outline" onPress={flow.reset} />
              </View>
            ) : (
              <View style={styles.actions}>
                <Button label="삭제" variant="outline" onPress={flow.reset} style={styles.actionSecondary} />
                <Button label="기록에 저장" onPress={flow.save} style={styles.actionPrimary} />
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  back: {
    width: 60,
    color: colors.textSecondary,
    fontSize: typography.body.fontSize,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.screenTitle.fontSize,
    fontWeight: typography.screenTitle.fontWeight,
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 60,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 12,
  },
  personRow: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 2,
  },
  personName: {
    fontSize: typography.personName.fontSize,
    fontWeight: typography.personName.fontWeight,
    color: colors.textPrimary,
  },
  personMeta: {
    fontSize: typography.meta.fontSize,
    color: colors.textQuaternary,
  },
  notice: {
    backgroundColor: 'rgba(254,202,87,0.10)',
    borderRadius: radius.card,
    padding: 12,
  },
  noticeText: {
    fontSize: typography.meta.fontSize,
    lineHeight: 18,
    color: colors.warning,
  },
  errorBox: {
    backgroundColor: 'rgba(253,114,114,0.12)',
    borderRadius: radius.card,
    padding: 12,
  },
  errorText: {
    fontSize: typography.meta.fontSize,
    lineHeight: 18,
    color: colors.gameAccent,
  },
  footnote: {
    fontSize: typography.meta.fontSize,
    textAlign: 'center',
    color: colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionSecondary: {
    flex: 1,
  },
  actionPrimary: {
    flex: 2,
  },
  savedBox: {
    gap: 10,
  },
  savedText: {
    fontSize: typography.body.fontSize,
    fontWeight: '600',
    textAlign: 'center',
    color: colors.secondary,
  },
});
