import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CallAlertButton } from '@/features/call-alert/components/CallAlertButton';
import { colors, typography } from '@/shared/theme';

import {
  approveIntroductionRequest,
  declineIntroductionRequest,
  fetchGraph,
  fetchIncomingIntroductionRequests,
  fetchMutualConnectionCount,
  requestIntroduction,
} from '../api/graphApi';
import { GraphCanvas } from '../components/GraphCanvas';
import { IntroductionBell } from '../components/IntroductionBell';
import { IntroductionRequestsSheet } from '../components/IntroductionRequestsSheet';
import { PersonBottomSheet } from '../components/PersonBottomSheet';
import { SearchFilterBar } from '../components/SearchFilterBar';
import type {
  GraphData,
  GraphNode,
  IncomingIntroductionRequest,
  JobClass,
  JobFilter,
} from '../types';

const EMPTY_GRAPH: GraphData = {
  nodes: [],
  edges: [],
  stats: { degree1Count: 0, degree2Count: 0 },
};

// Kept local (rather than imported from navigation/RootNavigator) so this
// screen doesn't couple to the exact GraphStack setup — same pattern
// PersonDetailScreen itself uses for its own route params.
type GraphStackParamList = {
  GraphHome: undefined;
  PersonDetail: { personId: number };
  CallAlert: undefined;
};

export default function GraphScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<GraphStackParamList>>();
  const [graphData, setGraphData] = useState<GraphData>(EMPTY_GRAPH);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [query, setQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState<JobFilter>('all');
  const [selectedPerson, setSelectedPerson] = useState<GraphNode | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<IncomingIntroductionRequest[]>([]);
  const [isRequestsSheetOpen, setIsRequestsSheetOpen] = useState(false);
  const [mutualCounts, setMutualCounts] = useState<Record<number, number>>({});

  useEffect(() => {
    let cancelled = false;

    setLoadState('loading');
    fetchGraph()
      .then((data) => {
        if (cancelled) return;
        setGraphData(data);
        setLoadState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState('error');
      });

    fetchIncomingIntroductionRequests()
      .then((requests) => {
        if (!cancelled) setIncomingRequests(requests);
      })
      .catch(() => {
        // Non-critical — the bell just stays hidden if this fails.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedPerson || selectedPerson.type !== 'person') return;
    if (mutualCounts[selectedPerson.id] !== undefined) return;

    let cancelled = false;
    fetchMutualConnectionCount(selectedPerson.id)
      .then((count) => {
        if (!cancelled) setMutualCounts((current) => ({ ...current, [selectedPerson.id]: count }));
      })
      .catch(() => {
        // Leave it unset — the stat tile just falls back to 0.
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPerson, mutualCounts]);

  const displayedPerson = useMemo(() => {
    if (!selectedPerson) return null;
    const mutualCount = mutualCounts[selectedPerson.id];
    return mutualCount === undefined ? selectedPerson : { ...selectedPerson, mutualCount };
  }, [selectedPerson, mutualCounts]);

  const availableJobs = useMemo(() => {
    const jobs = new Set<JobClass>();
    graphData.nodes.forEach((node) => {
      if (node.jobClass) jobs.add(node.jobClass);
    });
    return [...jobs].sort();
  }, [graphData]);

  // Nodes/edges never leave the graph on filter — the spec calls for a
  // 250ms fade to 18% opacity, not removal, so GraphCanvas gets the full
  // data set plus which person ids currently match.
  const matchedPersonIds = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const matches = (node: GraphNode) => {
      if (selectedJob !== 'all' && node.jobClass !== selectedJob) return false;
      if (!normalizedQuery) return true;
      const haystack = `${node.name} ${node.company ?? ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    };

    const ids = new Set<number>();
    graphData.nodes.forEach((node) => {
      if (node.type === 'person' && matches(node)) ids.add(node.id);
    });
    return ids;
  }, [graphData, query, selectedJob]);

  const closestConnections = useMemo(() => {
    return graphData.nodes
      .filter((node) => node.type === 'person')
      .slice()
      .sort((a, b) => (b.conversationCount ?? 0) - (a.conversationCount ?? 0))
      .slice(0, 2);
  }, [graphData]);

  const handleViewProfile = (person: GraphNode) => {
    setSelectedPerson(null);
    navigation.navigate('PersonDetail', { personId: person.id });
  };

  const handleViewMutual = (_person: GraphNode) => {
    setSelectedPerson(null);
  };

  const handleCanvasLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvasSize({ width, height });
  };

  const applyIntroductionStatus = (
    personId: number,
    status: GraphNode['introductionRequestStatus']
  ) => {
    setGraphData((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === personId ? { ...node, introductionRequestStatus: status } : node
      ),
    }));
    setSelectedPerson((current) =>
      current && current.id === personId
        ? { ...current, introductionRequestStatus: status }
        : current
    );
  };

  const handleRequestIntroduction = (person: GraphNode) => {
    requestIntroduction(person.id)
      .then((status) => applyIntroductionStatus(person.id, status))
      .catch(() => {
        // Leave the button as-is — the person can just tap it again.
      });
  };

  const handleApproveRequest = (personId: number) => {
    approveIntroductionRequest(personId)
      .then(() => {
        setIncomingRequests((current) =>
          current.filter((request) => request.personId !== personId)
        );
      })
      .catch(() => {
        // Leave it in the list — the person can just tap approve again.
      });
  };

  const handleDeclineRequest = (personId: number) => {
    declineIntroductionRequest(personId)
      .then(() => {
        setIncomingRequests((current) =>
          current.filter((request) => request.personId !== personId)
        );
      })
      .catch(() => {
        // Leave it in the list — the person can just tap decline again.
      });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>관계도</Text>
          <Text style={styles.subtitle}>
            1촌 {graphData.stats.degree1Count}명 · 2촌 {graphData.stats.degree2Count}명
          </Text>
        </View>
        <View style={styles.headerActions}>
          <CallAlertButton onPress={() => navigation.navigate('CallAlert')} />
          <IntroductionBell
            count={incomingRequests.length}
            onPress={() => setIsRequestsSheetOpen(true)}
          />
        </View>
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
        {loadState === 'loading' && (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
        {loadState === 'error' && (
          <View style={styles.centerState}>
            <Text style={styles.centerStateText}>관계도를 불러오지 못했어요</Text>
          </View>
        )}
        {loadState === 'ready' && canvasSize.width > 0 && (
          <GraphCanvas
            data={graphData}
            width={canvasSize.width}
            height={canvasSize.height}
            selectedPersonId={selectedPerson?.id ?? null}
            matchedPersonIds={matchedPersonIds}
            onSelectPerson={setSelectedPerson}
          />
        )}
      </View>

      {loadState === 'ready' && closestConnections.length > 0 && (
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
      )}

      <PersonBottomSheet
        person={displayedPerson}
        onClose={() => setSelectedPerson(null)}
        onViewProfile={handleViewProfile}
        onViewMutual={handleViewMutual}
        onRequestIntroduction={handleRequestIntroduction}
      />

      <IntroductionRequestsSheet
        visible={isRequestsSheetOpen}
        requests={incomingRequests}
        onClose={() => setIsRequestsSheetOpen(false)}
        onApprove={handleApproveRequest}
        onDecline={handleDeclineRequest}
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  headerText: {
    gap: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerStateText: {
    color: colors.textTertiary,
    fontSize: typography.body.fontSize,
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
