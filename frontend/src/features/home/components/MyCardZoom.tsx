import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

import { CardFace } from './MyBusinessCard';
import type { MyCard } from '../types';

type Props = {
  visible: boolean;
  card: MyCard;
  onClose: () => void;
};

// Tap-to-enlarge view — the same CardFace used everywhere else (home tile, MyCardSheet),
// just bigger: same landscape aspectRatio (1.72, CardFace's default) as the compact home
// tile, scaled up by the wider modal width, with a bigger QR (80px vs. 38px) since a
// "hold this up so someone can scan it" view benefits from a larger, easier-to-scan code.
// Reached by swiping the card instead of tapping it opens MyCardSheet (edit) instead.
export function MyCardZoom({ visible, card, onClose }: Props) {
  // The app is portrait-locked globally (app.json) so every other screen's layout can
  // assume portrait — that's not something to touch just for this one view. Instead,
  // unlock rotation only while this modal is open, and relock to portrait the moment it
  // closes, so nothing else in the app is affected.
  useEffect(() => {
    if (!visible) return;
    // expo-screen-orientation is a native module — it isn't present in Expo Go / a
    // dev-client build made before this dependency was added. When missing, the call
    // itself throws synchronously (before a Promise even exists to .catch()), so this
    // needs a real try/catch, not a Promise catch, to swallow it until a rebuilt client
    // with the module is installed.
    try {
      ScreenOrientation.unlockAsync().catch(() => {});
    } catch {}
    return () => {
      try {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      } catch {}
    };
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.cardWrap}>
          <CardFace card={card} qrSize={80} />
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
