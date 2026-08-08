import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuthStore } from '../state/authStore';
import { theme } from '../theme';
import { RootStackParamList } from './types';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { UnlockScreen } from '../screens/UnlockScreen';
import { RideScreen } from '../screens/RideScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.bgDeep,
    card: theme.colors.bgDeep,
    text: theme.colors.text,
    border: theme.colors.border,
    primary: theme.colors.primary,
  },
};

export function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.bgDeep },
          headerTintColor: theme.colors.primary,
          headerShadowVisible: false,
          headerTitleStyle: { color: theme.colors.text, fontWeight: '800' },
          contentStyle: { backgroundColor: theme.colors.bgDeep },
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Aldin Cycles' }} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Unlock" component={UnlockScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Ride" component={RideScreen} options={{ headerShown: false }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
