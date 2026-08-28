import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/shared/components/Button';
import { colors, radius, typography } from '@/shared/theme';

import CallDetector from '../../../../modules/call-detector';
import { useCallAlertPermissions } from '../hooks/useCallAlertPermissions';
import { useCallAlertSync } from '../hooks/useCallAlertSync';

// Kept local (rather than imported from navigation/RootNavigator) so this feature does
// not depend on the shared navigator's types — same approach GraphScreen uses.
type ConsentNavigation = NativeStackNavigationProp<{
  Tabs: undefined;
  CallAlertConsent: undefined;
}>;

const REASONS = [
  {
    icon: '📞',
    title: '전화번호 확인',
    body: '전화가 오면 저장된 인맥인지 대조합니다. 저장되지 않은 번호는 아무것도 표시하지 않고, 기록도 남기지 않아요.',
  },
  {
    icon: '💬',
    title: '마지막 대화 요약',
    body: '누구인지와 함께 마지막으로 나눈 대화의 한 줄 요약을 알림에 보여줍니다.',
  },
  {
    icon: '📶',
    title: '통신사 신호가 없어도',
    body: '알림에 필요한 정보는 앱을 열 때 미리 받아 기기에만 저장합니다. 전화가 오는 순간에는 서버에 연결하지 않아요.',
  },
];

export default function CallAlertConsentScreen() {
  const navigation = useNavigation<ConsentNavigation>();
  const { granted, request, supported } = useCallAlertPermissions();
  const { cachedCount, syncing, error } = useCallAlertSync(granted);

  // Answering the screen either way retires it: the navigator only opens on it while the
  // flag is unset, so without marking it the app would start here every launch.
  const dismiss = useCallback(() => {
    CallDetector.markConsentPromptSeen();
    // On a fresh install this is the app's first route, so there is nothing to go back
    // to — replace. goBack covers the case where the 관계도 header pushed it.
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace('Tabs');
  }, [navigation]);

  if (!supported) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.title}>안드로이드에서만 사용할 수 있어요</Text>
          <Text style={styles.body}>
            iOS는 앱이 수신 전화 정보를 읽는 것을 허용하지 않아, 이 기능은 안드로이드에서만 동작합니다.
          </Text>
          <Button label="앱으로 이동" onPress={dismiss} style={styles.action} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>전화가 오면{'\n'}누구인지 알려드릴까요?</Text>
        <Text style={styles.subtitle}>
          저장된 인맥에게 전화가 오면, 마지막으로 나눈 대화를 알림으로 먼저 보여드려요.
        </Text>

        <View style={styles.reasons}>
          {REASONS.map((reason) => (
            <View key={reason.title} style={styles.reason}>
              <Text style={styles.reasonIcon}>{reason.icon}</Text>
              <View style={styles.reasonText}>
                <Text style={styles.reasonTitle}>{reason.title}</Text>
                <Text style={styles.body}>{reason.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {granted ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>사용 중이에요</Text>
            <Text style={styles.body}>
              {syncing
                ? '인맥 정보를 불러오는 중이에요…'
                : `인맥 ${cachedCount}명의 정보를 이 기기에 저장해두었어요.`}
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        ) : null}

        {granted ? (
          <Button label="시작하기" onPress={dismiss} style={styles.action} />
        ) : (
          <>
            <Button label="알림 받기" onPress={request} style={styles.action} />
            <Button label="나중에 할게요" variant="text" onPress={dismiss} />
            <Text style={styles.footnote}>
              전화 상태·통화 기록·알림 권한이 필요합니다. 통화 기록 권한이 없으면 안드로이드가
              발신번호를 가려서 누구인지 확인할 수 없어요.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 20, gap: 16 },
  centered: { flex: 1, justifyContent: 'center', padding: 20, gap: 12 },
  title: { ...typography.greeting, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, lineHeight: 21 },
  reasons: { gap: 14, marginTop: 4 },
  reason: { flexDirection: 'row', gap: 12 },
  reasonIcon: { fontSize: 18 },
  reasonText: { flex: 1, gap: 3 },
  reasonTitle: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  body: { ...typography.meta, color: colors.textTertiary, lineHeight: 18 },
  action: { marginTop: 4 },
  statusCard: {
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 16,
    gap: 6,
  },
  statusTitle: { ...typography.body, fontWeight: '700', color: colors.secondary },
  footnote: { ...typography.meta, color: colors.textMuted, lineHeight: 17 },
  error: { ...typography.meta, color: colors.warning, lineHeight: 17 },
});
