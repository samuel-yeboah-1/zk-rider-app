import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { api, warmUp } from '../api/client';
import { ApiError } from '../api/types';
import { Banner, Button, Card, ScreenBackground, SectionTitle } from '../components/ui';
import { StatTile } from '../components/gauges';
import { QrScanner } from '../components/QrScanner';
import { RootStackParamList } from '../navigation/types';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const IMEI_LENGTH = 15;
const IMEI_RE = /^\d{15}$/;

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [imeiInput, setImeiInput] = useState('');
  const [imei, setImei] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [vehicleInput, setVehicleInput] = useState('');

  const scooterQuery = useQuery({
    queryKey: ['scooter', imei],
    queryFn: () => api.getScooter(imei!),
    enabled: !!imei,
    retry: false,
  });

  const isValidImei = IMEI_RE.test(imeiInput);

  function onChangeImei(value: string) {
    setImeiInput(value.replace(/\D/g, '').slice(0, IMEI_LENGTH));
    if (inputError) setInputError(null);
  }

  function lookup(rawValue: string) {
    const digits = rawValue.replace(/\D/g, '');
    if (!IMEI_RE.test(digits)) {
      setImeiInput(digits.slice(0, IMEI_LENGTH));
      setInputError(`IMEI must be exactly ${IMEI_LENGTH} digits — you entered ${digits.length}.`);
      return;
    }
    setInputError(null);
    setImeiInput(digits);
    setImei(digits);
  }

  async function onScanned(raw: string) {
    setScanning(false);
    const value = raw.trim();
    if (IMEI_RE.test(value)) {
      lookup(value);
      return;
    }
    const m = value.match(/vehicle\/([A-Za-z0-9]+)/i) || value.match(/([A-Za-z0-9]+)\/?$/);
    const vehicleId = m ? m[1] : null;
    if (!vehicleId) {
      const embedded = value.match(/\d{15}/);
      if (embedded) lookup(embedded[0]);
      else setInputError('Unrecognized QR code — not an Aldin bike.');
      return;
    }
    setResolving(true);
    try {
      const scooter = await api.resolveVehicle(vehicleId);
      setImeiInput(scooter.imei);
      setImei(scooter.imei);
      setInputError(null);
    } catch (e) {
      const code = (e as ApiError)?.code;
      setInputError(
        code === 'vehicle_not_found'
          ? 'This QR code isn’t a registered Aldin bike.'
          : 'Could not resolve the scanned code.'
      );
    } finally {
      setResolving(false);
    }
  }

  async function lookupVehicle() {
    const v = vehicleInput.trim();
    if (!v) return;
    setResolving(true);
    setInputError(null);
    try {
      const scooter = await api.resolveVehicle(v);
      setImeiInput(scooter.imei);
      setImei(scooter.imei);
    } catch (e) {
      const code = (e as ApiError)?.code;
      setInputError(code === 'vehicle_not_found' ? `No bike found for vehicle #${v}.` : 'Could not look up that vehicle number.');
    } finally {
      setResolving(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      // Nudge the backend awake as the rider lands here, before they tap Find.
      warmUp();
      if (imei) scooterQuery.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imei])
  );

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
        <Text style={styles.p}>Scan the scooter's QR code, or key in its 15-digit IMEI to unlock your ride.</Text>

        <Pressable
          onPress={() => setScanning(true)}
          style={({ pressed }) => [styles.scanBtn, { opacity: pressed ? 0.9 : 1 }]}
        >
          <QrGlyph size={34} color={theme.colors.primary} />
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
            value={vehicleInput}
            onChangeText={(v) => setVehicleInput(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="Vehicle no. — e.g. 91334"
            placeholderTextColor={theme.colors.textDim}
            keyboardType="number-pad"
            returnKeyType="search"
            onSubmitEditing={lookupVehicle}
          />
          <Button label="Go" onPress={lookupVehicle} loading={resolving} disabled={!vehicleInput.trim()} style={{ paddingHorizontal: 20 }} />
        </View>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={imeiInput}
            onChangeText={onChangeImei}
            placeholder="860•••••••••••••"
            placeholderTextColor={theme.colors.textDim}
            keyboardType="number-pad"
            returnKeyType="search"
            maxLength={IMEI_LENGTH}
            onSubmitEditing={() => lookup(imeiInput)}
          />
          <Button label="Find" onPress={() => lookup(imeiInput)} loading={scooterQuery.isFetching && !resolving} disabled={!isValidImei} style={{ paddingHorizontal: 22 }} />
        </View>

        {imeiInput.length > 0 && !isValidImei && !inputError && (
          <Text style={styles.counter}>{imeiInput.length}/{IMEI_LENGTH} digits</Text>
        )}

        {inputError && <Banner tone="error" text={inputError} />}

        {(resolving || scooterQuery.isFetching) && <RadarLoader imei={imei ?? ''} />}

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
          <>
            <Card style={{ padding: 14 }} glowColor={canUnlock ? theme.colors.green : theme.colors.warning}>
              <SectionTitle color={canUnlock ? theme.colors.green : theme.colors.warning}>Unit acquired</SectionTitle>
              {scooter.vehicleId ? <Text style={styles.cardVehicle}>Bike #{scooter.vehicleId}</Text> : null}
              <Text style={styles.cardImei}>{scooter.imei}</Text>

              <View style={styles.cardGrid}>
                <StatTile label="Battery" value="" unit="%" color={theme.colors.primary} loading />
                <StatTile label="Odometer" value="" unit="km" color={theme.colors.accent} loading />
              </View>

              <View style={styles.statusRow}>
                <StateChip on={scooter.available} labelOn="AVAILABLE" labelOff="UNAVAILABLE" />
                <StateChip on={scooter.lockState === 'locked'} labelOn="LOCKED" labelOff="UNLOCKED" color={theme.colors.cyan} />
              </View>
            </Card>

            {canUnlock ? (
              <Button label="Unlock & ride" onPress={() => navigation.navigate('Unlock', { imei: scooter.imei })} />
            ) : (
              <Banner
                tone="error"
                text={!scooter.available ? 'This scooter is not available right now.' : 'This scooter is already unlocked / in use.'}
              />
            )}
          </>
        )}

        <QrScanner visible={scanning} onClose={() => setScanning(false)} onScanned={onScanned} />
      </ScrollView>
    </ScreenBackground>
  );
}

