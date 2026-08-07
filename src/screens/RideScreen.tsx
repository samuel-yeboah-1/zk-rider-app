import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { api } from '../api/client';
import { AckTimeoutError, rideActions } from '../rideService';
import { ScooterInfo } from '../ble/protocol';
import { Banner, Button, Card, ScreenBackground, SectionTitle } from '../components/ui';
import { RadialGauge, StatTile, batteryColor } from '../components/gauges';
import { log } from '../log';
import { useRideStore } from '../state/rideStore';
import { RootStackParamList } from '../navigation/types';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Ride'>;

const POLL_INTERVAL_MS = 4000;
const LAMP_SYNC_GRACE_MS = 6000;

export function RideScreen({ navigation }: Props) {
  const rideId = useRideStore((s) => s.rideId);
  const imei = useRideStore((s) => s.imei);
  const isConnected = useRideStore((s) => s.isConnected);
  const connection = useRideStore((s) => s.connection);
  const clear = useRideStore((s) => s.clear);

  const [info, setInfo] = useState<ScooterInfo | null>(null);
  const [lamp, setLamp] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lampLockUntil = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const next = await rideActions.queryInfo();
      setInfo(next);
      if (Date.now() >= lampLockUntil.current) setLamp(next.headlampOn);
      setStatusError(null);
    } catch (e) {
      const msg = e instanceof AckTimeoutError ? 'Status timed out' : (e as Error).message;
      setStatusError(msg);
    }
  }, []);

  useEffect(() => {
    if (!isConnected) return;
    refresh();
    pollTimer.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [isConnected, refresh]);

  useEffect(() => {
    if (!isConnected && rideId) {
      setStatusError('Disconnected from scooter. Reconnect to continue the ride.');
    }
  }, [isConnected, rideId]);

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof AckTimeoutError ? 'Command timed out' : (e as Error).message;
      Alert.alert('Command failed', msg);
      log.warn(`${key} failed`, msg);
    } finally {
      setBusy(null);
    }
  }

  async function toggleLamp(next: boolean) {
    const prev = lamp;
    lampLockUntil.current = Date.now() + LAMP_SYNC_GRACE_MS;
    setLamp(next);
    await withBusy('lamp', async () => {
      const ok = await rideActions.setHeadlamp(next);
      if (!ok) {
        setLamp(prev);
        throw new Error('Scooter did not confirm the headlamp change.');
      }
    });
  }

  function onEndRide() {
    Alert.alert('End ride?', 'This will lock the scooter and finish your ride.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End ride', style: 'destructive', onPress: endRide },
    ]);
  }

  async function endRide() {
    setEnding(true);
    try {
      const locked = await rideActions.lock();
      if (!locked) throw new Error('Scooter did not confirm lock. Try again before ending.');
      if (rideId) await api.endRide(rideId);
      await connection?.disconnect();
      clear();
      navigation.replace('Home');
    } catch (e) {
      Alert.alert('Could not end ride', (e as Error).message);
    } finally {
      setEnding(false);
    }
  }

  if (!rideId) {
    return (
      <ScreenBackground>
        <View style={styles.centered}>
          <Text style={styles.muted}>No active ride.</Text>
          <Button label="Back to home" onPress={() => navigation.replace('Home')} />
        </View>
      </ScreenBackground>
    );
  }

  const battery = info?.batteryPct ?? null;
  const battColor = battery == null ? theme.colors.primary : batteryColor(battery);
  const loadingInfo = info == null && isConnected;

  return (
    <ScreenBackground>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={theme.colors.primary} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>ACTIVE RIDE</Text>
            <Text style={styles.imei}>{imei}</Text>
          </View>
          <StatusPill connected={isConnected} />
        </View>

        {!isConnected && <Banner tone="error" text="Bluetooth link lost — move closer to reconnect." />}
        {statusError && isConnected && <Banner tone="error" text={statusError} />}

        <View style={styles.gaugeWrap}>
          <RadialGauge
            value={battery}
            label="Battery"
            unit="%"
            color={battColor}
            loading={loadingInfo}
          />
        </View>

        <View style={styles.grid}>
          <StatTile label="Speed" value={info ? `${info.speedKmh}` : '––'} unit="km/h" color={theme.colors.cyan} />
          <StatTile label="This ride" value={info ? `${info.currentMileageKm}` : '––'} unit="km" color={theme.colors.accent} />
        </View>
        <View style={styles.grid}>
          <StatTile label="Total mileage" value={info ? `${info.totalMileageKm}` : '––'} unit="km" color={theme.colors.magenta} />
          <StatTile label="Ride time" value={info ? formatDuration(info.rideTimeSeconds) : '––'} color={theme.colors.green} />
        </View>

        <Card style={{ marginTop: 16 }} glowColor={theme.colors.accent}>
          <SectionTitle color={theme.colors.accent}>Controls</SectionTitle>

          <View style={styles.lampRow}>
            <View>
              <Text style={styles.lampLabel}>Headlamp</Text>
              <Text style={styles.lampState}>
                {info ? (info.headlampOn ? 'Beam active' : 'Beam off') : 'Reading…'}
              </Text>
            </View>
            <NeonToggle value={lamp} onChange={toggleLamp} disabled={!isConnected || busy === 'lamp'} busy={busy === 'lamp'} />
          </View>

          <View style={styles.divider} />

          <View style={styles.actionRow}>
            <Button
              label="Locate"
              variant="secondary"
              loading={busy === 'locate'}
              disabled={!isConnected || !!busy}
              onPress={() => withBusy('locate', async () => void (await rideActions.locate()))}
              style={{ flex: 1 }}
            />
            <Button
              label="Warn"
              variant="secondary"
              loading={busy === 'warn'}
              disabled={!isConnected || !!busy}
              onPress={() => withBusy('warn', async () => void (await rideActions.warn()))}
              style={{ flex: 1 }}
            />
          </View>
          <Text style={styles.disclaimer}>
            Locate &amp; Warn are protocol labels — the scooter's exact physical behavior is undefined.
          </Text>
        </Card>

        <View style={{ height: 18 }} />
        <Button label="End ride & lock" variant="danger" loading={ending} onPress={onEndRide} />
        <View style={{ height: 24 }} />
      </ScrollView>
    </ScreenBackground>
  );
}

