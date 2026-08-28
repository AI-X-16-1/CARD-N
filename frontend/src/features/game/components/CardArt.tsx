import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { radius } from '@/shared/theme';

type Props = {
  /** battle_cards.illustration_url — used as-is for <Image uri>. */
  uri?: string | null;
  /** `tile` = full-bleed behind a mini card tile; `detail` = banner atop the detail panel. */
  variant: 'tile' | 'detail';
};

// Card illustration. Renders nothing when there is no uri or the image fails to
// load, so a missing/broken art URL leaves the card exactly as it looks today.
export function CardArt({ uri, variant }: Props) {
  const [failed, setFailed] = useState(false);

  // A new uri is worth retrying even if the previous one failed.
  useEffect(() => setFailed(false), [uri]);

  if (!uri || failed) return null;

  if (variant === 'tile') {
    return (
      <View style={styles.tileFill} pointerEvents="none">
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
        {/* Bottom-up dark scrim so name/stats stay readable over any image. */}
        <LinearGradient
          colors={['transparent', 'rgba(10,10,15,0.85)']}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={styles.detail}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  tileFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.gameCard,
    overflow: 'hidden',
  },
  detail: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: radius.gameCard,
  },
});
