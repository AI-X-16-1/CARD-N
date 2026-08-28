import { Image, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/shared/theme';

import { personImageUrl } from '../api';
import { jobColor } from '../jobLabels';

type Props = {
  personId: number;
  jobClass: string | null;
  hasImage: boolean;
};

export function CardThumbnail({ personId, jobClass, hasImage }: Props) {
  const color = jobColor(jobClass);

  if (hasImage) {
    return (
      <Image
        source={{ uri: personImageUrl(personId) }}
        style={[styles.container, { borderColor: color }]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View style={[styles.container, { borderColor: color }]}>
      <View style={[styles.stripe, { backgroundColor: `${color}33` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 58,
    height: 36,
    borderRadius: radius.gameCard,
    borderWidth: 1.5,
    backgroundColor: colors.surface1,
    overflow: 'hidden',
  },
  stripe: {
    position: 'absolute',
    width: 60,
    height: 14,
    right: -18,
    top: 8,
    transform: [{ rotate: '-32deg' }],
  },
});
