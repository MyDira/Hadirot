// Pending listing-detail action that must complete after a user logs in.
//
// Stored in sessionStorage (separate from `hadirot_pending_auth`) so it
// survives Google OAuth redirects without being consumed by AuthForm's
// post-auth manager. The relevant listing page reads it on mount once the
// user is authenticated, runs the action, and clears the key.

const PENDING_LISTING_ACTION_KEY = "hadirot_pending_listing_action";

export type ListingType = "rental" | "commercial";

export interface PendingRevealPhoneAction {
  type: "reveal_phone";
  listingId: string;
  listingType: ListingType;
}

export interface PendingSendCallbackAction {
  type: "send_callback";
  listingId: string;
  listingType: ListingType;
  userName: string;
  userPhone: string;
  consentToFollowup: boolean;
}

export type PendingListingAction =
  | PendingRevealPhoneAction
  | PendingSendCallbackAction;

export function savePendingListingAction(action: PendingListingAction): void {
  try {
    sessionStorage.setItem(PENDING_LISTING_ACTION_KEY, JSON.stringify(action));
  } catch (err) {
    console.error("Pending Listing Action Storage Error:", err);
  }
}

export function peekPendingListingAction(): PendingListingAction | null {
  try {
    const raw = sessionStorage.getItem(PENDING_LISTING_ACTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingListingAction;
  } catch {
    return null;
  }
}

export function clearPendingListingAction(): void {
  try {
    sessionStorage.removeItem(PENDING_LISTING_ACTION_KEY);
  } catch {
    // Ignore storage errors
  }
}
