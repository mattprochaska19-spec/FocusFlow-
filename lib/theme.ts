// Centralized design tokens for FocusFlow.
// Warm off-white palette, single deep-green accent, hairline borders, soft shadows.

export const colors = {
  bg: '#FAF7F2',
  surface: '#FFFFFF',
  surfaceAlt: '#F4EFE6',
  surfaceMuted: '#F8F4ED',

  border: '#EBE6DC',
  borderSubtle: '#F2EDE3',
  divider: '#EFEBE2',

  textPrimary: '#1A1815',
  textSecondary: '#6E6760',
  textMuted: '#A8A099',
  textInverse: '#FFFFFF',

  accent: '#2F6B4A',
  accentSoft: '#E8F0EA',
  accentBorder: '#C9DBCF',

  danger: '#A04B47',
  dangerSoft: '#F5E8E7',
  dangerBorder: '#E5C9C7',

  neutral: '#F4EFE6',
  neutralBorder: '#E8E3DA',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

// Soft drop shadow for elevated cards (iOS) + matching elevation (Android)
export const shadow = {
  shadowColor: '#1A1815',
  shadowOpacity: 0.05,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

export const shadowSm = {
  shadowColor: '#1A1815',
  shadowOpacity: 0.04,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
} as const;
