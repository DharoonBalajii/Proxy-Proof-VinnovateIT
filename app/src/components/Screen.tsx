import { type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space } from '../theme/tokens';
import { T } from './ui';

export function Screen({ eyebrow, title, right, children, scroll = true, onRefresh, refreshing, contentStyle }: {
  eyebrow?: string; title?: string; right?: ReactNode; children: ReactNode; scroll?: boolean;
  onRefresh?: () => void; refreshing?: boolean; contentStyle?: StyleProp<ViewStyle>;
}) {
  const header = title ? (
    <View style={styles.header}>
      <View style={{ flex: 1, gap: 2 }}>
        {eyebrow ? <T variant="label" color={colors.signal}>{eyebrow}</T> : null}
        <T variant="h1" accessibilityRole="header">{title}</T>
      </View>
      {right}
    </View>
  ) : null;
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.signal} /> : undefined}
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }, contentStyle]}>{header}{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.chalk },
  content: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xxl, gap: space.lg },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md, marginBottom: space.xs },
});
