import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { api } from '../api/client';
import { ApiError } from '../api/types';
import { Banner, Button, Card, ScreenBackground, SectionTitle } from '../components/ui';
import { StatTile, batteryColor } from '../components/gauges';
import { QrScanner } from '../components/QrScanner';
import { RootStackParamList } from '../navigation/types';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [imeiInput, setImeiInput] = useState('');
  const [imei, setImei] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const scooterQuery = useQuery({
    queryKey: ['scooter', imei],
    queryFn: () => api.getScooter(imei!),
    enabled: !!imei,
    retry: false,
  });

  function lookup(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setImeiInput(trimmed);
    setImei(trimmed);
  }

  const scooter = scooterQuery.data;
  const canUnlock = scooter?.available && scooter.lockState === 'locked';

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <Image source={require('../../assets/aldin-logo.png')} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.h1}>Let's get you rolling</Text>
        <Text style={styles.p}>Scan the scooter's QR code, or key in its 15-digit IMEI to unlock your ride.</Text>

        <Pressable
          onPress={() => setScanning(true)}
          style={({ pressed }) => [styles.scanBtn, theme.glow(theme.colors.primary, 20, 0.5), { opacity: pressed ? 0.9 : 1 }]}
        >
          <Text style={styles.scanIcon}>⬡</Text>
          <Text style={styles.scanText}>SCAN QR CODE</Text>
        </Pressable>

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>OR</Text>
          <View style={styles.orLine} />
        </View>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={imeiInput}
            onChangeText={setImeiInput}
            placeholder="860•••••••••••••"
            placeholderTextColor={theme.colors.textDim}
            keyboardType="number-pad"
            returnKeyType="search"
            onSubmitEditing={() => lookup(imeiInput)}
          />
          <Button label="Find" onPress={() => lookup(imeiInput)} disabled={!imeiInput.trim()} style={{ paddingHorizontal: 22 }} />
        </View>

        {scooterQuery.isFetching && <RadarLoader imei={imei ?? ''} />}

        {scooterQuery.isError && !scooterQuery.isFetching && (
          <Banner
            tone="error"
            text={
              (scooterQuery.error as ApiError)?.code === 'scooter_not_found'
                ? `No scooter found for ${imei}.`
                : `Lookup failed: ${(scooterQuery.error as Error).message}`
            }
          />
        )}

        {scooter && !scooterQuery.isFetching && (
          <Card style={{ marginTop: 18 }} glowColor={canUnlock ? theme.colors.green : theme.colors.warning}>
            <SectionTitle color={canUnlock ? theme.colors.green : theme.colors.warning}>Unit acquired</SectionTitle>
            <Text style={styles.cardImei}>{scooter.imei}</Text>

            <View style={styles.cardGrid}>
              <StatTile label="Battery" value={`${scooter.batteryPct}`} unit="%" color={batteryColor(scooter.batteryPct)} />
              <StatTile label="Odometer" value={`${scooter.currentMileage}`} unit="km" color={theme.colors.accent} />
            </View>

            <View style={styles.statusRow}>
              <StateChip on={scooter.available} labelOn="AVAILABLE" labelOff="UNAVAILABLE" />
              <StateChip on={scooter.lockState === 'locked'} labelOn="LOCKED" labelOff="UNLOCKED" color={theme.colors.cyan} />
            </View>

            <View style={{ height: 14 }} />
            {canUnlock ? (
              <Button label="Unlock & ride" onPress={() => navigation.navigate('Unlock', { imei: scooter.imei })} />
            ) : (
              <Banner
                tone="error"
                text={!scooter.available ? 'This scooter is not available right now.' : 'This scooter is already unlocked / in use.'}
              />
            )}
          </Card>
        )}

        <QrScanner
          visible={scanning}
          onClose={() => setScanning(false)}
          onScanned={(value) => {
            setScanning(false);
            lookup(value);
          }}
        />
      </ScrollView>
    </ScreenBackground>
  );
}

