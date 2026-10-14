import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, type Course } from '../../api/client';
import { Screen } from '../../components/Screen';
import { SessionView } from '../../components/SessionView';
import { Button, Empty } from '../../components/ui';

export default function Live() {
  const router = useRouter();
  const [id, setId] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);

  const find = useCallback(async () => {
    try {
      const courses = await api.get<Course[]>('/courses');
      setId((cur) => cur ?? courses.find((c) => c.openSessionId)?.openSessionId ?? null);
    } catch { /* leave as is */ }
    setChecked(true);
  }, []);
  useFocusEffect(useCallback(() => { void find(); }, [find]));

  if (id) return <SessionView id={id} onDone={() => { setId(null); setChecked(false); void find(); }} />;
  if (!checked) return <Screen title="Live">{null}</Screen>;
  return (
    <Screen eyebrow="Live" title="Session">
      <Empty
        icon="radio"
        title="No session running"
        body="Pick a class and start a session. Students nearby are marked automatically."
        action={<Button label="Choose a class" onPress={() => router.navigate('/(organiser)')} />}
      />
    </Screen>
  );
}
