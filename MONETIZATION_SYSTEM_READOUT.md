# Residential-Rental Monetization — Full System Readout

*As of July 10 2026, after the agent-free guard fix (migration
`20260711000000_agent_free_posting_guard_fix.sql`). Applies to residential
**rentals** only — sales and commercial listings are free and only follow the
freshness/expiration rules.*

---

## 1. The two master switches (Admin → Subscriptions)

| Switch | Current value | Effect |
|---|---|---|
| **Monetization master** (`monetization_enabled`) | **ON** | The whole system below is live. OFF = everyone posts the old free way. |
| **Charge agents** (`charge_agents`) | **OFF** | While OFF, agents/high-volume/flagged users post free. Flip ON and they instantly fall into the paid flow (trial/$25/subscriptions) — no code change needed. |

Plus one setting that matters everywhere: **`rental_active_days` = 40** — the
"freshness" window for free (legacy) listings.

## 2. Who is who — the decision tree at posting time

When someone submits a residential rental, the system classifies them **in this
order** (first match wins). The classification happens twice — once in the
posting wizard (to show the right screen) and once **inside the database** when
the row is saved (so a hacked or outdated client can't cheat):

1. **Admin** → posts free, no questions.
2. **Free-posting agent** — any ONE of these while *Charge agents* is OFF:
   - profile role is `agent`, or
   - admin turned ON that user's **Free Posting** toggle (Admin → Users), or
   - the user has **3 or more lifetime listings** (rentals + sales +
     commercial, any status — this is the "high-volume lister" rule).
   → posts **free** (`legacy_free`), normal 40-day expiration, no clocks, no
   payment prompts, no payment SMS. This is the temporary arrangement until
   agent subscriptions launch.
3. **Active subscriber** (dormant feature, see §7) → posts under their plan.
4. **Landlord with a "fresh" phone** → offered the **14-day free trial** or
   the pay-at-posting deal. "Fresh" = that phone number has **no active rental
   listing** and **none deactivated in the last 30 days**. This is per-phone,
   not per-account, so you can't cycle trials by making new accounts.
5. **Landlord with a phone already in use** → **must pay $25** to post
   (no trial). The listing is created in a held state until Stripe payment
   completes.

## 3. Landlord scenarios, end to end

### 3a. Free trial (fresh phone, chooses "Start free trial")
1. Wizard shows "14-day free trial". Listing is created inactive + unapproved
   (`individual_trial`), pending admin review.
2. **Admin approves** → this is when every clock starts (queue time is never
   eaten): trial deadline = approval + 14 days; freshness = approval + 30 days.
3. Listing is live. Dashboard pill: *"Live · free trial · Nd left"*.
4. Reminders (SMS, Shabbat-aware, 10 AM ET): **3 days before** the deadline
   and **on the day**, each with a tokenized "pay from your phone" link
   (valid 14 days).
5. No payment by the deadline → the **nightly job** (midnight UTC) deactivates
   it. Three days later a "your listing came down" SMS goes out.
6. After deactivation the owner has a **30-day grace window**: paying
   reactivates the same listing ("Add days to relist" on the dashboard).
   Past 30 days it shows as permanently inactive — they'd post fresh (and
   their phone won't be trial-eligible, so they'd pay $25).

### 3b. Pay at posting (fresh phone, chooses "Pay $25 now")
- Same posting flow, but goes straight to Stripe Checkout after submitting.
- The deal: **14 trial days + 30 paid days + 30 bonus days = 74 days** of
  coverage, all counted from admin approval. The bonus only exists here —
  paying later from the dashboard never gets it (webhook-enforced: initial
  purchase only, no prior payments, listing still in trial).
- After approval the pill shows *"Live · N days left"* against the paid
  balance.

### 3c. Must pay (phone already on an active/recent listing)
- Wizard shows "Pay $25 to post" (no trial option). Listing is created as
  `pending_payment` and goes to Stripe.
