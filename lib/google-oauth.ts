// Shared, low-level Google OAuth helpers for both the primary signed-in
// account (auth-context) and the secondary classroom-only account
// (classroom-auth). No storage, no React — just HTTP exchange.

export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
export const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';

export const GOOGLE_OAUTH_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
  revocationEndpoint: GOOGLE_REVOKE_ENDPOINT,
};

export type GoogleTokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  // epoch ms; we subtract a small safety buffer to refresh slightly before
  // Google considers the token expired.
  expiresAt: number;
  email: string | null;
};

// Exchange an auth code (PKCE) for access + refresh + id tokens.
// Returns the tokens plus the user's email (best-effort via userinfo).
export async function exchangeAuthCode(opts: {
  code: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: opts.codeVerifier,
  });
  const r = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Token exchange failed (${r.status}): ${text}`);
  }
  const data = (await r.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
  };
  let email: string | null = null;
  try {
    const ui = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (ui.ok) {
      const u = (await ui.json()) as { email?: string };
      email = u.email ?? null;
    }
  } catch {
    // userinfo lookup is best-effort; not having an email isn't fatal
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    idToken: data.id_token ?? null,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    email,
  };
}

// Use a refresh token to mint a fresh access token. Returns null if Google
// rejects the refresh (revoked, expired, malformed).
export async function refreshGoogleAccessToken(opts: {
  refreshToken: string;
  clientId: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresAt: number } | null> {
  const body = new URLSearchParams({
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    grant_type: 'refresh_token',
  });
  const r = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!r.ok) return null;
  const data = (await r.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  return {
    accessToken: data.access_token,
    // Google typically does not rotate refresh tokens — keep the original if
    // a new one wasn't returned.
    refreshToken: data.refresh_token ?? opts.refreshToken,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
}

// Best-effort token revocation. Doesn't throw — caller should still clear
// local storage afterward in case revoke fails.
export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch(`${GOOGLE_REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    });
  } catch {
    // Revoke is best-effort.
  }
}
