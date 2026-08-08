import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { api } from '../api/client';
import { ApiError } from '../api/types';
import { getBleManager, ScooterConnection, waitForPoweredOn } from '../ble/bleManager';
import { IScooterConnection } from '../ble/connection';
import { ensureBlePermissions } from '../ble/permissions';
import { Banner, Button, ScreenBackground } from '../components/ui';
import { SlideAction } from '../components/SlideAction';
import { rideActions } from '../rideService';
import { useRideStore } from '../state/rideStore';
import { RootStackParamList } from '../navigation/types';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Unlock'>;

type StepState = 'pending' | 'active' | 'done' | 'error';
type Step = { label: string; hint: string; state: StepState };

const STEPS: Array<{ label: string; hint: string }> = [
  { label: 'Authorizing ride', hint: 'Requesting access from the fleet' },
  { label: 'Checking Bluetooth', hint: 'Waking the radio & permissions' },
  { label: 'Connecting to scooter', hint: 'Locking on to the BLE signal' },
];

export function UnlockScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { imei } = route.params;
  const startRide = useRideStore((s) => s.startRide);
  const setConnection = useRideStore((s) => s.setConnection);
  const clear = useRideStore((s) => s.clear);

  const [steps, setSteps] = useState<Step[]>(STEPS.map((s) => ({ ...s, state: 'pending' })));
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [starting, setStarting] = useState(false);
  const connRef = useRef<IScooterConnection | null>(null);
  const cancelled = useRef(false);
  const started = useRef(false);

  function setStep(i: number, state: StepState) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, state } : s)));
  }

  async function releaseRide() {
    const rid = useRideStore.getState().rideId;
    const conn = connRef.current;
    connRef.current = null;
    try {
      await conn?.disconnect();
    } catch {
      /* already gone */
    }
    if (rid) {
      try {
        await api.endRide(rid);
      } catch {
        /* best effort */
      }
    }
    clear();
  }

  async function run() {
    setError(null);
    setConnected(false);
    cancelled.current = false;
    setSteps(STEPS.map((s) => ({ ...s, state: 'pending' })));

    try {
      setStep(0, 'active');
      const ride = await api.startRide(imei);
      startRide({ rideId: ride.rideId, imei, blePassword: ride.blePassword, passwordMode: ride.passwordMode });
      setStep(0, 'done');
      if (cancelled.current) return;

      setStep(1, 'active');
      const perm = await ensureBlePermissions();
      if (!perm.granted) throw new Error(`Bluetooth permission denied: ${perm.missing.join(', ')}`);
      await waitForPoweredOn(getBleManager());
      setStep(1, 'done');
      if (cancelled.current) return;

      setStep(2, 'active');
      const conn: IScooterConnection = await ScooterConnection.connect(getBleManager(), imei, {
        onDisconnect: () => {
          if (!cancelled.current) setError('Scooter disconnected. Move closer and retry.');
        },
      });
      connRef.current = conn;
      setConnection(conn);
      setStep(2, 'done');
      if (cancelled.current) return;

      setConnected(true);
    } catch (e) {
      const msg = e instanceof ApiError ? apiErrorMessage(e) : (e as Error)?.message ?? 'Unknown error';
      setError(msg);
      setSteps((prev) => prev.map((s) => (s.state === 'active' ? { ...s, state: 'error' } : s)));
      await releaseRide();
    }
  }

  async function startBike() {
    setStarting(true);
    setError(null);
    try {
      const unlocked = await rideActions.unlock();
      if (!unlocked) throw new Error('Scooter rejected the unlock (ack result not "unlocked").');
      started.current = true;
      navigation.replace('Ride');
    } catch (e) {
      setError((e as Error)?.message ?? 'Could not start the bike.');
      setStarting(false);
    }
  }

  function cancel() {
    navigation.goBack();
  }

  useEffect(() => {
    run();
    return () => {
      cancelled.current = true;
      if (!started.current) {
        const rid = useRideStore.getState().rideId;
        const conn = connRef.current;
        connRef.current = null;
        conn?.disconnect().catch(() => {});
        if (rid) api.endRide(rid).catch(() => {});
        clear();
      }
    };
  }, []);

  const activeIndex = steps.findIndex((s) => s.state === 'active');
  const doneCount = steps.filter((s) => s.state === 'done').length;
  const hasError = steps.some((s) => s.state === 'error');

  return (
    <ScreenBackground>
      <View style={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.kicker}>
          {hasError ? 'LINK INTERRUPTED' : connected ? 'READY TO RIDE' : 'ESTABLISHING LINK'}
        </Text>
        <Text style={styles.h1}>
          {hasError ? 'Something stalled' : connected ? 'Bike connected' : 'Connecting…'}
        </Text>
        <Text style={styles.imei}>{imei}</Text>

        <Pulse
          active={activeIndex >= 0}
          error={hasError}
          done={connected && !hasError}
          progress={connected ? 1 : doneCount / STEPS.length}
        />

        <View style={styles.steps}>
          {steps.map((s, i) => (
            <StepRow key={i} step={s} isLast={i === steps.length - 1} />
          ))}
        </View>

        <View style={{ flex: 1 }} />

        {connected && !error && (
          <View style={styles.startWrap}>
            <Text style={styles.readyHint}>Connected. Slide to release the lock and begin your ride.</Text>
            <SlideAction
              label="Slide to start"
              busyLabel="Starting…"
              icon="power"
              color={theme.colors.primary}
              onComplete={startBike}
              busy={starting}
            />
            <Button label="Cancel" variant="secondary" onPress={cancel} />
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Banner tone="error" text={error} />
            <View style={{ gap: 10, marginTop: 6 }}>
              {connected ? (
                <SlideAction
                  label="Slide to start"
                  busyLabel="Starting…"
                  icon="power"
                  color={theme.colors.primary}
                  onComplete={startBike}
                  busy={starting}
                />
              ) : (
                <Button label="Retry" onPress={run} />
              )}
              <Button label="Back" variant="secondary" onPress={() => navigation.goBack()} />
            </View>
          </View>
        )}
      </View>
    </ScreenBackground>
  );
}

