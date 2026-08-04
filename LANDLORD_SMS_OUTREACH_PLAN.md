# Landlord SMS Outreach + Intake Cleanup — Implementation Plan

**Date:** 2026-07-29 · **Branch:** `claude/landlord-sms-outreach-b217b5`

## What this builds

After the admin vets parsed pamphlet listings in the Intake hub, they select leads and
send each landlord one SMS: *"Hadirot has thousands of tenants looking — can we post
your apartment? First 2 weeks free."* A **YES** reply auto-publishes the listing to the
house account (`l@hadirot.com`) with the standard 14-day free trial and texts back the
live link. Any other reply lands in a new **admin SMS inbox** where the admin can read
and answer landlords directly. Alongside this, a cleanup pass on the crowded Review
table and workspace drawer.

## VERIFICATION FINDINGS

Verified by reading the code (queries against prod schema recorded during
implementation):

- **Publish path** ([aiIntake.ts:640-815](src/services/aiIntake.ts)):
  `publishIntakeListing` inserts into `listings` with `user_id = assigned_user_id ||
  adminUserId`, `approved: true`, `is_active: true`, and — when monetization is on and
  the lead is a rental — `payment_kind: 'individual_trial'` + `trial_started_at: now`.
  **The 2-week free trial mechanic already exists in this path.** It runs client-side
  only; auto-publish on SMS reply requires a server-side port (edge function).
- **SMS state machine** (`handle-renewal-sms-webhook`, 1732 lines): routes inbound SMS
  by phone → active rows in `listing_renewal_conversations` (states:
  awaiting_availability, awaiting_hadirot_question, awaiting_listing_selection,
  awaiting_report_response, callback_sent, awaiting_disambiguation). Logs **every**
  inbound message to `sms_messages` (line 1068) before routing. Unmatched/unrecognized
  content emails the admin (`notifyAdmin` via `sms_admin_config`).
- **`listing_renewal_conversations`**: has `conversation_type` (text, default
  'renewal'), `metadata jsonb`, `is_commercial`; `listing_id` FK was **dropped**
  (20260630010000) — the column is already polymorphic, so it can hold a
  `scraped_listings` id for outreach conversations.
- **State CHECK constraint** (20260702000000): explicit list — any new state must be
  added to the constraint or inserts silently fail (this exact bug shipped once
  already; see the migration header).
- **`sms_messages`**: id, conversation_id, direction, phone_number, message_body,
  message_sid, message_source, listing_id, status, metadata, created_at. RLS =
  service-role only. **No admin UI reads it today** — the inbox is a brand-new surface,
  not a duplicate.
- **Outbound send pattern** (`send-report-rented-sms`): Twilio REST call with
  `TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER` env, StatusCallback →
  `sms-status-webhook`, log to `sms_messages`, insert conversation, link message → conv.
  The new outreach sender copies this shape.
- **Admin RLS pattern**: `is_admin_cached()` STABLE SECURITY DEFINER helper
  (20260417070000) used across admin policies — reuse for inbox read access.
- **Admin RPC precedent**: `admin_panel_search` (20260716000000),
  `admin_overview_today_stats` (20260722000000) — a thread-summary RPC follows this
  pattern.
- **`scraped_listings`** (`ScrapedListing` in src/config/supabase.ts): has
  `call_status`, `contact_phone`, `contact_phone_display`, `listing_kind`,
  `published_listing_id`, `image_paths`, `intake_extra` … no outreach columns yet.
- **Sidebar/badge pattern** (AdminSidebar.tsx): `pendingCount` badge on the Pending
  item — same mechanism carries the unread-SMS badge.

## CURRENT STATE ANALYSIS

Intake hub works end to end (upload/scrape/paste → review table → call workflow →
one-click publish) but the outreach step is manual phone calls. There is no way to
text landlords, no record of SMS conversations in the UI, and publishing to a house
account requires assigning a user manually. The Review table row packs up to 6 badges +
3 text lines per row, and 5 filter controls + search sit above it — functional but
noisy. The drawer is a long single scroll of sections.

## DUPLICATE / OVERLAPPING SYSTEMS CHECK

- SMS: extending the **existing** state machine table + webhook with a new
  `conversation_type='outreach'` — no parallel SMS system.
