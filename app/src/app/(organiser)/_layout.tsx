import { Tabs } from 'expo-router';
import { Icon } from '../../components/Icon';
import { TabBar } from '../../components/TabBar';

export default function OrganiserTabs() {
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Classes', tabBarIcon: ({ color }) => <Icon name="book" color={color} /> }} />
      <Tabs.Screen name="live" options={{ title: 'Live', tabBarIcon: ({ color }) => <Icon name="radio" color={color} /> }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports', tabBarIcon: ({ color }) => <Icon name="chart" color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Icon name="user" color={color} /> }} />
      <Tabs.Screen name="session/[id]" options={{ href: null, title: 'Session' }} />
    </Tabs>
  );
}
