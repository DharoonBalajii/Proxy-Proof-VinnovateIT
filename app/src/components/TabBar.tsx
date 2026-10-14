import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/tabs';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, space } from '../theme/tokens';

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        if (!options.tabBarIcon) return null; // hidden routes (e.g. session detail) have no icon
        const focused = state.index === index;
        const label = (options.title ?? route.name) as string;
        const color = focused ? colors.signal : colors.inkSoft;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) { void Haptics.selectionAsync().catch(() => {}); navigation.navigate(route.name); }
            }}
            style={styles.item}
          >
            <View style={[styles.pill, focused && { backgroundColor: colors.signalSoft }]}>
              {options.tabBarIcon?.({ focused, color, size: 22 })}
            </View>
            <Text style={{ fontFamily: focused ? fonts.bodyBold : fonts.bodyMedium, fontSize: 11.5, color }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.paper, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.haze, paddingTop: space.sm },
  item: { flex: 1, alignItems: 'center', gap: 2 },
  pill: { width: 58, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