function Pulse({ active, error, done, progress }: { active: boolean; error: boolean; done: boolean; progress: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const color = error ? theme.colors.danger : done ? theme.colors.green : theme.colors.primary;

  useEffect(() => {
    if (!active || error || done) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    a.start();
    return () => a.stop();
  }, [active, error, done, pulse]);

  return (
    <View style={styles.orbWrap}>
      {[0, 1].map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.orbRing,
            { borderColor: color },
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5 + i * 0.2, 1.15 + i * 0.15] }) }],
            },
          ]}
        />
      ))}
      <View style={[styles.orbCore, { backgroundColor: color }, theme.glow(color, 26, 0.9)]}>
        <Text style={styles.orbPct}>{done ? '✓' : error ? '!' : `${Math.round(progress * 100)}%`}</Text>
      </View>
    </View>
  );
}

function StepRow({ step, isLast }: { step: Step; isLast: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (step.state !== 'active') {
      pulse.setValue(0);
      return;
    }
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    a.start();
    return () => a.stop();
  }, [step.state, pulse]);

  const color =
    step.state === 'done'
      ? theme.colors.green
      : step.state === 'active'
      ? theme.colors.primary
      : step.state === 'error'
      ? theme.colors.danger
      : theme.colors.textDim;

  const glyph = step.state === 'done' ? '✓' : step.state === 'error' ? '✕' : step.state === 'active' ? '' : '';

  return (
    <View style={styles.stepRow}>
      <View style={styles.stepRail}>
        <Animated.View
          style={[
            styles.stepNode,
            { borderColor: color, backgroundColor: step.state === 'done' ? color : 'transparent' },
            step.state === 'active' ? { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) } : null,
            step.state !== 'pending' ? theme.glow(color, 10, 0.5) : null,
          ]}
        >
          <Text style={[styles.stepGlyph, { color: step.state === 'done' ? theme.colors.primaryText : color }]}>{glyph}</Text>
        </Animated.View>
        {!isLast && <View style={[styles.stepLine, { backgroundColor: step.state === 'done' ? theme.colors.green : theme.colors.border }]} />}
      </View>
      <View style={styles.stepText}>
        <Text style={[styles.stepLabel, { color: step.state === 'pending' ? theme.colors.textDim : theme.colors.text }]}>{step.label}</Text>
        <Text style={styles.stepHint}>
          {step.state === 'active' ? step.hint + '…' : step.state === 'done' ? 'Done' : step.state === 'error' ? 'Failed here' : step.hint}
        </Text>
      </View>
    </View>
  );
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
  content: { flex: 1, padding: 24, paddingTop: 20 },
  kicker: { color: theme.colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  h1: { fontSize: 30, fontWeight: '900', color: theme.colors.text, marginTop: 6, letterSpacing: -0.5 },
  imei: { color: theme.colors.textMuted, fontSize: 15, fontFamily: theme.font.mono, marginTop: 6, letterSpacing: 0.5 },

  orbWrap: { alignItems: 'center', justifyContent: 'center', height: 150, marginVertical: 18 },
  orbRing: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 1.5 },
  orbCore: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  orbPct: { color: theme.colors.primaryText, fontSize: 22, fontWeight: '900', fontFamily: theme.font.mono },

  steps: { marginTop: 8 },
  stepRow: { flexDirection: 'row', gap: 14 },
  stepRail: { alignItems: 'center', width: 34 },
  stepNode: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontSize: 15, fontWeight: '900' },
  stepLine: { width: 2, flex: 1, minHeight: 26, marginVertical: 2 },
  stepText: { flex: 1, paddingBottom: 22, paddingTop: 4 },
  stepLabel: { fontSize: 17, fontWeight: '700' },
  stepHint: { color: theme.colors.textMuted, fontSize: 13, marginTop: 3 },

  errorBox: { marginTop: 8 },
  startWrap: { marginTop: 12, gap: 12 },
  readyHint: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 },
});