function StatusPill({ connected }: { connected: boolean }) {
  const color = connected ? theme.colors.green : theme.colors.danger;
  return (
    <View style={[styles.pill, { borderColor: color }, theme.glow(color, 10, 0.25)]}>
      <View style={[styles.pillDot, { backgroundColor: color }, theme.glow(color, 8, 1)]} />
      <Text style={[styles.pillText, { color }]}>{connected ? 'LINKED' : 'LOST'}</Text>
    </View>
  );
}

function NeonToggle({
  value,
  onChange,
  disabled,
  busy,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const color = theme.colors.primary;
  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      style={[
        styles.toggle,
        {
          borderColor: value ? color : theme.colors.border,
          backgroundColor: value ? 'rgba(34,224,255,0.12)' : 'transparent',
          opacity: disabled ? 0.5 : 1,
        },
        value ? theme.glow(color, 14, 0.4) : null,
      ]}
    >
      <View
        style={[
          styles.knob,
          {
            alignSelf: value ? 'flex-end' : 'flex-start',
            backgroundColor: value ? color : theme.colors.textDim,
          },
          value ? theme.glow(color, 10, 1) : null,
        ]}
      />
      <Text style={[styles.toggleText, { color: value ? color : theme.colors.textMuted, left: value ? 12 : undefined, right: value ? undefined : 12 }]}>
        {busy ? '···' : value ? 'ON' : 'OFF'}
      </Text>
    </Pressable>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  muted: { color: theme.colors.textMuted, fontSize: 16 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  kicker: { color: theme.colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  imei: { color: theme.colors.text, fontSize: 18, fontFamily: theme.font.mono, marginTop: 4, letterSpacing: 0.5 },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: theme.colors.surfaceGlass,
  },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },

  gaugeWrap: { alignItems: 'center', marginVertical: 14 },

  grid: { flexDirection: 'row', gap: 12, marginBottom: 12 },

  lampRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  lampLabel: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  lampState: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },

  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 14 },
  actionRow: { flexDirection: 'row', gap: 12 },
  disclaimer: { color: theme.colors.textDim, fontSize: 11, marginTop: 12, lineHeight: 16 },

  toggle: {
    width: 76,
    height: 38,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  knob: { width: 28, height: 28, borderRadius: 14 },
  toggleText: { position: 'absolute', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
});
