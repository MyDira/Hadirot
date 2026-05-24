# Login-Gate Branch — Conflict Avoidance Notes

This file documents work happening on a **separate branch** (`claude/listing-detail-login-gate`) that hasn't merged to `main` yet. While you're working on the wizard branch, **avoid editing the files listed below** or you'll create merge conflicts when both branches eventually land on `main`.

If you must touch one of these files, do so on the login-gate branch instead, or coordinate so the conflict is resolved deliberately.

---

## What the other branch does

Adds a **login gate** to the listing-detail pages: logged-out users who click "reveal phone number" or submit a "request a callback" form now see a sign-in modal first. After signing in (email or Google OAuth), the original action completes automatically. Funnel analytics events fire at every stage so the admin dashboard can show conversion vs. bounce. A new admin widget in the Inquiries tab visualizes that funnel.

**Branch:** `claude/listing-detail-login-gate`
**Status:** Pushed to origin, not yet merged. Rachel opens the PR herself.

---

## Files touched on the login-gate branch

### Created (new files — no conflict risk on this branch)

| File | Purpose |
|---|---|
| `src/lib/pendingAuth.ts` | sessionStorage helpers for `{from, pendingAction}` across OAuth redirects. Extracted from AuthForm. |
| `src/lib/pendingListingAction.ts` | sessionStorage helpers for the listing-detail action that must replay after sign-in (reveal phone or send callback). |
| `src/services/listingContact.ts` | Shared client for the `send-listing-contact-sms` Edge Function. Used by both contact forms and by the post-auth replay. |
| `supabase/migrations/20260523120000_analytics_login_gate_funnel.sql` | New RPC `analytics_login_gate_funnel(days_back, tz)` aggregating the four login-gate events. Already applied to remote Supabase. |

### Modified — **AVOID EDITING THESE ON THE WIZARD BRANCH**

| File | What changed | Why it matters for the wizard |
|---|---|---|
| `src/components/auth/AuthForm.tsx` | Pending-auth helpers moved out to `src/lib/pendingAuth.ts`. `onAuthSuccess` now passes `{method}`. New `compact` prop suppresses outer chrome when embedded in a modal. | PostListingWizard / EditListingWizard probably render this when the user is logged out. If you tweak AuthForm props or markup, conflicts are likely. |
| `src/components/common/PhoneNumberReveal.tsx` | `onReveal` can return `boolean | void`; returning `false` aborts the reveal. New exported `setPhoneRevealedSession(listingId)` helper. | Low-risk for the wizard but the file is touched. |
| `src/components/listing/ListingContactForm.tsx` | New props: `isAuthenticated`, `onAuthRequired(formData)`, `defaultSuccess`. Submission logic moved to the shared service. | Wizard doesn't render this, but if you change props or imports there will be a conflict. |
| `src/components/listing/CommercialContactForm.tsx` | Same as above for commercial. | Same. |
| `src/components/analytics/InquiriesTab.tsx` | New `loginGateFunnel` prop + a new "Login-Gate Funnel" section inserted between the existing "Conversion Funnel" and "Listing-Level Inquiry Behavior" sections. New `LoginGateFunnel` interface. | Only matters if the wizard branch also touches the analytics tab. |
| `src/lib/analytics.ts` | Added `trackLoginGateShown/Dismissed/AuthSuccess/ActionCompleted` exports + `LoginGateAction/ListingType/Method` types. | Avoid editing this file. If you need a new tracker, add it in a way that's easy to rebase. |
| `src/lib/analytics.types.ts` | Added 4 new event names to the `AnalyticsEventName` union. | Same — avoid editing the union or merge carefully. |
| `src/pages/ListingDetail.tsx` | Heavy edits: new state for the auth modal, `handleCallClick` returns `false` to abort reveal when logged out, new `handleCallbackAuthRequired`/`handleAuthModalClose`/`handleAuthSuccessFromModal` handlers, `replayPendingListingAction` callback, post-OAuth effect, modal JSX appended near the bottom of the return. Both `<PhoneNumberReveal>` instances (mobile + desktop blocks) now take a `key` for forced remount. Both `<ListingContactForm>` instances pass the new props. | If the wizard branch edits anything in ListingDetail, expect conflicts. The wizard appears not to touch this file, but double-check before editing. |
| `src/pages/CommercialListingDetail.tsx` | Same shape of changes as ListingDetail, mirrored for commercial. | Same warning. |
| `src/pages/InternalAnalytics.tsx` | New state `loginGateFunnel`, new RPC call in the `Promise.all`, new prop passed to `InquiriesTab`. | Same — avoid editing this file. |

---

## Coordination rules of thumb

1. **Wizard work that touches `/post`, `/edit`, `PostListingWizard.tsx`, `EditListingWizard.tsx`, or the step components is safe** — those files are not on the login-gate diff.
2. **Don't change `AuthForm.tsx`** unless you've checked the diff on the other branch first. The "compact mode" refactor is sensitive.
3. **Don't add new analytics event names** without coordinating — the union in `analytics.types.ts` will conflict.
4. **Don't edit the two listing detail pages or the InternalAnalytics page** unless absolutely necessary.
5. **DB migrations**: keep new migration filenames in a different timestamp slot. The login-gate branch added `20260523120000_analytics_login_gate_funnel.sql`. Pick a different timestamp (later than this) for any new wizard migration.
6. **`src/services/listingContact.ts`** is new on the login-gate branch. If the wizard happens to need similar functionality, wait for the merge instead of duplicating.

When the login-gate branch lands on `main`, you can delete this notes file from the wizard branch.

---

*This file was generated by Claude on 2026-05-23 while the login-gate branch was active. Source branch: `claude/listing-detail-login-gate` at commit `2d9e9c9`.*
