# Hadirot — Master Audit Report

**Date:** July 8, 2026
**Scope:** Full top-to-bottom audit of `main` @ 37018d6 (React + TypeScript + Vite + Supabase + Mapbox + Stripe + Twilio + ZeptoMail).
**Method:** 7 specialized read-only audit agents, each covering one track, synthesized here. Live production DB was inspected (metadata/catalogs + row counts only — no user data read). Full per-track detail is in `audit/reports/01`–`07`.
**Nothing in this audit changed any product code.** Every finding is written up as a self-contained fix prompt so a cheaper model (Sonnet/Haiku) can execute it later, one at a time, in its own session.

---

## 1. The bottom line — your three questions answered

### "Is the foundation solid? Will it break as I scale?"

**The foundation is genuinely solid; the wiring on top of it has holes.** This is the surprising and encouraging headline. For a codebase built entirely by successive AI sessions, the *bones* are much better than expected:

- All 48 database tables have row-level security enabled. Every one of 91 privileged DB functions is hardened against the classic search-path hijack. Users cannot make themselves admins (trigger-blocked). Stripe webhook signatures are verified correctly. Prices are mostly computed server-side. Images are compressed before upload. The map only loads listings in the current viewport. The heavy map library and admin code are correctly kept out of the bundle that normal visitors download. Point-in-time featured-listing expiry self-heals every hour.

- **But** there are specific, serious cracks that *will* surface as you grow. The browse pages and the admin panel don't paginate — they fetch *every* matching listing/user into the browser and slice it up in JavaScript. The code already prints a warning that it silently drops data past ~1,000 rows. You have ~1,384 listings today; a broad search is already brushing that ceiling. This is the single biggest *scaling* risk and it's not hypothetical — it's live.

- The other scaling pressure points are the background jobs: several digest and SMS jobs loop one-at-a-time and will start timing out (silently, sending nothing) as your listing count and recipient list grow.

**Verdict:** The database and architecture will scale to 100k listings *after* roughly a dozen well-scoped fixes. Nothing here requires a rewrite. This is a "fix the plumbing," not "condemn the house," situation.

### "Is it spaghetti that will keep complicating things?"

**Yes — but a specific, fixable kind.** It is *duplication* spaghetti, not *tangled-dependency* spaghetti. The call graph is clean, the router is legible, and the shared state layer (filters, auth) is genuinely well-built — two past production bugs were fixed once in shared code and correctly protect both the rentals and sales pages.

The disease is **parallel reimplementation**: nearly every feature exists twice — once for rentals, once for sales/commercial — as independent copy-pasted files with independent bugs, instead of one shared implementation. There are **three posting flows and two full commercial-posting UIs live in production at once**. The browse pages are 91% identical but have already silently drifted apart in two confirmed spots. `formatPrice` is reimplemented in 10+ places.

**Why it matters to you specifically:** every time you ask for "add a feature to listings," someone has to remember there are two (sometimes four) files, and nothing enforces that. The audit already caught two live drift bugs in the browse pages alone without looking hard. Left alone, this cost compounds. The good news: the report includes a concrete 5-step consolidation plan, each step a one-session job, that stops the bleeding.

**Architecture grades:** Data layer **C+** · Pages **D+** (this is where duplication lives) · Components **B−** · Hooks **B+**.

### "Are there bugs I'm not seeing?"

**Yes, and they cluster in three predictable places:** money, the listings RLS policy, and the copy-pasted twins.

The scariest is not really a "bug" in the normal sense — it's a database security policy that's written backwards, so **any logged-in user can read every listing on the site, including unapproved/deactivated ones and private landlord data** (rent rolls, tenant notes, contact info, full addresses). That's a data-confidentiality breach, live right now, exploitable by anyone who signs up for a free account.

On the money side: a user can pay for the cheapest featured-listing tier and receive the most expensive one; deleted users keep getting billed by Stripe forever; and a duplicate Stripe webhook can hand out double the paid days.

Below those, the correctness bug hunt confirmed your *canonical* create/edit flows are actually clean (the field-loss class that bit you before has been closed on the live wizard) — the remaining bugs are in pagination math (some active listings are literally unreachable on any browse page) and in the legacy forms that are still quietly reachable by URL.

