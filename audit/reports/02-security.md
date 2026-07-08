# Track 2 — Security surface (auth, edge functions, XSS, abuse) — Findings

## Summary

The security posture is uneven: the *sensitive administrative* endpoints are genuinely well-built (impersonation, user deletion, and the Stripe webhook all verify identity, check authorization, and log), but a large tier of *public/utility* edge functions was written with "the anon key gatekeeps it" as the only protection — which is no protection, because the anon key ships in the client bundle. The single worst finding is that the inbound Twilio webhook (`handle-renewal-sms-webhook`) does **no `X-Twilio-Signature` validation**, so anyone can forge an SMS reply and deactivate or renew any listing on the site; combined with the unauthenticated `send-report-rented-sms` (which creates the conversation on demand), an anonymous attacker can take down any active listing. Money paths are mostly safe (prices are hardcoded server-side from `_shared/stripe-prices.ts`), with two exceptions: `create-checkout-session` trusts a client-supplied `price_id` while granting a server-chosen entitlement duration (pay-less-get-more), and `create-boost-checkout` has no auth at all. The two `move-temp-*-images` functions are unauthenticated IDORs that let anyone download and **delete** arbitrary images from the shared bucket via service-role. Several SMS/email/AI functions are open relays or cost sinks (Twilio/Zepto/hcti.io spend with no rate limit). XSS is well-handled on render paths (DOMPurify on read, `escapeHtml` in map popups, listing descriptions rendered as auto-escaped JSX text). No secrets are committed to git, but the **live `service_role` key sits in plaintext** in `.claude/settings.local.json` (gitignored, but replicated across worktrees). Severity counts: **4 P0, 5 P1, 5 P2, 4 P3.**

Note on `verify_jwt`: `supabase/config.toml` sets it explicitly for only 5 functions; every other function's real gateway posture is unknowable from the repo (see P2 "config drift"). Throughout this report "unauthenticated / reachable by anyone" means "reachable by anyone holding the public anon key" (which is embedded in the shipped JS), because none of those functions perform an in-function identity check.

---

## Edge-function authorization matrix (all 42)

Legend: **JWT?** = calls `auth.getUser()` to verify caller identity. **AuthZ?** = checks admin/owner beyond mere authentication. **Svc-role scoped?** = uses `SUPABASE_SERVICE_ROLE_KEY` and whether its queries are constrained to the caller. **Validation?** = input validation present.

