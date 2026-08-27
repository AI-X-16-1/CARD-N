import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { CardFace } from './MyBusinessCard';
import type { MyCard } from '../types';

type Props = {
  visible: boolean;
  card: MyCard;
  onClose: () => void;
};

// Tap-to-enlarge view of the card face only — no edit inputs here, that's MyCardSheet
// (reached by swiping the card instead of tapping it).
export function MyCardZoom({ visible, card, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.cardWrap}>
          <CardFace card={card} />
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
