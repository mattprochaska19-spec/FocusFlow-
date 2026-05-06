import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  exchangeAuthCode,
  GOOGLE_OAUTH_DISCOVERY,
  refreshGoogleAccessToken,
  revokeGoogleToken,
  type GoogleTokenResponse,
} from './google-oauth';

// Secondary Google account (school) used exclusively for Google Classroom API
// access. Independent of the user's Supabase identity (which can be any
// Google account or email/password). Stored device-locally because it carries
// API access only — no Supabase session is bound to it.

const STORAGE_KEYS = {
  accessToken: 'pandu_classroom_access_token',
  refreshToken: 'pandu_classroom_refresh_token',
  expiresAt: 'pandu_classroom_token_expires_at',
  email: 'pandu_classroom_account_email',
} as const;

// Re-exported for the OAuth hook in classroom-link-section.tsx.
export { GOOGLE_OAUTH_DISCOVERY as CLASSROOM_OAUTH_DISCOVERY };

// Scope-restricted: only what Classroom needs. No Calendar, no Drive.
export const CLASSROOM_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
];

export type ClassroomTokens = GoogleTokenResponse;

export async function loadClassroomTokens(): Promise<ClassroomTokens | null> {
  const [accessToken, refreshToken, expiresAtStr, email] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.accessToken),
    AsyncStorage.getItem(STORAGE_KEYS.refreshToken),
    AsyncStorage.getItem(STORAGE_KEYS.expiresAt),
    AsyncStorage.getItem(STORAGE_KEYS.email),
  ]);
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken,
    idToken: null,
    expiresAt: expiresAtStr ? parseInt(expiresAtStr, 10) : 0,
    email,
  };
}

export async function persistClassroomTokens(t: ClassroomTokens): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.accessToken, t.accessToken);
  await AsyncStorage.setItem(STORAGE_KEYS.expiresAt, String(t.expiresAt));
  if (t.refreshToken) await AsyncStorage.setItem(STORAGE_KEYS.refreshToken, t.refreshToken);
  if (t.email) await AsyncStorage.setItem(STORAGE_KEYS.email, t.email);
}

async function clearClassroomTokens(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
}

// Re-export the shared exchange under a Classroom-specific name to keep
// existing callers (classroom-link-section) working without refactor.
export const exchangeClassroomCode = exchangeAuthCode;

// Returns a non-stale access token, refreshing if needed. Returns null if
// no link exists OR the refresh token is missing/invalid.
export async function getValidClassroomAccessToken(clientId: string): Promise<string | null> {
  const t = await loadClassroomTokens();
  if (!t) return null;
  if (t.expiresAt > Date.now() + 30_000) return t.accessToken;
  if (!t.refreshToken) return null;
  const refreshed = await refreshGoogleAccessToken({ refreshToken: t.refreshToken, clientId });
  if (!refreshed) return null;
  const next: ClassroomTokens = {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    idToken: null,
    expiresAt: refreshed.expiresAt,
    email: t.email,
  };
  await persistClassroomTokens(next);
  return refreshed.accessToken;
}

export async function revokeAndClearClassroomTokens(): Promise<void> {
  const t = await loadClassroomTokens();
  if (t?.accessToken) await revokeGoogleToken(t.accessToken);
  await clearClassroomTokens();
}
