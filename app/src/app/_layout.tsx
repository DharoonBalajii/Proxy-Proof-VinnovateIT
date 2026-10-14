import { useEffect } from 'react';
import { View } from 'react-native';
import { Slot, SplashScreen, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  Archivo_400Regular, Archivo_500Medium, Archivo_700Bold,
} from '@expo-google-fonts/archivo';
import { BigShoulders_800ExtraBold, BigShoulders_900Black } from '@expo-google-fonts/big-shoulders';
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { AppProvider, useApp } from '../store/app';
import { colors } from '../theme/tokens';

void SplashScreen.preventAutoHideAsync();

function Gate() {
  const { ready, user } = useApp();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const group = segments[0] as string | undefined;
    if (!user) {
      if (group !== 'login') router.replace('/login');
      return;
    }
    if (group !== `(${user.role})`) router.replace(`/(${user.role})` as never);
  }, [ready, user, segments, router]);

  return <Slot />;
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Archivo_400Regular, Archivo_500Medium, Archivo_700Bold,
    BigShoulders_800ExtraBold, BigShoulders_900Black,
    JetBrainsMono_500Medium, JetBrainsMono_700Bold,
  });
  useEffect(() => { if (loaded) void SplashScreen.hideAsync(); }, [loaded]);
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.chalk }} />;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppProvider>
        <Gate />
      </AppProvider>
    </SafeAreaProvider>
  );
}
