# Track 7 — Operational Readiness & Hidden Dangers — Findings

## Summary

Hadirot runs with almost no operational safety net for a solo non-technical owner. Sentry
is wired into the React client (errors + 10% traces + session replay) but has zero presence
in the 42 Supabase Edge Functions — every cron job, webhook, and cost-bearing background
process reports failures with `console.error` only, which lands in Supabase's function logs
and nowhere else. Only 2 of 42 functions persist a failure record to a table
(`send-daily-admin-digest`, `delete-user`), and nothing in the app reads either log. The
cron schedule itself is split across git migrations and undocumented dashboard edits (one
migration comment references "cron job 18," implying jobs exist that no migration file
created). Three cron jobs' SQL bodies still contain literal `[PROJECT-REF]` /
`[SERVICE-ROLE-KEY]` placeholders in the committed migration — if ever reapplied to rebuild
the database, those jobs would silently POST to a non-existent hostname forever. The
`scripts/` directory referenced by four `package.json` npm scripts (`smoke:analytics`,
`debug:analytics`, `test:deactivation`, `seed:deactivation-tests`) was deleted in February
2026 and never cleaned from `package.json` — every one of those commands now fails
immediately with "module not found." There is no CI, no automated tests, and no test
framework installed. `delete-user` deletes the Supabase Auth user but never touches Stripe
(no customer deletion, no subscription cancellation) — a "deleted" user with an active
subscription keeps getting billed. No digest email in the codebase includes an unsubscribe
link. Backup guidance is limited to "confirm the dashboard shows a recent backup" in a
deploy runbook; there is no PITR/retention/spend-cap verification anywhere in the repo.
Findings: 2 P0, 6 P1, 5 P2, 2 P3.

## Findings

### [P0] Deleted user keeps being billed — delete-user never touches Stripe
- **Where:** `supabase/functions/delete-user/index.ts` (entire file, 209 lines)
- **What:** The function verifies the caller is an admin, then calls only
  `supabaseAdmin.auth.admin.deleteUser(userId)` (line 142) and inserts an audit log row. It
  never looks up or cancels the user's Stripe subscription, never deletes the Stripe
  customer object, and never checks `featured_purchases` / listing-subscription tables for
  active billing relationships tied to that user.
- **Why it matters / failure scenario:** Owner (or the user themselves via a future
  self-serve delete flow) deletes an account that has an active Agent/VIP subscription or a
  paid individual listing renewal. Stripe keeps charging the card on the existing
  subscription every billing cycle because nothing ever called `subscriptions.cancel` or
  `customers.del`. The owner will not know this happened until the ex-user disputes a charge
  or emails asking why they're still being billed after "deleting" their account — at which
  point it may already be a chargeback.
- **Evidence:** `delete-user/index.ts` lines 140–171 show the entire deletion logic: Auth
  delete → audit log insert → deletion email. No `stripe` import exists in the file at all
  (`grep -c stripe supabase/functions/delete-user/index.ts` → 0).
- **Fix prompt:** In `supabase/functions/delete-user/index.ts`, before calling
  `supabaseAdmin.auth.admin.deleteUser(userId)`, look up the user's Stripe customer ID
  (check whatever table stores it — likely `profiles` or a subscriptions table populated by
  `stripe-webhook`), call the Stripe API to cancel any active subscriptions
  (`stripe.subscriptions.cancel`) and optionally delete the customer
  (`stripe.customers.del`), and log the result to `admin_audit_log`. Wrap in try/catch so a
  Stripe API failure doesn't block the auth deletion, but surface it clearly (return a
  warning in the response, not just console.error) so the admin knows to follow up manually.
  Verify by creating a test user with an active subscription in Stripe test mode, deleting
  them, and confirming the Stripe dashboard shows the subscription canceled.

### [P0] Edge function crons have zero error visibility outside console.error
- **Where:** All 42 files in `supabase/functions/*/index.ts`
- **What:** Every edge function catches errors with `console.error` (confirmed count: 41 of
  42 functions use `console.error`, only `send-password-reset` has zero). No function
  imports or calls Sentry. Only `send-daily-admin-digest` (writes to
  `daily_admin_digest_logs`) and `delete-user` (writes to `admin_audit_log`) persist
  anything to a queryable table. `console.error` output goes only to Supabase's Edge
  Function logs, which are retained for a limited window and require the owner to actively
  open the Supabase dashboard and search — nothing pushes a notification.
- **Why it matters / failure scenario:** `cleanup-expired-renewals` (runs nightly at
  midnight UTC), `send-renewal-reminders` (10am ET daily), `inactivate-old-listings`,
  `send-paid-listing-reminders`, `send-weekly-performance-reports` (Thursdays), and
  `stripe-webhook` itself can all throw and fail completely — a Stripe library upgrade
  breaking a webhook handler, a Twilio auth token expiring, a Supabase RLS change blocking a
  service-role query — and the only trace is a log line that ages out of retention. The
  owner finds out when a landlord asks "why didn't my listing renewal reminder come" or a
  paying customer's subscription lapses silently with no reminder ever sent.
- **Evidence:** table below (function → failure visibility). Full inventory command used:
  `grep -c "catch\|console.error\|_logs\"\|_log\"\|sentry" supabase/functions/*/index.ts`.

