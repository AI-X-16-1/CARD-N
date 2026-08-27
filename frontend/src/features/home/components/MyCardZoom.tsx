import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { colors, radius, typography } from '@/shared/theme';
import { Logo } from '@/shared/components/Logo';

import { hexToRgba, myCardToMecard, positionLine } from './MyBusinessCard';
import type { MyCard } from '../types';

const QR_SIZE = 168; // vs. the 38px QR on the compact landscape home tile

type Props = {
  visible: boolean;
  card: MyCard;
  onClose: () => void;
};

// Tap-to-enlarge view of the card — no edit inputs here, that's MyCardSheet (reached by
// swiping the card instead of tapping it). Deliberately its own portrait layout rather
// than just scaling up CardFace: CardFace's row-based layout is tuned for the compact
// landscape home tile, and stretching that into a bigger landscape rect while also
// enlarging the QR would put the QR back down at a cramped corner instead of the
// prominent, easy-to-scan center a "hold this up so someone can scan it" view wants.
export function MyCardZoom({ visible, card, onClose }: Props) {
  const mecard = myCardToMecard(card);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <LinearGradient
          colors={['#1c1c30', '#12121e', '#171728']}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.9 }}
          style={styles.card}
        >
          <View style={styles.topRow}>
            <Logo size={16} />
            <Text style={styles.companyLabel}>{card.company || 'CARD:N'}</Text>
          </View>

          <View style={styles.middle}>
            <Text style={styles.name}>{card.name || '이름을 입력해주세요'}</Text>
            <Text style={styles.position}>{positionLine(card)}</Text>
          </View>

          {mecard ? (
            // Same fixed light-on-dark QR colors as CardFace — see its comment: real
            // scanners need strong contrast regardless of the app's own dark theme.
            <View style={styles.qrWrap}>
              <QRCode value={mecard} size={QR_SIZE} backgroundColor={colors.textPrimary} color={colors.canvas} />
            </View>
          ) : (
            <View style={[styles.qrWrap, styles.qrPlaceholder]} />
          )}

          <View style={styles.contactBlock}>
            {!!card.phone && <Text style={styles.contact}>{card.phone}</Text>}
            {!!card.email && <Text style={styles.contact}>{card.email}</Text>}
            {!!card.address && <Text style={styles.contact}>{card.address}</Text>}
          </View>
        </LinearGradient>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    aspectRatio: 0.62, // portrait — inverse-ish of CardFace's 1.72 landscape
    borderRadius: radius.myCard,
    borderWidth: 1,
    borderColor: hexToRgba(colors.primary, 0.4),
    padding: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  companyLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  middle: {
    alignItems: 'center',
    gap: 4,
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.cardName.fontSize + 4,
    fontWeight: typography.cardName.fontWeight,
  },
  position: {
    color: colors.primaryLight,
    fontSize: 14,
    fontWeight: '600',
  },
  qrWrap: {
    width: QR_SIZE + 16,
    height: QR_SIZE + 16,
    borderRadius: 12,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPlaceholder: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderMedium,
  },
  contactBlock: {
    alignItems: 'center',
    gap: 4,
  },
  contact: {
    color: colors.textSecondary,
    fontSize: 12.5,
  },
});
