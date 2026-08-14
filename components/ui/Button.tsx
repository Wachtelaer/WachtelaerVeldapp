import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { colors, fonts } from '@/lib/theme';

interface Props extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
}

export function Button({ label, variant = 'primary', loading, disabled, ...rest }: Props) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        pressed && !disabled && (isPrimary ? styles.primaryPressed : styles.secondaryPressed),
        (disabled || loading) && styles.disabled,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.white : colors.accent} />
      ) : (
        <Text style={[styles.label, isPrimary ? styles.labelPrimary : styles.labelSecondary]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  primary: { backgroundColor: colors.accent, borderWidth: 1, borderColor: colors.accentDark },
  primaryPressed: { backgroundColor: colors.accentDark },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.dividerStrong },
  secondaryPressed: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  disabled: { opacity: 0.5 },
  label: {
    fontFamily: fonts.heading,
    fontSize: 15,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  labelPrimary: { color: colors.white },
  labelSecondary: { color: colors.ink },
});