- **Checkout completed** → webhook records the payment; at approval it becomes
  `individual_paid` with paid days counted from approval.
- **Checkout abandoned** → the listing stays `pending_payment`. It can be
  admin-approved (leaves the review queue) but is **kept offline** until
  payment lands — it never goes live free. Dashboard shows *"Complete payment
  to post"*. The nightly job also sweeps up any that slip through active.

### 3d. Renewals and the running clock (paid listings)
- Pricing: first payment on a listing vs. renewals:

  | Package | First time | Renewal |
  |---|---|---|
  | 30 days | $25 | $15 |
  | 60 days | $40 | $30 |
  | 90 days | $55 | $45 |
  | 120 days | $70 | $60 |
  | 180 days | $100 | $90 |
  | 270 days | $145 | $135 |
  | 360 days | $190 | $180 |

- Two separate clocks: the **paid balance** (`paid_until` — what they bought)
  and the **freshness window** (`expires_at` — capped at 30 days out, keeps
  stale listings off the site). When freshness runs low but balance remains,
  the dashboard offers a **free renew** that draws from the balance. When the
  balance itself runs low: 3-day and day-of payment SMS, then nightly
  deactivation.
- **Owner deactivates a paid listing** ("rented it out"): remaining paid days
  are **banked**, not lost. Reactivating restores them from that moment.

## 4. Agent / high-volume scenarios (today, while Charge agents is OFF)

### 4a. Agent posts a rental
- Wizard shows **"Free to post"** — no trial, no card, no phone check.
- Saved as `legacy_free` — and since the July 10 fix the **database itself
  derives this** from the poster's profile, so it works even if the app
  misbehaves. (Before the fix, a security trigger stripped the free tag and
  agents landed on trial/pay-now clocks — that was the bug.)
- Expiration: the normal **40-day** freshness window, same as the
  pre-monetization site. No payment SMS ever.
- Renewal: the long-standing **"is it still available?" SMS** flow — sent when
  the listing is 5 days from expiring (Sundays catch up the 3–5-day window
  Friday/Saturday skipped). Replying renews it free; not replying lets it
  expire. Republishing from the dashboard is always free for legacy listings.
- A brand-new agent account (0 listings, role `agent`) qualifies via the role
  rule immediately. A landlord who has posted 3+ listings qualifies via
  volume automatically — no admin action needed.

### 4b. What agents still can't do
- The **10-day field lock** (§6) applies to everyone but admins, agents
  included.
- Featured placement, boosts, etc. remain separate paid/permissioned features.

### 4c. When subscriptions launch (flip Charge agents ON)
- The agent-free branch turns off **instantly for new posts**; agents then see
  the subscription offer (Agent $50/mo · 7 listings, VIP $100/mo · unlimited)
  or the same trial/$25 flow as landlords.
- Existing `legacy_free` listings keep their tag (nothing retroactive) —
  they'd simply age out on freshness and the next post goes through the paid
  gate.

## 5. Admin scenarios

