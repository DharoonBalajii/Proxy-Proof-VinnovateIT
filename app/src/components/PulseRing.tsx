import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing, FadeIn, cancelAnimation, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { colors, fonts } from '../theme/tokens';
import { Icon } from './Icon';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type PulseState = 'idle' | 'broadcast' | 'listening' | 'detected' | 'locked' | 'error';

type Props = {
  state: PulseState;
  size?: number;
  /** 8-hex-char token shown in the core while broadcasting. */
  token?: string;
  /** When the current token rotates; drives the countdown arc. */
  expiresAt?: number;
  rotateS?: number;
  /** Changes on every rotation to fire one outward pulse. */
  pulseKey?: number;
};

const RINGS = [0, 1, 2];

/**
 * The signature element. Rings radiate from a dark core; the arc around the core is the time left on
 * the current token. Organiser: bursts on every rotation. Student: radar sweep, tightens when a beacon
 * is heard, and locks green when the mark lands.
 */
export const PulseRing = memo(function PulseRing({ state, size = 300, token, expiresAt, rotateS = 10, pulseKey }: Props) {
  const reduced = useReducedMotion();
  const c = size / 2;
  const core = size * 0.27;
  const arcR = core + 10;
  const circumference = 2 * Math.PI * arcR;
  const maxR = c - 4;

  const t = useSharedValue(0); // ring phase
  const reach = useSharedValue(1); // how far the rings travel
  const loop = useSharedValue(0); // 1 = continuous sweep, 0 = single burst
  const remaining = useSharedValue(0); // fraction of the token window left
  const tint = state === 'locked' ? colors.lockedBright : state === 'error' ? colors.flare : colors.signal;

  // Ring phase
  useEffect(() => {
    cancelAnimation(t);
    if (reduced || state === 'idle') { t.value = 0.6; loop.value = 0; return; }
    if (state === 'listening' || state === 'detected') {
      loop.value = 1;
      reach.value = withTiming(state === 'detected' ? 0.62 : 1, { duration: 500 });
      t.value = 0;
      t.value = withRepeat(withTiming(1, { duration: state === 'detected' ? 1500 : 3000, easing: Easing.linear }), -1, false);
    } else if (state === 'broadcast') {
      loop.value = 0;
      reach.value = 1;
    } else {
      // locked or error: one final burst, then rest
      loop.value = 0;
      reach.value = withTiming(0.8, { duration: 300 });
      t.value = 0;
      t.value = withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) });
    }
  }, [state, reduced, t, reach, loop]);

  // One burst per token rotation while broadcasting
  useEffect(() => {
    if (state !== 'broadcast' || reduced) return;
    cancelAnimation(t);
    t.value = 0;
    t.value = withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) });
  }, [pulseKey, state, reduced, t]);

  // Countdown arc
  useEffect(() => {
    cancelAnimation(remaining);
    if (state !== 'broadcast' || !expiresAt) { remaining.value = 0; return; }
    const left = Math.max(0, expiresAt - Date.now());
    remaining.value = Math.min(1, left / (rotateS * 1000));
    if (!reduced) remaining.value = withTiming(0, { duration: left, easing: Easing.linear });
  }, [expiresAt, rotateS, state, reduced, remaining]);

  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - remaining.value) }));

  const showToken = state === 'broadcast' && !!token;
  const groups = token ? [token.slice(0, 4), token.slice(4)] : [];

  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={describe(state, token)}>
      <Svg width={size} height={size}>
        {/* radar guides */}
        <Circle cx={c} cy={c} r={c * 0.62} stroke={colors.haze} strokeWidth={1} fill="none" strokeDasharray="2 6" />
        <Circle cx={c} cy={c} r={c * 0.84} stroke={colors.haze} strokeWidth={1} fill="none" strokeDasharray="2 6" />
        {RINGS.map((i) => (
          <Ring key={i} i={i} c={c} core={core} maxR={maxR} t={t} reach={reach} loop={loop} color={tint} />
        ))}
        {state === 'locked' && <Circle cx={c} cy={c} r={core + 10} stroke={colors.lockedBright} strokeWidth={5} fill="none" />}
        {state === 'error' && <Circle cx={c} cy={c} r={core + 10} stroke={colors.flare} strokeWidth={3} fill="none" strokeDasharray="4 6" />}
        {state === 'broadcast' && (
          <>
            <Circle cx={c} cy={c} r={arcR} stroke={colors.hazeSoft} strokeWidth={5} fill="none" />
            <AnimatedCircle
              cx={c} cy={c} r={arcR} stroke={colors.signal} strokeWidth={5} fill="none" strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`} transform={`rotate(-90 ${c} ${c})`} animatedProps={arcProps}
            />
          </>
        )}
        <Circle cx={c} cy={c} r={core} fill={state === 'locked' ? colors.locked : state === 'error' ? colors.flareSoft : colors.ink} />
      </Svg>

      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        {showToken ? (
          <Animated.View key={token} entering={reduced ? undefined : FadeIn.duration(300)} style={{ alignItems: 'center' }}>
            {groups.map((g, i) => (
              <Animated.Text key={i} style={[styles.token, { fontSize: size * 0.105 }]}>{g}</Animated.Text>
            ))}
          </Animated.View>
        ) : state === 'locked' ? (
          <Icon name="check" size={size * 0.2} color="#fff" stroke={3} />
        ) : state === 'error' ? (
          <Icon name="alert" size={size * 0.17} color={colors.flare} stroke={2.5} />
        ) : (
          <Icon name="radio" size={size * 0.17} color={state === 'idle' ? colors.haze : '#fff'} stroke={2} />
        )}
      </View>
    </View>
  );
});

function Ring({ i, c, core, maxR, t, reach, loop, color }: {
  i: number; c: number; core: number; maxR: number; t: { value: number }; reach: { value: number }; loop: { value: number }; color: string;
}) {
  const props = useAnimatedProps(() => {
    const phase = loop.value === 1 ? (t.value + i / 3) % 1 : Math.min(1, Math.max(0, (t.value * 1.5 - i * 0.25) / 1));
    const eased = 1 - Math.pow(1 - phase, 2);
    const travel = (maxR - core) * reach.value;
    const live = loop.value === 1 || (phase > 0 && phase < 1);
    return {
      r: core + 6 + travel * eased,
      strokeOpacity: live ? (1 - phase) * 0.6 : 0,
      strokeWidth: 3 - phase * 1.5,
    };
  });
  return <AnimatedCircle cx={c} cy={c} fill="none" stroke={color} animatedProps={props} />;
}

function describe(state: PulseState, token?: string) {
  switch (state) {
    case 'broadcast': return `Broadcasting. Current code ${token ?? ''}`;
    case 'listening': return 'Listening for your class signal';
    case 'detected': return 'Signal detected, checking you in';
    case 'locked': return 'Marked present';
    case 'error': return 'Could not mark attendance';
    default: return 'No signal';
  }
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  token: { fontFamily: fonts.monoBold, color: '#fff', letterSpacing: 2, lineHeight: undefined },
});
