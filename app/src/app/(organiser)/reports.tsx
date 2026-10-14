import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, type Course, type SessionRow } from '../../api/client';
import { Icon } from '../../components/Icon';
import { Screen } from '../../components/Screen';
import { Bar, Button, Card, Chip, Empty, Mono, Skeleton, T } from '../../components/ui';
import { fmtClock, fmtDay } from '../../lib/format';
import { shareCsv } from '../../lib/share';
import { colors, space } from '../../theme/tokens';

export default function Reports() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (pick?: number | null) => {
    try {
      const cs = await api.get<Course[]>('/courses');
      setCourses(cs);
      const id = pick ?? courseId ?? cs[0]?.id ?? null;
      setCourseId(id);
      setRows(id ? await api.get<SessionRow[]>(`/sessions?courseId=${id}`) : []);
    } catch (e) { Alert.alert('Could not load reports', (e as Error).message); }
  }, [courseId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const course = courses.find((c) => c.id === courseId);
  const exportAll = async () => {
    if (!course) return;
    setExporting(true);
    try { await shareCsv(`/courses/${course.id}/export.csv`, `${course.code}-attendance.csv`); }
    catch (e) { Alert.alert('Could not export', (e as Error).message); }
    finally { setExporting(false); }
  };

  return (
    <Screen eyebrow="Attendance" title="Reports">
      {courses.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {courses.map((c) => <Chip key={c.id} label={c.code} selected={c.id === courseId} onPress={() => { setRows(null); void load(c.id); }} />)}
        </View>
      ) : null}

      {course ? (
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View style={{ gap: 2, flex: 1 }}>
              <Mono size={12} color={colors.inkSoft}>{course.code}</Mono>
              <T variant="h2">{course.name}</T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T variant="label" color={colors.inkSoft}>Average</T>
              <T variant="h1" color={colors.signal}>{course.sessions ? `${course.avgPercent}%` : '–'}</T>
            </View>
          </View>
          <Button label="Export whole class as CSV" icon="download" variant="ghost" onPress={exportAll} loading={exporting} disabled={!course.sessions} />
        </Card>
      ) : null}

      {!rows ? <><Skeleton height={90} /><Skeleton height={90} /><Skeleton height={90} /></> : null}
      {rows && rows.length === 0 ? <Empty icon="chart" title="No sessions yet" body="Run a session and its attendance will be listed here." /> : null}

      {rows?.map((r) => (
        <Pressable key={r.id} onPress={() => router.push(`/(organiser)/session/${r.id}`)} accessibilityRole="button" accessibilityLabel={`Session on ${fmtDay(r.startedAt)}`}>
          <Card style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ flex: 1 }}>
                <T variant="title">{fmtDay(r.startedAt)}</T>
                <T variant="small" color={colors.inkSoft}>{fmtClock(r.startedAt)}{r.status === 'open' ? ' · running now' : ''}</T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <T variant="h2" color={r.percent >= 75 ? colors.locked : colors.ink}>{r.present}<T variant="small" color={colors.inkSoft}> / {r.enrolled}</T></T>
              </View>
              <Icon name="chevron" size={18} color={colors.haze} />
            </View>
            <Bar value={r.percent / 100} height={6} color={r.percent >= 75 ? colors.locked : colors.signal} />
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
