import { DarkTheme, DefaultTheme, ThemeProvider, Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View, ActivityIndicator } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import LoginScreen from '@/screens/LoginScreen';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  // If user is not signed in, show pure social login screen
  if (!user) {
    return <LoginScreen />;
  }

  // If user is signed in, render app directly without bottom navbar
  return <Slot />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <RootNavigator />
      </ThemeProvider>
    </AuthProvider>
  );
}