- Publish: porting the **existing** client publish logic into a shared server module;
  the client keeps calling its own path (unchanged behavior), the webhook calls the
  server port. Logic forked deliberately (browser vs Deno) — kept small and documented.
- Inbox: no existing UI reads `sms_messages`; new section confirmed non-duplicate.
- Grep confirmed no existing `l@hadirot.com` references, no `outreach` columns.

## PROPOSED SOLUTION

### A. Outreach send (admin-triggered)

New edge function **`send-intake-outreach-sms`**: admin-JWT-authenticated, takes
`scrapedListingIds[]`. For each: validate phone (E.164) + not already published + no
other active outreach conversation on the same phone (skip + report if so); send the
offer SMS via Twilio; insert `listing_renewal_conversations` row
(`conversation_type='outreach'`, `state='awaiting_outreach_response'`,
`listing_id=<scraped id>`, `expires_at = now + 14 days`); log to `sms_messages`
(`message_source='intake_outreach'`); stamp the scraped row
(`outreach_status='sent'`, `outreach_sent_at`, `outreach_conversation_id`).

Message copy (~2 SMS segments, includes descriptor + opt-out):

> Hadirot: We saw your {3 BR at 14th Ave & 50th St} listed for rent. Hadirot.com has
> thousands of local tenants searching — can we post it for you? First 2 weeks FREE,
> no obligation. Reply YES to go live. Questions? Just reply here. Reply STOP to opt out.

UI: "Send SMS offer" bulk action + per-lead button in the drawer, both behind a
confirmation modal listing exactly who gets texted with a message preview. Rentals
with a phone number only.

### B. Reply handling (webhook extension — additive branch)

In `handle-renewal-sms-webhook`, route `state='awaiting_outreach_response'`:

- **YES / affirmative** → server-side publish to the `l@hadirot.com` profile (looked up
  by email at runtime; if missing → error path). On success: conv `completed`
  (`action_taken='published'`), scraped row `outreach_status='confirmed'` (+ the normal
  `call_status='published'` + `published_listing_id` from the publish), reply:
  *"Great — your listing is live on Hadirot! View it: hadirot.com/listing/{id}. Your
  2-week free posting has started. Reply here with any questions."* On failure: conv
  `state='error'`, scraped `outreach_status='error'`, admin email alert, landlord gets
  *"Thanks! Our team will confirm shortly."* — admin finishes from the panel.
- **NO / negative** → conv `completed` (`action_taken='declined'`), scraped
  `outreach_status='declined'`, polite goodbye SMS. (STOP never reaches us — Twilio
  blocks at carrier level.)
- **Anything else** → conv stays open, scraped `outreach_status='replied'`, one-time
  ack SMS ("Got it — a team member will reply shortly", tracked in conv metadata so it
  never loops), admin email alert + unread badge. Thread continues in the inbox; a
  later YES still auto-publishes.
- Multi-conversation safety: `fetchListingForConv` / disambiguation descriptors get a
  `conversation_type==='outreach'` branch that reads `scraped_listings` instead of
  `listings`. All changes are additive; existing renewal/report/callback flows
  untouched.

Server publish lives in **`_shared/publish-intake.ts`** — a Deno port of
`publishIntakeListing` (validation → listings insert incl. trial stamping → storage
copy of images/video → `listing_images` rows → scraped row update).

### C. Admin SMS inbox

New admin section **`/admin/messages`** ("Messages" in the sidebar with an unread
badge):

- Thread list grouped by phone (new `admin_sms_threads` RPC: phone, last message
  preview/direction/time, unread count, matched contact name from scraped/live
  listings), search by phone/name.
- Thread view: full history from `sms_messages` (both directions, all sources — so
  renewal texts show too), context chip linking to the intake lead / live listing,
  reply box → new edge function **`send-admin-sms`** (admin JWT, sends via Twilio, logs
  as `message_source='admin_manual'`, attaches to the open conversation if one exists).
- Opening a thread stamps `read_by_admin_at` on its inbound messages; the sidebar badge
  counts inbound messages where `read_by_admin_at IS NULL` (scoped to
  landlord-relevant sources).
- Desktop: two-pane. Mobile: list → drill-in.

### D. Intake cleanup (Review table + drawer)

