import {
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  Fraunces_900Black,
} from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/lib/auth-context';
import { FocusProvider, useFocus } from '@/lib/focus-context';
import { colors } from '@/lib/theme';

export const unstable_settings = {
  anchor: '(tabs)',
};

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    primary: colors.accent,
  },
};

function AuthGate() {
  const { session, loading } = useAuth();
  const { profile, profileLoaded } = useFocus();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    const onSetupRole = inAuthGroup && segments[1] === 'setup-role';

    // Not signed in → push to sign-in (unless already in auth group)
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
      return;
    }

    // Signed in but no profile yet — finish role setup before entering the app.
    // We wait for profileLoaded to flip true so we don't bounce them while
    // the profile fetch is still in flight.
    if (session && profileLoaded && !profile && !onSetupRole) {
      router.replace('/(auth)/setup-role');
      return;
    }

    // Signed in with a profile, but stuck on an auth screen → drop into app.
    if (session && profile && inAuthGroup) {
      router.replace('/');
    }
  }, [loading, session, profile, profileLoaded, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      <Stack.Screen name="player" options={{ presentation: 'modal', headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Fraunces_900Black,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <ThemeProvider value={navTheme}>
        <FocusProvider>
          <AuthGate />
          <StatusBar style="dark" />
        </FocusProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
