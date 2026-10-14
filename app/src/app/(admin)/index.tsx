import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api, type DeviceRequest } from '../../api/client';
import { Screen } from '../../components/Screen';
import { Banner, Button, Card, Chip, Empty, Mono, Skeleton, T } from '../../components/ui';
import { fmtAgo } from '../../lib/format';
import { colors, space } from '../../theme/tokens';

const PLATFORM: Record<string, string> = { ios: 'iPhone', android: 'Android phone' };

export default function Requests() {
  const [rows, setRows] = useState<DeviceRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try { setRows(await api.get<DeviceRequest[]>('/admin/device-requests')); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const decide = async (r: DeviceRequest, decision: 'approve' | 'reject') => {
    setBusyId(r.id);
    try { await api.post(`/admin/device-requests/${r.id}/${decision}`); await load(); }
    catch (e) { Alert.alert('Could not save', (e as Error).message); }
    finally { setBusyId(null); }
  };

  return (
    <Screen
      eyebrow="Admin" title="Phone changes" refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
    >
      <T variant="body" color={colors.inkSoft}>Students are locked to one phone. Approve a request only after you have checked it is really them.</T>
      {error ? <Banner tone="flare" title="Can’t load requests">{error}</Banner> : null}
      {!rows && !error ? <Skeleton height={170} /> : null}
      {rows && rows.length === 0 ? <Empty icon="inbox" title="Nothing waiting" body="When a student signs in on a new phone, the request shows up here." /> : null}
      {rows?.map((r) => (
        <Card key={r.id} style={{ gap: space.lg }}>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T variant="h2">{r.name}</T>
              <Chip label={fmtAgo(r.createdAt)} />
            </View>
            <Mono size={12} color={colors.inkSoft}>{r.rollNo}</Mono>
          </View>
          <T variant="small" color={colors.inkSoft}>
            Wants to switch from {PLATFORM[r.currentPlatform ?? ''] ?? 'their current phone'} to {PLATFORM[r.platform ?? ''] ?? 'a new phone'}.
          </T>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button style={{ flex: 1 }} label="Approve" variant="locked" onPress={() => decide(r, 'approve')} loading={busyId === r.id} />
            <Button style={{ flex: 1 }} label="Decline" variant="danger" onPress={() => decide(r, 'reject')} disabled={busyId === r.id} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