- **Row de-noising**: keep at most NEW + kind badge inline; collapse warnings (no geo /
  trial used / duplicate) into compact icons with tooltips at the row end; merge the
  "Seen ×" meta into the single secondary line; add an SMS status pill (Sent /
  Replied / Confirmed / Declined / Error) in the Status column.
- **Filter bar**: one aligned row — status becomes a segmented control of the 4
  common states (Active / To call / Ready / Published) + overflow select; source +
  kind + neighborhood as compact selects; search stays.
- **Drawer**: sectioned layout with sticky action header (status + publish + SMS
  offer), collapsible Reference/History block, and a new SMS thread panel for the
  lead's outreach conversation.
- All existing functionality preserved (bulk bar, assign, publish, edit, delete).

## ASSUMPTIONS

1. Outreach is **rentals only** (the 2-week trial is a rental-monetization concept).
   Sales leads never show the SMS action.
2. Confirmed listings always publish to `l@hadirot.com` (even if an `assigned_user_id`
   was set — outreach implies house posting). Resolved by email at runtime, never a
   hardcoded id.
3. One active outreach conversation per phone at a time; extra selected leads for the
   same phone are skipped with a visible "skipped — same phone" result.
4. Outreach conversations expire after 14 days (state `timeout` via the existing
   cleanup cron); a reply after that emails the admin as unrecognized (existing
   behavior) and still shows in the inbox.
5. A2P/Twilio compliance for cold outreach content is the user's responsibility (STOP
   handling is carrier-level; the message includes opt-out language).
6. Declining does not auto-change `call_status` — the admin decides whether to discard
   the lead.

## FILES TO MODIFY

**DB** — new migration `supabase/migrations/20260729000000_landlord_sms_outreach.sql`:
`scraped_listings` +`outreach_status`+`outreach_sent_at`+`outreach_conversation_id`;
state CHECK +`awaiting_outreach_response`; `sms_messages` +`read_by_admin_at` (+partial
index); admin RLS (SELECT on `sms_messages`+`listing_renewal_conversations`, UPDATE
read-receipts on `sms_messages`); `admin_sms_threads` RPC.

**Edge functions**: `send-intake-outreach-sms/index.ts` (new),
`send-admin-sms/index.ts` (new), `_shared/publish-intake.ts` (new),
`handle-renewal-sms-webhook/index.ts` (additive outreach branch).

**Frontend**: `src/config/supabase.ts` (ScrapedListing + new types),
`src/types/database.ts` (regen/patch), `src/services/smsInbox.ts` (new),
`src/services/aiIntake.ts` (outreach actions), `src/pages/admin/sections/
MessagesSection.tsx` (new) + `AdminSidebar.tsx` + `AdminArea.tsx`/`AdminLayout.tsx`
(route + badge), `src/components/admin/intake/IntakeReviewView.tsx`,
`IntakeWorkspaceDrawer.tsx`.

## IMPLEMENTATION PLAN

1. Migration (above) → apply to prod via `SUPABASE_DB_URL` → regen/patch types.
2. `_shared/publish-intake.ts` server publish port.
3. `send-intake-outreach-sms` edge fn.
4. Webhook outreach branch (+ outreach-aware descriptors/fetch).
5. `send-admin-sms` edge fn.
6. Frontend service layer (`smsInbox.ts`, `aiIntake.ts` outreach actions).
7. Messages section + sidebar/route/badge.
8. Intake Review + drawer: SMS actions/pills + cleanup pass.
9. Build + lint + Playwright pass on the admin screens; deploy the 3 edge fns.

Checkpoint commits + push after each numbered step that leaves the tree green.

## TESTING CHECKLIST

- Send offer to 1 vetted rental lead → row shows "SMS sent"; conversation + logged
  message in DB; skips: sale lead (no button), lead w/o phone, duplicate phone.
- Reply YES (real phone) → listing live under l@hadirot.com w/ trial stamped, images
  copied, confirmation SMS w/ working link, intake row Published + Confirmed.
- Reply NO → declined pill, goodbye SMS, conversation closed.
- Reply a question → unread badge appears, thread visible in Messages, admin reply
  arrives on phone, thread marks read, later YES still publishes.
- Renewal-flow regression: existing YES/NO renewal reply on a listing still works.
- Inbox on mobile viewport; Review table + drawer unchanged functionality
  (edit/save/publish/assign/discard) after cleanup.
- Build + lint green.
