// Design tokens ported from project/_ds/industry-.../styles.css and the
// Wachtelaer Veldapp prototype's inline styles (Claude Design handoff).

export const colors = {
  bg: '#e7e7ea',
  surface: '#f2f2f3',
  surfaceRaised: '#ffffff',
  ink: '#1d1f20',
  inkMuted: '#5d5d60',
  inkFaint: '#7a7a7d',
  divider: 'rgba(29,31,32,0.16)',
  dividerStrong: 'rgba(29,31,32,0.3)',
  chipBg: '#e7e7ea',
  chipText: '#424244',

  navy: '#1d2d3d',
  navyText: '#94bce3',

  accent: '#5980a6',
  accentDark: '#416180',
  accentDarker: '#2c455d',
  accentPale: '#94bce3',
  accentTint: '#eef6ff',
  accentTint2: '#d6ebff',

  white: '#ffffff',
  danger: '#b23b3b',
} as const;

export const fonts = {
  heading: 'BarlowCondensed_600SemiBold',
  headingBold: 'BarlowCondensed_700Bold',
  body: 'Barlow_400Regular',
  bodyMedium: 'Barlow_500Medium',
  bodySemiBold: 'Barlow_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const roleLabels: Record<string, string> = {
  tech: 'Werf',
  werfleider: 'Werfleiding',
  sales: 'Verkoop',
  mgmt: 'Management',
};
