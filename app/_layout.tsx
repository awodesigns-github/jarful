import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useFonts } from 'expo-font';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { ShantellSans_800ExtraBold } from '@expo-google-fonts/shantell-sans';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DataProvider } from '@/lib/data';
import { ConnectGate } from '@/components/ConnectGate';
import { ThemeProvider, useTheme } from '@/theme';
import { SettingsEffects } from '@/components/settings/SettingsEffects';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Shell() {
  const { theme, scheme } = useTheme();
  useEffect(() => {
    // Keeps the window behind the navigation bar in the theme colour.
    SystemUI.setBackgroundColorAsync(theme.colors.bgBase).catch(() => {});
  }, [theme.colors.bgBase]);
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bgBase } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="compose" options={{ presentation: 'modal' }} />
        <Stack.Screen name="archive" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="sign-in-progress" options={{ gestureEnabled: false }} />
        <Stack.Screen name="delete-done" options={{ gestureEnabled: false }} />
      </Stack>
      <SettingsEffects />
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    ShantellSans_800ExtraBold,
  });
  const ready = loaded || !!error; // fall back to system fonts rather than hang on the splash
  if (!ready) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={() => SplashScreen.hideAsync().catch(() => {})}>
      <SafeAreaProvider>
        <DataProvider>
          <ThemeProvider>
            <ConnectGate>
              <Shell />
            </ConnectGate>
          </ThemeProvider>
        </DataProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
