import { useLocalSearchParams, useRouter } from 'expo-router';
import { SessionView } from '../../../components/SessionView';

export default function SessionDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  return <SessionView id={Number(id)} backLabel="Reports" onDone={() => router.navigate('/(organiser)/reports')} />;
}
