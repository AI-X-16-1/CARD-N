import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, size, typography } from '@/shared/theme';

import CallRecordingFinder from '../components/CallRecordingFinder';
import { ConversationTimeline } from '../components/ConversationTimeline';
import { JobBadge } from '../components/JobBadge';
import { RelationBadge } from '../components/RelationBadge';
import { usePersonDetail } from '../hooks/usePersonDetail';

type PersonDetailStackParamList = {
  PersonDetail: { personId: number };
  // Kept in step with navigation/RootNavigator.tsx and conversation/screens/ConversationRecordScreen.tsx (#24/#25).
  ConversationRecord: { personId: number; mode?: 'record' | 'upload' };
};

function initialsOf(name: string): string {
  return name.trim().slice(0, 2);
}

type Props = {
  // Passed when rendered inline (e.g. list → detail inside a single screen) instead
  // of as a registered stack route. Falls back to route params otherwise.
  personId?: number;
  onBack?: () => void;
};

export default function PersonDetailScreen({ personId: personIdProp, onBack }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<PersonDetailStackParamList>>();
  const route = useRoute<RouteProp<PersonDetailStackParamList, 'PersonDetail'>>();
  const personId = personIdProp ?? route.params?.personId;
  const { person, loading, error } = usePersonDetail(personId ?? -1);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [callRecordingFinderOpen, setCallRecordingFinderOpen] = useState(false);
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);
  const goBack = onBack ?? (() => navigation.goBack());

  if (personId === undefined || loading || !person) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.stateText}>{error ? '불러오지 못했어요' : '불러오는 중…'}</Text>
      </SafeAreaView>
    );
  }

  const meta = [person.title, person.company].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={12}>
          <Text style={styles.back}>‹ 뒤로</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsOf(person.name)}</Text>
          </View>
          <Text style={styles.name}>{person.name}</Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
          <View style={styles.badgeRow}>
            <JobBadge jobClass={person.job_class} />
            <RelationBadge relation={person.relation} />
          </View>
        </View>

        <View style={styles.card}>
          {person.phone ? (
            <Text style={styles.contactLine}>📞 {person.phone}</Text>
          ) : null}
          {person.email ? (
            <Text style={styles.contactLine}>📧 {person.email}</Text>
          ) : null}
          {!person.phone && !person.email ? (
            <Text style={styles.contactLineMuted}>등록된 연락처 정보가 없어요</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>배틀 카드</Text>
          <Text style={styles.contactLineMuted}>아직 생성된 배틀 카드가 없어요</Text>
        </View>

        {callRecordingFinderOpen ? (
          <View style={styles.card}>
            <View style={styles.callRecordingHeader}>
              <Text style={styles.sectionLabel}>📼 휴대폰에서 통화 녹음 찾기</Text>
              <Pressable onPress={() => setCallRecordingFinderOpen(false)} hitSlop={8}>
                <Text style={styles.closeInlinePanel}>닫기</Text>
              </Pressable>
            </View>
            <CallRecordingFinder
              personId={person.id}
              phone={person.phone}
              onSummarySaved={() => setTimelineRefreshKey((k) => k + 1)}
            />
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>대화 기록</Text>
          <ConversationTimeline key={timelineRefreshKey} personId={person.id} />
        </View>
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setActionSheetOpen(true)}>
        <Text style={styles.fabIcon}>🎙</Text>
      </Pressable>

      <Modal visible={actionSheetOpen} transparent animationType="fade">
        <Pressable style={styles.backdrop} onPress={() => setActionSheetOpen(false)}>
          <View style={styles.actionSheet}>
            <View style={styles.actionGrid}>
              <Pressable
                style={styles.actionTile}
                onPress={() => {
                  setActionSheetOpen(false);
                  // Only registered stack routes (e.g. the Home tab) can push
                  // ConversationRecord today; inline (list) mode has no route for it yet.
                  if (!onBack) {
                    navigation.navigate('ConversationRecord', { personId: person.id, mode: 'record' });
                  }
                }}
              >
                <Text style={styles.actionTileIcon}>🎙</Text>
                <Text style={styles.actionTileLabel}>녹음</Text>
              </Pressable>
              <Pressable
                style={styles.actionTile}
                onPress={() => {
                  setActionSheetOpen(false);
                  setCallRecordingFinderOpen(true);
                }}
              >
                <Text style={styles.actionTileIcon}>📼</Text>
                <Text style={styles.actionTileLabel}>자동검색</Text>
              </Pressable>
              <Pressable
                style={styles.actionTile}
                onPress={() => {
                  setActionSheetOpen(false);
                  // mode: 'upload' makes ConversationRecordScreen lead with the file picker
                  // instead of the record button (#24/#25).
                  if (!onBack) {
                    navigation.navigate('ConversationRecord', { personId: person.id, mode: 'upload' });
                  }
                }}
              >
                <Text style={styles.actionTileIcon}>📁</Text>
                <Text style={styles.actionTileLabel}>파일 올리기</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  stateText: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 40,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  back: {
    color: colors.textSecondary,
    fontSize: typography.body.fontSize,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 96,
    gap: 12,
  },
  profile: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  name: {
    fontSize: typography.personName.fontSize,
    fontWeight: typography.personName.fontWeight,
    color: colors.textPrimary,
  },
  meta: {
    fontSize: typography.meta.fontSize,
    color: colors.textQuaternary,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    padding: 16,
    gap: 8,
  },
  sectionLabel: {
    fontSize: typography.sectionLabel.fontSize,
    fontWeight: typography.sectionLabel.fontWeight,
    letterSpacing: typography.sectionLabel.letterSpacing,
    color: colors.textTertiary,
  },
  contactLine: {
    fontSize: typography.body.fontSize,
    color: colors.secondary,
  },
  contactLineMuted: {
    fontSize: typography.body.fontSize,
    color: colors.textMuted,
  },
  callRecordingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeInlinePanel: {
    fontSize: typography.meta.fontSize,
    color: colors.textQuaternary,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: size.fab,
    height: size.fab,
    borderRadius: radius.fab,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: {
    fontSize: 22,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: colors.surface3,
    borderTopLeftRadius: radius.bottomSheet,
    borderTopRightRadius: radius.bottomSheet,
    padding: 16,
    paddingBottom: 28,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  actionTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 18,
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
  },
  actionTileIcon: {
    fontSize: 22,
  },
  actionTileLabel: {
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
