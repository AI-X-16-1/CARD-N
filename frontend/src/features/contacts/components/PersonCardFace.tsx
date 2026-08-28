import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Circle } from 'react-native-svg';

import { colors, radius, typography } from '@/shared/theme';
import { Logo } from '@/shared/components/Logo';

import { jobColor, jobLabel, RELATION_LABELS } from '../jobLabels';
import type { Person } from '../types';

// Mirrors features/home/components/MyBusinessCard.tsx's CardFace visual (same gradient,
// decoration, and top/middle/bottom layout) so a generated card for a contact reads as
// "the same kind of digital card" as the user's own — duplicated rather than imported
// per frontend/CLAUDE.md's feature-folder boundary rule (see this screen's
// getIntroductionRow comment in PersonDetailScreen.tsx for the same pattern).

function personPositionLine(person: Person): string {
  return [person.department, person.title].filter(Boolean).join(' · ');
}

// Same MECARD shape as home's myCardToMecard.
function personToMecard(person: Person): string | null {
  if (!person.name.trim()) return null;
  const note = [person.department, person.title].filter(Boolean).join(' ');
  const fields: [string, string][] = [
    ['N', person.name],
    ['ORG', person.company ?? ''],
    ['TEL', person.phone ?? ''],
    ['EMAIL', person.email ?? ''],
    ['ADR', [person.address, person.address_detail].filter(Boolean).join(' ')],
    ['NOTE', note],
  ];
  const body = fields
    .filter(([, value]) => value.trim())
    .map(([key, value]) => `${key}:${value.replace(/[\\;:]/g, '\\$&')};`)
    .join('');
  return `MECARD:${body};`;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type Props = {
  person: Person;
  // Layered after styles.card so callers can resize (e.g. PersonDetailScreen's 70%-width
  // profile slot) without clobbering the radius/border/padding that make this look like
  // the home card — StyleSheet array merging only overrides keys a later object sets.
  style?: StyleProp<ViewStyle>;
  qrSize?: number;
};

// A "제작 명함" (generated card) view of a contact — built from their saved fields
// rather than the scanned image, in the same visual style as the user's own digital
// business card on Home. Lets PersonDetailScreen offer it as an alternative to the
// scanned card image (see ui-spec.md §5's profile header).
export function PersonCardFace({ person, style, qrSize = 38 }: Props) {
  const mecard = personToMecard(person);
  const qrBoxSize = qrSize + 6;
  return (
    <LinearGradient
      colors={['#1c1c30', '#12121e', '#171728']}
      locations={[0, 0.55, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0.9 }}
      style={[styles.card, style]}
    >
      <Svg width={80} height={80} style={styles.decoration}>
        <Circle cx={70} cy={70} r={20} stroke={colors.borderMedium} strokeWidth={1} fill="none" />
        <Circle cx={70} cy={70} r={34} stroke={colors.borderLight} strokeWidth={1} fill="none" />
      </Svg>

      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <Logo size={14} />
          <Text style={styles.companyLabel}>{person.company || 'CARD:N'}</Text>
        </View>
        <Text style={styles.digitalLabel}>DIGITAL CARD</Text>
      </View>

      <View style={styles.middle}>
        <Text style={styles.name}>{person.name}</Text>
        <Text style={styles.title}>{personPositionLine(person)}</Text>
        <View style={styles.tagRow}>
          <Text style={[styles.tag, { color: jobColor(person.job_class) }]}>
            {jobLabel(person.job_class)}
          </Text>
          <Text style={styles.tagDivider}>·</Text>
          <Text style={styles.tag}>{RELATION_LABELS[person.relation]}</Text>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <View>
          {!!person.phone && <Text style={styles.contact}>{person.phone}</Text>}
          {!!person.email && <Text style={styles.contact}>{person.email}</Text>}
          {!!person.address && (
            <Text style={styles.contact} numberOfLines={1}>
              {person.address}
              {person.address_detail ? ` ${person.address_detail}` : ''}
              {person.postal_code ? ` (${person.postal_code})` : ''}
            </Text>
          )}
        </View>
        {mecard ? (
          // Strong light/dark contrast for scan reliability regardless of the app's dark
          // theme — matches home's CardFace QR treatment.
          <View style={[styles.qrWrap, { width: qrBoxSize, height: qrBoxSize }]}>
            <QRCode value={mecard} size={qrSize} backgroundColor={colors.textPrimary} color={colors.canvas} />
          </View>
        ) : (
          <View style={[styles.qrPlaceholder, { width: qrBoxSize, height: qrBoxSize }]} />
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 1.7,
    borderRadius: radius.myCard,
    borderWidth: 1,
    borderColor: hexToRgba(colors.primary, 0.4),
    padding: 16,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  decoration: {
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  companyLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  digitalLabel: {
    color: colors.textSubtle,
    fontSize: 9,
    fontFamily: 'monospace',
  },
  middle: {
    gap: 2,
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.cardName.fontSize,
    fontWeight: typography.cardName.fontWeight,
  },
  title: {
    color: colors.primaryLight,
    fontSize: 12,
    fontWeight: '600',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  tag: {
    color: colors.textQuaternary,
    fontSize: 10,
    fontWeight: '600',
  },
  tagDivider: {
    color: colors.textSubtle,
    fontSize: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  contact: {
    color: colors.textSecondary,
    fontSize: 10.5,
  },
  qrPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderMedium,
  },
  qrWrap: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
});
