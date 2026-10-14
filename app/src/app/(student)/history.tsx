import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { api, type HistoryCourse } from '../../api/client';
import { Screen } from '../../components/Screen';
import { Card, Chip, Empty, Mono, Skeleton, T } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { fmtDay, fmtClock } from '../../lib/format';
import { colors, space } from '../../theme/tokens';

const MINIMUM = 75;

function PercentRing({ value, size = 76 }: { value: number; size?: number }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const low = value < MINIMUM;
  const color = low ? colors.flare : colors.locked;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.hazeSoft} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - value / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: 'absolute' }}>
        <T variant="h2" color={low ? colors.flare : colors.ink}>{value}%</T>
      </View>
    </View>
  );
}

export default function History() {
  const [data, setData] = useState<HistoryCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api.get<HistoryCourse[]>('/me/attendance')); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <Screen
      eyebrow="Attendance" title="History" refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
    >
      {!data && !error ? <><Skeleton height={190} /><Skeleton height={190} /></> : null}
      {error ? <Empty icon="alert" title="Can’t load history" body={error} /> : null}
      {data && data.length === 0 ? <Empty icon="book" title="No classes yet" body="Once an organiser enrols you, your classes appear here." /> : null}
      {data?.map((c) => (
        <Card key={c.course.id} style={{ gap: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <PercentRing value={c.percent} />
            <View style={{ flex: 1, gap: 4 }}>
              <Mono size={12} color={colors.inkSoft}>{c.course.code}</Mono>
              <T variant="title">{c.course.name}</T>
              <T variant="small" color={colors.inkSoft}>{c.attended} of {c.total} classes</T>
              {c.total > 0 && c.percent < MINIMUM ? <Chip label={`Below ${MINIMUM}% minimum`} tone="flare" /> : null}
            </View>
          </View>
          {c.sessions.length > 0 ? (
            <View style={{ gap: 2 }}>
              {c.sessions.slice(0, 8).map((s) => (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: space.md }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: s.present ? colors.lockedSoft : colors.flareSoft }}>
                    <Icon name={s.present ? 'check' : 'x'} size={13} stroke={3} color={s.present ? colors.locked : colors.flare} />
                  </View>
                  <T variant="small" style={{ flex: 1 }}>{fmtDay(s.startedAt)}</T>
                  <Mono size={12} color={colors.inkSoft}>{fmtClock(s.startedAt)}</Mono>
                  <T variant="small" color={s.present ? colors.locked : colors.flare} style={{ width: 56, textAlign: 'right', fontFamily: 'Archivo_700Bold' }}>
                    {s.present ? 'Present' : 'Absent'}
                  </T>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
