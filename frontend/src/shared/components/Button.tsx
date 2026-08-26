import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors, radius, typography } from '@/shared/theme';

type Variant = 'primary' | 'outline' | 'text';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  style,
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      style={[styles.base, variantStyles[variant], isDisabled && styles.disabled, style]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.textPrimary : colors.primaryLight} />
      ) : (
        <>
          {icon}
          <Text style={[styles.label, labelVariantStyles[variant]]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.card,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
});

const variantStyles: Record<Variant, StyleProp<ViewStyle>> = {
  primary: { backgroundColor: colors.primary },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderMedium },
  text: { backgroundColor: 'transparent', paddingVertical: 8 },
};

const labelVariantStyles: Record<Variant, StyleProp<TextStyle>> = {
  primary: { color: colors.textPrimary },
  outline: { color: colors.textSecondary },
  text: { color: colors.secondary },
};
