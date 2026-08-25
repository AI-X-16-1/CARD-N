import { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, typography } from '@/shared/theme';

import { GraphCanvas } from '../components/GraphCanvas';
import { PersonBottomSheet } from '../components/PersonBottomSheet';
import { SearchFilterBar } from '../components/SearchFilterBar';
import { mockGraphData } from '../data/mockGraph';
import type { GraphNode, JobClass, JobFilter } from '../types';

export default function GraphScreen() {
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [query, setQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState<JobFilter>('all');
  const [selectedPerson, setSelectedPerson] = useState<GraphNode | null>(null);

  const availableJobs = useMemo(() => {
    const jobs = new Set<JobClass>();
    mockGraphData.nodes.forEach((node) => {
      if (node.jobClass) jobs.add(node.jobClass);
    });
    return [...jobs].sort();
  }, []);

  const filteredData = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const matches = (node: GraphNode) => {
      if (node.type === 'me') return true;
      if (selectedJob !== 'all' && node.jobClass !== selectedJob) return false;
      if (!normalizedQuery) return true;
      const haystack = `${node.name} ${node.company ?? ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    };

    const nodes = mockGraphData.nodes.filter(matches);
    const visibleIds = new Set(nodes.map((node) => node.id));
    const edges = mockGraphData.edges.filter(
      (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)
    );

    return { nodes, edges, stats: mockGraphData.stats };
  }, [query, selectedJob]);

  const closestConnections = useMemo(() => {
    return mockGraphData.nodes
      .filter((node) => node.type === 'person')
      .slice()
      .sort((a, b) => (b.conversationCount ?? 0) - (a.conversationCount ?? 0))
      .slice(0, 2);
  }, []);

  const handleViewProfile = (_person: GraphNode) => {
    // Person Detail lives on the Home tab's stack; GraphScreen isn't
    // nested in a stack yet (see CLAUDE.md's 2+-approval note on
    // frontend/src/navigation/), so real navigation is wired once that
    // shared change lands. For now, just dismiss the sheet.
    setSelectedPerson(null);
  };

  const handleViewMutual = (_person: GraphNode) => {
    setSelectedPerson(null);
  };

  const handleCanvasLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvasSize({ width, height });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>관계도</Text>
        <Text style={styles.subtitle}>1촌 {mockGraphData.stats.degree1Count}명</Text>
      </View>

      <View style={styles.searchFilterWrap}>
        <SearchFilterBar
          query={query}
          onChangeQuery={setQuery}
          availableJobs={availableJobs}
          selectedJob={selectedJob}
          onSelectJob={setSelectedJob}
        />
      </View>

      <View style={styles.canvasWrap} onLayout={handleCanvasLayout}>
        {canvasSize.width > 0 && (
          <GraphCanvas
            data={filteredData}
            width={canvasSize.width}
            height={canvasSize.height}
            selectedPersonId={selectedPerson?.id ?? null}
            onSelectPerson={setSelectedPerson}
          />
        )}
      </View>

      <View style={styles.closestOverlay}>
        <View style={styles.closestHeaderRow}>
          <Text style={styles.closestTitle}>가장 가까운 사람</Text>
          <Text style={styles.closestViewAll}>전체 보기</Text>
        </View>
        <View style={styles.closestCards}>
          {closestConnections.map((person) => (
            <View key={person.id} style={styles.closestCard}>
              <Text style={styles.closestName}>{person.name}</Text>
              <Text style={styles.closestMeta}>
                대화 {person.conversationCount ?? 0}회 · {person.lastConversationLabel}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <PersonBottomSheet
        person={selectedPerson}
        onClose={() => setSelectedPerson(null)}
        onViewProfile={handleViewProfile}
        onViewMutual={handleViewMutual}
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
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 4,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.screenTitle.fontSize,
    fontWeight: typography.screenTitle.fontWeight,
  },
  subtitle: {
    color: colors.textTertiary,
    fontSize: typography.meta.fontSize,
  },
  searchFilterWrap: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  canvasWrap: {
    flex: 1,
  },
  closestOverlay: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.surface1,
    gap: 12,
  },
  closestHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closestTitle: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  closestViewAll: {
    color: colors.textTertiary,
    fontSize: typography.meta.fontSize,
  },
  closestCards: {
    flexDirection: 'row',
    gap: 10,
  },
  closestCard: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.surface2,
    gap: 4,
  },
  closestName: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
  closestMeta: {
    color: colors.textTertiary,
    fontSize: typography.micro.fontSize,
  },
});