| Function | JWT? | AuthZ? | Svc-role safely scoped? | Input validation | Notes |
|---|---|---|---|---|---|
| admin-sign-in-as-user | ✅ | ✅ admin via `app_metadata.is_admin`, refuses admin targets | ✅ | ✅ | Audit-logged. Healthy. |
| approve-listing | ✅ | ✅ admin (`app_metadata.is_admin`) | ✅ | ✅ | Healthy. |
| delete-user | ✅ | ✅ admin, self-delete guard | ✅ | ✅ UUID+len | Audit-logged. Healthy. |
| create-checkout-session | ✅ | ✅ owner-or-admin | ⚠️ | partial | **P0**: client-supplied `price_id` charged; entitlement from separate `plan`. |
| create-boost-checkout | ❌ | ❌ none | ⚠️ scoped to looked-up listing | ✅ UUID | **P1**: no auth; owner-blocking pending rows. Price is server-side (safe). |
| create-concierge-checkout | ✅ | owner (self) | ✅ | ✅ | Prices from `_shared/stripe-prices.ts`. |
| create-individual-listing-checkout | ✅ | owner/admin | ✅ | ✅ | Prices server-side. |
| create-listing-subscription-checkout | ✅ | owner (self) | ✅ | ✅ | Prices server-side. |
| create-portal-session | ✅ | owner (self) | ✅ | n/a | Healthy. |
| upgrade-listing-subscription | ✅ | owner (self) | ✅ | ✅ | Prices server-side. |
| extend-paid-listing | ✅ | ✅ owner/admin | ✅ | ✅ | Healthy. |
| update-concierge-subscription | ✅ | owner (self) | ✅ | ✅ | `verify_jwt=true` in config. |
| update-concierge-sources | ✅ | owner (self) | ✅ | ✅ | Healthy. |
| cascade-deactivate-subscription | ✅ | admin OR service-role bearer (called by webhook) | ✅ | ✅ | Healthy. |
| stripe-webhook | n/a | Stripe signature (`constructEventAsync`, raw body) | ✅ per-handler idempotency | ✅ | `verify_jwt=false`. Healthy. |
| pay-listing-link | n/a | HMAC-signed token | ✅ approved-rental-only | ✅ | `verify_jwt=false`. Healthy. No client price. |
| handle-renewal-sms-webhook | ❌ | ❌ **no Twilio signature** | ❌ mutates any listing by phone match | partial | **P0**: forge SMS → deactivate/renew any listing. |
| send-report-rented-sms | ❌ | ❌ none | ⚠️ | partial | **P1**: unauth SMS to owners + creates deactivation conversation. |
| send-listing-contact-sms | ❌ | ❌ none | ⚠️ | partial (len) | **P1**: unauth; sends up to 2 Twilio SMS/call, no rate limit. |
| send-email | partial | ❌ `admin_notification`/`password_reset` bypass auth; `general` = any logged-in user | ⚠️ | partial | **P1**: relay abuse + admin phishing. |
| send-password-reset | ❌ | ❌ none | ✅ | ✅ email regex | **P2**: no rate limit; leaks generateLink error (enumeration). |
| send-contact-message | ❌ | ❌ (intended public) | n/a (no DB) | ✅ + rate limit + escape | Fixed recipient. Healthy. |
| generate-listing-image | ❌ | ❌ none | n/a | partial (len) | **P2**: anon hcti.io cost abuse. |
| track | ❌ | ❌ (intended public ingest) | ⚠️ svc insert | ✅ + rate limit + admin filter | event_props unbounded (**P3**). |
| redirect-short-url | ❌ | ❌ | ⚠️ | n/a | **P2**: 302 to stored URL, no dest allowlist. |
| get-boost-listing | ❌ | ❌ | read-only public listing | ✅ | **P3**: low (public data). |
| get-neighborhood-polygon | ❌ | ❌ | read-only cache | ✅ | Healthy (public read). |
| get-zipcode-polygon | ❌ | ❌ | read-only cache | ✅ | Healthy (public read). |
| geocode-cross-streets | ❌ | ❌ | ⚠️ | ✅ | `verify_jwt=false`; Mapbox cost — see P2 "cost sinks". |
| update-neighborhood-polygons | ❌ | ❌ none | ⚠️ writes polygons | partial | **P1** (grouped): admin-data write with no gate. |
| move-temp-images | ❌ | ❌ none | ❌ arbitrary `filePath` dl+remove | ✅ UUID | **P0**: unauth IDOR / image deletion. |
| move-temp-commercial-images | ❌ | ❌ none | ❌ same pattern | ✅ UUID | **P0**: same as above. |
| cleanup-expired-renewals | ❌ | ❌ no secret | writes deactivations | n/a | **P1** (grouped): cron with no gate. |
| delete-old-listings | ❌ | ❌ no secret | deletes listings | n/a | **P1** (grouped): cron with no gate. |
| inactivate-old-listings | ❌ | ❌ no secret | mass deactivation | n/a | **P1** (grouped): cron with no gate. |
| send-renewal-reminders | ❌ | ❌ no secret | sends SMS | n/a | **P1** (grouped): forced blast = cost. |
| send-paid-listing-reminders | ❌ | ❌ no secret | sends SMS (signs pay tokens) | n/a | **P1** (grouped): forced blast = cost. |
| send-deactivation-emails | ❌ | ❌ no secret | sends email | n/a | `verify_jwt=false` in config. **P1** (grouped). |
| send-enhanced-digest | ✅ (admin path) | admin OR cron | ⚠️ | n/a | Manual trigger admin-gated; cron path ungated. |
| send-daily-admin-digest | ✅ (admin path) | admin OR cron | ⚠️ | n/a | Same. |
| send-weekly-performance-reports | ❌ | ❌ no secret | sends email | n/a | **P1** (grouped). |
| send-listing-email-manual | ✅ | ✅ admin | ✅ | ✅ | Healthy. |

