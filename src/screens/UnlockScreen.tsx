import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { api } from '../api/client';
import { ApiError } from '../api/types';
import { getBleManager, ScooterConnection, waitForPoweredOn } from '../ble/bleManager';
import { ensureBlePermissions } from '../ble/permissions';
import { Banner, Button, Card } from '../components/ui';
import { rideActions } from '../rideService';
import { useRideStore } from '../state/rideStore';
import { RootStackParamList } from '../navigation/types';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Unlock'>;

type Step = { label: string; state: 'pending' | 'active' | 'done' | 'error' };

const STEPS = ['Authorizing ride', 'Checking Bluetooth', 'Connecting to scooter', 'Unlocking'] as const;

export function UnlockScreen({ route, navigation }: Props) {
  const { imei } = route.params;
  const startRide = useRideStore((s) => s.startRide);
  const setConnection = useRideStore((s) => s.setConnection);
  const clear = useRideStore((s) => s.clear);

  const [steps, setSteps] = useState<Step[]>(STEPS.map((label) => ({ label, state: 'pending' })));
  const [error, setError] = useState<string | null>(null);
  const connRef = useRef<ScooterConnection | null>(null);
  const cancelled = useRef(false);

  function setStep(i: number, state: Step['state']) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, state } : s)));
  }

  async function run() {
    setError(null);
    cancelled.current = false;
    setSteps(STEPS.map((label) => ({ label, state: 'pending' })));
    const manager = getBleManager();

    try {
      setStep(0, 'active');
      const ride = await api.startRide(imei);
      startRide({ rideId: ride.rideId, imei, blePassword: ride.blePassword, passwordMode: ride.passwordMode });
      setStep(0, 'done');
      if (cancelled.current) return;

      setStep(1, 'active');
      const perm = await ensureBlePermissions();
      if (!perm.granted) throw new Error(`Bluetooth permission denied: ${perm.missing.join(', ')}`);
      await waitForPoweredOn(manager);
      setStep(1, 'done');
      if (cancelled.current) return;

      setStep(2, 'active');
      const conn = await ScooterConnection.connect(manager, imei, {
        onDisconnect: () => {
          if (!cancelled.current) setError('Scooter disconnected. Move closer and retry.');
        },
      });
      connRef.current = conn;
      setConnection(conn);
      setStep(2, 'done');
      if (cancelled.current) return;

      setStep(3, 'active');
      const unlocked = await rideActions.unlock();
      if (!unlocked) throw new Error('Scooter rejected the unlock (ack result not "unlocked").');
      setStep(3, 'done');

      navigation.replace('Ride');
    } catch (e) {
      const msg =
        e instanceof ApiError ? apiErrorMessage(e) : (e as Error)?.message ?? 'Unknown error';
      setError(msg);
      setSteps((prev) => prev.map((s) => (s.state === 'active' ? { ...s, state: 'error' } : s)));
      await connRef.current?.disconnect();
      connRef.current = null;
      clear();
    }
  }

  useEffect(() => {
    run();
    return () => {
      cancelled.current = true;
    };
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Unlocking scooter</Text>
      <Text style={styles.imei}>{imei}</Text>

      <Card style={{ marginTop: 16 }}>
        {steps.map((s, i) => (
          <View key={i} style={styles.step}>
            <Text style={styles.stepIcon}>{icon(s.state)}</Text>
            <Text style={[styles.stepLabel, s.state === 'error' && { color: theme.colors.danger }]}>
              {s.label}
            </Text>
          </View>
        ))}
      </Card>

      {error && <Banner tone="error" text={error} />}

      {error && (
        <View style={{ gap: 10, marginTop: 8 }}>
          <Button label="Retry" onPress={run} />
          <Button label="Back" variant="secondary" onPress={() => navigation.goBack()} />
        </View>
      )}
    </ScrollView>
  );
}

function icon(state: Step['state']): string {
  return state === 'done' ? '✅' : state === 'active' ? '⏳' : state === 'error' ? '❌' : '⚪️';
}

function apiErrorMessage(e: ApiError): string {
  switch (e.code) {
    case 'scooter_in_use':
      return 'This scooter is already in use.';
    case 'no_active_password':
      return 'No active password from the backend (dynamic mode). Try again shortly.';
    case 'no_static_password_set':
      return 'No static password is set on this scooter.';
    case 'scooter_not_found':
      return 'Scooter not found.';
    case 'unauthorized':
      return 'Your session expired. Please sign in again.';
    default:
      return `Ride authorization failed (${e.code}).`;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 20, gap: 12 },
  h1: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  imei: { color: theme.colors.textMuted, fontSize: 15, marginTop: 4 },
  step: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  stepIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  stepLabel: { color: theme.colors.text, fontSize: 16 },
});
