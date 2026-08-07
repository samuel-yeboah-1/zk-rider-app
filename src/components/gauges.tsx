import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { theme } from '../theme';

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function batteryColor(pct: number): string {
  if (pct <= 15) return theme.colors.danger;
  if (pct <= 40) return theme.colors.warning;
  return theme.colors.green;
}

export function RadialGauge({
  value,
  max = 100,
  size = 232,
  tickCount = 56,
  label,
  unit,
  color,
  loading = false,
}: {
  value: number | null;
  max?: number;
  size?: number;
  tickCount?: number;
  label: string;
  unit?: string;
  color?: string;
  loading?: boolean;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const p = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    p.start();
    return () => p.stop();
  }, [pulse]);

  useEffect(() => {
    if (!loading) {
      spin.setValue(0);
      return;
    }
    const s = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    s.start();
    return () => s.stop();
  }, [loading, spin]);

  const pct = value == null ? 0 : clamp(value / max, 0, 1);
  const gaugeColor = color ?? theme.colors.primary;
  const lit = Math.round(pct * tickCount);

  const tickW = Math.max(2.5, size * 0.014);
  const tickH = size * 0.072;
  const step = 360 / tickCount;

  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.32] });
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.02] });
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: size * 0.78,
            height: size * 0.78,
            borderRadius: size,
            backgroundColor: gaugeColor,
            opacity: haloOpacity,
            transform: [{ scale: haloScale }],
          },
          theme.glow(gaugeColor, 40, 0.5),
        ]}
      />

      {Array.from({ length: tickCount }).map((_, i) => {
        const on = loading ? false : i < lit;
        const leading = on && i === lit - 1;
        return (
          <View key={i} style={[StyleSheet.absoluteFill, { alignItems: 'center', transform: [{ rotate: `${i * step}deg` }] }]}>
            <View
              style={[
                {
                  width: tickW,
                  height: tickH,
                  borderRadius: tickW,
                  marginTop: size * 0.02,
                  backgroundColor: on ? gaugeColor : theme.colors.border,
                },
                on ? theme.glow(gaugeColor, leading ? 14 : 7, leading ? 1 : 0.8) : null,
              ]}
            />
          </View>
        );
      })}

      {loading && (
        <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', transform: [{ rotate: spinDeg }] }]}>
          <View style={{ width: tickW, height: tickH, borderRadius: tickW, marginTop: size * 0.02, backgroundColor: gaugeColor, ...theme.glow(gaugeColor, 14, 1) }} />
        </Animated.View>
      )}

      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[styles.value, { color: value == null ? theme.colors.textDim : theme.colors.text }]}>
          {value == null ? '––' : Math.round(value)}
          {unit ? <Text style={[styles.unit, { color: gaugeColor }]}>{unit}</Text> : null}
        </Text>
        <Text style={[styles.label, { color: gaugeColor }]}>{label}</Text>
      </View>
    </View>
  );
}

export function StatTile({
  label,
  value,
  unit,
  color = theme.colors.primary,
  style,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.tile, style]}>
      <View style={[styles.tileBar, { backgroundColor: color }, theme.glow(color, 8, 0.8)]} />
      <Text style={styles.tileLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <Text style={styles.tileValue}>{value}</Text>
        {unit ? <Text style={[styles.tileUnit, { color }]}> {unit}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  value: { fontSize: 66, fontWeight: '800', fontFamily: theme.font.mono, letterSpacing: -2 },
  unit: { fontSize: 24, fontWeight: '700', fontFamily: theme.font.mono },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase', marginTop: 2 },

  tile: {
    flex: 1,
    minWidth: 140,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  tileBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  tileLabel: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  tileValue: { color: theme.colors.text, fontSize: 26, fontWeight: '800', fontFamily: theme.font.mono, marginTop: 6, letterSpacing: -0.5 },
  tileUnit: { fontSize: 13, fontWeight: '700', marginBottom: 5 },
});