---

## Findings

### [P0] Inbound Twilio webhook does not validate `X-Twilio-Signature` — anyone can forge SMS replies to deactivate or renew any listing
- **Where:** `supabase/functions/handle-renewal-sms-webhook/index.ts:218-256` (handler reads `From`/`Body` from `req.formData()`; no signature check anywhere in the 1545-line file — grep for `X-Twilio`/`validateRequest` returns nothing).
- **What:** The webhook trusts the POST body's `From` phone number and `Body` text, matches an open `listing_renewal_conversations` row by phone, and applies the resulting state change (renew = +14 days, or "rented/NO" = deactivate). The Twilio auth token is present in env (`TWILIO_AUTH_TOKEN`, used for *outbound* sends) but is never used to verify inbound requests.
- **Why it matters / failure scenario:** A competitor scripts POSTs to the public function URL with `From=<owner phone>&Body=NO`. Because listing contact phones are shown publicly on the site, and because `send-report-rented-sms` (below) lets an attacker *create* an `awaiting_report_response` conversation on demand for any listing, the attacker can deactivate **every active listing on the platform** without authentication. Forging `Body=YES` on paid listings grants free 14-day renewals (revenue leak). Forged inbound messages are also logged as if genuine, poisoning the SMS audit trail.
- **Evidence:** `const formData = await req.formData(); from = formData.get("From")... body = formData.get("Body")...` at lines 239-241, followed by state mutation with `supabaseAdmin` (service role) keyed only on the phone match. No `req.headers.get('X-Twilio-Signature')` read exists.
- **Fix prompt:** In `handle-renewal-sms-webhook/index.ts`, before parsing intent, validate the Twilio signature: read `X-Twilio-Signature`, reconstruct the signed string per Twilio's algorithm (full request URL + sorted POST params), HMAC-SHA1 with `TWILIO_AUTH_TOKEN`, base64, and compare with a timing-safe equality; return 403 on mismatch. Use the public function URL (respect `X-Forwarded-Proto`/host) exactly as Twilio saw it. Add the same guard to any other function Twilio POSTs to. Verify by replaying a captured genuine Twilio request (passes) and a hand-crafted one (rejected). Confirm `verify_jwt=false` for this function so Twilio can still reach it.

### [P0] `create-checkout-session` charges a client-supplied `price_id` while granting a server-chosen entitlement — pay-less-get-more
- **Where:** `supabase/functions/create-checkout-session/index.ts:43` (`const { listing_id, plan, price_id } = await req.json();`), used raw at line 154 (`line_items: [{ price: price_id, quantity: 1 }]`); entitlement `duration_days` comes from `VALID_PLANS[plan]` (line ~159), a *different* client field.
- **What:** The amount actually charged is whatever Stripe price the client names, but the featured-duration entitlement recorded in metadata is derived from `plan`. The two are never cross-checked. `price_id` is only validated for type/length (≤100 chars), not against an allowlist.
- **Why it matters / failure scenario:** A user opens the featured-purchase call, passes `plan` = the 90-day plan (max entitlement) but `price_id` = the cheapest active price in the merchant's Stripe account (e.g. a $5 boost price, all of which are discoverable). Stripe charges $5; `stripe-webhook.handleFeaturedCheckout` grants 90 days of featuring based on `duration_days` from metadata, regardless of `amount_total`. Direct revenue loss on every featured sale, scaling with paying users.
- **Evidence:** `if (typeof price_id !== 'string' || price_id.length > 100)` is the only price_id check (lines 67-72); no mapping of `plan → expected price_id`. Contrast `create-boost-checkout` which uses `PRICE_MAP[plan].priceId` server-side.
- **Fix prompt:** In `create-checkout-session/index.ts`, stop accepting `price_id` from the client. Import the plan→price map from `_shared/stripe-prices.ts` (mirror the pattern in `create-boost-checkout`), look up the canonical `priceId` and `duration_days` from the validated `plan`, and pass only the server-resolved price to `stripe.checkout.sessions.create`. If a `price_id` must remain for backward compat, reject any value not equal to the plan's canonical price. Verify by attempting a checkout with a mismatched `price_id` and confirming a 400.

