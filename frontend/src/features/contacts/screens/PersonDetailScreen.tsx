import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, size, typography } from '@/shared/theme';

import { deleteContact, updatePerson, type UpdatePersonInput } from '../api';
import CallRecordingFinder from '../components/CallRecordingFinder';
import { CategoryChip } from '../components/CategoryChip';
import { ConversationTimeline } from '../components/ConversationTimeline';
import { JobBadge } from '../components/JobBadge';
import { RelationBadge } from '../components/RelationBadge';
import { usePersonDetail } from '../hooks/usePersonDetail';
import { RELATION_LABELS } from '../jobLabels';
import type { RelationCategory } from '../types';

const RELATION_OPTIONS: RelationCategory[] = ['client', 'partner', 'networking', 'other'];

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
  const { person, loading, error, refetch } = usePersonDetail(personId ?? -1);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [callRecordingFinderOpen, setCallRecordingFinderOpen] = useState(false);
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<UpdatePersonInput>({});
  const goBack = onBack ?? (() => navigation.goBack());

  if (personId === undefined || loading || !person) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.stateText}>{error ? '불러오지 못했어요' : '불러오는 중…'}</Text>
      </SafeAreaView>
    );
  }

  const meta = [person.title, person.company].filter(Boolean).join(' · ');

  const startEditing = () => {
    setForm({
      name: person.name,
      company: person.company ?? '',
      department: person.department ?? '',
      title: person.title ?? '',
      phone: person.phone ?? '',
      email: person.email ?? '',
      relation: person.relation,
      context: person.context ?? '',
    });
    setEditing(true);
  };

  const setField = (key: keyof UpdatePersonInput, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSaveEdit = async () => {
    if (!form.name?.trim()) {
      Alert.alert('이름을 입력해주세요', '이름은 비워둘 수 없어요.');
      return;
    }
    setSaving(true);
    try {
      await updatePerson(person.id, form);
      await refetch();
      setEditing(false);
    } catch {
      Alert.alert('오류', '저장하지 못했어요. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('연락처 삭제', `${person.name}님을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await deleteContact(person.id);
          goBack();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={12}>
          <Text style={styles.back}>‹ 뒤로</Text>
        </Pressable>
        {editing ? (
          <View style={styles.headerActions}>
            <Pressable onPress={() => setEditing(false)} hitSlop={8} disabled={saving}>
              <Text style={styles.headerActionMuted}>취소</Text>
            </Pressable>
            <Pressable onPress={handleSaveEdit} hitSlop={8} disabled={saving}>
              <Text style={styles.headerAction}>{saving ? '저장 중…' : '저장'}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {editing ? (
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>이름</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(v) => setField('name', v)}
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.fieldLabel}>회사</Text>
            <TextInput
              style={styles.input}
              value={form.company ?? ''}
              onChangeText={(v) => setField('company', v)}
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.fieldLabel}>부서</Text>
            <TextInput
              style={styles.input}
              value={form.department ?? ''}
              onChangeText={(v) => setField('department', v)}
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.fieldLabel}>직급</Text>
            <TextInput
              style={styles.input}
              value={form.title ?? ''}
              onChangeText={(v) => setField('title', v)}
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.fieldLabel}>전화번호</Text>
            <TextInput
              style={styles.input}
              value={form.phone ?? ''}
              onChangeText={(v) => setField('phone', v)}
              keyboardType="phone-pad"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.fieldLabel}>이메일</Text>
            <TextInput
              style={styles.input}
              value={form.email ?? ''}
              onChangeText={(v) => setField('email', v)}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.fieldLabel}>관계</Text>
            <View style={styles.relationRow}>
              {RELATION_OPTIONS.map((option) => (
                <CategoryChip
                  key={option}
                  label={RELATION_LABELS[option]}
                  active={form.relation === option}
                  onPress={() => setForm((prev) => ({ ...prev, relation: option }))}
                />
              ))}
            </View>
            <Text style={styles.fieldLabel}>만난 컨텍스트</Text>
            <TextInput
              style={styles.input}
              value={form.context ?? ''}
              onChangeText={(v) => setField('context', v)}
              placeholderTextColor={colors.textMuted}
            />
          </View>
        ) : (
          <>
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
          </>
        )}

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

      {actionSheetOpen ? (
        <Pressable style={styles.speedDialBackdrop} onPress={() => setActionSheetOpen(false)} />
      ) : null}

      {actionSheetOpen ? (
        <View style={styles.speedDialMenu}>
          <Pressable
            style={styles.speedDialItem}
            onPress={() => {
              setActionSheetOpen(false);
              startEditing();
            }}
          >
            <Text style={styles.speedDialIcon}>✏️</Text>
            <Text style={styles.speedDialLabel}>수정</Text>
          </Pressable>
          <Pressable
            style={styles.speedDialItem}
            onPress={() => {
              setActionSheetOpen(false);
              handleDelete();
            }}
          >
            <Text style={styles.speedDialIcon}>🗑</Text>
            <Text style={[styles.speedDialLabel, styles.speedDialLabelDanger]}>삭제</Text>
          </Pressable>
          <Pressable
            style={styles.speedDialItem}
            onPress={() => {
              setActionSheetOpen(false);
              setCallRecordingFinderOpen(true);
            }}
          >
            <Text style={styles.speedDialIcon}>📼</Text>
            <Text style={styles.speedDialLabel}>자동검색</Text>
          </Pressable>
          <Pressable
            style={styles.speedDialItem}
            onPress={() => {
              setActionSheetOpen(false);
              // ConversationRecordScreen offers both live recording and file upload
              // (AudioPickerCard) — mode: 'record' just picks which one it leads with.
              // Only registered stack routes (e.g. the Home tab) can push
              // ConversationRecord today; inline (list) mode has no route for it yet.
              if (!onBack) {
                navigation.navigate('ConversationRecord', { personId: person.id, mode: 'record' });
              }
            }}
          >
            <Text style={styles.speedDialIcon}>🎙</Text>
            <Text style={styles.speedDialLabel}>녹음</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable style={styles.fab} onPress={() => setActionSheetOpen((open) => !open)}>
        <Text style={styles.fabIcon}>{actionSheetOpen ? '✕' : '+'}</Text>
      </Pressable>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  back: {
    color: colors.textSecondary,
    fontSize: typography.body.fontSize,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 16,
  },
  headerAction: {
    color: colors.secondary,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
  headerActionMuted: {
    color: colors.textQuaternary,
    fontSize: typography.body.fontSize,
  },
  headerActionDanger: {
    color: colors.gameAccent,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: typography.sectionLabel.fontSize,
    fontWeight: typography.sectionLabel.fontWeight,
    letterSpacing: typography.sectionLabel.letterSpacing,
    color: colors.textTertiary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    marginBottom: 14,
  },
  relationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
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
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '600',
  },
  // Invisible, full-screen — only there to close the speed-dial menu on an outside tap.
  speedDialBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  speedDialMenu: {
    position: 'absolute',
    right: 20,
    bottom: 24 + size.fab + 12,
    gap: 8,
    alignItems: 'flex-end',
  },
  speedDialItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface3,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  speedDialIcon: {
    fontSize: 18,
  },
  speedDialLabel: {
    fontSize: typography.body.fontSize,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  speedDialLabelDanger: {
    color: colors.gameAccent,
  },
});
