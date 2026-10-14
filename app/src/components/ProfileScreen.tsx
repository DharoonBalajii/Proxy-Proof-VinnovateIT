import { View } from 'react-native';
import { Screen } from './Screen';
import { Banner, Button, Card, Chip, Divider, Mono, T } from './ui';
import { nativeBleAvailable } from '../ble';
import { useApp } from '../store/app';
import { colors, space } from '../theme/tokens';
import { initials } from '../lib/format';

const ROLE = { student: 'Student', organiser: 'Organiser', admin: 'Admin' } as const;

export function ProfileScreen() {
  const { user, deviceId, serverUrl, bleMode, setBleMode, signOut } = useApp();
  if (!user) return null;
  const canNative = nativeBleAvailable();
  return (
    <Screen eyebrow={ROLE[user.role]} title="Profile">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          <T variant="h2" color="#fff">{initials(user.name)}</T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="title">{user.name}</T>
          <Mono size={13} color={colors.inkSoft}>{user.rollNo}</Mono>
        </View>
      </Card>

      {user.role === 'student' ? (
        <Card style={{ gap: space.sm }}>
          <T variant="label" color={colors.inkSoft}>Linked phone</T>
          <Mono size={12}>{deviceId}</Mono>
          <T variant="small" color={colors.inkSoft}>
            Attendance only counts from this phone. To switch, sign in on the new phone and ask an admin to approve it.
          </T>
        </Card>
      ) : null}

      {user.role !== 'admin' ? (
        <Card style={{ gap: space.md }}>
          <T variant="label" color={colors.inkSoft}>Signal source</T>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Chip label="Bluetooth" selected={bleMode === 'native'} onPress={() => canNative && setBleMode('native')} />
            <Chip label="Simulated" selected={bleMode === 'sim'} onPress={() => setBleMode('sim')} />
          </View>
          {!canNative ? (
            <T variant="small" color={colors.inkSoft}>Real Bluetooth needs the development build on a physical phone. Simulated mode relays the signal through the server so you can try the whole flow here.</T>
          ) : null}
        </Card>
      ) : null}

      <Card style={{ gap: space.sm }}>
        <T variant="label" color={colors.inkSoft}>Server</T>
        <Mono size={12}>{serverUrl}</Mono>
      </Card>

      <Divider />
      <Button label="Sign out" variant="danger" icon="logout" onPress={signOut} />
    </Screen>
  );
}
