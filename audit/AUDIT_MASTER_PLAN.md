# Hadirot Top-to-Bottom Audit — Master Orchestration Plan

**Date:** July 7, 2026
**Orchestrator:** Claude Fable 5 (planning + synthesis only; heavy lifting delegated)
**Codebase state audited:** `main` @ 37018d6 (worktree `quizzical-mendel-b6195e` is identical to main)
**Mode:** READ-ONLY AUDIT. No agent modifies product code. Every agent writes a findings report only.

---

## Why this plan is shaped this way

The user's questions map to seven independent audit tracks. Each track below contains a
**verbatim, self-contained prompt** for a subagent — the agent needs no other context.
Agents run in parallel, each writes its report to `audit/reports/`, and the orchestrator
synthesizes everything into one severity-ranked master report with a phased fix roadmap.

Every finding must be written as a **self-contained fix prompt** so that lighter/cheaper
models (Sonnet, Haiku) can later execute fixes one at a time without re-discovering context.
That is the whole point of this exercise: spend the smart-model budget once, up front.

### Facts established in pre-survey (do not re-derive)

- Repo: React 18 + TypeScript + Vite + Tailwind + Supabase (Postgres/RLS/Edge Functions) + Mapbox + Stripe + Twilio + ZeptoMail. Sentry installed.
- ~82,000 LOC TS/TSX in 245 files under `src/`; 233 migrations; 42 edge functions.
- **Zero automated tests** (no `*.test.*` / `*.spec.*` anywhere). Confirmed.
- God files: `src/pages/AdminPanel.tsx` (2268), `src/pages/PostListing.tsx` (2180), `src/services/listings.ts` (2092), `src/pages/EditListing.tsx` (1857), `src/components/listings/ListingsMapEnhanced.tsx` (1812), `src/pages/Dashboard.tsx` (1682), `src/pages/ListingDetail.tsx` (1507), `src/pages/BrowseListings.tsx` (1464), `src/components/listings/ListingFiltersHorizontal.tsx` (1462), `src/pages/BrowseSales.tsx` (1413).
- Three posting flows coexist: `src/pages/PostListing.tsx`, `src/pages/postListingWizard/`, `src/pages/postCommercial/`.
- Known duplicate-system axes (from project history): BrowseListings vs BrowseSales, mobile vs desktop component twins, ListingsMap variants, `useBrowseFilters`.
- ~80 loose status/fix `.md` files in repo root (doc sprawl from incremental AI sessions).

### Severity rubric (all agents use this)

- **P0 — Critical:** security hole, data loss/leak, money handled wrongly, or production outage risk. Fix before anything else.
- **P1 — High:** will break or degrade visibly as users/listings grow, or an active user-facing bug.
- **P2 — Medium:** maintainability debt that compounds (duplication, god files, drift risk), or a bug in an edge case.
- **P3 — Low:** hygiene, polish, nice-to-have.

### Required report format (all agents)

Write to the exact output path given in your track. Structure:

```
# Track N — <name> — Findings

## Summary
<5-10 sentences: overall health of this area, worst finding, count by severity>

## Findings
### [P0|P1|P2|P3] <short title>
- **Where:** <file:line or table/function name>
- **What:** <the defect/risk, plainly>
- **Why it matters / failure scenario:** <concrete: "when X users do Y, Z happens">
- **Evidence:** <code excerpt or query result that proves it — no speculation>
- **Fix prompt:** <a self-contained prompt a fresh Sonnet session could execute:
  files to touch, exact change, how to verify. 3-8 sentences.>

## Non-findings (things checked and confirmed healthy)
<bullet list — this is important; absence of findings must be distinguishable from absence of looking>
```

Rules for every agent:
1. READ-ONLY on product code. You may write ONLY your own report file and scratch notes.
2. Evidence before assertion. If you can't show the code/query that proves a finding, mark it "UNVERIFIED — needs live check" instead of stating it as fact.
3. No fix implementation. Fix prompts only.
4. Prefer fewer, verified findings over many speculative ones — but do not suppress real P2s.
5. The repo you audit is at: `/Users/RachelMor/Desktop/Aharon/Hadirot/Hadirot/.claude/worktrees/quizzical-mendel-b6195e` (identical to main). All paths relative to that root.

