import { useEffect, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Pressable, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, space, type } from '../theme/tokens';
import { Icon, type IconName } from './Icon';

export function T({ variant = 'body', color = colors.ink, style, children, ...rest }: {
  variant?: keyof typeof type; color?: string; style?: StyleProp<any>; children: ReactNode; numberOfLines?: number; selectable?: boolean;
  onPress?: () => void; accessibilityRole?: 'header' | 'button' | 'text';
}) {
  return <Text {...rest} style={[type[variant], { color }, style]}>{children}</Text>;
}

export const Mono = ({ children, color = colors.ink, size = 14, bold, style }: { children: ReactNode; color?: string; size?: number; bold?: boolean; style?: StyleProp<any> }) => (
  <Text style={[{ fontFamily: bold ? fonts.monoBold : fonts.mono, fontSize: size, color }, style]}>{children}</Text>
);

type ButtonProps = {
  label: string; onPress: () => void; variant?: 'primary' | 'ink' | 'ghost' | 'danger' | 'locked';
  icon?: IconName; loading?: boolean; disabled?: boolean; small?: boolean; style?: StyleProp<ViewStyle>;
};
export function Button({ label, onPress, variant = 'primary', icon, loading, disabled, small, style }: ButtonProps) {
  const bg = { primary: colors.signal, ink: colors.ink, ghost: 'transparent', danger: colors.flareSoft, locked: colors.locked }[variant];
  const fg = { primary: '#fff', ink: '#fff', ghost: colors.ink, danger: colors.flare, locked: '#fff' }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      onPress={() => { void Haptics.selectionAsync().catch(() => {}); onPress(); }}
      style={({ pressed }) => [
        s.btn, small && s.btnSmall,
        { backgroundColor: bg, opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        variant === 'ghost' && { borderWidth: 1.5, borderColor: colors.haze, backgroundColor: colors.paper },
        (variant === 'primary' || variant === 'ink' || variant === 'locked') && { shadowColor: bg, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon && <Icon name={icon} size={small ? 18 : 20} color={fg} />}
          <Text numberOfLines={1} style={{ fontFamily: fonts.bodyBold, fontSize: small ? 14 : 16, color: fg }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style, tone = 'paper' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'paper' | 'flare' | 'locked' | 'signal' }) {
  const bg = { paper: colors.paper, flare: colors.flareSoft, locked: colors.lockedSoft, signal: colors.signalSoft }[tone];
  return <View style={[s.card, { backgroundColor: bg }, style]}>{children}</View>;
}

export function Chip({ label, selected, onPress, tone }: { label: string; selected?: boolean; onPress?: () => void; tone?: 'locked' | 'flare' | 'signal' | 'neutral' }) {
  const toneBg = { locked: colors.lockedSoft, flare: colors.flareSoft, signal: colors.signalSoft, neutral: colors.hazeSoft }[tone ?? 'neutral'];
  const toneFg = { locked: colors.locked, flare: colors.flare, signal: colors.signal, neutral: colors.inkSoft }[tone ?? 'neutral'];
  const content = <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: selected ? '#fff' : onPress ? colors.ink : toneFg }}>{label}</Text>;
  const base = [s.chip, { backgroundColor: selected ? colors.ink : onPress ? colors.paper : toneBg }, onPress && !selected && { borderWidth: 1.5, borderColor: colors.haze }];
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={onPress} style={base}>{content}</Pressable>
  ) : <View style={base}>{content}</View>;
}

export function Field({ label, ...input }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <T variant="label" color={colors.inkSoft}>{label}</T>
      <TextInput
        placeholderTextColor={colors.haze}
        {...input}
        style={[s.input, input.style]}
      />
    </View>
  );
}

export function Banner({ tone, title, children }: { tone: 'flare' | 'locked' | 'signal'; title: string; children?: ReactNode }) {
  const fg = { flare: colors.flare, locked: colors.locked, signal: colors.signal }[tone];
  return (
    <Card tone={tone} style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
      <View style={{ marginTop: 2 }}><Icon name={tone === 'locked' ? 'check' : tone === 'flare' ? 'alert' : 'radio'} size={20} color={fg} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="title" color={colors.ink}>{title}</T>
        {children ? <T variant="small" color={colors.inkSoft}>{children}</T> : null}
      </View>
    </Card>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.huge, paddingHorizontal: space.xl }}>
      <View style={s.emptyIcon}><Icon name={icon} size={26} color={colors.signal} /></View>
      <T variant="h2" style={{ textAlign: 'center' }}>{title}</T>
      <T variant="body" color={colors.inkSoft} style={{ textAlign: 'center', maxWidth: 300 }}>{body}</T>
      {action}
    </View>
  );
}

export function Bar({ value, color = colors.locked, height = 8 }: { value: number; color?: string; height?: number }) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: Math.max(0, Math.min(1, value)), duration: 500, useNativeDriver: false }).start();
  }, [value, w]);
  return (
    <View style={{ height, borderRadius: height, backgroundColor: colors.hazeSoft, overflow: 'hidden' }}>
      <Animated.View style={{ height, borderRadius: height, backgroundColor: color, width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

export function Skeleton({ height = 120, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  const o = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(o, { toValue: 0.5, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={[{ height, borderRadius: radius.lg, backgroundColor: colors.hazeSoft, opacity: o }, style]} />;
}

export function Stat({ label, value, tone = colors.ink }: { label: string; value: string | number; tone?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T variant="h1" color={tone}>{value}</T>
      <T variant="label" color={colors.inkSoft}>{label}</T>
    </View>
  );
}

export const Divider = () => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.haze }} />;

const s = StyleSheet.create({
  btn: { minHeight: 54, borderRadius: radius.pill, paddingHorizontal: space.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnSmall: { minHeight: 42, paddingHorizontal: space.lg },
  card: { borderRadius: radius.lg, padding: space.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(12,16,48,0.08)', shadowColor: '#0C1030', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  chip: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start' },
  input: { minHeight: 54, borderRadius: radius.md, backgroundColor: colors.paper, borderWidth: 1.5, borderColor: colors.haze, paddingHorizontal: space.lg, fontFamily: fonts.bodyMedium, fontSize: 17, color: colors.ink },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.signalSoft, alignItems: 'center', justifyContent: 'center' },
});