### Other dangers you didn't ask about (added per your request)

- **You are operationally blind.** Sentry watches the website, but *none* of your 42 background functions report failures anywhere except a log that ages out. If a cron job dies at 6am — renewal reminders, digests, Stripe webhook handling — you find out when a customer complains. There is no alert, no dashboard, no dead-man's-switch.
- **Compliance gaps:** no unsubscribe link in any marketing email (CAN-SPAM), and SMS opt-out relies entirely on a Twilio setting you must verify by hand (TCPA).
- **Single point of failure:** if your laptop dies, all *code* survives in git, but nobody else knows how to log into Stripe/Twilio/Zepto/Supabase/the domain registrar. That knowledge lives only with you.
- **Abuse = money:** several SMS/email/AI endpoints are unauthenticated, so anyone can loop them to run up your Twilio/Zepto/AI bills or text every landlord on the site.

---

## 2. Findings at a glance

Across the 7 tracks: **~9 Critical (P0)** · **~24 High (P1)** · **~39 Medium (P2)** · **~20 Low (P3)**.

| Track | Report | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| 1. Database, RLS, migrations | [01-database-rls.md](reports/01-database-rls.md) | 2 | 2 | 8 | 4 |
| 2. Security (edge fns, XSS, abuse) | [02-security.md](reports/02-security.md) | 4 | 5 | 5 | 4 |
| 3. Money paths (Stripe) | [03-billing.md](reports/03-billing.md) | 1* | 3 | 4 | 2 |
| 4. Scalability & performance | [04-performance.md](reports/04-performance.md) | 1 | 5 | 5 | 1 |
| 5. Architecture & duplication | [05-architecture.md](reports/05-architecture.md) | 0 | 2 | 9 | 4 |
| 6. Correctness bug hunt | [06-bughunt.md](reports/06-bughunt.md) | 0 | 1 | 3 | 3 |
| 7. Operational readiness | [07-operations.md](reports/07-operations.md) | 2 | 6 | 5 | 2 |

\* Billing's P0 (client-controlled featured price) is the *same underlying bug* as one of Security's P0s, counted once in the roadmap below.

---

## 3. The Critical (P0) list — deduplicated

These are the "fix before anything else" items. Two of the seven agents independently flagged the featured-price bug, so it appears once here.

| # | Critical finding | Track(s) | One-line risk |
|---|---|---|---|
| **C1** | `listings` SELECT RLS policy is written backwards — any logged-in user reads **all** listings + private owner PII (rent rolls, tenant notes, contact info, full addresses) | 1 | Data-confidentiality breach, live, trivially exploitable |
| **C2** | Featured checkout trusts a client-supplied Stripe `price_id` decoupled from the granted duration | 2 + 3 | Pay for 7 days, get 30 — systematic revenue leak |
| **C3** | Inbound Twilio SMS webhook does **not** verify Twilio's signature | 2 | Anyone can forge an SMS to deactivate or free-renew any listing on the site |
| **C4** | `move-temp-images` / `move-temp-commercial-images` are unauthenticated | 2 | Anyone can download and **delete** any user's listing photos |
| **C5** | SMS/renewal tables (`sms_messages`, etc.) are world-readable **and** world-writable | 1 | Anyone with the public key reads phone numbers + message bodies, or forges/deletes them |
| **C6** | `delete-user` never cancels the user's Stripe subscription | 7 | "Deleted" users keep getting charged → chargebacks |
| **C7** | Live `service_role` key sits in plaintext on disk (gitignored, but at-rest, ~43-yr expiry) | 2 | Whoever gets a copy has god-mode over production. **Rotate it.** |
| **C8** | 42 edge functions have zero failure visibility (console-log only) | 7 | Silent cron/webhook death — you learn of outages from customers |
| **C9** | Browse + Admin panels fetch entire tables unpaginated; already silently truncate past ~1,000 rows | 4 | Admins act on incomplete data today; browse drops listings as you grow |

---

## 4. Phased fix roadmap

