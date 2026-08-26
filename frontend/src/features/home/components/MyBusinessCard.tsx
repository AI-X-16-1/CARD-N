import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';

import { colors, radius, typography } from '@/shared/theme';
import { Logo } from '@/shared/components/Logo';
import type { MyCard } from '../types';

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Pure card visual — shared by the Home tile (MyBusinessCard, below) and MyCardSheet's
// detail header, so the same card face carries over when the sheet transitions in.
export function CardFace({ card }: { card: MyCard }) {
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
        <Text style={styles.title}>{card.title}</Text>
      </View>

      <View style={styles.bottomRow}>
        <View>
          {!!card.phone && <Text style={styles.contact}>{card.phone}</Text>}
          {!!card.email && <Text style={styles.contact}>{card.email}</Text>}
        </View>
        <View style={styles.qrPlaceholder} />
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
});
