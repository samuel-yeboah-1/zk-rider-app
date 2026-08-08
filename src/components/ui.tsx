import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { theme } from '../theme';

export function ScreenBackground({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bg}>
      <View style={styles.bgContent}>{children}</View>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  const accent =
    variant === 'danger' ? theme.colors.danger : variant === 'secondary' ? theme.colors.borderBright : theme.colors.primary;
  const fg =
    variant === 'primary' ? theme.colors.primaryText : variant === 'danger' ? theme.colors.danger : theme.colors.text;
  const bg = variant === 'primary' ? theme.colors.primary : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: accent,
          opacity: isDisabled ? 0.4 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  style,
  glowColor,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  glowColor?: string;
}) {
  return (
    <View style={[styles.card, glowColor ? theme.glow(glowColor, 22, 0.25) : null, style]}>
      <View style={styles.cardEdge} pointerEvents="none" />
      {children}
    </View>
  );
}

export function SectionTitle({ children, color = theme.colors.primary }: { children: React.ReactNode; color?: string }) {
  return (
    <View style={styles.sectionRow}>
      <View style={[styles.sectionTick, { backgroundColor: color }, theme.glow(color, 8, 0.9)]} />
      <Text style={styles.sectionText}>{children}</Text>
    </View>
  );
}

export function Row({ label, value, mono, valueColor }: { label: string; value: string; mono?: boolean; valueColor?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          mono && { fontFamily: theme.font.mono, letterSpacing: 0.5 },
          valueColor ? { color: valueColor } : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export function Banner({ text, tone = 'info' }: { text: string; tone?: 'info' | 'error' | 'success' }) {
  const color =
    tone === 'error' ? theme.colors.danger : tone === 'success' ? theme.colors.green : theme.colors.primary;
  return (
    <View style={[styles.banner, { borderColor: color }, theme.glow(color, 12, 0.25)]}>
      <View style={[styles.bannerDot, { backgroundColor: color }, theme.glow(color, 8, 1)]} />
      <Text style={[styles.bannerText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.colors.bgDeep, overflow: 'hidden' },
  bgContent: { flex: 1 },

  button: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonText: { fontSize: 15, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  cardEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: theme.colors.borderBright,
    opacity: 0.6,
  },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTick: { width: 10, height: 10, borderRadius: 2, transform: [{ rotate: '45deg' }] },
  sectionText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  rowLabel: { color: theme.colors.textMuted, fontSize: 14 },
  rowValue: { color: theme.colors.text, fontSize: 15, fontWeight: '700' },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: 13,
    marginVertical: 8,
    backgroundColor: theme.colors.surfaceGlass,
  },
  bannerDot: { width: 8, height: 8, borderRadius: 4 },
  bannerText: { fontSize: 13, fontWeight: '700', flex: 1 },
});
