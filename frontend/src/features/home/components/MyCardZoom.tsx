import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { CardFace } from './MyBusinessCard';
import type { MyCard } from '../types';

type Props = {
  visible: boolean;
  card: MyCard;
  onClose: () => void;
};

// Tap-to-enlarge view — the same CardFace used everywhere else (home tile, MyCardSheet),
// just reshaped: a portrait aspectRatio instead of the compact landscape home tile, and a
// bigger QR (168px vs. 38px) since a "hold this up so someone can scan it" view benefits
// from a larger, easier-to-scan code. Reached by swiping the card instead of tapping it
// opens MyCardSheet (edit) instead.
export function MyCardZoom({ visible, card, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.cardWrap}>
          <CardFace card={card} aspectRatio={0.62} qrSize={168} />
        </View>
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
  cardWrap: {
    width: '100%',
  },
});