### [P0] `move-temp-images` / `move-temp-commercial-images` are unauthenticated IDORs — anyone can download and delete arbitrary bucket images
- **Where:** `supabase/functions/move-temp-images/index.ts` (whole file — no `auth.getUser`, no ownership check) and identical `move-temp-commercial-images/index.ts`. Key sinks: `.download(filePath)` (line 68), `.remove([filePath])` (lines 82, 120), `listing_images` insert with client `listingId` (lines 110-137).
- **What:** `listingId`, `userId`, and each `tempImages[].filePath` come straight from the request body and are used with the **service-role** storage client, which bypasses all storage RLS. Nothing verifies the caller owns `userId`/`listingId` or that `filePath` belongs to them. Finalized image paths are exposed in public URLs, so every listing's storage path is known.
- **Why it matters / failure scenario:** An attacker posts `{ listingId: <own or any>, userId: <any uuid>, tempImages: [{ filePath: "<victim-listing>/1699_0.jpg" }] }`. The function downloads the victim's image, re-uploads it, then **`.remove([filePath])` deletes the victim's original** — arbitrary, unauthenticated destruction of any user's listing photos across the whole bucket. The same call can attach images to a `listingId` the caller doesn't own (defacement). This is data loss with no authentication required.
- **Evidence:** `const { listingId, userId, tempImages } = await req.json();` (line 22) with only UUID-format checks; `await supabaseAdmin.storage.from('listing-images').remove([filePath]);` (line 82) on a client-controlled path.
- **Fix prompt:** In both `move-temp-*-images` functions, require `Authorization`, call `auth.getUser(token)`, and (a) reject if `user.id !== userId`, (b) fetch the target listing and reject if `listing.user_id !== user.id` (allow admins), and (c) constrain every `filePath` to the caller's own temp prefix (e.g. must start with `user_${user.id}/temp/`) before any `download`/`remove`. Keep the existing MIME/magic-byte/size validation. Verify by calling with another user's `filePath` and confirming 403, and with a valid own temp path and confirming success.

### [P0] Live `service_role` key stored in plaintext on disk (gitignored, but exposed across worktrees)
- **Where:** `.claude/settings.local.json` (and identical copies under `.claude/worktrees/*/.claude/settings.local.json`), embedded in ~40 allowlisted `curl` command strings for project `pxlxdlrjmrkxyygdhvku` (the live prod project).
- **What:** The full `service_role` JWT (`role":"service_role"`, `exp` ~2069 — a ~43-year lifetime) is pasted in cleartext. This key bypasses all RLS and grants read/write to every table (all user PII, billing, SMS logs). The public `anon` key is also present (that one is expected/harmless).
- **Why it matters / failure scenario:** `git check-ignore` confirms the file is ignored and `git ls-files` confirms it is **not** committed — so it will not leak via a repo push (good). But the highest-value secret in the system is sitting at rest in a config file that is trivially committed by accident (`git add -f`, a future `.gitignore` edit), is duplicated into every worktree, and was pasted by prior AI sessions (so it likely also lives in agent transcript logs / shell history). Anyone who obtains any copy gets god-mode over production. It never needed to be in a permission rule — the allowlist could match the URL prefix without the key.
- **Evidence:** Decoded payload: `{"iss":"supabase","ref":"pxlxdlrjmrkxyygdhvku","role":"service_role","iat":1753796251,"exp":2069...}`. Present verbatim in the current worktree's `.claude/settings.local.json` lines 5-73 and in `nice-hofstadter-1458c2`, `admiring-brahmagupta-3f7aa1` worktrees.
- **Fix prompt:** Treat the key as compromised: rotate the `service_role` (and `anon`, since they share a JWT secret) in the Supabase dashboard, then update the deployed edge-function env and any local `.env`. Scrub the key from every `.claude/settings.local.json` (all worktrees) — replace the allowlist entries with URL-prefix matches that don't embed credentials, or remove them. Purge shell history. This is a manual/ops task, not a product-code change; do not commit any key. Also consider issuing keys with a shorter expiry.

