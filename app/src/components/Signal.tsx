import { View } from 'react-native';
import { colors, space } from '../theme/tokens';
import { Mono, T } from './ui';

export type Band = { key: 'room' | 'edge' | 'far'; label: string; bars: number; color: string };

export function bandFor(rssi: number | null | undefined, min = -80): Band {
  if (rssi == null) return { key: 'far', label: 'No signal', bars: 0, color: colors.haze };
  if (rssi >= -65) return { key: 'room', label: 'In the room', bars: 3, color: colors.locked };
  if (rssi >= min) return { key: 'edge', label: 'Edge of the room', bars: 2, color: colors.signal };
  return { key: 'far', label: 'Too far', bars: 1, color: colors.flare };
}

export function Bars({ count, color, size = 16 }: { count: number; color: string; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: size }}>
      {[0.4, 0.7, 1].map((h, i) => (
        <View key={i} style={{ width: size / 4, height: size * h, borderRadius: 2, backgroundColor: i < count ? color : colors.hazeSoft }} />
      ))}
    </View>
  );
}

export function SignalBand({ rssi, min, showDbm = true }: { rssi: number | null | undefined; min?: number; showDbm?: boolean }) {
  const b = bandFor(rssi, min);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Bars count={b.bars} color={b.color} />
      <T variant="small" color={colors.ink} style={{ fontFamily: 'Archivo_500Medium' }}>{b.label}</T>
      {showDbm && rssi != null ? <Mono size={12} color={colors.inkSoft}>{rssi} dBm</Mono> : null}
    </View>
  );
}
