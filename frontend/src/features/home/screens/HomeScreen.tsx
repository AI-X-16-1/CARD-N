import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { colors, typography } from '@/shared/theme';
import { Logo } from '@/shared/components/Logo';
import type { HomeStackParamList, TabParamList } from '@/navigation/RootNavigator';

import { MyBusinessCard } from '../components/MyBusinessCard';
import { MyCardSheet } from '../components/MyCardSheet';
import { RecentContactRow } from '../components/RecentContactRow';
import { useMyCard } from '../hooks/useMyCard';
import { useRecentContacts } from '../hooks/useRecentContacts';
import type { RecentPerson } from '../types';

type Navigation = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

export default function HomeScreen() {
  const navigation = useNavigation<Navigation>();
  const { card, save } = useMyCard();
  const { total, newThisWeek, recent, loading } = useRecentContacts();
  const [cardSheetOpen, setCardSheetOpen] = useState(false);

  const openPerson = (person: RecentPerson) => {
    navigation.navigate('PersonDetail', { personId: person.id });
  };

  const openList = () => {
    navigation.getParent<BottomTabNavigationProp<TabParamList>>()?.navigate('목록');
  };

  const initials = card.name.slice(0, 1) || '?';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <Logo size={26} />
            <Text style={styles.brandLabel}>CARD:N</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarLabel}>{initials}</Text>
          </View>
        </View>

        <View style={styles.greeting}>
          <Text style={styles.greetingTitle}>
            안녕하세요, {card.name || '회원'}님
          </Text>
          <Text style={styles.greetingSubtitle}>
            이번 주 새로운 인연 {newThisWeek}명 · 전체 {total}명
          </Text>
        </View>

        <MyBusinessCard card={card} onPress={() => setCardSheetOpen(true)} />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>최근 등록</Text>
          <Pressable onPress={openList}>
            <Text style={styles.sectionLink}>전체보기 ›</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primaryLight} style={styles.loading} />
        ) : recent.length === 0 ? (
          <Text style={styles.emptyText}>아직 등록된 인연이 없어요</Text>
        ) : (
          recent.map((person) => (
            <RecentContactRow key={person.id} person={person} onPress={openPerson} />
          ))
        )}
      </ScrollView>

      <MyCardSheet
        visible={cardSheetOpen}
        card={card}
        onClose={() => setCardSheetOpen(false)}
        onSave={save}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandLabel: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  greeting: {
    marginBottom: 20,
    gap: 4,
  },
  greetingTitle: {
    color: colors.textPrimary,
    fontSize: typography.greeting.fontSize,
    fontWeight: typography.greeting.fontWeight,
  },
  greetingSubtitle: {
    color: colors.textQuaternary,
    fontSize: 13,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    color: colors.textTertiary,
    fontSize: typography.sectionLabel.fontSize,
    fontWeight: typography.sectionLabel.fontWeight,
    letterSpacing: typography.sectionLabel.letterSpacing,
  },
  sectionLink: {
    color: colors.textSecondary,
    fontSize: typography.meta.fontSize,
  },
  loading: {
    marginTop: 16,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.body.fontSize,
    paddingVertical: 16,
  },
});