### [P1] Unauthenticated SMS relays — `send-listing-contact-sms` and `send-report-rented-sms` (Twilio cost + harassment)
- **Where:** `supabase/functions/send-listing-contact-sms/index.ts` (no auth, no rate limit; sends alert SMS at line ~365 and a second follow-up SMS at line ~476) and `send-report-rented-sms/index.ts` (no auth; sends at line 195).
- **What:** Both accept a public `listingId` plus attacker-supplied `userName`/`userPhone`/reporter fields and send Twilio SMS to the listing owner's `contact_phone`. `send-listing-contact-sms` sends up to two messages per call. Neither has any rate limiting (contrast `send-contact-message`, which does).
- **Why it matters / failure scenario:** Listing IDs are enumerable from the public site. An attacker loops over all listings → every owner is texted (harassment + carrier complaints) and Twilio is billed per segment × 2, a direct money-loss lever with no cap. `send-report-rented-sms` additionally inserts an `awaiting_report_response` conversation that will auto-deactivate the listing in 24h if the owner doesn't reply — and it feeds the P0 forgery above.
- **Evidence:** grep of both files shows no `auth.getUser`, no `rate`/`window` limiter; `send-listing-contact-sms` builds `To: formatPhoneForSMS(listing.contact_phone)` from a body-supplied `listingId`.
- **Fix prompt:** Add IP-hash + per-listing rate limiting (reuse the sliding-window pattern from `send-contact-message`/`track`), and require a lightweight anti-abuse gate (authenticated user, or a per-session token, or hCaptcha). Cap sends per phone per day. For `send-report-rented-sms`, additionally dedupe: refuse to open a new report conversation if one is already open for the listing. Verify by scripting repeated calls and confirming 429 after the threshold.

### [P1] `send-email` is a weakly-gated relay — anonymous arbitrary HTML to admins; any logged-in user can email anyone
- **Where:** `supabase/functions/send-email/index.ts:65-77` (auth is skipped when `type` is `password_reset` or `admin_notification`) and 294-329 (the `general` path just requires *any* valid user).
- **What:** For `type: 'admin_notification'`, no auth is required and the caller-supplied `subject` + `html` are sent to **all admin emails**. For `type: 'general'`, any authenticated user (free signup) can send fully attacker-controlled `to`/`subject`/`html`. No rate limiting.
- **Why it matters / failure scenario:** (1) An anonymous attacker POSTs `{ type:'admin_notification', subject:'Action required', html:'<a href="evil">verify your account</a>' }` → a convincing spear-phish lands in every admin's inbox from the legitimate `noreply@hadirot.com` sender (DKIM-valid). (2) A throwaway account uses the `general` path as an open email relay to spam arbitrary recipients from Hadirot's domain, burning Zepto quota and torching sender reputation.
- **Evidence:** `if (!isPasswordReset && !isAdminNotification && !authHeader) { return 401 }` — i.e. the two typed paths are explicitly exempt from auth, and neither restricts `html` content.
- **Fix prompt:** Require authentication for all paths. For `admin_notification`, either require an admin JWT or (better) ignore client `html` and build the admin-notification body server-side from a fixed template keyed by an enum. For `general`, restrict `to` to the caller's own email or a server-verified allowlist, and never let arbitrary users choose recipients. Add IP + user rate limiting. Verify that an anonymous `admin_notification` call now returns 401 and that a normal user cannot send to a third-party address.

