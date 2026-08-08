import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '../components/ui';
import { useAuthStore } from '../state/authStore';
import { theme } from '../theme';

export function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('rider@example.com');
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    setLoading(true);
    try {
      await login(email.trim());
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>⚡ ZK Rider</Text>
        <Text style={styles.subtitle}>Sign in to unlock a scooter.</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor={theme.colors.textMuted}
        />

        <View style={{ height: 16 }} />
        <Button label="Sign in" onPress={onLogin} loading={loading} disabled={!email.trim()} />
        <Text style={styles.note}>
          Auth is a stub (§5.1). Any email works; the backend accepts the dev token.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 34, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  label: { color: theme.colors.textMuted, marginBottom: 6, fontSize: 14 },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: 14,
    color: theme.colors.text,
    fontSize: 16,
  },
  note: { color: theme.colors.textMuted, fontSize: 12, marginTop: 16, textAlign: 'center' },
});