| Function | Failure visibility |
|---|---|
| admin-sign-in-as-user | silent (console.error only) |
| approve-listing | silent |
| cascade-deactivate-subscription | silent |
| cleanup-expired-renewals | silent |
| create-boost-checkout | silent |
| create-checkout-session | silent |
| create-concierge-checkout | silent |
| create-individual-listing-checkout | silent |
| create-listing-subscription-checkout | silent |
| create-portal-session | silent |
| delete-old-listings | silent |
| delete-user | logged (admin_audit_log, success only — no failure-path log) |
| extend-paid-listing | silent |
| generate-listing-image | silent |
| geocode-cross-streets | silent |
| get-boost-listing | silent |
| get-neighborhood-polygon | silent |
| get-zipcode-polygon | silent |
| handle-renewal-sms-webhook | silent |
| inactivate-old-listings | silent |
| move-temp-commercial-images | silent |
| move-temp-images | silent |
| pay-listing-link | silent |
| redirect-short-url | silent |
| send-contact-message | silent |
| send-daily-admin-digest | logged (daily_admin_digest_logs, success AND failure rows) — but nothing reads this table, no alert fires |
| send-deactivation-emails | silent |
| send-email | silent |
| send-enhanced-digest | silent |
| send-listing-contact-sms | silent |
| send-listing-email-manual | silent |
| send-paid-listing-reminders | silent |
| send-password-reset | silent (no console.error at all — errors return generic response with no trace) |
| send-renewal-reminders | silent |
| send-report-rented-sms | silent |
| send-weekly-performance-reports | silent |
| stripe-webhook | silent |
| track | silent |
| update-concierge-sources | silent |
| update-concierge-subscription | silent |
| update-neighborhood-polygons | silent |
| upgrade-listing-subscription | silent |

  "Logged" above means a table row exists, not that anyone is alerted — no email/SMS/Slack
  fires on failure for any function, including the two that log.
- **Fix prompt:** Add a small shared helper in `supabase/functions/_shared/` (e.g.
  `reportError.ts`) that POSTs to Sentry's ingest API using `@sentry/deno` or a plain fetch
  to the Sentry envelope endpoint with the same DSN already used in `src/main.tsx`, and call
  it from every function's top-level catch block. Start with the highest-value functions
  first: `stripe-webhook`, `cleanup-expired-renewals`, `send-renewal-reminders`,
  `send-daily-admin-digest`, `send-paid-listing-reminders`. Verify by throwing a test error
  in one function locally and confirming it appears in the Sentry project as a distinct
  "server" or "edge-function" tagged issue.

### [P1] Three cron jobs still contain literal placeholder URLs/keys in committed migrations

> **🟡 STATUS (SMS audit, July 8 2026): FIXED LIVE, GIT STILL STALE.** `SMS_CRON_FIX.sql` repaired the live `send-weekly-performance-reports` (and `send-paid-listing-reminders`) crons — verified in prod. The committed migration files still contain the `[PROJECT-REF]`/`[SERVICE-ROLE-KEY]` placeholders, so the rebuild-from-migrations risk described below is not yet closed. Write a migration capturing the live fix to fully resolve.
- **Where:** `supabase/migrations/20260113202436_create_sms_renewal_system.sql` (lines
  137–164, jobs `send-renewal-reminders` and `cleanup-expired-renewals`) and
  `supabase/migrations/20260121191812_schedule_weekly_performance_reports.sql` (lines
  51–60, job `send-weekly-performance-reports`)
- **What:** The `cron.schedule(...)` bodies call `net.http_post` with
  `url:='https://[PROJECT-REF].supabase.co/functions/v1/...'` and
  `'Authorization', 'Bearer [SERVICE-ROLE-KEY]'` as literal strings — never replaced with
  real values in the SQL file. Each migration's trailing `RAISE NOTICE` block explicitly
  instructs: "Go to Supabase Dashboard > Database > Extensions > pg_cron... Replace
  [PROJECT-REF]... Replace [SERVICE-ROLE-KEY]..." — i.e., the real fix was designed to
  happen as a manual, undocumented, non-reproducible edit directly in the live database,
  never captured in git. No later migration supersedes these three job definitions with the
  safer `current_setting('app.supabase_url')` pattern that later migrations (e.g.
  `send-paid-listing-reminders` in `20260527150600...sql`) correctly use.
