import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { api } from '../api/client';
import { AckTimeoutError, rideActions } from '../rideService';
import { ScooterInfo } from '../ble/protocol';
import { Banner, ScreenBackground, SectionTitle } from '../components/ui';
import { SlideAction } from '../components/SlideAction';
import { RadialGauge, batteryColor } from '../components/gauges';
import { log } from '../log';
import { useRideStore } from '../state/rideStore';
import { RootStackParamList } from '../navigation/types';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Ride'>;
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const POLL_INTERVAL_MS = 4000;
const LAMP_SYNC_GRACE_MS = 6000;

export function RideScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
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

  async function toggleLamp() {
    const next = !lamp;
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

  function onReset() {
    Alert.alert('Reset controller?', 'This reboots the scooter controller and may briefly disconnect it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => withBusy('reset', async () => void (await rideActions.reset())) },
    ]);
  }

  if (!rideId) {
    return (
      <ScreenBackground>
        <View style={styles.centered}>
          <Text style={styles.muted}>No active ride.</Text>
        </View>
      </ScreenBackground>
    );
  }

  const battery = info?.batteryPct ?? null;
  const battColor = battery == null ? theme.colors.primary : batteryColor(battery);
  const loadingInfo = info == null && isConnected;
  const disabled = !isConnected || !!busy;
  const ecuLocked = info?.locked ?? false;

  return (
    <ScreenBackground>
      <View style={[styles.screen, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 12 }]}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>ACTIVE RIDE</Text>
            <Text style={styles.imei}>{imei}</Text>
          </View>
          <StatusPill connected={isConnected} />
        </View>

        {!isConnected && <Banner tone="error" text="Bluetooth link lost — move closer." />}
        {statusError && isConnected && <Banner tone="error" text={statusError} />}

        <View style={styles.hero}>
          <RadialGauge value={battery} label="Battery" unit="%" color={battColor} loading={loadingInfo} size={148} />
          <View style={styles.metricsCol}>
            <Metric label="Speed" value={info ? `${info.speedKmh}` : '––'} unit="km/h" color={theme.colors.sky} />
            <Metric label="This ride" value={info ? `${info.currentMileageKm}` : '––'} unit="km" color={theme.colors.blue} />
            <Metric label="Total" value={info ? `${info.totalMileageKm}` : '––'} unit="km" color={theme.colors.magenta} />
            <Metric label="Ride time" value={info ? formatDuration(info.rideTimeSeconds) : '––'} color={theme.colors.green} />
          </View>
        </View>

        <SectionTitle color={theme.colors.sky}>Controls</SectionTitle>
        <View style={styles.ctrlRow}>
          <IconTile
            icon={ecuLocked ? 'lock-open-variant' : 'lock'}
            label={ecuLocked ? 'Unlock ECU' : 'Lock ECU'}
            color={ecuLocked ? theme.colors.green : theme.colors.warning}
            busy={busy === 'ecu'}
            disabled={disabled}
            onPress={() =>
              withBusy('ecu', async () => {
                if (ecuLocked) await rideActions.unlock();
                else await rideActions.lock();
                await refresh();
              })
            }
          />
          <IconTile
            icon="battery-lock-open"
            label="Batt unlock"
            color={theme.colors.green}
            busy={busy === 'battunlock'}
            disabled={disabled}
            onPress={() => withBusy('battunlock', async () => void (await rideActions.unlockBattery()))}
          />
          <IconTile
            icon="battery-lock"
            label="Batt lock"
            color={theme.colors.skyLight}
            busy={busy === 'battlock'}
            disabled={disabled}
            onPress={() => withBusy('battlock', async () => void (await rideActions.lockBattery()))}
          />
        </View>
        <View style={styles.ctrlRow}>
          <IconTile
            icon={lamp ? 'lightbulb-on' : 'lightbulb-outline'}
            label={lamp ? 'Lamp on' : 'Headlamp'}
            color={lamp ? theme.colors.sky : theme.colors.textMuted}
            active={lamp}
            indicator
            busy={busy === 'lamp'}
            disabled={disabled && busy !== 'lamp'}
            onPress={toggleLamp}
          />
          <IconTile
            icon="map-marker"
            label="Locate"
            color={theme.colors.sky}
            busy={busy === 'locate'}
            disabled={disabled}
            onPress={() => withBusy('locate', async () => void (await rideActions.locate()))}
          />
          <IconTile
            icon="alert"
            label="Warn"
            color={theme.colors.danger}
            busy={busy === 'warn'}
            disabled={disabled}
            onPress={() => withBusy('warn', async () => void (await rideActions.warn()))}
          />
        </View>

        <Pressable
          onPress={onReset}
          disabled={disabled}
          style={({ pressed }) => [styles.resetBtn, { opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}
        >
          {busy === 'reset' ? (
            <ActivityIndicator color={theme.colors.textMuted} />
          ) : (
            <>
              <MaterialCommunityIcons name="restart" size={18} color={theme.colors.textMuted} />
              <Text style={styles.resetText}>Reset controller</Text>
            </>
          )}
        </Pressable>

        </ScrollView>
        <SlideAction
          label="Slide to end & lock"
          busyLabel="Locking…"
          icon="lock"
          color={theme.colors.danger}
          onComplete={endRide}
          busy={ending}
        />
      </View>
    </ScreenBackground>
  );
}

function IconTile({
  icon,
  label,
  color = theme.colors.text,
  onPress,
  active,
  indicator,
  busy,
  disabled,
}: {
  icon: IconName;
  label: string;
  color?: string;
  onPress: () => void;
  active?: boolean;
  indicator?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.tile,
        active && { borderColor: color, borderWidth: 1.5 },
        { opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
      ]}
    >
      {indicator && active ? <View style={[styles.tileDot, { backgroundColor: color }]} /> : null}
      {busy ? (
        <ActivityIndicator color={color} />
      ) : (
        <MaterialCommunityIcons name={icon} size={27} color={color} />
      )}
      <Text style={[styles.tileLabel, active && { color }]}>{label}</Text>
    </Pressable>
  );
}

function Metric({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return (
    <View style={styles.metric}>
      <View style={[styles.metricBar, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>
          {value}
          {unit ? <Text style={[styles.metricUnit, { color }]}> {unit}</Text> : null}
        </Text>
      </View>
    </View>
  );
}

function StatusPill({ connected }: { connected: boolean }) {
  const color = connected ? theme.colors.green : theme.colors.danger;
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <View style={[styles.pillDot, { backgroundColor: color }, theme.glow(color, 8, 1)]} />
      <Text style={[styles.pillText, { color }]}>{connected ? 'LINKED' : 'LOST'}</Text>
    </View>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 18 },
  scroll: { flex: 1 },
  content: { paddingBottom: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  muted: { color: theme.colors.textMuted, fontSize: 16 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  kicker: { color: theme.colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 3 },
  imei: { color: theme.colors.text, fontSize: 16, fontFamily: theme.font.mono, marginTop: 3, letterSpacing: 0.5 },

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

  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 10, marginBottom: 16 },
  metricsCol: { flex: 1, gap: 8 },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  metricBar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  metricLabel: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  metricValue: { color: theme.colors.text, fontSize: 18, fontWeight: '800', fontFamily: theme.font.mono, marginTop: 1 },
  metricUnit: { fontSize: 11, fontWeight: '700' },

  ctrlRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  tile: {
    flex: 1,
    aspectRatio: 1.15,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tileLabel: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  tileDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4 },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  resetText: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },

});
