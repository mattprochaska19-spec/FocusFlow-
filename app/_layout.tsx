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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { onboardingDoneKey } from '@/app/(auth)/onboarding';
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
    let cancelled = false;
    (async () => {
      // Read AsyncStorage inline so the routing decision uses the freshest
      // onboarding flag — no race against a separately-cached state value
      // when the user just completed onboarding and we navigate to /.
      // Key is scoped per user so signing out + back in as the same parent
      // doesn't re-trigger onboarding; a different user gets a fresh funnel.
      const onboardingDone = session?.user.id
        ? (await AsyncStorage.getItem(onboardingDoneKey(session.user.id))) === '1'
        : false;
      if (cancelled) return;

      const inAuthGroup = segments[0] === '(auth)';
      const onSetupRole = inAuthGroup && segments[1] === 'setup-role';
      const onOnboarding = inAuthGroup && segments[1] === 'onboarding';
      const onWalkthrough = inAuthGroup && segments[1] === 'walkthrough';

      // Not signed in → push to sign-in (unless already in auth group)
      if (!session && !inAuthGroup) {
        router.replace('/(auth)/sign-in');
        return;
      }

      // Signed in but no profile yet — finish role setup before entering the
      // app. Wait for profileLoaded so we don't bounce mid-fetch.
      if (session && profileLoaded && !profile && !onSetupRole && !onOnboarding) {
        router.replace('/(auth)/setup-role');
        return;
      }

      // Signed-in parent who hasn't seen onboarding yet → route to it.
      // Catches force-quits mid-flow and existing accounts pre-onboarding.
      if (
        session &&
        profile &&
        profile.role === 'parent' &&
        !onboardingDone &&
        !onOnboarding
      ) {
        router.replace('/(auth)/onboarding');
        return;
      }

      // Signed-in parent past onboarding but who hasn't completed the
      // tap-through walkthrough → route to it. Walkthrough completion is
      // tracked server-side on the profile so it persists across devices.
      if (
        session &&
        profile &&
        profile.role === 'parent' &&
        onboardingDone &&
        !profile.walkthroughCompletedAt &&
        !onWalkthrough
      ) {
        router.replace('/(auth)/walkthrough');
        return;
      }

      // Signed in with a profile, but stuck on an auth screen → drop into app.
      // Don't override when intentionally on onboarding/walkthrough — those
      // screens own their own exits.
      if (session && profile && inAuthGroup && !onOnboarding && !onWalkthrough) {
        router.replace('/');
      }
    })();
    return () => { cancelled = true; };
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