- **Why it matters / failure scenario:** If these three migrations are ever re-run to
  rebuild a fresh database (disaster recovery, a staging environment, or restoring from a
  dump and replaying migrations), the cron jobs get created but call a URL that doesn't
  resolve. `net.http_post` fails inside Postgres with no application-level error — the
  failure is only visible in the `net._http_response` table, which nothing in this codebase
  queries. Renewal reminders and weekly performance report SMS would silently stop going out
  forever, with the `cron.job` table still showing the jobs as "active." This is UNVERIFIED
  against the live database — I cannot confirm whether the owner hand-edited these three
  jobs post-migration (the RAISE NOTICE instructions suggest they were told to, and the
  feature appears to be in active use per project history, so it's likely fixed live) — but
  the git history itself is now permanently wrong and misleading for anyone who trusts it.
- **Evidence:** `grep -rn "PROJECT-REF" supabase/migrations/*.sql` → 7 matches across the
  two files listed above; no other migration re-schedules these three job names with real
  values.
- **Fix prompt:** Owner should run `SELECT jobid, jobname, schedule, command FROM cron.job;`
  in the Supabase SQL editor to see what the three jobs' `command` columns actually contain
  today. If they already show a real project ref (i.e., were hand-fixed live), write a new
  migration file (e.g. `supabase/migrations/<timestamp>_fix_renewal_cron_urls.sql`) that
  unschedules and re-schedules `send-renewal-reminders`, `cleanup-expired-renewals`, and
  `send-weekly-performance-reports` using the `current_setting('app.supabase_url')` /
  `current_setting('app.supabase_service_role_key')` pattern already used by
  `send-paid-listing-reminders`, so the committed migration matches live reality and survives
  a rebuild. Verify with `SELECT command FROM cron.job WHERE jobname = '...'` after applying.

### [P1] `npm run smoke:analytics` / `debug:analytics` / `test:deactivation` / `seed:deactivation-tests` are all dead — the scripts directory was deleted, package.json wasn't
- **Where:** `package.json` lines 12–15; referenced files under `scripts/` (deleted)
- **What:** `package.json` still declares:
  ```
  "smoke:analytics": "tsx scripts/analytics-smoke.ts",
  "debug:analytics": "tsx scripts/analytics-debug.ts",
  "test:deactivation": "tsx scripts/test-deactivation-system.ts",
  "seed:deactivation-tests": "tsx scripts/seed-deactivation-test-data.ts"
  ```
  but `git log --all --diff-filter=D -- scripts/` shows commit `50ac30f` ("Deleted
  seed-images.ts") deleted the entire `scripts/` directory, including all four files these
  npm scripts point to. `ls scripts` today: "No such file or directory."
- **Why it matters / failure scenario:** These were the only smoke-test tooling this
  project ever had (per the master plan, zero automated tests exist otherwise). If the
  owner or a future session ever tries to run `npm run smoke:analytics` to sanity-check the
  analytics pipeline after a change, it fails instantly with `ERR_MODULE_NOT_FOUND` — giving
  false confidence that "there's no smoke test to run" rather than "the smoke test used to
  exist and silently rotted."
- **Evidence:**
  ```
  $ npx tsx scripts/analytics-smoke.ts
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../scripts/analytics-smoke.ts'
  ```
  `git log --all --oneline -- scripts/` confirms the directory existed and was deleted
  wholesale in commit `50ac30f`.
- **Fix prompt:** Either restore the four scripts from git history (`git show
  50ac30f^:scripts/analytics-smoke.ts` etc.) if they're still useful, or remove the four
  dead entries from `package.json`'s `scripts` block so `npm run` doesn't advertise
  nonexistent tooling. Given the testing gap identified in Finding [P1] "Minimal test plan"
  below, restoring `analytics-smoke.ts` as a real post-deploy sanity check is the higher-value
  option — verify by running it against a local Supabase instance and confirming it exits 0.

### [P1] No digest/marketing email includes an unsubscribe link
- **Where:** `supabase/functions/send-enhanced-digest/index.ts` (full file, admin-triggered
  bulk digest to an arbitrary `recipient_emails` list); also
  `supabase/functions/send-weekly-performance-reports/index.ts`,
  `supabase/functions/send-daily-admin-digest/index.ts`
- **What:** `grep -rn "unsubscribe" -i supabase/functions/ src/` returns zero matches
  anywhere in the codebase except unrelated React `subscription.unsubscribe()` calls (auth
  listener cleanup, not email). `send-enhanced-digest` builds full HTML emails
  (`buildListingsQuery`, template rendering functions in the same file) with no footer
  function of any kind — no unsubscribe link, no physical mailing address, no List-Unsubscribe
  header.
- **Why it matters / failure scenario:** `send-enhanced-digest` is an admin tool for sending
  bulk promotional emails (new listings) to a recipient list — this is a commercial email
  under CAN-SPAM, which requires a working opt-out mechanism in every message. The owner
  will not know this is a compliance gap until a recipient complains, reports it as spam
  (hurting Zepto sender reputation / deliverability for transactional email too), or a
  regulator inquiry arrives.
- **Evidence:** `grep -n "footer\|Footer\|</html>\|buildHtml\|function build"
  supabase/functions/send-enhanced-digest/index.ts` shows only `buildListingsQuery` and
  `buildFilterUrl` — no footer/unsubscribe builder exists.
- **Fix prompt:** Add an unsubscribe footer to the shared email template used by
  `send-enhanced-digest` (and ideally `_shared/zepto.ts`'s `renderBrandEmail` helper used
  by other functions) that includes a `List-Unsubscribe` header pointing at a simple
  edge-function endpoint (new, e.g. `unsubscribe-digest`) which flags the recipient email in
  a suppression table, and check that table before sending future digests. Verify by sending
  a test digest to yourself and confirming the unsubscribe link removes you from the next
  send.

### [P1] Deploy pipeline is entirely manual with no CI gate
- **Where:** repo root (no `.github/workflows/`, no `netlify.toml`/`vercel.json` committed);
  `MONETIZATION_LAUNCH_PLAN.md` line ~92 ("frontend host (Netlify/Vercel) auto-deploys
  `main`"); `live_deploy/README_RUNBOOK.md`; root `apply_migration*.sh`, `deploy-daily-cards.sh`
- **What:** There is no GitHub Actions workflow, no lint/build/typecheck gate before merge,
  and no automated test suite to fail a bad PR. Frontend deploys are triggered by the
  hosting provider (Netlify or Vercel — which one, and who owns that account, is not
  recorded in the repo) auto-building `main` on push. Database migrations are applied by
  pasting SQL directly into the Supabase dashboard SQL editor one file at a time (per
  `live_deploy/README_RUNBOOK.md` Step 2 and the monetization launch plan), explicitly
  avoiding `supabase db push` because "the live project's migration-history table may not
  match the repo."
- **Why it matters / failure scenario:** Any push to `main` (or manual dashboard paste)
  reaches production with no automated check that the app still builds, lints clean, or
  that a migration doesn't conflict with the live schema. A typo in a manually-pasted
  migration, or a broken build merged without anyone running `npm run build` locally first,
  goes straight to real users. The explicit acknowledgment that the live migration-history
  table may already be out of sync with the repo means nobody currently has full confidence
  in what's actually been applied to production.
- **Evidence:** `find . -iname "*.yml" -not -path "*/node_modules/*"` → no results;
  `ls .github/workflows/` → "No such file or directory"; direct quote from
  `live_deploy/README_RUNBOOK.md`: "SQL Editor → New query → paste the ENTIRE contents of
  `live_deploy/ALL_MONETIZATION_MIGRATIONS.sql` → Run."
- **Fix prompt:** Add a minimal GitHub Actions workflow (`.github/workflows/ci.yml`) that
  runs `npm ci && npm run lint && npm run build` on every PR against `main`, so at minimum a
  broken build/lint can't merge silently. This doesn't fix the manual-migration-paste
  problem (that likely needs to stay manual given the migration-history-drift risk called
  out in the runbook, and is out of scope for a quick fix), but it closes the cheapest gap.
  Verify by opening a PR with an intentional lint error and confirming the check fails.

### [P1] Cron job inventory is split between git migrations and undocumented dashboard edits
- **Where:** `supabase/migrations/20260702010000_commercial_lifecycle_wiring.sql` header
  comment (lines 1–17); `supabase/migrations/20260315235739_fix_reactivation_trigger_and_lifecycle_control.sql`
  line 23; no migration ever creates a job matching the "Deactivate Old Listings" name
- **What:** The commercial-lifecycle migration's own header states, as a verified-against-prod
  fact: "cron job 1 runs deactivate_old_listings(), cron job 2 runs
  delete_very_old_listings()... expire_featured_listings() (cron job 18, hourly)." No
  migration file in `supabase/migrations/` ever calls `cron.schedule('deactivate-old-listings',
  ...)` or creates a job numbered up to 18 — these numbers and job names only surface in
  code-comment references to what a prior session found by querying the live `cron.job`
  table directly. Separately, `20260315235739...sql` documents that "The pg_cron job
  'Deactivate Old Listings' (0 0 * * *) calls deactivate_old_listings()" as an already-existing
  fact, again with no corresponding `cron.schedule(...)` call anywhere in migration history.
- **Why it matters / failure scenario:** Nobody — not this audit, not a future engineer, not
  the owner without direct database access — can get a complete, authoritative list of what
  runs on a schedule from the git repo alone. If the database is ever rebuilt from migrations
  (disaster recovery, replicating to a new project, or even just onboarding a new developer
  who reads only the repo), an unknown number of cron jobs (at least "job 1" and "job 2" for
  listing lifecycle, and whatever else exists up to at least job 18) would not be recreated,
  and nobody would notice until listings stop expiring/deactivating on schedule weeks later.
- **Evidence:** direct quotes above from the two migration files; cross-referenced against
  `grep -rn "cron.schedule" supabase/migrations/*.sql` which shows only 11 distinct
  `cron.schedule` calls total across all 233 migrations — far fewer than "job 18" implies
  exist live.
- **Fix prompt:** This is not a code fix — it requires the owner to run
  `SELECT jobid, jobname, schedule, command, active FROM cron.job ORDER BY jobid;` in the
  Supabase SQL editor and paste the full output into a new tracked file (e.g.
  `supabase/CRON_INVENTORY.md`), so the repo has at least a point-in-time authoritative
  snapshot of every scheduled job, even for the ones that were created by hand and never
  captured in a migration. Ideally, for any job found live that has no corresponding
  migration, write a new migration that recreates it via `cron.schedule` so future rebuilds
  are complete.

### [P1] No test framework, zero automated tests — minimal pragmatic test plan
- **Where:** whole repo; confirmed via master-plan pre-survey and re-confirmed here
  (`find . -iname "*.test.*" -o -iname "*.spec.*"` excluding node_modules → no results; no
  `vitest`/`jest`/`playwright` in `package.json` dependencies)
- **What:** Zero automated tests of any kind exist. This finding doesn't relitigate that —
  it delivers the requested minimal pragmatic plan.
- **Why it matters / failure scenario:** Every deploy is a manual smoke test performed by
  the owner clicking around production, or not tested at all. Money-path regressions
  (double-charging, entitlement not granted) or listing-lifecycle regressions (a listing
  silently never expiring, or expiring too early) ship straight to real users and are
  discovered only when someone complains.
- **Evidence:** N/A (absence confirmed by search above); this is a plan, not a code defect.
- **Fix prompt / recommended plan:**
  - **Framework:** Vitest for unit/component tests (fast, native Vite integration, zero
    config beyond `vitest.config.ts` sharing the existing `vite.config.ts` aliases) +
    Playwright for the handful of true end-to-end flows. Both are the standard pairing for
    a Vite + React stack and require minimal new tooling.
  - **The 10 highest-value tests to add first, in priority order:**
    1. Stripe webhook idempotency: replay the same `checkout.session.completed` event twice
       against `stripe-webhook` (mocked Supabase client) and assert entitlement is granted
       exactly once, not twice.
    2. `stripe-webhook` signature verification rejects a tampered payload (security +
       money — one test, high leverage).
    3. Listing lifecycle: a listing with `paid_until` in the past gets deactivated by
       `auto_inactivate_old_listings()`/`deactivate_old_listings()`, and one with
       `paid_until` in the future does not (guards against the exact class of bug
       `20260315235739...sql` had to hand-fix once already).
    4. `cascade-deactivate-subscription` / `cleanup-expired-renewals`: a canceled Stripe
       subscription results in the listing losing `is_featured`/paid status within one cron
       cycle, not staying paid forever (revenue-leak class).
    5. Price integrity: every `create-*-checkout` function rejects a client-supplied
       price/amount and only ever uses server-side price IDs or the hardcoded
       `INDIVIDUAL_LISTING_PACKAGES` table.
    6. Browse filters round-trip: given a URL with filter params, `useBrowseFilters` parses
       it back to the same filter object that produced it (guards the exact class of bug in
       `FILTER_PERSISTENCE_BUG_FIX.md`/`PRICE_FILTER_BUG_FIX.md`).
    7. Price/rent range boundary tests: min===max, min>max, broker_fee null vs false vs true
       all produce the expected filtered set against a small fixture dataset.
    8. Create-vs-edit field parity: assert every field present in `PostListing`'s submit
       payload has a corresponding field read/write in `EditListing`'s load+submit (a
       structural test, not a full E2E — catches the "field silently dropped on edit" class
       of bug the codebase has already hit at least twice per master-plan history).
    9. `delete-user` end-to-end (once Finding P0 above is fixed): deleting a user with an
       active Stripe subscription results in that subscription being canceled.
    10. Timezone: a `paid_until`/`expires_at` set for "midnight ET" actually compares
        correctly against `now()` in UTC across a DST boundary (guards the class of bug in
        `ANALYTICS_TIMEZONE_FIX_REPORT.md`).
  - **Realistic one-session smoke suite scope:** tests 1, 3, 5, 6, and 7 above are achievable
    in a single focused session against a local Supabase stack with seeded fixture data —
    they don't require live Stripe/Twilio calls, just mocked/stubbed HTTP. Tests 2, 4, 9 need
    a local Stripe CLI (`stripe listen`) which the project's own history notes has been a
    recurring blocker — scope those as a follow-up session once that's unblocked.
  - The dead `scripts/analytics-smoke.ts` (see Finding above) should be restored as the
    first re-introduced piece of tooling, since it's the one thing that used to exist and
    already knew how to talk to a live/local Supabase instance.

### [P2] Sentry has no release/source-map configuration — stack traces are unreadable
- **Where:** `src/main.tsx` lines 9–105 (full `Sentry.init` call); `vite.config.ts` (no
  `@sentry/vite-plugin`); `package.json` dependencies (no `@sentry/vite-plugin` or
  `@sentry/cli`)
- **What:** `Sentry.init` sets `environment` from `import.meta.env.MODE` but never sets a
  `release` identifier, and there is no build-time source-map upload step (no Sentry Vite
  plugin, no `.sentryclirc`, no CI step running `sentry-cli releases`). The production
  build presumably ships minified JS (default Vite behavior) without associated source maps
  in Sentry.
- **Why it matters / failure scenario:** When a production error is captured, the stack
  trace in Sentry will show minified variable/function names and bundled line numbers
  instead of original source locations, making it materially harder (or practically
  impossible) to diagnose without manually re-building and comparing bundles. The owner
  (or anyone helping them) will find every Sentry issue much harder to act on than it should
  be — a bug that looks findable in principle actually costs 5-10x longer to trace.
- **Evidence:** `grep -n "sourcemap\|sentry-vite\|@sentry/vite-plugin\|release" vite.config.ts`
  → no matches; `grep -n "sentry" package.json` → only the `@sentry/react` runtime
  dependency, no build-time plugin.
- **Fix prompt:** Add `@sentry/vite-plugin` to `package.json` devDependencies, configure it
  in `vite.config.ts` with `authToken`/`org`/`project` (from a new `SENTRY_AUTH_TOKEN` env
  var, not committed), and set `release: <git-sha-or-package-version>` in the `Sentry.init`
  call in `src/main.tsx` matching the plugin's release name. Verify by triggering a test
  error in a production build and confirming the Sentry issue shows original TypeScript
  file names/line numbers, not minified bundle references.

### [P2] `.env.example` omits most Edge Function secrets actually read by the code
- **Where:** `.env.example` (23 lines); actual usage across `supabase/functions/*/index.ts`
- **What:** `.env.example` documents `VITE_*` client vars plus a comment about `ZEPTO_TOKEN`
  and the monetization-era Stripe/Twilio secrets. It does not mention
  `GOOGLE_MAPS_API_KEY` (server-side, distinct from `VITE_GOOGLE_MAPS_API_KEY`),
  `HTMLCSSTOIMAGE_API_KEY`/`HTMLCSSTOIMAGE_USER_ID`, `EMAIL_PROVIDER`, `CONTACT_RECIPIENT`,
  or `ZEPTO_FROM_ADDRESS`/`ZEPTO_FROM_NAME`/`ZEPTO_REPLY_TO` — all of which are read via
  `Deno.env.get(...)` in shipped edge functions.
- **Why it matters / failure scenario:** Anyone (including a future AI session or a
  contractor the owner brings on) trying to stand up a second environment (staging, or
  rebuilding after a disaster) from `.env.example` alone will be missing 7+ required Edge
  Function secrets with no indication they exist, and the affected functions
  (`geocode-cross-streets`, `generate-listing-image`, `send-contact-message`, `send-email`)
  will fail at runtime with unhelpful "not configured" console errors that (per the P0/P1
  Sentry findings above) nobody will see.
- **Evidence:** `grep -c "GOOGLE_MAPS_API_KEY\|HTMLCSSTOIMAGE\|EMAIL_PROVIDER\|CONTACT_RECIPIENT\|ZEPTO_FROM\|ZEPTO_REPLY_TO" .env.example`
  → 1 (only the unrelated `VITE_GOOGLE_MAPS_API_KEY` line matches by substring).
- **Fix prompt:** Extend the comment block in `.env.example` to list every
  `Deno.env.get(...)` key found by
  `grep -rhoE "Deno\.env\.get\(['\"][A-Z_]+['\"]\)" supabase/functions/ | sort -u`, grouped
  by which function(s) use them, following the existing format for the monetization secrets.
  No code change needed, just documentation — verify by re-running that grep and confirming
  every key now has a corresponding mention in `.env.example`.

### [P2] Feature flags are hardcoded constants, not env/DB config — no staging environment to test a flip
- **Where:** `src/config/launchFlags.ts` (`export const COMMERCIAL_POSTING_LIVE = true;`)
- **What:** Launch flags like `COMMERCIAL_POSTING_LIVE` are TypeScript constants baked into
  the client bundle at build time, not read from an env var or a DB-backed settings table.
  Flipping one requires a code change + full redeploy, and because there's no separate
  staging environment (deploy process only auto-builds `main` to what is presumably the one
  production site), the flip goes straight to 100% of production traffic with no
  intermediate verification environment.
- **Why it matters / failure scenario:** If a future flag flip has an unexpected
  interaction (e.g., re-enabling a flow that has drifted from a parallel code path since it
  was last live), the first place it's tested is production, for every visitor
  simultaneously, with no gradual rollout and no separate environment to catch it first.
- **Evidence:** `grep -rn "COMMERCIAL_POSTING_LIVE" src/config/launchFlags.ts` → hardcoded
  `= true`; no `.env` or database table read for this value anywhere in `src/`.
- **Fix prompt:** Not urgent to change given the small team size, but worth noting for the
  owner: consider moving high-risk launch flags into a small `admin_settings`-style DB table
  (already used for other admin-configurable values per the migrations) so they can be
  toggled without a full rebuild+redeploy, and/or stand up a low-cost staging deploy (a
  second Netlify/Vercel site pointed at a preview branch) before the next risky flag flip.
  This is a process recommendation, not a required code fix.

### [P2] Backup/recovery story is "check the dashboard," with no PITR/retention/spend-cap verification recorded anywhere
- **Where:** `MONETIZATION_LAUNCH_PLAN.md` section "0.4 Database backup";
  `live_deploy/README_RUNBOOK.md` line 23
- **What:** The only backup-related guidance in the entire repo is: "Dashboard → Database →
  Backups → confirm a fresh daily backup exists (or take a manual one)" before a risky
  bulk-update deploy. Nothing in the repo confirms whether Point-In-Time Recovery (PITR) is
  enabled, what the backup retention window is, or whether a Supabase billing spend cap is
  set (relevant given the cost-exposure findings below).
- **Why it matters / failure scenario:** If a bad migration or an admin bulk action (e.g., a
  mistyped `UPDATE listings SET ...` with no `WHERE` clause) wipes or corrupts listing data,
  recovery time and data-loss window depend entirely on Supabase project settings that
  cannot be verified from this repo. The owner needs to check this proactively, not
  discover it's misconfigured during an actual incident.
- **Evidence:** `grep -rn "PITR\|backup" *.md live_deploy/*.md` → the two locations quoted
  above are the entirety of backup-related documentation in the repo.
- **Fix prompt:** Not a code fix — the owner must manually verify, in the Supabase
  dashboard, and document the answers somewhere durable (even a one-line note in this
  repo's README): (1) Database → Backups → is Point-in-Time Recovery enabled, and what's
  the retention window (free/Pro tier defaults may be as short as 24 hours or not include
  PITR at all)? (2) Settings → Billing → is there a spend cap set, and is it OFF (unlimited,
  risk of surprise bill) or ON with a sane limit? (3) Confirm at least one successful manual
  backup/export exists that isn't solely inside Supabase's own infrastructure (e.g., an
  occasional `pg_dump` to the owner's own storage), so recovery doesn't depend entirely on
  Supabase's own backup system being available/intact.

### [P2] SMS opt-out relies entirely on Twilio's platform default, with no application-level suppression list

> **✅ STATUS (SMS audit, July 8 2026): VERIFIED.** Twilio Advanced Opt-Out confirmed active/working in the console (12 STOP opt-outs observed; err 21610). The TCPA-compliance risk is resolved at the platform level. An app-level `sms_opt_outs` suppression table remains an optional defense-in-depth improvement, not a compliance gap.
- **Where:** `supabase/functions/handle-renewal-sms-webhook/index.ts` (full inbound-SMS
  intent classifier, lines 1–~200+); `supabase/functions/send-renewal-reminders/index.ts`;
  `supabase/functions/send-weekly-performance-reports/index.ts`;
  `supabase/functions/send-report-rented-sms/index.ts`
- **What:** None of the SMS-sending or SMS-receiving functions contain any STOP/opt-out
  handling logic (`grep -n "STOP\|Unsubscribe\|opt.out" -i` across all SMS-related
  functions returns no matches other than unrelated variable names). TCPA compliance for
  outbound SMS in the US is currently resting entirely on Twilio's platform-level "Advanced
  Opt-Out" feature (auto-replies STOP and blocks future sends from that number), which is
  UNVERIFIED from this repo — it is a Twilio console/account setting, not something visible
  in code.
- **Why it matters / failure scenario:** If Twilio's Advanced Opt-Out is somehow disabled on
  the account, or the owner ever migrates to a different SMS provider or a Twilio number
  type that doesn't get this protection by default, there is no applicaton-level fallback —
  a user who has texted STOP could keep receiving renewal reminders or weekly performance
  report texts, which is a real TCPA liability. The owner would not discover this is a gap
  until a recipient complains or files a TCPA complaint.
- **Evidence:** grep results above (zero matches for opt-out logic in any SMS function).
- **Fix prompt:** UNVERIFIED — needs live check: the owner should confirm in the Twilio
  console (Messaging → Compliance / the phone number's settings) that Advanced Opt-Out is
  enabled for the number(s) used to send renewal/performance SMS. As defense in depth,
  consider adding a `sms_opt_outs` table and checking it before every outbound send in
  `send-renewal-reminders`, `send-weekly-performance-reports`, and `send-report-rented-sms`,
  populated by `handle-renewal-sms-webhook` whenever it sees a STOP-like reply (it already
  classifies message intent — add a `stop`/`optout` intent type to the existing
  `MessageIntent` union at line 64-67 and act on it).

### [P3] Deploy/migration shell scripts and account-ownership knowledge live only with the owner
- **Where:** root `apply_migration.sh`, `apply_migration_digest_settings.sh`,
  `deploy-daily-cards.sh`, `test-weekly-reports.sh`; `live_deploy/README_RUNBOOK.md`
- **What:** All deploy/migration tooling is committed to git (good — confirmed via `git
  ls-files live_deploy/` and the root `.sh` scripts are tracked), so code and instructions
  survive a laptop loss. What does NOT survive in the repo: who has login access to the
  Twilio, Stripe, Zepto, Supabase, domain registrar, and Netlify/Vercel accounts (`grep -rln
  "account owner\|who owns\|admin access to" *.md` finds no such documentation anywhere in
  81 root `.md` files), and the actual `.env` file with live secrets (correctly gitignored,
  but that means it exists in exactly one place: the owner's machine, with Supabase-side
  edge function secrets being the one exception since those are stored server-side in the
  Supabase project itself and would survive independently).
- **Why it matters / failure scenario:** If the owner's laptop dies today, all code and
  migration SQL is recoverable from git, and edge function secrets survive inside Supabase's
  own project settings — but nobody else knows how to log into Twilio/Stripe/Zepto/the
  domain registrar/the hosting provider to make changes, rotate a compromised key, or
  respond to an account-level issue (e.g., Twilio suspending the number, Stripe flagging the
  account) unless that access is documented in a password manager the owner has already
  shared with someone else.
- **Evidence:** `git ls-files live_deploy/` confirms both files tracked; `.gitignore` line
  25 confirms `.env` is (correctly) excluded from git; no account-ownership doc found in the
  81 root `.md` files.
- **Fix prompt:** Not a code fix. Recommend the owner maintain a password-manager entry (not
  in git) listing every third-party account (Twilio, Stripe, Zepto, Supabase, domain
  registrar, Netlify/Vercel, Mapbox, Google Cloud/Maps, Sentry) with login method and, ideally,
  share emergency access with one trusted second person (e.g., via the password manager's
  emergency-access feature), so the business doesn't have a true single point of failure on
  one person's continued availability.

### [P3] `send-password-reset` has no error logging at all
- **Where:** `supabase/functions/send-password-reset/index.ts`
- **What:** Of all 42 functions, this is the only one with zero `console.error` calls
  (confirmed count: 0), meaning if it fails, there is no trace whatsoever, not even in the
  Supabase function logs.
- **Why it matters / failure scenario:** A user reports "the password reset email never
  arrived" and there is nothing to look at — not even ephemeral console logs — to diagnose
  why.
- **Evidence:** `grep -c "console.error" supabase/functions/send-password-reset/index.ts` →
  0.
- **Fix prompt:** Add `console.error` logging in the catch block(s) of
  `send-password-reset/index.ts`, matching the pattern used in sibling functions like
  `send-email/index.ts`. Low effort, quick win alongside the broader Sentry-in-edge-functions
  fix above.

## Cron Inventory Table

Jobs confirmed via `cron.schedule(...)` calls found in migrations (not necessarily the
complete live list — see [P1] finding on cron inventory fragmentation above):

| Job | Schedule | If it silently stops | Detected by? |
|---|---|---|---|
| daily-admin-digest-email (`trigger_daily_digest_if_time`, hourly check, actual send gated by configured hour) | `0 * * * *` (hourly check) | Admin never receives the daily new-listings digest email | No — only `daily_admin_digest_logs` rows would stop appearing, nothing reads that table |
| send-renewal-reminders | `0 14 * * *` (10am ET) | Listing owners never get renewal-reminder SMS; listings lapse without warning (revenue leak) | No — placeholder-URL risk noted above compounds this |
| cleanup-expired-renewals | `0 0 * * *` | Expired renewal SMS conversations never get cleaned up (data hygiene only, low severity) | No |
| send-weekly-performance-reports | `0 19 * * 4` (Thu 2pm ET) | Listing owners stop getting weekly performance SMS (engagement/retention feature silently dies) | No |
| expire-featured-listings-hourly (`expire_featured_listings`) | `0 * * * *` | Featured listings never expire — buyer of a featured slot keeps the perk forever after paying stops (revenue leak) | No |
| send-paid-listing-reminders | `0 10 * * *` (10am ET via `current_setting`) | Paid listing owners never get renewal reminders before expiry | No |
| reconcile-individual-listing-anchors | `7 * * * *` | Hourly safety-net that fixes a known approve/webhook race silently stops covering for that race, and the underlying race bug (if it recurs) goes unmitigated | No |
| analytics-rollup | `10 6 * * *` | Analytics dashboards stop getting fresh rolled-up data | No |
| analytics-cleanup | `20 6 * * *` | `analytics_events` grows unbounded again (see cost-exposure section) | No |
| "Deactivate Old Listings" (`deactivate_old_listings`, per `20260315235739...sql`) | `0 0 * * *` (midnight) | Listings never auto-deactivate on expiry — inventory looks live/fresh when it isn't | No — this job's very existence is undocumented in migrations (see [P1] finding) |
| "job 2" (`delete_very_old_listings`, referenced in `20260702010000...sql`) | unknown (not in any migration) | Old inactive listings/images never get anonymized/cleaned up (storage cost + stale data lingers) | No |
| At least ~7 more jobs implied by "cron job 18" reference in `20260702010000...sql` | unknown | unknown — genuinely not derivable from this repo | No |

For every job above, the honest answer to "does anything detect a silent stop" is no —
there is no dashboard, alert, or dead-man's-switch anywhere in this codebase that checks
"did job X run today." The closest thing is `daily_admin_digest_logs`, which nobody's UI
reads.

## Non-findings (things checked and confirmed healthy)

- Privacy Policy (`/privacy`) and Terms of Service (`/terms`) pages exist and are routed in
  `src/App.tsx` (lines 38–39, 139–140).
- `analytics_events` has an actual bounded-growth story: `cleanup_analytics_events()`
  deletes impression events older than 30 days and other events older than 90 days, wired
  to a daily cron (`analytics-cleanup`) alongside a rollup job — this is a real, working
  retention policy, not just a good intention (`supabase/migrations/20250902184214_navy_math.sql`
  lines 566–627).
- `.env.example` exists (many repos this size skip it entirely) and correctly covers the
  client-side `VITE_*` variables plus documents the monetization-era Edge Function secrets
  in a comment block — it's incomplete (see [P2] finding) but not absent.
- `live_deploy/` and the root deploy shell scripts are committed to git, not left as
  local-only files — deploy tooling itself would survive a laptop loss.
- `.env` is correctly gitignored (`.gitignore` line 25) — no evidence of a committed secret
  file in this worktree's tracked files (a full secret-leak grep across all 81 root `.md`
  files is Track 2's scope, not duplicated here).
- `send-daily-admin-digest` and `delete-user` do write structured logs to a database table
  on both success and failure paths — better than the other 40 functions, even though
  nothing currently reads those tables.
- Later cron migrations (`send-paid-listing-reminders`, `reconcile-individual-listing-anchors`)
  correctly use `current_setting('app.supabase_url')` / `current_setting('app.supabase_service_role_key')`
  instead of hardcoded URLs — the placeholder-literal problem was a pattern from earlier in
  the project's history, not a currently-repeating one.
- `track`'s analytics ingest endpoint has an in-memory sliding-window rate limiter (200
  events/60s per IP hash) — imperfect (per-instance, not distributed) but a real mitigation,
  not absent.