### [P1] `create-boost-checkout` has no authentication and lets anyone create owner-blocking pending purchases
- **Where:** `supabase/functions/create-boost-checkout/index.ts` (no `auth.getUser`; takes `listing_id`/`plan`/`is_commercial` from body).
- **What:** Price is safely server-side (`BOOST_PRICES[plan]`), so amounts can't be manipulated — but there is no caller verification. It inserts a `featured_purchases` row with `status:'pending'` for the target listing (lines 119-128), and both this function and `create-checkout-session` refuse to proceed if a pending/paid purchase already exists.
- **Why it matters / failure scenario:** An attacker scripts a `pending` boost purchase for every listing (unauthenticated). The unique-constraint/existing-check then **blocks the legitimate owner** from boosting or featuring their own listing ("A purchase is already pending"). Denial-of-service on the paid-boost feature, per listing, plus spurious Stripe session creation.
- **Evidence:** No auth in the handler; `await supabaseAdmin.from("featured_purchases").insert({ ... status:"pending" ... })` on a body-supplied `listing_id`.
- **Fix prompt:** Add `Authorization`/`auth.getUser`, fetch the listing, and require `listing.user_id === user.id` (or admin) before creating the session or the pending row — matching `create-checkout-session`'s owner check. Ensure abandoned `pending` rows expire/clean up so a stale pending never permanently blocks an owner. Verify a non-owner call returns 403.

### [P1] Cron / maintenance functions have no invocation secret — reachable by anyone with the anon key
- **Where:** `delete-old-listings`, `inactivate-old-listings`, `cleanup-expired-renewals`, `send-renewal-reminders`, `send-paid-listing-reminders`, `send-deactivation-emails`, `send-weekly-performance-reports`, `update-neighborhood-polygons` — none read a `CRON_SECRET`/authorization header (grep confirms only `Deno.serve` and DB writes).
- **What:** These are meant to be triggered by a scheduler only, but their sole protection is the platform gateway accepting the public anon key. There is no in-function shared-secret check.
- **Why it matters / failure scenario:** An attacker with the (public) anon key POSTs to `send-renewal-reminders`/`send-paid-listing-reminders` repeatedly → forced SMS/email blasts to owners = uncapped Twilio/Zepto spend and user spam. Triggering `inactivate-old-listings`/`delete-old-listings`/`cleanup-expired-renewals` runs destructive maintenance on demand (state churn, premature deactivation cycles). `update-neighborhood-polygons` lets an outsider overwrite map polygon data.
- **Evidence:** For each file, no `CRON_SECRET`, `authHeader`, or signature check appears before the DB writes / SMS sends.
- **Fix prompt:** Add a shared-secret gate to every scheduled function: read a header (e.g. `X-Cron-Secret`) and compare (timing-safe) against a `CRON_SECRET` env var; return 403 on mismatch. Update the scheduler (pg_cron / external) to send the header. Keep `verify_jwt` as-is. Verify each function returns 403 without the secret and runs with it. (Cross-ref Track 7 for the cron inventory.)