function RadarLoader({ imei }: { imei: string }) {
  const rings = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  const sweep = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState(0);
  const PHASES = ['Pinging fleet network', 'Locating unit by IMEI', 'Reading telemetry'];

  useEffect(() => {
    const animations = rings.map((r, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 500),
          Animated.timing(r, { toValue: 1, duration: 1500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ])
      )
    );
    animations.forEach((a) => a.start());
    const s = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: true }));
    s.start();
    const t = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), 900);
    return () => {
      animations.forEach((a) => a.stop());
      s.stop();
      clearInterval(t);
    };
  }, []);

  const sweepDeg = sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.radarWrap}>
      <View style={styles.radar}>
        {rings.map((r, i) => (
          <Animated.View
            key={i}
            style={[
              styles.radarRing,
              theme.glow(theme.colors.primary, 12, 0.5),
              {
                opacity: r.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
                transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) }],
              },
            ]}
          />
        ))}
        <Animated.View style={[styles.radarSweep, { transform: [{ rotate: sweepDeg }] }]}>
          <View style={styles.radarSweepArm} />
        </Animated.View>
        <View style={[styles.radarCore, theme.glow(theme.colors.primary, 14, 1)]} />
      </View>
      <Text style={styles.radarText}>{PHASES[phase]}…</Text>
      <Text style={styles.radarImei}>{imei}</Text>
    </View>
  );
}

function StateChip({ on, labelOn, labelOff, color = theme.colors.green }: { on: boolean; labelOn: string; labelOff: string; color?: string }) {
  const c = on ? color : theme.colors.textDim;
  return (
    <View style={[styles.chip, { borderColor: c }, on ? theme.glow(c, 8, 0.2) : null]}>
      <View style={[styles.chipDot, { backgroundColor: c }]} />
      <Text style={[styles.chipText, { color: c }]}>{on ? labelOn : labelOff}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 22, flexGrow: 1 },
  brand: { alignItems: 'center', marginBottom: 14 },
  logo: { width: 216, height: 100 },
  h1: { fontSize: 30, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.5 },
  p: { color: theme.colors.textMuted, fontSize: 15, marginTop: 8, marginBottom: 24, lineHeight: 21 },

  scanBtn: {
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,224,255,0.06)',
    gap: 8,
  },
  scanIcon: { color: theme.colors.primary, fontSize: 40, fontWeight: '400' },
  scanText: { color: theme.colors.primary, fontSize: 15, fontWeight: '800', letterSpacing: 2 },

  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  orLine: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  orText: { color: theme.colors.textDim, fontSize: 12, fontWeight: '800', letterSpacing: 2 },

  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderBright,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 15,
    paddingHorizontal: 16,
    color: theme.colors.text,
    fontSize: 17,
    fontFamily: theme.font.mono,
    letterSpacing: 1,
  },

  radarWrap: { alignItems: 'center', marginTop: 34, marginBottom: 10 },
  radar: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  radarRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
  },
  radarSweep: { position: 'absolute', width: 160, height: 160, alignItems: 'center' },
  radarSweepArm: {
    width: 2,
    height: 80,
    marginTop: 0,
    backgroundColor: theme.colors.primary,
    ...theme.glow(theme.colors.primary, 10, 0.9),
  },
  radarCore: { width: 14, height: 14, borderRadius: 7, backgroundColor: theme.colors.primary },
  radarText: { color: theme.colors.primary, fontSize: 13, fontWeight: '700', letterSpacing: 1, marginTop: 20 },
  radarImei: { color: theme.colors.textDim, fontSize: 13, fontFamily: theme.font.mono, marginTop: 6, letterSpacing: 1 },

  cardImei: { color: theme.colors.text, fontSize: 20, fontFamily: theme.font.mono, letterSpacing: 0.5, marginBottom: 14 },
  cardGrid: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  statusRow: { flexDirection: 'row', gap: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
});
