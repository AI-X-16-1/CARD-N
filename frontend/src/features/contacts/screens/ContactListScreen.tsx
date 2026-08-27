import { useCallback } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, radius, typography } from '@/shared/theme';
import type { ListStackParamList } from '@/navigation/RootNavigator';

import { CategoryChip } from '../components/CategoryChip';
import { ContactRow } from '../components/ContactRow';
import { deleteContact } from '../api';
import { useContactList } from '../hooks/useContactList';
import { RELATION_LABELS } from '../jobLabels';
import type { Person, RelationFilter } from '../types';

const CATEGORIES: RelationFilter[] = ['all', 'client', 'partner', 'networking', 'other'];

export default function ContactListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ListStackParamList, 'ContactList'>>();
  const { total, contacts, loading, query, setQuery, category, setCategory, refetch } =
    useContactList();

  // Refetch on focus so a contact saved via the Scan modal, or edited/deleted from
  // PersonDetail, shows up as soon as this list is back in view.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const openPerson = (person: Person) => navigation.navigate('PersonDetail', { personId: person.id });

  const confirmDeletePerson = (person: Person) => {
    Alert.alert('연락처 삭제', `${person.name}님을 목록에서 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await deleteContact(person.id);
          refetch();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>전체 목록</Text>
        <Text style={styles.count}>{total}명 · 길게 눌러 삭제</Text>
      </View>

      <TextInput
        style={styles.search}
        placeholder="이름, 회사, 태그로 검색"
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
      />

      <FlatList
        data={CATEGORIES}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item}
        style={styles.chipList}
        contentContainerStyle={styles.chipListContent}
        renderItem={({ item }) => (
          <CategoryChip
            label={RELATION_LABELS[item]}
            active={category === item}
            onPress={() => setCategory(item)}
          />
        )}
      />

      <FlatList
        data={contacts}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <ContactRow person={item} onPress={openPerson} onLongPress={confirmDeletePerson} />
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>검색 결과가 없어요</Text>
            </View>
          ) : null
        }
      />
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
    alignItems: 'baseline',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontSize: typography.screenTitle.fontSize,
    fontWeight: typography.screenTitle.fontWeight,
    color: colors.textPrimary,
  },
  count: {
    fontSize: typography.meta.fontSize,
    color: colors.textQuaternary,
  },
  search: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: colors.surface1,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
  },
  chipList: {
    flexGrow: 0,
    marginBottom: 12,
  },
  chipListContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  empty: {
    paddingTop: 64,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.body.fontSize,
  },
});
