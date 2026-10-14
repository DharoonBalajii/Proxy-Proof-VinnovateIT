import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api, type DirectoryUser } from '../../api/client';
import { Screen } from '../../components/Screen';
import { Banner, Card, Chip, Mono, T } from '../../components/ui';
import { space } from '../../theme/tokens';
import { colors } from '../../theme/tokens';

const ROLE_ORDER = ['student', 'organiser', 'admin'] as const;

export default function People() {
  const [rows, setRows] = useState<DirectoryUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    api.get<DirectoryUser[]>('/admin/users').then((r) => { setRows(r); setError(null); }).catch((e) => setError(e.message));
  }, []));

  const students = rows?.filter((r) => r.role === 'student') ?? [];
  const bound = students.filter((s) => s.bound).length;

  return (
    <Screen eyebrow="Admin" title="People">
      {error ? <Banner tone="flare" title="Can’t load people">{error}</Banner> : null}
      {rows ? <T variant="body" color={colors.inkSoft}>{bound} of {students.length} students have linked a phone.</T> : null}
      {ROLE_ORDER.map((role) => {
        const group = rows?.filter((r) => r.role === role) ?? [];
        if (!group.length) return null;
        return (
          <View key={role} style={{ gap: space.sm }}>
            <T variant="label" color={colors.inkSoft}>{role === 'student' ? 'Students' : role === 'organiser' ? 'Organisers' : 'Admins'}</T>
            {group.map((u) => (
              <Card key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="title">{u.name}</T>
                  <Mono size={12} color={colors.inkSoft}>{u.rollNo}</Mono>
                </View>
                {role === 'student' ? <Chip label={u.bound ? (u.devicePlatform === 'ios' ? 'iPhone linked' : 'Phone linked') : 'No phone yet'} tone={u.bound ? 'locked' : 'neutral'} /> : null}
              </Card>
            ))}
          </View>
        );
      })}
    </Screen>
  );
}
