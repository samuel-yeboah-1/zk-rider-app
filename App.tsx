import 'react-native-gesture-handler';
import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { RootNavigator } from './src/navigation';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } },
});

export default function App() {
  const [fontsLoaded] = useFonts(MaterialCommunityIcons.font);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#040b12' }} />;
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <RootNavigator />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
