export const colors = {
  chalk: '#F2F3F9', // app background
  paper: '#FFFFFF', // cards
  ink: '#0C1030', // text, dark surfaces
  inkSoft: '#575C82', // secondary text
  haze: '#CDD2EE', // hairlines, idle rings
  hazeSoft: '#E4E7F5',
  signal: '#2A3BFF', // the beacon and primary actions
  signalSoft: '#E3E6FF',
  locked: '#0E9E73', // marked / present
  lockedBright: '#12B886',
  lockedSoft: '#DDF5EC',
  flare: '#E8442F', // rejected or blocked, nothing else
  flareSoft: '#FFE7E2',
} as const;

export const fonts = {
  display: 'BigShoulders_800ExtraBold',
  displayBlack: 'BigShoulders_900Black',
  body: 'Archivo_400Regular',
  bodyMedium: 'Archivo_500Medium',
  bodyBold: 'Archivo_700Bold',
  mono: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 } as const;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

export const type = {
  display: { fontFamily: fonts.displayBlack, fontSize: 60, lineHeight: 56, letterSpacing: -0.5 },
  h1: { fontFamily: fonts.display, fontSize: 38, lineHeight: 38 },
  h2: { fontFamily: fonts.display, fontSize: 26, lineHeight: 28 },
  title: { fontFamily: fonts.bodyBold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23 },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  mono: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 20 },
} as const;
