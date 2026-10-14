import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

const PATHS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  radio: 'M12 12.5a.5.5 0 100-1 .5.5 0 000 1zM8.5 8.5a5 5 0 000 7M15.5 8.5a5 5 0 010 7M5.6 5.6a9 9 0 000 12.8M18.4 5.6a9 9 0 010 12.8',
  book: 'M5 4.5A1.5 1.5 0 016.5 3H19v15H6.5A1.5 1.5 0 005 19.5v-15zM5 19.5A1.5 1.5 0 006.5 21H19',
  chart: 'M5 20V10M12 20V4M19 20v-7',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 19a6.5 6.5 0 0113 0M16 4.3a3.5 3.5 0 010 6.4M18 13.2A6.5 6.5 0 0121.5 19',
  shield: 'M12 3l7.5 3v5.5c0 4.5-3 8-7.5 9.5-4.5-1.500-7.500-5-7.500-9.500V6L12 3z',
  phone: 'M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2',
  clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  alert: 'M12 4l9 16H3L12 4zM12 10v4M12 17v.5',
  logout: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  download: 'M12 4v11M7.500 10.500L12 15l4.500-4.500M5 20h14',
  chevron: 'M9 6l6 6-6 6',
  inbox: 'M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5',
  sliders: 'M5 8h9M18 8h1M5 16h1M10 16h9M16 6v4M8 14v4',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, color = '#0C1030', stroke = 2 }: { name: IconName; size?: number; color?: ColorValue; stroke?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <Path d={PATHS[name]} />
      {name === 'radio' && <Circle cx="12" cy="12" r="1.2" fill={color} />}
    </Svg>
  );
}
