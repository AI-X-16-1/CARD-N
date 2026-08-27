import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Circle } from 'react-native-svg';

import { colors, radius, typography } from '@/shared/theme';
import { Logo } from '@/shared/components/Logo';
import type { MyCard } from '../types';

// MECARD is the format most phone camera / QR apps recognize as "add to contacts"
// without needing a dedicated reader app — plain text (a vCard string, a JSON blob,
// ...) just gets treated as a link/search query instead. Empty fields are dropped
// rather than left blank ("N:;TEL:;") so a half-filled card doesn't encode a MECARD
// entry full of empty properties.
function myCardToMecard(card: MyCard): string | null {
  if (!card.name.trim()) return null;
  const note = [card.department, card.grade, card.job_function].filter(Boolean).join(' ');
  const fields: [string, string][] = [
    ['N', card.name],
    ['ORG', card.company],
    ['TEL', card.phone],
    ['EMAIL', card.email],
    ['ADR', card.address],
    ['NOTE', note],
  ];
  const body = fields
    .filter(([, value]) => value.trim())
    .map(([key, value]) => `${key}:${value.replace(/[\\;:]/g, '\\$&')};`)
    .join('');
  return `MECARD:${body};`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 부서/직급/직무 replaced the old single "직함" (title) field — joined into one line so
// the card face keeps the same slot it always had, rather than growing a new row per field.
function positionLine(card: MyCard): string {
  return [card.department, card.grade, card.job_function].filter(Boolean).join(' · ');
}

// Pure card visual — shared by the Home tile (MyBusinessCard, below) and MyCardSheet's
// detail header, so the same card face carries over when the sheet transitions in.
export function CardFace({ card }: { card: MyCard }) {
  const mecard = myCardToMecard(card);
  return (
    <LinearGradient
      colors={['#1c1c30', '#12121e', '#171728']}
      locations={[0, 0.55, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0.9 }}
      style={styles.card}
    >
      <Svg width={80} height={80} style={styles.decoration}>
        <Circle cx={70} cy={70} r={20} stroke={colors.borderMedium} strokeWidth={1} fill="none" />
        <Circle cx={70} cy={70} r={34} stroke={colors.borderLight} strokeWidth={1} fill="none" />
      </Svg>

      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <Logo size={14} />
          <Text style={styles.companyLabel}>{card.company || 'CARD:N'}</Text>
        </View>
        <Text style={styles.digitalLabel}>DIGITAL CARD</Text>
      </View>

      <View style={styles.middle}>
        <Text style={styles.name}>{card.name || '이름을 입력해주세요'}</Text>
        <Text style={styles.title}>{positionLine(card)}</Text>
      </View>

      <View style={styles.bottomRow}>
        <View>
          {!!card.phone && <Text style={styles.contact}>{card.phone}</Text>}
          {!!card.email && <Text style={styles.contact}>{card.email}</Text>}
          {!!card.address && (
            <Text style={styles.contact} numberOfLines={1}>
              {card.address}
            </Text>
          )}
        </View>
        {mecard ? (
          // QR scanners need strong light/dark contrast to read reliably regardless of
          // the app's own dark theme — white module background + dark modules, not the
          // theme's own (near-white-on-dark) palette.
          <View style={styles.qrWrap}>
            <QRCode value={mecard} size={38} backgroundColor={colors.textPrimary} color={colors.canvas} />
          </View>
        ) : (
          <View style={styles.qrPlaceholder} />
        )}
      </View>
    </LinearGradient>
  );
}

type Props = {
  card: MyCard;
  onPress: () => void;
};

export function MyBusinessCard({ card, onPress }: Props) {
  return (
    <Pressable style={styles.wrap} onPress={onPress}>
      <CardFace card={card} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 24,
  },
  card: {
    aspectRatio: 1.72,
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
