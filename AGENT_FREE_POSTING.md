# Agent-free posting — deploy & test runbook

Lets **agents** post residential rentals for free (legacy behavior, normal
admin-controlled expiration) while **landlords keep paying**. All the existing
paid Agent/VIP subscription code stays intact and dormant — flip one switch to
start charging agents in the future.

Branch: `claude/agents-post-free` (off `main`).

## Who is treated as an "agent" (posts free)

While `admin_settings.charge_agents` is **false** (default), a residential-rental
poster posts free if **ANY** of:

1. `profiles.role = 'agent'`, OR
2. `profiles.free_posting_agent = true` (admin manual toggle), OR
3. lifetime listing count (all types, any status) **≥ 3**
   (`get_user_lifetime_listing_count`).

Free agents post with `payment_kind = 'legacy_free'` and the normal
`admin_settings.rental_active_days` expiration. No trial, no $25, no
subscription.

When `charge_agents` is **true**, nobody is treated as a free agent here —
agents fall back into the existing subscription / trial / $25 flow.

Landlords (non-agents) are **unchanged** in all cases.

## Deploy steps (in order)

1. **Apply the migration.** Paste the contents of
   `supabase/migrations/20260622000000_agent_free_posting.sql` into the Supabase
   SQL editor (live project) and run it. It is additive and idempotent:
   - adds `admin_settings.charge_agents` (default false)
   - adds `profiles.free_posting_agent` (default false)
   - creates `get_user_lifetime_listing_count(uuid)`

2. **Regenerate DB types** (optional but recommended):
   `npm run db:types`. The code uses targeted casts so it builds without this,
   but regenerating keeps `src/types/database.ts` honest.

3. **Deploy the frontend** (merge the PR to `main` once tested).

No edge-function changes. No new env vars.

## Admin controls

- **Charge agents switch:** Admin → Subscriptions page, panel under the
  monetization master switch. OFF = agents free (default). ON = agents pay.
- **Per-user free-posting toggle:** Admin → Users table, "Free Posting" column.
  Marks an individual user as a free-posting agent regardless of role/volume.

## Test checklist (after migration applied)

Monetization master switch must be **ON** for these (otherwise everyone is
`disabled`/legacy and the agent branch is moot).

- [ ] Landlord, `role=landlord`, < 3 lifetime listings, not flagged,
      `charge_agents` OFF → still sees trial / $25 / must_pay. **(unchanged)**
- [ ] `role=agent` → wizard shows "Free to post"; listing posts immediately,
      `payment_kind=legacy_free`, `expires_at` ≈ now + `rental_active_days`.
- [ ] Landlord with **3+ lifetime listings** → posts free (volume rule).
- [ ] Admin flips a user's "Free Posting" toggle ON → that user posts free.
- [ ] Flip **Charge agents ON** → an agent now sees the normal
      subscription/trial/$25 flow again (dormant paid code still works).
- [ ] Dashboard shows the agent's listing as a normal/legacy listing (no
      "unknown" pill, no payment prompts).
- [ ] Master monetization switch OFF → everyone posts legacy (unaffected).
