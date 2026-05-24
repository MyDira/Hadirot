// Shared sessionStorage helpers for "what should happen after the user logs in".
// Survives Google OAuth redirects (browser tab is reused).
//
// Used by AuthForm to: (a) navigate back to `from` after auth, and
// (b) execute simple post-auth actions like restoring a favorite.

const PENDING_AUTH_KEY = "hadirot_pending_auth";

export interface PendingAction {
  type: "favorite";
  listingId: string;
  currentlyFavorited: boolean;
}

export interface PendingAuthState {
  from?: string;
  pendingAction?: PendingAction;
}

export function savePendingAuth(state: PendingAuthState): void {
  try {
    sessionStorage.setItem(PENDING_AUTH_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("Auth Storage Error:", err);
  }
}

export function consumePendingAuth(): PendingAuthState | null {
  try {
    const raw = sessionStorage.getItem(PENDING_AUTH_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_AUTH_KEY);
    return JSON.parse(raw) as PendingAuthState;
  } catch {
    return null;
  }
}
