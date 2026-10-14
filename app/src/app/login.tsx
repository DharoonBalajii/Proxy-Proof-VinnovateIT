import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import { ApiError } from '../api/client';
import { PulseRing } from '../components/PulseRing';
import { Banner, Button, Card, Chip, Field, T, Mono } from '../components/ui';
import { useApp } from '../store/app';
import { colors, space } from '../theme/tokens';

const DEMO = [
  { label: 'Student', roll: '23CS001' },
  { label: 'Another student', roll: '23CS002' },
  { label: 'Organiser', roll: 'FAC01' },
  { label: 'Admin', roll: 'ADMIN' },
];

export default function Login() {
  const { signIn, serverUrl, setServerUrl, deviceId, setDeviceId } = useApp();
  const [roll, setRoll] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [showServer, setShowServer] = useState(false);
  const [urlDraft, setUrlDraft] = useState(serverUrl);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(roll.trim(), password);
    } catch (e) {
      const err = e as ApiError;
      setError({ code: err.code ?? 'error', message: err.message ?? 'Could not sign in.' });
    } finally {
      setBusy(false);
    }
  };

  const pending = error?.code === 'device_pending';

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <PulseRing state="listening" size={210} />
          </View>
          <View style={{ gap: space.sm, alignItems: 'center' }}>
            <T variant="display" color={colors.ink}>ProxyProof</T>
            <T variant="body" color={colors.inkSoft} style={{ textAlign: 'center' }}>Walk into class. Your phone does the rest.</T>
          </View>

          <Card style={{ gap: space.lg, padding: space.xl }}>
            <Field label="Roll number" value={roll} onChangeText={setRoll} autoCapitalize="characters" autoCorrect={false} placeholder="23CS001" returnKeyType="next" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" returnKeyType="go" onSubmitEditing={submit} />
            {error ? (
              <Banner tone={pending ? 'signal' : 'flare'} title={pending ? 'Waiting for admin approval' : 'Could not sign in'}>
                {error.message}
              </Banner>
            ) : null}
            <Button label="Sign in" onPress={submit} loading={busy} disabled={!roll.trim() || !password} />
          </Card>


          {__DEV__ ? (
            <View style={{ gap: space.sm }}>
              <T variant="label" color={colors.inkSoft}>Demo accounts</T>
              <View style={styles.chips}>
                {DEMO.map((d) => (
                  <Chip key={d.roll} label={d.label} onPress={() => { setRoll(d.roll); setPassword('proxyproof'); }} />
                ))}
              </View>
            </View>
          ) : null}

          <View style={{ gap: space.md }}>
            <T variant="small" color={colors.signal} style={{ fontFamily: 'Archivo_700Bold' }} accessibilityRole="button" onPress={() => setShowServer((v) => !v)}>
              {showServer ? 'Hide server settings' : 'Server settings'}
            </T>
            {showServer ? (
              <View style={{ gap: space.md }}>
                <Field label="Server address" value={urlDraft} onChangeText={setUrlDraft} autoCapitalize="none" autoCorrect={false} keyboardType="url" onBlur={() => setServerUrl(urlDraft.trim())} />
                <View style={{ gap: 6 }}>
                  <T variant="label" color={colors.inkSoft}>This phone's ID</T>
                  <Mono size={12} color={colors.inkSoft}>{deviceId}</Mono>
                  <Button small variant="ghost" label="Use a new ID" onPress={() => setDeviceId(randomUUID())} />
                  <T variant="small" color={colors.inkSoft}>Each student account locks to one phone ID. A new ID is treated as a new phone and needs admin approval.</T>
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.chalk },
  content: { padding: space.xl, gap: space.xl, paddingBottom: space.huge },
  hero: { alignItems: 'center', marginTop: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
