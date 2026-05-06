// Centralized design tokens for Pandu.
// Warm cream background + vibrant green accent — kid-friendly, optimistic,
// pairs well with the black/white panda mascot.

export const colors = {
  // Warm cream — like a notebook page, more inviting than pure white
  bg: '#FFFAF0',
  surface: '#FFFFFF',
  surfaceAlt: '#FEF3E0',
  surfaceMuted: '#FFF6E6',

  // Soft tan hairlines — keep the engineered structure without going stark
  border: '#EFE4CD',
  borderSubtle: '#F4ECD9',
  divider: '#F0E8D5',
  hairline: '#EFE4CD',

  // Warm near-black — preserves a touch of brown for cohesion with the cream
  textPrimary: '#1F1A14',
  textSecondary: '#5C544A',
  textMuted: '#9F968A',
  textInverse: '#FFFFFF',

  // Vibrant kid-friendly green — high saturation pops against cream and gives
  // the app a cheerful, optimistic feel without being neon
  accent: '#22C55E',
  accentSoft: '#DCFCE7',
  accentBorder: '#86EFAC',

  // Warm coral — softer than red, friendlier in a kids' app
  danger: '#EF6B5E',
  dangerSoft: '#FEE2E2',
  dangerBorder: '#FCA5A5',

  neutral: '#FEF3E0',
  neutralBorder: '#EFE4CD',
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

// Soft drop shadow for elevated cards (iOS) + matching elevation (Android).
// Lower opacity than typical iOS — Linear/Mercury vibe over Material vibe.
export const shadow = {
  shadowColor: '#0F0E0B',
  shadowOpacity: 0.04,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

export const shadowSm = {
  shadowColor: '#0F0E0B',
  shadowOpacity: 0.03,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
} as const;

// Tabular number styling for stat displays (mono digits, equal-width)
export const tabularNumbers = { fontVariant: ['tabular-nums'] as ['tabular-nums'] };

// Inter is loaded at the root layout via useFonts. Falling back to the system
// font on Android/web during the brief window before fonts are ready.
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
  // Fraunces — variable wedge serif used for display numbers and editorial headings.
  // Pairs with Inter the way Source Serif pairs with Source Sans.
  serif: 'Fraunces_500Medium',
  serifSemibold: 'Fraunces_600SemiBold',
  serifBold: 'Fraunces_700Bold',
  serifBlack: 'Fraunces_900Black',
} as const;