Each item below is sized for **one focused session on a cheaper model (Sonnet, or Haiku for the mechanical ones)**. The detailed, copy-pasteable fix prompt for each lives in the referenced track report under the matching finding — a fresh session only needs that report open. **Do fixes one at a time, verify each, commit each.** Never batch a security fix with an unrelated one.

### Phase 0 — This week (the 9 Criticals)

Ordered by blast-radius and dependency. C7 (key rotation) is listed last of the "do immediately" set only because it's an ops action in the Supabase/Stripe dashboards, not a code change — but it can happen in parallel any time.

1. **C1 — Fix the `listings` RLS leak.** New migration dropping the backwards "Hide listings from banned users" permissive policy; if ban-hiding is wanted, reimplement as a RESTRICTIVE policy checking the *owner's* ban status. Verify a plain logged-in test user can only read active+approved+own rows. → *Report 01, finding P0 #1.* **Model: Opus** (RLS reasoning; get it exactly right).
2. **C5 — Lock down the SMS tables.** Same migration or a sibling: drop the `USING true` public policies on `sms_messages`, `listing_renewal_conversations`, `sms_admin_config`, restrict to `service_role`. → *Report 01, finding P0 #2.* **Model: Sonnet.**
3. **C3 — Add Twilio signature validation** to `handle-renewal-sms-webhook` (and any other Twilio-hit function). → *Report 02, finding P0 #1.* **Model: Opus** (crypto correctness).
4. **C4 — Authenticate the image-move functions.** Require JWT, verify caller owns the listing, constrain `filePath` to the caller's own prefix. → *Report 02, finding P0 #3.* **Model: Sonnet.**
5. **C2 — Stop trusting the client price** in `create-checkout-session`; derive both price and duration server-side from the validated plan (mirror `create-boost-checkout`). → *Report 03, finding P0 (and Report 02 P0 #2).* **Model: Sonnet.**
6. **C6 — Make `delete-user` cancel Stripe** before deleting the auth user; surface failures to the admin. → *Report 07, finding P0 #1.* **Model: Sonnet.**
7. **C9 — Add server-side pagination** to the browse pages and admin tables (biggest of the set; may split into browse-session + admin-session). Until admin pagination ships, make the truncation warning an un-missable banner. → *Report 04, findings P0 + P1 #1/#2.* **Model: Opus** (touches the featured-injection logic and the pagination bug C-adjacent below).
8. **C8 — Add error reporting to edge functions.** Shared `_shared/reportError.ts` posting to Sentry; wire into the top-level catch of the highest-value functions first (`stripe-webhook`, the crons). → *Report 07, finding P0 #2.* **Model: Sonnet.**
9. **C7 — Rotate the `service_role` (and `anon`) key** in the Supabase dashboard; update edge-function env + local `.env`; scrub the key from all `.claude/settings.local.json` copies. **Ops task, not code.** → *Report 02, finding P0 #4.* **You + Sonnet to help with the file scrub.**

### Phase 1 — This month (the High / P1 items)

Grouped by theme. Full prompts in the reports.

- **Money hardening:** webhook DB-failure handling + a `stripe_webhook_events` dedup table so failed events retry instead of silently vanishing (Report 03 P1 #1); atomic idempotency so duplicate webhooks can't double-grant paid days (Report 03 P1 #3); fix the agent-free `legacy_free` path being stripped by the stale guard, and stop trusting self-declared `role='agent'` (Report 03 P1 #2). **Model: Opus** for the webhook idempotency work.
- **Abuse/cost control:** rate-limit + authenticate the unauthenticated SMS/email/AI relays and add a shared-secret gate to all cron functions (Report 02 P1 #1–#5). **Model: Sonnet.**
- **The banned-user DB policies don't actually block banned users** — convert to RESTRICTIVE (Report 01 P1 #1). Add the missing Stripe-session UNIQUE index on `featured_purchases` (Report 01 P1 #2). **Model: Sonnet.**
- **The pagination-skip bug:** some active listings fall into an unreachable gap on every browse page due to featured-injection cursor math (Report 06 P1). Fold into the C9 pagination work. **Model: Opus.**
- **Scaling the batch jobs:** batch the digest short-URL loop and the SMS reminder loops; aggregate the weekly-report analytics query (Report 04 P1 #3–#5). **Model: Sonnet.**
- **Ops:** fix the broken `send-weekly-performance-reports` cron (literal placeholders — has never run); snapshot the full live cron inventory into git; add a minimal CI (lint+build) gate; add unsubscribe footers to digests; restore or delete the dead `npm run` script entries (Report 07 P1 #1–#6). **Model: Sonnet/Haiku.**
- **Architecture — the two P1 route fixes:** redirect the redundant `/post-commercial` and `/edit-old/:id` legacy routes (Report 05 P1 #1–#2). **Model: Sonnet.**

### Phase 2 — Ongoing (P2 consolidation — stop the spaghetti compounding)

Do the architecture track's ranked 5-step convergence plan (Report 05, Verdict section), in order: kill the redundant commercial posting UI → close `/edit-old` → fix the two confirmed BrowseSales drift bugs → consolidate `formatPrice`/phone formatters → extract the typed join helper in `listings.ts`. Then the larger items: converge the residential/commercial twin pages using `ListingsMapEnhanced`'s parallel-props pattern as the template; move the ~34 direct `supabase.from()` calls behind the service layer; add DB indexes for non-default sorts before ~50k listings; thumbnail images for the browse grid; archive the ~80 root `.md` files. **Model: Sonnet, mostly mechanical.**

### Phase 3 — Foundations (do alongside, not last)

- **Add the minimal test suite** (Vitest + Playwright). Report 07 specifies the exact 10 highest-value tests — start with the 5 that don't need a live Stripe CLI (webhook idempotency logic, listing-lifecycle expiry, price integrity, filter round-tripping, range boundaries). This is what stops regressions shipping to users. **Model: Sonnet.**
- **The P3 items** across all tracks are genuine but low-stakes; sweep them opportunistically when touching nearby code.

---

## 5. Things only you can verify (dashboard checklist)

No agent can see these — they live in third-party consoles. Please check:

- [ ] **Supabase → Database → Backups:** Is Point-in-Time Recovery enabled? What's the retention window? (Free/Pro defaults may be as short as 24h.)
- [ ] **Supabase → Billing:** Is a spend cap set? On or off? (Off = risk of a surprise bill from the abuse vectors above.)
- [ ] **Take one manual `pg_dump`** stored somewhere outside Supabase, so recovery doesn't depend solely on their infrastructure.
- [ ] **Twilio console → Messaging/Compliance:** Is "Advanced Opt-Out" (auto-STOP handling) enabled on your sending number? (Your only TCPA protection right now.)
- [ ] **Stripe → Webhooks:** Confirm the endpoint is healthy and check the failed-events count (relevant to the silent-webhook-failure finding).
- [ ] **Run `SELECT jobid, jobname, schedule, command FROM cron.job;`** in the Supabase SQL editor and confirm the three placeholder crons were hand-fixed live (and paste the output into a tracked file per Report 07 P1).
- [ ] **Rotate the `service_role` key** (C7) and confirm edge functions still work afterward.
- [ ] **Password manager:** record login/ownership for Stripe, Twilio, Zepto, Supabase, domain registrar, host (Netlify/Vercel), Mapbox, Sentry — and share emergency access with one trusted person.

---

## 6. How to use this going forward

1. Each Phase-0 item is a green-light-and-go task. Open the referenced report, copy the "Fix prompt" from the matching finding, hand it to a Sonnet (or Opus where noted) session with this instruction: *"Implement exactly this one fix, verify it, then stop."* The `hadirot-workflow` skill will run the plan→implement→test→commit loop; you only do the localhost check and open the PR.
2. **One finding = one session = one commit = one PR.** Do not let a session bundle fixes. The whole reason this audit spent the expensive-model budget up front is so the fixes can run cheap and scoped.
3. Start at C1 and work down C1→C9. Do not skip ahead to Phase 1 until the Criticals are closed.
4. The per-track reports contain far more detail than this summary — including exact file:line locations, code excerpts proving each finding, and the confirmed-healthy "non-findings" (so you know what was checked and is fine). When a fix session needs specifics, the report is the source of truth.
