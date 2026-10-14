import { Tabs } from 'expo-router';
import { Icon } from '../../components/Icon';
import { TabBar } from '../../components/TabBar';

export default function AdminTabs() {
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Requests', tabBarIcon: ({ color }) => <Icon name="phone" color={color} /> }} />
      <Tabs.Screen name="people" options={{ title: 'People', tabBarIcon: ({ color }) => <Icon name="users" color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Icon name="user" color={color} /> }} />
    </Tabs>
  );
}
