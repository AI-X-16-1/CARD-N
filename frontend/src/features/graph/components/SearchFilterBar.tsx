import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import type { JobClass, JobFilter } from '../types';

const JOB_LABEL: Record<JobClass, string> = {
  dev: '개발',
  marketing: '마케팅',
  design: '디자인',
  hr: '인사',
  finance: '재무',
  legal: '법무',
  sales: '영업',
  pm: '기획',
};

type Props = {
  query: string;
  onChangeQuery: (text: string) => void;
  availableJobs: JobClass[];
  selectedJob: JobFilter;
  onSelectJob: (job: JobFilter) => void;
};

export function SearchFilterBar({
  query,
  onChangeQuery,
  availableJobs,
  selectedJob,
  onSelectJob,
}: Props) {
  const filters: JobFilter[] = ['all', ...availableJobs];

  return (
    <View style={styles.container}>
      <TextInput
        value={query}
        onChangeText={onChangeQuery}
        placeholder="이름, 회사, 태그로 검색"
        placeholderTextColor={colors.textQuaternary}
        style={styles.searchInput}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {filters.map((filter) => {
          const isActive = filter === selectedJob;
          const label = filter === 'all' ? '전체' : JOB_LABEL[filter];
          return (
            <Pressable
              key={filter}
              onPress={() => onSelectJob(filter)}
              style={[styles.chip, isActive && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  searchInput: {
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
  },
  chipRow: {
    gap: 8,
    paddingRight: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipLabel: {
    color: colors.textSecondary,
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
  },
  chipLabelActive: {
    color: colors.textPrimary,
  },
});
