import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { api } from '../api/client';
import { AckTimeoutError, rideActions } from '../rideService';
import { ScooterInfo } from '../ble/protocol';
import { Banner, Button, Card, Row } from '../components/ui';
import { log } from '../log';
import { useRideStore } from '../state/rideStore';
import { RootStackParamList } from '../navigation/types';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Ride'>;

const POLL_INTERVAL_MS = 4000;

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

  const refresh = useCallback(async () => {
    try {
      const next = await rideActions.queryInfo();
      setInfo(next);
      setLamp(next.headlampOn);
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
      <View style={styles.centered}>
        <Text style={styles.muted}>No active ride.</Text>
        <Button label="Back to home" onPress={() => navigation.replace('Home')} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={theme.colors.primary} />}
    >
      <Text style={styles.h1}>Riding</Text>
      <Text style={styles.imei}>{imei}</Text>

      {!isConnected && <Banner tone="error" text="Bluetooth link lost." />}
      {statusError && isConnected && <Banner tone="error" text={statusError} />}

      <Card style={{ marginTop: 8 }}>
        <Text style={styles.cardTitle}>Live status (AT+BKINF)</Text>
        <Row label="Speed" value={info ? `${info.speedKmh} km/h` : '—'} />
        <Row label="Battery" value={info ? `${info.batteryPct}%` : '—'} />
        <Row label="This ride" value={info ? `${info.currentMileageKm} km` : '—'} />
        <Row label="Ride time" value={info ? formatDuration(info.rideTimeSeconds) : '—'} />
        <Row label="Total mileage" value={info ? `${info.totalMileageKm} km` : '—'} />
        <Row label="Lock" value={info ? (info.locked ? 'Locked' : 'Unlocked') : '—'} />
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={styles.cardTitle}>Controls</Text>
        <View style={styles.lampRow}>
          <Text style={styles.lampLabel}>Headlamp{busy === 'lamp' ? ' …' : ''}</Text>
          <Switch
            value={lamp}
            onValueChange={toggleLamp}
            disabled={!isConnected || busy === 'lamp'}
            trackColor={{ true: theme.colors.primary }}
          />
        </View>
        <View style={{ height: 8 }} />
        <Button
          label="Locate"
          variant="secondary"
          loading={busy === 'locate'}
          disabled={!isConnected || !!busy}
          onPress={() => withBusy('locate', async () => void (await rideActions.locate()))}
        />
        <View style={{ height: 8 }} />
        <Button
          label="Sound warning"
          variant="secondary"
          loading={busy === 'warn'}
          disabled={!isConnected || !!busy}
          onPress={() => withBusy('warn', async () => void (await rideActions.warn()))}
        />
        <Text style={styles.disclaimer}>
          Locate & warning are protocol labels only — the scooter's exact behavior is undefined (§8).
        </Text>
      </Card>

      <View style={{ height: 16 }} />
      <Button label="End ride & lock" variant="danger" loading={ending} onPress={onEndRide} />
    </ScrollView>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  muted: { color: theme.colors.textMuted, fontSize: 16 },
  h1: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  imei: { color: theme.colors.textMuted, fontSize: 15, marginTop: 4 },
  cardTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '700', marginBottom: 4 },
  lampRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  lampLabel: { color: theme.colors.text, fontSize: 16 },
  disclaimer: { color: theme.colors.textMuted, fontSize: 12, marginTop: 12, lineHeight: 17 },
});