---

## Track 1 — Database schema, RLS & migration integrity

**Model: Opus** · **Output:** `audit/reports/01-database-rls.md`

### Agent prompt (verbatim)

> You are auditing the database layer of Hadirot, a React+Supabase real-estate listings site in production. Repo root: `/Users/RachelMor/Desktop/Aharon/Hadirot/Hadirot/.claude/worktrees/quizzical-mendel-b6195e`. Read `audit/AUDIT_MASTER_PLAN.md` sections "Severity rubric" and "Required report format" first and follow them exactly. Write your report to `audit/reports/01-database-rls.md`. READ-ONLY audit: no product code changes.
>
> There are 233 migrations in `supabase/migrations/`. The **effective final state** is what matters, not history. Derive the current schema by reading migrations newest-to-oldest per object (later migrations override earlier ones — watch for DROP POLICY / CREATE OR REPLACE / ALTER).
>
> **Optional live verification:** the file `/Users/RachelMor/Desktop/Aharon/Hadirot/Hadirot/.env` contains `SUPABASE_DB_URL` for the production DB. You MAY run read-only SELECT queries against it (information_schema, pg_policies, pg_indexes, pg_tables, pg_proc) to verify the derived schema, using a short node script with the `pg` package (note: the password contains special characters — parse the URL carefully, don't naive-split). ABSOLUTELY NO writes, DDL, or queries touching user data content — metadata catalogs only, plus row counts (`SELECT count(*)`) per table. If the .env is missing or connection fails, proceed file-only and note it.
>
> Audit for:
> 1. **RLS coverage:** every table — is RLS enabled? Any table with RLS enabled but no policies (silently blocks all) or policies missing for some operations? Any table WITHOUT RLS that holds user data?
> 2. **Policy correctness:** policies that leak across users (USING true on reads of private data, missing `auth.uid()` checks, admin checks that trust a client-supplied value). Pay special attention to: profiles, listings (draft/inactive visibility), anything billing/Stripe-related, SMS/phone tables, analytics/impressions tables, digest/notification settings.
> 3. **SECURITY DEFINER functions:** list all; for each, can a non-privileged caller reach it and what can they do? Check `search_path` hardening.
> 4. **Triggers & lifecycle:** listing lifecycle (active/inactive/featured/paid) — are state transitions enforced in DB or only in app code? Can states drift (e.g., featured=true after payment expired)?
> 5. **Indexes vs. query patterns:** read `src/services/listings.ts` and `src/hooks/useBrowseFilters.ts` (and grep other `.from(` query sites) to inventory the filter/sort columns actually used in browse queries; check each has a supporting index. Flag missing composite indexes for the hot browse path. Also check FK columns without indexes.
> 6. **Constraint gaps:** columns that should be NOT NULL / CHECK / UNIQUE but aren't (e.g., can two rows claim the same Stripe subscription? can price be negative?). FK ON DELETE behavior — any CASCADE that could mass-delete, any RESTRICT that will break user deletion?
> 7. **Migration hygiene:** migrations that were superseded/reverted in confusing ways, objects created but never used (dead tables/columns — cross-check against `src/types/database.ts` usage in src), and whether local migration files could have drifted from live (note the two classifier-gated migrations from July 2 2026 — `20260702000000_fix_sms_state_constraint.sql` and `20260702030000_digest_sent_logs_polymorphic.sql` — which may or may not be applied in prod; verify via live check if possible).
>
> Scale context: currently small (likely <10k listings), owner expects growth. Judge "will this break at 100k listings / 50k users".

---

## Track 2 — Security surface (auth, edge functions, XSS, abuse)

**Model: Opus** · **Output:** `audit/reports/02-security.md`

### Agent prompt (verbatim)

> You are auditing the security surface of Hadirot, a production React+Supabase real-estate site. Repo root: `/Users/RachelMor/Desktop/Aharon/Hadirot/Hadirot/.claude/worktrees/quizzical-mendel-b6195e`. Read `audit/AUDIT_MASTER_PLAN.md` sections "Severity rubric" and "Required report format" first; follow exactly. Write your report to `audit/reports/02-security.md`. READ-ONLY. This is an authorized first-party security review of the owner's own codebase; do not implement fixes, only report.
>
> There are 42 edge functions in `supabase/functions/`. For EVERY function, build a table: name → does it verify a JWT / caller identity? → does it check authorization (admin? owner?) or just authentication? → does it use the service-role key, and if so is every service-role query safely scoped? → input validation?
>
> Priority targets (audit these line-by-line):
> 1. `admin-sign-in-as-user` — impersonation endpoint. Who can call it? How is admin verified? Is impersonation logged?
> 2. `delete-user` — authz? Can user A delete user B?
> 3. `stripe-webhook` — signature verification present and correct? Raw-body handling? What happens on replay?
> 4. `handle-renewal-sms-webhook` and `send-report-rented-sms` — Twilio webhooks: is `X-Twilio-Signature` validated? If not, anyone can forge SMS-driven state changes (renewals, "rented" reports).
> 5. `track` — the analytics ingest. Can it be spammed to poison analytics or run up DB costs? Any auth/rate limit?
> 6. `redirect-short-url` — open-redirect potential? Where do short URLs come from?
> 7. `send-contact-message`, `send-email`, `send-password-reset`, `send-listing-contact-sms` — can an anonymous caller use these to spam arbitrary recipients (email/SMS relay abuse = direct money loss via Twilio/Zepto)? Rate limiting anywhere?
> 8. `generate-listing-image`, `geocode-cross-streets`, `get-neighborhood-polygon` — cost-bearing third-party calls (AI, Mapbox): abusable anonymously?
> 9. `pay-listing-link`, all `create-*-checkout` functions — can amounts/products be manipulated from the client? Is the price taken from client input anywhere?
>
> Then the client side:
> 10. XSS: the app uses TipTap rich text + DOMPurify. Find every `dangerouslySetInnerHTML` and verify sanitization on the RENDER path (not just save path). Check listing descriptions, help center content, digest/email HTML construction in edge functions (HTML injection into emails).
> 11. Secrets: grep the entire repo (including the ~80 root .md files, `live_deploy/`, and shell scripts like `apply_migration.sh`) for leaked keys: service-role JWTs, Stripe sk_, Twilio tokens, DB passwords. Root .md files were written by AI sessions and may quote secrets.
> 12. Client-side admin gating: find how admin routes/components decide the user is admin; confirm every admin-visible action is ALSO enforced server-side (RLS or edge function), not just hidden in UI.
> 13. Storage: image upload paths (`move-temp-images`, `move-temp-commercial-images`) — can a user overwrite another user's images? Are bucket policies public-read only where intended? Any unbounded upload size/count (storage cost abuse)?
>
> Do NOT probe the production site over the network. Static analysis of this repo only (plus reading, not calling, deployed function code).

---

## Track 3 — Money paths: Stripe billing & entitlement correctness

**Model: Opus** · **Output:** `audit/reports/03-billing.md`

### Agent prompt (verbatim)

> You are auditing every money-touching path in Hadirot, a production React+Supabase real-estate site that recently launched paid features (featured listings, listing subscriptions, boosts, concierge, commercial featured purchases; agents post free while landlords pay). Repo root: `/Users/RachelMor/Desktop/Aharon/Hadirot/Hadirot/.claude/worktrees/quizzical-mendel-b6195e`. Read `audit/AUDIT_MASTER_PLAN.md` sections "Severity rubric" and "Required report format" first; follow exactly. Write your report to `audit/reports/03-billing.md`. READ-ONLY.
>
> Scope: edge functions `stripe-webhook`, `create-checkout-session`, `create-boost-checkout`, `create-concierge-checkout`, `create-individual-listing-checkout`, `create-listing-subscription-checkout`, `create-portal-session`, `upgrade-listing-subscription`, `extend-paid-listing`, `pay-listing-link`, `cascade-deactivate-subscription`, `cleanup-expired-renewals`, `send-paid-listing-reminders`, `send-renewal-reminders`; plus `src/components/billing/`, billing-related tables in migrations, and `MONETIZATION_LAUNCH_PLAN.md` / `AGENT_FREE_POSTING.md` for intended behavior.
>
> Hunt for:
> 1. **Webhook correctness:** every Stripe event type handled — is processing idempotent (event replay/delivery-twice safe)? Are events verified before trust? What happens to events for unknown objects? Is there a dead-letter/failure log, or are failed webhook events silently lost (entitlement never granted after successful payment = angry customer)?
> 2. **Race conditions:** user pays → webhook grants entitlement vs. user returns to success URL — which one grants? Both (double-grant)? Neither on webhook delay? Checkout created twice (double-click) → two subscriptions?
> 3. **Entitlement drift:** enumerate every state pair that must stay in sync (stripe subscription status ↔ listing.is_featured / paid_until / subscription rows). For each: what reconciles it if a webhook is missed? Do the cron functions (`cleanup-expired-renewals`, `cascade-deactivate-subscription`, `inactivate-old-listings`) close the loop or can a listing stay featured forever after payment stops (revenue leak) or get deactivated while paid (angry customer)?
> 4. **Price integrity:** are price IDs/amounts hardcoded server-side or accepted from the client anywhere? Can the agent-free-posting flag (`charge_agents`) be manipulated by a user self-declaring as agent to post free?
> 5. **Proration/upgrade logic** in `upgrade-listing-subscription` and `extend-paid-listing` — off-by-one on dates, timezone bugs on expiry (site is NY-based; check UTC vs America/New_York on `paid_until`-style comparisons).
> 6. **Refund/cancel/dispute handling:** what happens on `charge.refunded`, `customer.subscription.deleted`, disputes? Anything unhandled that leaves entitlement active?
> 7. **Test-vs-live leakage:** hardcoded test price IDs, test-mode conditionals that could ship to prod.
>
> The Stripe E2E was never fully run (blocked historically on `stripe listen`), so assume the webhook path is under-tested — read it with extra suspicion. Scale judgment: what breaks at 1,000 paying users?

---

## Track 4 — Scalability & performance

**Model: Sonnet** · **Output:** `audit/reports/04-performance.md`

### Agent prompt (verbatim)

> You are auditing scalability/performance of Hadirot, a React 18 + Vite + Supabase + Mapbox real-estate site. Repo root: `/Users/RachelMor/Desktop/Aharon/Hadirot/Hadirot/.claude/worktrees/quizzical-mendel-b6195e`. Read `audit/AUDIT_MASTER_PLAN.md` sections "Severity rubric" and "Required report format" first; follow exactly. Write your report to `audit/reports/04-performance.md`. READ-ONLY. Frame every finding as "at N listings / M users, X happens".
>
> 1. **Query patterns:** read `src/services/listings.ts` (2092 lines) fully, then grep all `.from(` / `.rpc(` call sites in `src/`. Flag: unpaginated `select` on growing tables; `select('*')` pulling heavy columns (full image arrays, descriptions) into list views; N+1 patterns (per-row follow-up queries, especially in Dashboard/AdminPanel/analytics tabs); client-side filtering or sorting of what should be a DB query; queries inside render loops or non-memoized effects that re-fire on every filter keystroke (is there debouncing?).
> 2. **Browse path:** `src/pages/BrowseListings.tsx`, `src/pages/BrowseSales.tsx`, `src/hooks/useBrowseFilters.ts` — pagination or infinite scroll present? Count queries? Does the map (`ListingsMapEnhanced.tsx`, 1812 lines) fetch ALL matching listings to render pins? At 20k listings what does the map request/render? Marker clustering?
> 3. **Images:** upload path — client-side resize/compression before upload? Are original multi-MB photos served on card grids, or are Supabase image transforms / width params used? Estimate the browse-page payload at 24 cards.
> 4. **Bundle:** run `npm install` (allowed) then `npm run build` ONLY to read the emitted chunk sizes (this writes to dist/, which is fine — do not commit it). Route-level code splitting (React.lazy) present? Is Mapbox GL (~800KB) in the entry chunk? AdminPanel/analytics shipped to anonymous visitors?
> 5. **Cron/batch functions:** read `send-enhanced-digest`, `send-daily-admin-digest`, `send-weekly-performance-reports`, `inactivate-old-listings`, `delete-old-listings`, `send-paid-listing-reminders`, `send-renewal-reminders` in `supabase/functions/`. Which do full-table scans or send per-row emails/SMS in an unbatched loop? Edge functions have CPU/wall-clock limits — which of these dies first as rows grow, and does it fail silently mid-batch (half the digests sent, no resume)?
> 6. **Analytics ingestion:** the `track` function + impressions tables — write volume per pageview? Any aggregation, or will dashboards scan raw events forever? Table growth unbounded?
> 7. **Realtime/subscriptions:** any Supabase realtime channels left open, listeners leaking on unmount?
> 8. **Rerender hygiene (light pass):** in the god components listed in the master plan, flag only egregious issues (state-in-parent causing full-list rerender per keystroke, missing keys, heavy work in render). Do not micro-optimize.

---

## Track 5 — Architecture, duplication & spaghetti map

**Model: Sonnet** · **Output:** `audit/reports/05-architecture.md`

### Agent prompt (verbatim)

> You are auditing code architecture/maintainability of Hadirot (React+TS+Supabase, ~82k LOC, built entirely by successive AI sessions — expect duplication and drift). Repo root: `/Users/RachelMor/Desktop/Aharon/Hadirot/Hadirot/.claude/worktrees/quizzical-mendel-b6195e`. Read `audit/AUDIT_MASTER_PLAN.md` sections "Severity rubric" and "Required report format" first; follow exactly. Write your report to `audit/reports/05-architecture.md`. READ-ONLY. Your customer question: "is this spaghetti that compounds, and what's the consolidation roadmap?"
>
> 1. **The three posting flows:** `src/pages/PostListing.tsx` (2180 lines), `src/pages/postListingWizard/` (Phase-1 wizard at /post-listing-new), `src/pages/postCommercial/`. Determine from the router which are actually reachable in prod. Diff their validation/field logic. Deliverable: which is canonical, what diverges (fields validated in one but not another = data-quality bug source), and a concrete kill/consolidate plan.
> 2. **Twin drift:** BrowseListings vs BrowseSales (1464 vs 1413 lines) — diff their logic; list every behavior present in one but not the other and judge which are intentional (sales vs rental) vs drift bugs. Same for mobile/desktop component twins (find them: grep Mobile/Desktop naming and conditional `isMobile` rendering) and ListingsMap variants.
> 3. **Service-layer integrity:** does all data access go through `src/services/`, or do pages/components call `supabase.from()` directly? Count direct call sites outside services; the higher the count the worse schema changes will hurt. Map which of the 10 god files (listed in master plan) are riskiest to modify (fan-in/fan-out).
> 4. **Dead code:** unreachable routes, unused components/hooks/services, exported-but-never-imported symbols, the `src/dev/` directory, feature flags permanently on/off (e.g., COMMERCIAL_POSTING_LIVE). Also inventory the ~80 root-level .md status files and ad-hoc shell scripts (`apply_migration*.sh`, `deploy-daily-cards.sh`, `test-weekly-reports.sh`) — propose an archive/delete list (this is docs, still report-only).
> 5. **Type safety:** count `any` / `as unknown as` / `@ts-ignore` / `@ts-expect-error` in src; where concentrated? Is `src/types/database.ts` (generated) actually used for query typing or are results re-typed by hand (drift risk)?
> 6. **Shared logic that isn't shared:** find copy-pasted blocks ≥20 lines appearing 2+ times (formatting helpers, listing-card logic, filter serialization, phone/price formatting). Top 10 worst, with consolidation targets.
> 7. **State management:** how do filters/auth/user profile propagate — context, prop drilling, URL params, localStorage? Flag places where the same state lives in two stores and can disagree (history shows filter-persistence bugs — see FILTER_PERSISTENCE_BUG_FIX.md and PRICE_FILTER_BUG_FIX.md for past incidents; are those fixes consistent between the twins?).
> 8. **Verdict section:** an honest letter grade per area (data layer, pages, components, hooks, edge functions) plus a ranked "refactor these 5 things first, in this order, each is a 1-session job" list — sized so a Sonnet session can execute each safely.

---

## Track 6 — Correctness bug hunt (deep read of hot paths)

**Model: Opus** · **Output:** `audit/reports/06-bughunt.md`

### Agent prompt (verbatim)

> You are hunting real, latent bugs in Hadirot, a production React+Supabase real-estate site. Repo root: `/Users/RachelMor/Desktop/Aharon/Hadirot/Hadirot/.claude/worktrees/quizzical-mendel-b6195e`. Read `audit/AUDIT_MASTER_PLAN.md` sections "Severity rubric" and "Required report format" first; follow exactly. Write your report to `audit/reports/06-bughunt.md`. READ-ONLY. Report only bugs you can trace end-to-end with a concrete failure scenario — quality over quantity; no style commentary (Track 5 owns that).
>
> Read these files COMPLETELY, line by line (they are the hot paths, ~15k lines total): `src/services/listings.ts`, `src/pages/PostListing.tsx`, `src/pages/EditListing.tsx`, `src/pages/BrowseListings.tsx`, `src/pages/BrowseSales.tsx`, `src/pages/ListingDetail.tsx`, `src/pages/Dashboard.tsx`, `src/pages/AdminPanel.tsx`, `src/hooks/useBrowseFilters.ts`, `src/components/listings/ListingFiltersHorizontal.tsx`, plus every file in `src/hooks/`.
>
> Bug classes to hunt, in priority order:
> 1. **Create-vs-edit divergence:** field handled in PostListing but dropped/mangled in EditListing (or wizard) — user edits a listing and silently loses data (utilities checkboxes, cross-streets, images order, commercial fields). History shows this class before (EDIT_LISTING_LOCATION_FIX.md, UTILITIES_CHECKBOX_FIX.md) — assume more remain.
> 2. **Listing lifecycle state machine:** enumerate every writer of listing status/featured/paid fields (app code, edge functions, DB triggers). Find contradictory transitions, e.g. cron `inactivate-old-listings` deactivating a just-renewed listing; `delete-old-listings` racing `extend-paid-listing`; re-approval flow after edit.
> 3. **Time/timezone:** every `new Date()` comparison, `toISOString().split('T')`, day-boundary math on expiries, digests, "days on market", analytics buckets. Site is New York-based; server runs UTC. History shows timezone bugs (ANALYTICS_TIMEZONE_FIX_REPORT.md); check the same class elsewhere (expiry at 8pm ET vs midnight UTC).
> 4. **Filter correctness:** price/rent range boundaries (inclusive/exclusive, min>max), null vs 0 vs '' (e.g., "no fee" vs unset broker_fee), array filters with empty arrays matching everything or nothing, URL-param round-tripping (share a filtered URL → same results?), filters silently dropped on the map view vs list view.
> 5. **Async races in React:** stale-closure setState after unmount/route change, effects missing deps that read filters, double-submit on slow network (post a listing twice, pay twice), optimistic UI never rolled back on error.
> 6. **Error swallowing:** `catch {}` or `catch (e) { console.log }` around writes — user thinks it saved, it didn't. Grep-driven pass over src/ and supabase/functions/.
> 7. **Notification double/zero-fire:** trace one listing through approval → SMS/email/digest paths — can a listing be digested twice or never (dedup logic, sent-log FKs — note `20260702030000_digest_sent_logs_polymorphic.sql` dropped FKs)?
> 8. **Pagination/count drift:** total counts vs page contents after filter change mid-scroll.

---

## Track 7 — Operational readiness & hidden dangers

**Model: Sonnet** · **Output:** `audit/reports/07-operations.md`

### Agent prompt (verbatim)

> You are auditing operational readiness of Hadirot, a production React+Supabase real-estate site run by a solo non-technical owner. Repo root: `/Users/RachelMor/Desktop/Aharon/Hadirot/Hadirot/.claude/worktrees/quizzical-mendel-b6195e`. Read `audit/AUDIT_MASTER_PLAN.md` sections "Severity rubric" and "Required report format" first; follow exactly. Write your report to `audit/reports/07-operations.md`. READ-ONLY. Frame findings as "the owner will not know X happened until a user complains".
>
> 1. **Error visibility:** Sentry (`@sentry/react`) — where is it initialized, is the DSN set via env, what's captured (errors only? traces?), are releases/source maps configured? Critically: the 42 edge functions — do ANY report errors anywhere (Sentry, log table, email)? If a cron function throws at 6am, what observes it? Build a table: function → failure visibility (silent / logged / alerted).
> 2. **Cron inventory:** find how scheduled functions are triggered (pg_cron in migrations? external scheduler? check migrations + `live_deploy/` + root .md deployment docs). Table: job → schedule → what happens if it silently stops running → does anything detect that?
> 3. **Testing gap:** zero automated tests confirmed. Don't relitigate; instead deliver a pragmatic MINIMAL test plan: the 10 highest-value tests to add first (money paths, listing lifecycle, filters), which framework fits this stack (Vitest + Playwright), and a realistic "smoke suite in one session" scope. Note the existing `scripts/*.ts` smoke scripts and whether they still run.
> 4. **Backup/recovery:** any evidence of backup strategy beyond Supabase defaults (PITR mention, dumps)? What's the recovery story if a bad migration or admin bulk action wipes listings? (You can't see the Supabase dashboard — report what's knowable from repo + docs and list the exact dashboard settings the owner must verify manually: PITR enabled, backup retention, spend cap OFF/ON.)
> 5. **Environment/config sprawl:** inventory every env var read anywhere (`import.meta.env`, `Deno.env.get`) → table with: where used, is it in `.env.example` (does one exist?), what breaks if missing. Flag config drift risk between localhost and prod (feature flags like COMMERCIAL_POSTING_LIVE, test vs live Stripe keys).
> 6. **Cost exposure:** which growth curves cost money non-linearly: Twilio SMS per listing event, Zepto emails per digest recipient, Mapbox loads per browse, AI calls in intake, Supabase egress from unoptimized images, analytics row growth. Rough "at 10x users, which bill spikes first" ranking. Any spend caps/kill switches in code?
> 7. **Single-human-failure points:** deploy process (how does code reach prod — docs mention manual dashboard pastes and `supabase functions deploy`), migration application (memory of SUPABASE_DB_URL direct-apply), Twilio/Stripe/Zepto account ownership. List what breaks if the owner's laptop dies today (is everything in git? note untracked-but-critical files like `.env`, `live_deploy/`).
> 8. **Compliance quick pass:** privacy policy/ToS pages exist and reachable? SMS opt-out (TCPA — STOP handling in Twilio webhooks)? Email unsubscribe links in digests? Data-deletion path (`delete-user` — does it actually delete PII everywhere: analytics rows, SMS logs, Stripe customer)?

---

## Execution protocol (orchestrator runbook)

1. **On green light**, spawn all 7 agents in parallel via the Agent tool, `run_in_background: true`, each with the verbatim prompt above and the `model` per track (Opus: 1, 2, 3, 6 — Sonnet: 4, 5, 7). Do NOT use Fable for subagents; preserve Fable budget for synthesis.
2. Agents write reports to `audit/reports/0N-*.md`. As each completes, orchestrator skims for P0s and surfaces them to the user immediately (don't wait for the full set).
3. **Synthesis (Fable or Opus if Fable budget exhausted):** read all 7 reports → write `audit/MASTER_AUDIT_REPORT.md`:
   - Executive summary in plain English answering the owner's three questions (foundation? spaghetti? hidden bugs?) with honest grades.
   - Unified findings table, deduplicated across tracks, severity-ranked.
   - **Phased fix roadmap:** Phase 0 (this week: P0s), Phase 1 (this month: P1s), Phase 2 (ongoing: P2 consolidation) — each phase item = one self-contained fix prompt sized for a Sonnet session, with explicit ordering/dependencies.
   - "Verify manually in dashboards" checklist (Supabase PITR, Stripe webhook health, Twilio console) — things no agent can see.
4. Commit the `audit/` directory to a fresh branch (e.g. `claude/full-audit-2026-07`) and push, so nothing is lost. No product code on that branch.
5. Fixes happen LATER, in separate scoped sessions, one finding at a time, using the fix prompts. Never mix audit and fix in one session.

### Contingencies
- If an agent fails/stalls: respawn same prompt once; if it fails twice, note the gap in the master report rather than burning budget.
- If user's Opus budget is tight: priority order for the Opus tracks is 3 (money) > 2 (security) > 1 (DB) > 6 (bugs); downgrade the tail to Sonnet rather than skipping.
- Track 1's live-DB verification is optional sugar — the audit stands without it.
