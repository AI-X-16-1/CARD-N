import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

import type { ConversationSummary, SummaryContextPerson } from '../types';

// Below this the model is telling us it probably misheard the name, so the
// confidence gets flagged rather than quietly rendered as fact.
const SHAKY_CONFIDENCE = 0.7;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {children}
    </View>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>·</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

type Props = {
  summary: ConversationSummary;
  person: SummaryContextPerson | null;
  historyUsed: number;
  model: string;
  elapsed: number;
};

export function SummaryPanel({ summary, person, historyUsed, model, elapsed }: Props) {
  return (
    <View style={styles.panel}>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>✦ 한 줄 요약</Text>
        <Text style={styles.heroText}>{summary.one_line}</Text>
      </View>

      {summary.key_points.length > 0 ? (
        <Section title="핵심 내용">
          {summary.key_points.map((point, index) => (
            <Bullet key={index}>{point}</Bullet>
          ))}
        </Section>
      ) : null}

      {summary.mentioned_people.length > 0 ? (
        <Section title="언급된 인물 · 관계도 후보">
          {summary.mentioned_people.map((mention, index) => (
            <View key={index} style={styles.mentionRow}>
              <Text style={styles.mentionName}>{mention.name}</Text>
              <Text style={styles.mentionRelation}>{mention.relation}</Text>
              <Text
                style={[
                  styles.mentionConfidence,
                  mention.confidence < SHAKY_CONFIDENCE && styles.mentionShaky,
                ]}
              >
                {Math.round((mention.confidence ?? 0) * 100)}%
              </Text>
            </View>
          ))}
        </Section>
      ) : null}

      {summary.keywords.length > 0 ? (
        <View style={styles.tags}>
          {summary.keywords.map((keyword, index) => (
            <Text key={index} style={styles.tag}>
              #{keyword}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.meta}>
        <Text style={styles.metaText}>{model}</Text>
        <Text style={styles.metaText}>{elapsed.toFixed(1)}초</Text>
        {person ? <Text style={styles.metaText}>{person.meet_count}번째 만남</Text> : null}
        <Text style={styles.metaText}>지난 대화 {historyUsed}건 참고</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    padding: 16,
    gap: 16,
  },
  hero: {
    backgroundColor: 'rgba(108,92,231,0.14)',
    borderRadius: radius.card,
    padding: 14,
    gap: 6,
  },
  heroLabel: {
    fontSize: typography.micro.fontSize,
    fontWeight: typography.micro.fontWeight,
    letterSpacing: 0.8,
    color: colors.primaryLight,
  },
  heroText: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: 21,
    color: colors.textPrimary,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: typography.sectionLabel.fontSize,
    fontWeight: typography.sectionLabel.fontWeight,
    letterSpacing: typography.sectionLabel.letterSpacing,
    color: colors.textTertiary,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
  },
  bulletDot: {
    fontSize: typography.body.fontSize,
    color: colors.textMuted,
  },
  bulletText: {
    flex: 1,
    fontSize: typography.body.fontSize,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mentionName: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  mentionRelation: {
    flex: 1,
    fontSize: typography.meta.fontSize,
    color: colors.textQuaternary,
  },
  mentionConfidence: {
    fontSize: typography.meta.fontSize,
    color: colors.textMuted,
  },
  mentionShaky: {
    color: colors.gameAccent,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    fontSize: typography.meta.fontSize,
    color: colors.primaryLight,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 12,
  },
  metaText: {
    fontSize: typography.meta.fontSize,
    color: colors.textMuted,
  },
});
