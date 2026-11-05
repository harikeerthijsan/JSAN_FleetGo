/**
 * In-memory access-token store.
 *
 * The access token is deliberately kept in a module variable (memory) — NOT in
 * localStorage/sessionStorage — so it is not readable by injected scripts and
 * is cleared on tab close. The refresh token lives only in an httpOnly cookie
 * managed by the backend. On reload the app silently re-authenticates via the
 * refresh cookie (see AuthContext bootstrap).
 */
let accessToken: string | null = null;

export const tokenStore = {
  get(): string | null {
    return accessToken;
  },
  set(token: string | null): void {
    accessToken = token;
  },
  clear(): void {
    accessToken = null;
  },
};
