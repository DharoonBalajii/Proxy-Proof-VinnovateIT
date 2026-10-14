import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, ApiError, type Course } from '../../api/client';
import { Screen } from '../../components/Screen';
import { Sheet } from '../../components/Sheet';
import { Banner, Bar, Button, Card, Chip, Empty, Field, Mono, Skeleton, Stat, T } from '../../components/ui';
import { colors, space } from '../../theme/tokens';

const DURATIONS = [1, 5, 10, 15, 30];
const RANGES = [
  { label: 'Close (−65)', value: -65 },
  { label: 'Room (−80)', value: -80 },
  { label: 'Wide (−90)', value: -90 },
];

export default function Classes() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState<Course | null>(null);
  const [enrolling, setEnrolling] = useState<Course | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try { setCourses(await api.get<Course[]>('/courses')); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <Screen
      eyebrow="Your classes" title="Classes" refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
      right={<Button small label="New class" icon="plus" variant="ink" onPress={() => setCreating(true)} />}
    >
      {error ? <Banner tone="flare" title="Can’t load your classes">{error}</Banner> : null}
      {!courses && !error ? <><Skeleton height={230} /><Skeleton height={230} /></> : null}
      {courses && courses.length === 0 ? (
        <Empty icon="book" title="No classes yet" body="Create a class, add your students, then start a session when everyone is in the room." />
      ) : null}

      {courses?.map((c) => (
        <Card key={c.id} style={{ gap: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Mono size={12} color={colors.inkSoft}>{c.code}</Mono>
              <T variant="h2">{c.name}</T>
            </View>
            {c.openSessionId ? <Chip label="Live now" tone="locked" /> : null}
          </View>
          <View style={{ flexDirection: 'row', paddingVertical: space.xs }}>
            <Stat label="Students" value={c.students} />
            <Stat label="Sessions" value={c.sessions} />
            <Stat label="Average" value={c.sessions ? `${c.avgPercent}%` : '–'} tone={c.sessions && c.avgPercent < 75 ? colors.flare : colors.signal} />
          </View>
          <Bar value={c.avgPercent / 100} color={c.avgPercent < 75 ? colors.flare : colors.signal} height={6} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {c.openSessionId ? (
              <Button style={{ flex: 1, paddingHorizontal: space.md }} label="Open live session" icon="radio" onPress={() => router.navigate('/(organiser)/live')} />
            ) : (
              <Button style={{ flex: 1, paddingHorizontal: space.md }} label="Start session" icon="radio" onPress={() => setStarting(c)} />
            )}
            <Button style={{ paddingHorizontal: space.lg }} label="Students" variant="ghost" onPress={() => setEnrolling(c)} />
          </View>
        </Card>
      ))}

      <StartSheet course={starting} onClose={() => setStarting(null)} onStarted={() => { setStarting(null); router.navigate('/(organiser)/live'); }} onRunning={() => { setStarting(null); router.navigate('/(organiser)/live'); }} />
      <EnrollSheet course={enrolling} onClose={() => { setEnrolling(null); void load(); }} />
      <CreateSheet visible={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void load(); }} />
    </Screen>
  );
}

function StartSheet({ course, onClose, onStarted, onRunning }: { course: Course | null; onClose: () => void; onStarted: () => void; onRunning: () => void }) {
  const [minutes, setMinutes] = useState(5);
  const [rssiMin, setRssi] = useState(-80);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (!course) return;
    setBusy(true); setError(null);
    try {
      await api.post('/sessions', { courseId: course.id, durationMin: minutes, rssiMin });
      onStarted();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'session_open') onRunning();
      else setError((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Sheet visible={!!course} title={course ? `Start ${course.code}` : ''} onClose={onClose}>
      <View style={{ gap: space.sm }}>
        <T variant="label" color={colors.inkSoft}>How long should it run?</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {DURATIONS.map((m) => <Chip key={m} label={`${m} min`} selected={minutes === m} onPress={() => setMinutes(m)} />)}
        </View>
      </View>
      <View style={{ gap: space.sm }}>
        <T variant="label" color={colors.inkSoft}>How close must students be?</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {RANGES.map((r) => <Chip key={r.value} label={r.label} selected={rssiMin === r.value} onPress={() => setRssi(r.value)} />)}
        </View>
        <T variant="small" color={colors.inkSoft}>Signal strength in dBm. Pick Close for a small room, Wide for a lecture hall.</T>
      </View>
      {error ? <Banner tone="flare" title="Could not start">{error}</Banner> : null}
      <Button label="Start session" icon="radio" onPress={start} loading={busy} />
    </Sheet>
  );
}

function EnrollSheet({ course, onClose }: { course: Course | null; onClose: () => void }) {
  const [roll, setRoll] = useState('');
  const [students, setStudents] = useState<{ id: number; name: string; rollNo: string }[]>([]);
  const [msg, setMsg] = useState<{ tone: 'locked' | 'flare'; text: string } | null>(null);

  const load = useCallback(async (id: number) => {
    setStudents(await api.get(`/courses/${id}/students`));
  }, []);
  const courseId = course?.id;
  useEffect(() => {
    if (courseId == null) return;
    setMsg(null); setRoll(''); setStudents([]);
    void load(courseId).catch(() => {});
  }, [courseId, load]);

  const add = async () => {
    if (!course) return;
    try {
      const s = await api.post<{ name: string }>(`/courses/${course.id}/enroll`, { rollNo: roll });
      setMsg({ tone: 'locked', text: `${s.name} added.` });
      setRoll('');
      await load(course.id);
    } catch (e) { setMsg({ tone: 'flare', text: (e as Error).message }); }
  };

  return (
    <Sheet visible={!!course} title={course ? `${course.code} students` : ''} onClose={onClose}>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}><Field label="Add by roll number" value={roll} onChangeText={setRoll} autoCapitalize="characters" autoCorrect={false} placeholder="23CS012" onSubmitEditing={add} /></View>
        <Button label="Add" onPress={add} disabled={!roll.trim()} style={{ minHeight: 54 }} />
      </View>
      {msg ? <Banner tone={msg.tone} title={msg.text} /> : null}
      <View style={{ gap: 2 }}>
        <T variant="label" color={colors.inkSoft}>{students.length} enrolled</T>
        {students.map((s) => (
          <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
            <T variant="body">{s.name}</T>
            <Mono size={13} color={colors.inkSoft}>{s.rollNo}</Mono>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

function CreateSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    try {
      await api.post('/courses', { code, name });
      setCode(''); setName(''); setError(null);
      onCreated();
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <Sheet visible={visible} title="New class" onClose={onClose}>
      <Field label="Course code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="CS3401" />
      <Field label="Course name" value={name} onChangeText={setName} placeholder="Computer Networks" />
      {error ? <Banner tone="flare" title="Could not create">{error}</Banner> : null}
      <Button label="Create class" onPress={create} disabled={!code.trim() || !name.trim()} />
    </Sheet>
  );
}
