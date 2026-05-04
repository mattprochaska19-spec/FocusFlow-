// Centralized design tokens for FocusFlow.
// Glossy warm obsidian palette, brighter emerald accent, hairline borders.

export const colors = {
  // Warm obsidian — near-black with a hint of brown for that glossy fine-leather feel
  bg: '#0B0A08',
  surface: '#15140F',
  surfaceAlt: '#1E1C16',
  surfaceMuted: '#171510',

  // Hairlines — subtle lifts for separating rows on dark
  border: '#2A2720',
  borderSubtle: '#1F1D17',
  divider: '#252319',
  hairline: '#22201A',

  // Warm off-white text — inverted from the previous near-black
  textPrimary: '#F4F1EA',
  textSecondary: '#A8A29A',
  textMuted: '#6E6962',
  textInverse: '#0B0A08',

  // Brighter emerald — needs to pop on near-black, was too dim before
  accent: '#5DD79A',
  accentSoft: '#13261C',
  accentBorder: '#1F5A3D',

  danger: '#E87568',
  dangerSoft: '#2C1612',
  dangerBorder: '#5C2A26',

  neutral: '#1E1C16',
  neutralBorder: '#2A2720',
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