### [P2] `send-password-reset` — no rate limiting and leaks account-existence via error detail
- **Where:** `supabase/functions/send-password-reset/index.ts` (no rate limiter; returns `linkError?.message`/`details` at lines 86-97).
- **What:** Unauthenticated, generates a recovery link and emails it. No IP/email throttle, and it surfaces the raw `generateLink` error to the caller.
- **Why it matters / failure scenario:** An attacker floods a victim's inbox with reset emails (email bombing) at Zepto's expense; the differing error/success responses let them enumerate which emails have accounts. (The separate `send-email` `password_reset` path does bubble up Supabase's own 429, but this dedicated function does not.)
- **Evidence:** No `checkRateLimit`; response includes `details: linkError`.
- **Fix prompt:** Add the IP-hash sliding-window limiter used in `send-contact-message`, return a generic success message regardless of whether the account exists (never echo `generateLink` errors), and cap per-email sends per hour. Verify rapid repeats return 429 and that responses are identical for existing vs non-existing emails.

### [P2] Cost-bearing third-party functions abusable anonymously — `generate-listing-image`, `geocode-cross-streets`
- **Where:** `generate-listing-image/index.ts` (no auth/rate limit; calls hcti.io at line 89) and `geocode-cross-streets` (`verify_jwt=false`, calls Mapbox).
- **What:** Both make paid external API calls driven by anonymous input with no throttle. `generate-listing-image` accepts a full client-supplied listing object and renders it via hcti.io per call.
- **Why it matters / failure scenario:** A loop of anonymous calls runs up the hcti.io and Mapbox bills directly. `geocode-cross-streets` can also be used to proxy Mapbox lookups for free.
- **Evidence:** No `auth.getUser`/rate limiter in either handler; external `fetch` to `hcti.io`/Mapbox on every request.
- **Fix prompt:** Gate both behind authentication (these are only needed by logged-in posting/admin flows) and add IP + user rate limiting. For `generate-listing-image`, prefer deriving the card data server-side from the DB listing rather than trusting a full client object. Verify anonymous calls return 401 and that a rate cap triggers 429.

### [P2] `redirect-short-url` performs an unvalidated 302 to a stored URL (open-redirect if short-URL creation is client-reachable)
- **Where:** `supabase/functions/redirect-short-url/index.ts:97-102` (`Location: shortUrl.original_url`, no destination allowlist).
- **What:** The function redirects to whatever `original_url` is stored for the short code. Today all writers are server-side (`create_short_url` RPC called from digest/SMS functions with internal `hadirot.com` URLs), so it is not currently exploitable — **but** the redirector itself does zero validation, so it becomes an open redirect the moment any client-reachable path can insert a `short_urls` row with an arbitrary destination.
- **Why it matters / failure scenario:** If the `create_short_url` RPC (or the `short_urls` table) is callable/insertable by `anon`/`authenticated` via PostgREST (UNVERIFIED — depends on RLS/grants, see Track 1), an attacker mints `https://…/redirect-short-url/<code>` that 302s to a phishing site under Hadirot's trusted domain, ideal for laundering malicious links in emails.
- **Evidence:** Redirect uses `shortUrl.original_url` unmodified; `create_short_url(p_original_url, ...)` is a SECURITY-DEFINER-style RPC — its grants were not verified in this static pass.
- **Fix prompt:** Add a host allowlist in `redirect-short-url` (only redirect to `hadirot.com`/known hosts; otherwise 400). Separately, verify (Track 1) that `INSERT` on `short_urls` and `EXECUTE` on `create_short_url` are not granted to `anon`/`authenticated`. Verify by inserting a test row with an external `original_url` and confirming the redirect is refused.

### [P2] `verify_jwt` config drift — the real caller-gating posture of most functions is unknowable from the repo
- **Where:** `supabase/config.toml` sets `verify_jwt` for only 5 functions (`send-deactivation-emails`, `stripe-webhook`, `pay-listing-link`, `geocode-cross-streets` = false; `update-concierge-subscription` = true). The Twilio webhooks, `track`, `redirect-short-url`, `move-temp-*`, `send-*-sms`, and all crons are absent.
- **What:** Functions absent from config.toml take the CLI default at deploy time, and since deploys here are manual, whether each was deployed with `--no-verify-jwt` is not derivable from the repo. The Twilio webhooks *must* be `verify_jwt=false` to work (Twilio sends no JWT), yet aren't declared — implying config.toml has drifted from the deployed reality.
- **Why it matters / failure scenario:** Security review cannot establish who-can-call-what from source; a future redeploy from config.toml could silently flip a function's gateway posture (e.g., break a webhook, or expose a function that was `--no-verify-jwt`). It also means the in-function auth gaps above cannot be mitigated by an assumed gateway.
- **Evidence:** `grep verify_jwt supabase/config.toml` returns 5 entries for 42 functions.
- **Fix prompt:** Make config.toml the single source of truth: add an explicit `[functions.<name>] verify_jwt = …` block for **every** function, matching intended posture (false for Stripe/Twilio webhooks + intentionally-public utilities, true otherwise), and redeploy so declared == actual. This is config, not product code. Verify each declared value against the live function settings.

### [P3] Miscellaneous lower-severity items
- **`track` event_props unbounded:** `sanitizeEventProps` returns the object with no size cap (`track/index.ts:145-150`); a 50-event batch of large JSON blobs bloats `analytics_events`. Add a serialized-size limit per event. (Rate limit + batch cap already mitigate volume.)
- **`delete-user` `reason` unescaped into email HTML** (`delete-user/index.ts:179`): admin-supplied only, so low risk, but should be `escapeHtml`'d for consistency.
- **`get-boost-listing` no auth:** returns only public listing fields; low risk, but add auth if any non-public field is ever added to its select.
- **Client admin gating is UI + JWT-claim, with a dual source of truth:** the client decides admin via `profiles.is_admin` (`useAuth`/`AdminPanel.tsx:169`) while edge functions verify via `app_metadata.is_admin` (JWT claim). If the two diverge, authz is confusing. AdminPanel also does direct `supabase.from('profiles').select('*')` (line 337), which relies entirely on RLS to prevent profile enumeration by a non-admin who bypasses the client redirect — verify that policy in Track 1. Consider making `profiles.is_admin` and the JWT claim reconcile on login.

---

## Non-findings (checked and confirmed healthy)

- **`admin-sign-in-as-user`** (impersonation): verifies caller JWT, requires `app_metadata.is_admin === true`, refuses to impersonate other admins, generates a magic-link session server-side, and **writes an `admin_audit_log` row** (actor/target/name/email). Well-built.
- **`delete-user`**: admin-gated via JWT claim, validates `userId` is a UUID, blocks self-deletion, and audit-logs the deletion. User A cannot delete user B without admin privileges.
- **`stripe-webhook`**: signature verified with `stripe.webhooks.constructEventAsync` over the **raw** `req.text()` body + `STRIPE_WEBHOOK_SECRET` (correct raw-body handling); each handler is idempotent (checks for an existing purchase/subscription row by session/subscription id before acting), so event replay/double-delivery is safe. `customer.subscription.deleted` and `charge.refunded` are handled. Email HTML interpolates user strings through `escapeHtml`.
- **`pay-listing-link`**: authenticated by an HMAC-SHA256 signed token (timing-safe compare, expiry enforced) derived from the service-role secret; only charges for admin-approved rentals; price/days come from server-side `INDIVIDUAL_LISTING_PACKAGES`, never the client. Token replay is analyzed and bounded (only opens a fresh Checkout the visitor must complete).
- **Money paths generally**: `create-concierge-checkout`, `create-individual-listing-checkout`, `create-listing-subscription-checkout`, `create-boost-checkout`, `upgrade-listing-subscription` all resolve prices from `_shared/stripe-prices.ts` server-side — amounts cannot be set from the client (the one exception is `create-checkout-session`, filed P0 above). All except `create-boost-checkout` verify the caller and listing ownership.
- **XSS on render paths**: listing descriptions render as `{listing.description}` JSX text (React auto-escapes) — **not** `dangerouslySetInnerHTML`. Static pages (Contact/Privacy/Terms/About/StaticPage), Help articles, and the agency "about" block all pass through DOMPurify on the **read** path (`sanitizeHtml`, and `agenciesService.mapAgencyRow → prepareAboutHtml → sanitizeHtml` before the component renders `sanitizedAboutHtml`). Map popups build HTML via `innerHTML` but route every user field through `escapeHtml` (15 call sites in `ListingsMapEnhanced.tsx`). Email HTML in edge functions escapes interpolated user strings. `sanitize.ts` DOMPurify config forbids `script`/`style`/event handlers and restricts tags/attrs.
- **`send-contact-message`**: IP-hash sliding-window rate limit (5/min), HTML-escapes all fields, enforces field-length caps, and sends only to the fixed `CONTACT_RECIPIENT` — not a relay.
- **`track`**: batch cap (50), field-length caps, per-IP rate limit (200/min), defense-in-depth admin-event filtering, IP pseudonymized via SHA-256. Reasonable for an anonymous ingest.
- **File-upload validation** (`_shared/validateFileUpload.ts`): checks MIME type, extension, magic bytes, image/video consistency, and size caps (8MB image / 100MB video). `move-temp-images` calls it (the IDOR there is an authz gap, not a validation gap).
- **Secrets in git**: no `sk_live_`/`sk_test_`/`whsec_`/Twilio `AC…`/service-role JWT is committed. `.env` and `.claude/settings.local.json` are gitignored (`git check-ignore` + `git ls-files` confirm). Root `.md` files (`MONETIZATION_LAUNCH_PLAN.md`, `live_deploy/README_RUNBOOK.md`) only reference key **prefixes** as instructions, not actual key material. (The at-rest service-role key in the gitignored settings file is filed P1 above.)