function RadarLoader({ imei }: { imei: string }) {
  const rings = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  const sweep = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState(0);
  const [slow, setSlow] = useState(false);
  const PHASES = ['Waking the fleet network', 'Locating unit by IMEI', 'Reading telemetry'];

  useEffect(() => {
    // The backend can be spun down and take a moment to wake on the first
    // lookup — tell the rider so a slow connect doesn't read as a freeze.
    const slowTimer = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(slowTimer);
  }, []);

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
      {slow && <Text style={styles.radarHint}>First connect can take a moment — waking the server.</Text>}
    </View>
  );
}

function QrGlyph({ size = 44, color = theme.colors.primary }: { size?: number; color?: string }) {
  const fs = size * 0.34;
  const finder = (pos: object, key: string) => (
    <View
      key={key}
      style={[
        { position: 'absolute', width: fs, height: fs, borderRadius: 3, borderWidth: 2.5, borderColor: color, alignItems: 'center', justifyContent: 'center' },
        pos,
      ]}
    >
      <View style={{ width: fs * 0.42, height: fs * 0.42, borderRadius: 1, backgroundColor: color }} />
    </View>
  );
  const dot = (top: number, left: number, key: string) => (
    <View key={key} style={{ position: 'absolute', top: top * size, left: left * size, width: size * 0.1, height: size * 0.1, borderRadius: 1, backgroundColor: color }} />
  );
  return (
    <View style={{ width: size, height: size }}>
      {finder({ top: 0, left: 0 }, 'tl')}
      {finder({ top: 0, right: 0 }, 'tr')}
      {finder({ bottom: 0, left: 0 }, 'bl')}
      {dot(0.5, 0.52, 'd1')}
      {dot(0.5, 0.74, 'd2')}
      {dot(0.5, 0.9, 'd3')}
      {dot(0.66, 0.62, 'd4')}
      {dot(0.66, 0.84, 'd5')}
      {dot(0.82, 0.52, 'd6')}
      {dot(0.82, 0.74, 'd7')}
      {dot(0.9, 0.9, 'd8')}
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
  content: { paddingHorizontal: 20, paddingVertical: 16, flexGrow: 1, justifyContent: 'center', alignItems: 'stretch', gap: 13 },
  brand: { alignItems: 'center' },
  logo: { width: 168, height: 74 },
  h1: { fontSize: 22, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.5, textAlign: 'center' },
  p: { color: theme.colors.text, fontSize: 15, lineHeight: 21, textAlign: 'center' },

  scanBtn: {
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,224,255,0.06)',
    gap: 6,
  },
  scanText: { color: theme.colors.primary, fontSize: 13, fontWeight: '800', letterSpacing: 2 },

  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orLine: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  orText: { color: theme.colors.textDim, fontSize: 12, fontWeight: '800', letterSpacing: 2 },

  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderBright,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: theme.colors.text,
    fontSize: 16,
    fontFamily: theme.font.mono,
    letterSpacing: 1,
  },
  counter: { color: theme.colors.textMuted, fontSize: 12, marginTop: 6, fontFamily: theme.font.mono, letterSpacing: 1 },

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
  radarHint: { color: theme.colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 10, maxWidth: 240, lineHeight: 17 },

  cardVehicle: { color: theme.colors.text, fontSize: 18, fontWeight: '900', letterSpacing: 0.3, marginBottom: 2 },
  cardImei: { color: theme.colors.textMuted, fontSize: 12, fontFamily: theme.font.mono, letterSpacing: 0.5, marginBottom: 10 },
  cardGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
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
