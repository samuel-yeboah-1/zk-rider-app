import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { theme } from '../theme';

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function batteryColor(pct: number): string {
  if (pct <= 15) return theme.colors.danger;
  if (pct <= 40) return theme.colors.warning;
  return theme.colors.green;
}

export function BatteryGauge({ value, size = 150, label = 'Battery' }: { value: number | null; size?: number; label?: string }) {
  const pct = value == null ? 0 : clamp(value / 100, 0, 1);
  const color = value == null ? theme.colors.textDim : batteryColor(value);
  const bodyW = Math.round(size * 0.66);
  const bodyH = size;
  const nubW = Math.round(bodyW * 0.42);

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: nubW, height: Math.round(size * 0.05), borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: color, marginBottom: 2 }} />
      <View
        style={{
          width: bodyW,
          height: bodyH,
          borderRadius: 16,
          borderWidth: 2.5,
          borderColor: color,
          overflow: 'hidden',
          justifyContent: 'flex-end',
          backgroundColor: theme.colors.surface,
        }}
      >
        <View style={{ height: `${pct * 100}%`, backgroundColor: color, opacity: 0.28 }} />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: theme.colors.text, fontSize: Math.round(size * 0.24), fontWeight: '800', fontFamily: theme.font.mono, letterSpacing: -1 }}>
              {value == null ? '––' : Math.round(value)}
              <Text style={{ fontSize: Math.round(size * 0.12), color }}>%</Text>
            </Text>
            <Text style={{ color, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 2 }}>{label.toUpperCase()}</Text>
          </View>
        </View>
      </View>
    </View>
  );
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
  const spin = useRef(new Animated.Value(0)).current;

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

  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
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
  loading = false,
  style,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
  loading?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.tile, style]}>
      <View style={[styles.tileBar, { backgroundColor: color }, theme.glow(color, 8, 0.8)]} />
      <Text style={styles.tileLabel}>{label}</Text>
      {loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
          <ActivityIndicator size="small" color={color} />
          <Text style={styles.tilePending}>after unlock</Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <Text style={styles.tileValue}>{value}</Text>
          {unit ? <Text style={[styles.tileUnit, { color }]}> {unit}</Text> : null}
        </View>
      )}
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
  tilePending: { color: theme.colors.textDim, fontSize: 12, fontWeight: '600', marginTop: 1 },
});
