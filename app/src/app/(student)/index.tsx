import { useCallback, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Slider from '@react-native-community/slider';
import { useIsFocused } from 'expo-router';
import { PulseRing, type PulseState } from '../../components/PulseRing';
import { Screen } from '../../components/Screen';
import { SignalBand, bandFor } from '../../components/Signal';
import { Banner, Button, Card, Chip, Mono, T } from '../../components/ui';
import { useAttendance } from '../../ble/useAttendance';
import { fmtClock, fmtDay } from '../../lib/format';
import { useApp } from '../../store/app';
import { colors, space } from '../../theme/tokens';

export default function Today() {
  const { user, bleMode } = useApp();
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  const simRssi = useRef(-55);
  const [simValue, setSimValue] = useState(-55);
  const getSimRssi = useCallback(() => simRssi.current, []);
  const { phase, reset, retry } = useAttendance(focused, getSimRssi);

  const ring = Math.min(width - space.xl * 2 - space.xl, 290);
  const pulse: PulseState =
    phase.kind === 'locked' ? 'locked'
    : phase.kind === 'error' ? 'error'
    : phase.kind === 'detected' ? 'detected'
    : phase.kind === 'blocked' || phase.kind === 'starting' ? 'idle'
    : 'listening';

  const first = user?.name.split(' ')[0] ?? '';
  const copy = (() => {
    switch (phase.kind) {
      case 'locked': return { h: 'You’re marked present', p: `${phase.course} · ${fmtClock(phase.at)}` };
      case 'detected': return { h: phase.course ? `Found ${phase.course}` : 'Signal found', p: phase.hint ?? 'Checking you in…' };
      case 'error': return { h: 'Not marked', p: phase.message };
      case 'blocked': return { h: 'Bluetooth is off limits', p: phase.message };
      case 'starting': return { h: 'Getting ready', p: 'Starting the Bluetooth listener.' };
      default: return { h: 'Listening for your class', p: 'Keep this screen open near the organiser’s phone. No taps needed.' };
    }
  })();

  return (
    <Screen eyebrow={fmtDay(Date.now())} title={`Hi, ${first}`}>
      <Card style={{ alignItems: 'center', paddingVertical: space.xl }}>
        <PulseRing state={pulse} size={ring} />
      </Card>

      <View style={{ alignItems: 'center', gap: space.sm }} accessibilityLiveRegion="polite">
        <T variant="h1" color={phase.kind === 'locked' ? colors.locked : phase.kind === 'error' ? colors.flare : colors.ink} style={{ textAlign: 'center' }}>{copy.h}</T>
        <T variant="body" color={colors.inkSoft} style={{ textAlign: 'center', maxWidth: 320 }}>{copy.p}</T>
        {phase.kind === 'detected' ? <SignalBand rssi={phase.rssi} /> : null}
      </View>

      {phase.kind === 'blocked' ? <Button label="Try again" onPress={retry} /> : null}
      {phase.kind === 'error' ? <Button label="Listen again" variant="ghost" onPress={reset} /> : null}
      {phase.kind === 'locked' ? <Button label="Listen for another class" variant="ghost" onPress={reset} /> : null}

      {phase.kind === 'error' && phase.code === 'wrong_device' ? (
        <Banner tone="flare" title="One phone per student">
          Attendance only counts from the phone linked to your account. Ask an admin to approve a change if you switched phones.
        </Banner>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.sm, justifyContent: 'center' }}>
        <Chip label={bleMode === 'native' ? 'Bluetooth' : 'Simulated signal'} tone={bleMode === 'native' ? 'signal' : 'neutral'} />
      </View>

      {bleMode === 'sim' ? (
        <Card>
          <View style={{ gap: space.sm }}>
            <T variant="label" color={colors.inkSoft}>Simulated distance</T>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <SignalBand rssi={simValue} showDbm={false} />
              <Mono size={13} color={colors.inkSoft}>{simValue} dBm</Mono>
            </View>
            <Slider
              minimumValue={-95} maximumValue={-35} step={1} value={simValue}
              minimumTrackTintColor={bandFor(simValue).color} maximumTrackTintColor={colors.hazeSoft} thumbTintColor={colors.ink}
              onValueChange={(v) => { simRssi.current = v; setSimValue(v); }}
              accessibilityLabel="Simulated distance from the organiser"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T variant="small" color={colors.inkSoft}>Far</T>
              <T variant="small" color={colors.inkSoft}>Close</T>
            </View>
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}