| Action | Where | What happens |
|---|---|---|
| Admin posts a rental themselves | wizard or old form | Free. If the target account qualifies as a free agent (including the admin's own account via the 3+ rule) → `legacy_free`, 40-day window. Otherwise → unlimited free trial kind (by design every listing carries a payment tag; nothing bypasses the system). |
| Admin posts **for an agent** (assigns `user_id`) — incl. scraped-listings pipeline | pipeline / forms | **Since the fix:** the assigned owner is checked — free agents get `legacy_free`. (Before: these wrongly landed on a 14-day trial clock.) |
| Make an account free | Admin → Users → **Free Posting** toggle | That user posts free regardless of role or volume. |
| Give days to a listing | Dashboard admin tools → **Grant days** | Adds N paid days (no charge), recorded in the ledger as an admin grant; reactivates the listing if it was down. |
| Exempt one listing entirely | **Mark granted** | `admin_granted` — no payment clock at all; only the freshness window applies. |
| Emergency stop | Admin → Subscriptions → master switch OFF | Everything posts/behaves the old free way; existing tags are kept but ignored. |

## 6. The anti-abuse field lock

- **What locks:** bedrooms, neighborhood, cross-streets/location, address,
  map position, contact phone. Price, description, photos, and features stay
  editable forever.
- **When:** exactly **10 full days after the listing was created**. Rentals
  only. Admins exempt.
- **Why:** stops someone from paying/trialing once and then "rotating" the
  listing into a different apartment.
- **How it's enforced (3 layers):** the edit wizard shows a lock banner and
  disables the inputs; the save path strips locked fields server-side; and a
  database function double-checks with admin override. Someone bypassing the
  UI still can't change locked fields.
- If a locked detail genuinely needs correcting, an admin edits it (or
  support is contacted).

## 7. Subscriptions (built, dormant, waiting for launch)

- **Agent** $50/month → up to 7 concurrent listings. **VIP** $100/month →
  unlimited. Optional concierge add-on $50.
- 14-day free subscription trial supported; Stripe billing on the signup
  day-of-month; past-due gets a dunning grace (listings stay up) before
  cancellation cascades and deactivates covered listings.
- A database trigger enforces the listing cap at posting time.
- Admins can hand-grant subscriptions (`admin_active`) with a billing-day
  anchor for the "who renews next" view.
- While *Charge agents* is OFF, the wizard checks the agent-free rule **first**,
  so subscriptions are effectively invisible to agents today.

## 8. The clockwork — every scheduled job that touches this system

| Job | Schedule | What it does |
|---|---|---|
| Nightly deactivation (`deactivate_old_listings`) | **daily, midnight UTC** | Deactivates: listings past freshness; expired trials; exhausted paid balances; unpaid `pending_payment`; uncovered subscription listings. Also expires no-card sub trials. *(Note: code comments used to say "hourly" — it is nightly.)* |
| Payment reminders (`send-paid-listing-reminders`) | daily 10 AM ET | Trial 3-day/day-of, paid-balance 3-day/day-of, post-deactivation +3d SMS. Skips Shabbat. Excludes subscribers and all free kinds. |
| Legacy renewal SMS (`send-renewal-reminders`) | daily 10 AM ET | "Still available?" texts for **free** listings 5 days from expiry (Sunday widens to 3–5d). Explicitly excludes monetized kinds. |
| Renewal-conversation cleanup | every 6 h | Times out unanswered SMS conversations; an unanswered "this was reported rented" conversation auto-deactivates the listing (any payment kind — intended). |
| Anchor reconcile | hourly at :07 | Repairs trial/paid clock anchors against the payment ledger. |
| Featured expiry | hourly | Ends expired featured placements (separate system). |

## 9. Safety rails (what makes this hard to cheat)

- **Server-side classification:** the payment tag is decided inside the
  database on save; clients can request, never dictate. Non-admins can never
  set clocks, balances, or privileged tags — attempts are silently reverted,
  on insert and on every update.
- **Per-phone trial rule:** one trial per phone per 30-day window, checked
  against real listing data.
- **Bonus-days gate:** the 30 pay-at-posting bonus is webhook-enforced
  (initial purchase, no prior payments, still in trial).
- **No free ride through approval:** an approved-but-unpaid must-pay listing
  stays offline; the nightly job backstops any that slip through.
- **Clock starts at approval:** admin queue time never consumes trial or paid
  days.

## 10. Current production status (July 10 2026)

- Monetization ON, Charge agents OFF, rental window 40 days.
- **The July 10 fix** (guard rewrite + repair): re-tags all mis-tagged agent
  listings (162 found in the audit — trial/pending tags that should have been
  free) back to `legacy_free`, wipes their fake payment clocks, and reactivates
  the ones the nightly job wrongly took down (43 as of the last count; one
  deactivation was a legitimate reported-rented timeout and is left alone).
  Repair status is tracked in
  [MONETIZATION_AUDIT_2026-07-10.md](MONETIZATION_AUDIT_2026-07-10.md).
