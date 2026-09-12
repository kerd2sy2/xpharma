import { DarkTheme, DefaultTheme, ThemeProvider, Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View, ActivityIndicator } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import LoginScreen from '@/screens/LoginScreen';
import DeviceMismatchModal from '@/components/DeviceMismatchModal';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { user, isLoading, deviceMismatchInfo, clearDeviceMismatch, logout } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3f0082" />
      </View>
    );
  }

  return (
    <>
      {!user ? <LoginScreen /> : <Slot />}
      <DeviceMismatchModal
        visible={!!deviceMismatchInfo?.isMismatch}
        onClose={clearDeviceMismatch}
        registeredDevice={deviceMismatchInfo?.registeredDevice}
        currentDevice={deviceMismatchInfo?.currentDevice}
        email={deviceMismatchInfo?.email || user?.email}
        errorMessage={deviceMismatchInfo?.error}
        onLogout={logout}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider value={DefaultTheme}>
        <AnimatedSplashOverlay />
        <RootNavigator />
      </ThemeProvider>
    </AuthProvider>
  );
}
