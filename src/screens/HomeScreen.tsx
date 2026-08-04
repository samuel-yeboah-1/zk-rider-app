import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { api } from '../api/client';
import { ApiError } from '../api/types';
import { Banner, Button, Card, Row } from '../components/ui';
import { QrScanner } from '../components/QrScanner';
import { useAuthStore } from '../state/authStore';
import { RootStackParamList } from '../navigation/types';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const logout = useAuthStore((s) => s.logout);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Scan or enter a scooter ID</Text>
      <Text style={styles.p}>The IMEI (~15 digits) is printed on the scooter and its QR code.</Text>

      <Button label="📷  Scan QR code" variant="secondary" onPress={() => setScanning(true)} />

      <Text style={styles.or}>— or —</Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={imeiInput}
          onChangeText={setImeiInput}
          placeholder="e.g. 860123456789012"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="number-pad"
          returnKeyType="search"
          onSubmitEditing={() => lookup(imeiInput)}
        />
        <Button label="Look up" onPress={() => lookup(imeiInput)} disabled={!imeiInput.trim()} />
      </View>

      {scooterQuery.isFetching && <Banner text="Checking availability…" />}
      {scooterQuery.isError && (
        <Banner
          tone="error"
          text={
            (scooterQuery.error as ApiError)?.code === 'scooter_not_found'
              ? `No scooter found for ${imei}.`
              : `Lookup failed: ${(scooterQuery.error as Error).message}`
          }
        />
      )}

      {scooter && (
        <Card style={{ marginTop: 12 }}>
          <Text style={styles.cardTitle}>Scooter {scooter.imei}</Text>
          <Row label="Availability" value={scooter.available ? 'Available' : 'Unavailable'} />
          <Row label="Lock state" value={scooter.lockState} />
          <Row label="Battery" value={`${scooter.batteryPct}%`} />
          <Row label="Mileage" value={`${scooter.currentMileage} km`} />
          <View style={{ height: 12 }} />
          {canUnlock ? (
            <Button label="Unlock this scooter" onPress={() => navigation.navigate('Unlock', { imei: scooter.imei })} />
          ) : (
            <Banner
              tone="error"
              text={
                !scooter.available
                  ? 'This scooter is not available right now.'
                  : 'This scooter is already unlocked / in use.'
              }
            />
          )}
        </Card>
      )}

      <View style={{ flex: 1 }} />
      <Button label="Sign out" variant="secondary" onPress={logout} />

      <QrScanner
        visible={scanning}
        onClose={() => setScanning(false)}
        onScanned={(value) => {
          setScanning(false);
          lookup(value);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 20, gap: 12, flexGrow: 1 },
  h1: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  p: { color: theme.colors.textMuted, fontSize: 15, marginBottom: 8 },
  or: { color: theme.colors.textMuted, textAlign: 'center', marginVertical: 4 },
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: 14,
    color: theme.colors.text,
    fontSize: 16,
  },
  cardTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
});
