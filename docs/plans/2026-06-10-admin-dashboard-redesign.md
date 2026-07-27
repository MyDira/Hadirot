# Admin Dashboard Redesign — Implementation Plan

> **For agentic workers:** Execute with the executing-plans flow, task by task, with a checkpoint commit + push after each task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 2,158-line `AdminPanel.tsx` with a sidebar-navigation admin dashboard at `/admin/*` where every admin surface is its own lazily-loaded route/component, each section loads only its own data, and the Listings/Users tables get server-side pagination, comprehensive search, bulk actions, and column controls — with zero functional regressions.

**Architecture:** A persistent `AdminLayout` shell (admin guard + sidebar + `<Outlet/>`) hosts nested React Router routes. The four core sections (Overview, Users, Listings, Pending) are rebuilt as focused components backed by per-section hooks; the five existing standalone admin pages (Subscriptions, Content, Digest, Digest Settings, Analytics) and three existing tab components (Sales, Concierge, Pipeline) nest into the shell unchanged. Listings search/pagination moves server-side via a new `SECURITY DEFINER` RPC that follows the repo's established admin-check pattern.

**Tech stack:** React 18 + TS + Vite, react-router-dom v6 nested routes, Tailwind (brand `#4E4B43`), lucide-react, Supabase (PostgREST + 1 new SQL migration). No new npm dependencies.

---

## VERIFICATION FINDINGS

What I actually read/ran (worktree `claude/admin-dashboard-redesign`, clean off origin/main c10ec7b):

- **`src/pages/AdminPanel.tsx` (2,158 lines, read in full).** 7 tabs keyed by `?tab=` param: `overview, users, listings, pending, sales, concierge, pipeline`. Only 5 appear in the tab bar (`ADMIN_TABS` omits sales/concierge — they're reached from the Overview "Admin Tools" grid). `loadAdminData()` fetches EVERYTHING up front: stats counts, full `profiles` table, full `listings` table (with owner join), pending residential + commercial, `admin_settings` lifecycle days — regardless of active tab. It even warns via toast when Supabase's 1,000-row cap truncates users/listings ("Showing X of Y — row limit reached").
- **Functionality inventory (must all survive):**
  - *Overview:* 4 stat cards (total users, listings, currently-featured count via `featured_expires_at > now()` check, "active users" = total users, explicitly simplified), listing-lifecycle duration editor (`admin_settings.rental_active_days` / `sale_active_days`, validated 7–365 integer), Admin Tools grid (Analytics, Content, Digest, Sales tab, Concierge tab, Subscriptions, `/post-old` old form link).
  - *Users:* filters (name search, role, agency from distinct profile agencies), client-side sort (name/role/agency/status/joined/phone), pagination 25/page, inline role `<select>` (`updateUserRole`), Agency Access toggle (`can_manage_agency` + `agenciesService.ensureAgencyForOwner` on enable, optimistic w/ rollback), Sales Access toggle (`salesService.toggleUserSalesPermission`, dimmed when `salesService.isSalesFeatureEnabled()` is false), Sign In As User (`useAdminSignInAsUser`, blocked for admins, confirm dialog, redirects to `/dashboard`), Delete User (edge fn `delete-user`, confirm), banned rows tinted `bg-red-50`, self-actions disabled.
  - *Listings:* phone-digits search, owner-role/status(featured|standard)/active filters, created-date range, sortable columns (title/owner/price/created_at/is_active/is_featured), pagination 25/page, actions per row: View (`/listing/:id`), Edit (`/edit/:id`), Feature (opens `AdminFeatureModal` — props `isOpen,onClose,listing,adminId,onSuccess`), Active toggle (direct update), Grant paid days (`GrantDaysModal` — props `open,onClose,onGranted,listingId,listingLabel,adminId`, rentals only), Charge via Stripe (`ChargeListingModal` — props `open,onClose,listingId,listingLabel`, rentals only), Delete (confirm + direct delete). "Archived" pill when `user_id` is null. Price renders `$X/month` always (sale listings show wrong unit — fix while preserving data).
  - *Pending:* merged residential (`listings.approved=false`) + commercial (`commercialListingsService.getAdminCommercialListings(false)`) lists, color-coded left border (residential `#1E4A74`, commercial `#0891B2`), title/owner search, sort, pagination, actions: View, Map (`AdminListingMapModal`, residential only), Approve (edge fn `approve-listing` w/ `isCommercial` flag), Reject (residential = direct delete; commercial = `deleteCommercialListing`). Pending tab badge with count.
  - *Sales/Concierge/Pipeline:* already separate components (`SalesManagement`, `ConciergeManagement`, `PipelineManagement` in `src/components/admin/`, 5,367 lines total across admin components) — rendered directly.
- **`src/App.tsx`:** all admin pages lazy-loaded; flat routes `/admin`, `/admin/analytics`, `/admin/content-management`, `/admin/digest` (+`digest-manager` redirect), `/admin/digest-settings`, `/admin/subscriptions`, plus legacy redirects (`/admin/static-pages`, `/admin/featured-settings`, `/internal-analytics`, `/analytics`, `/static-pages`, `/featured-settings`). Everything renders inside the site `Layout` (header + footer).
- **The 5 standalone admin pages** each self-guard (`if (!profile?.is_admin) navigate('/')`) and render their own `max-w-*` container + `<h1>`. They embed cleanly as nested routes with no changes.
- **Schema (read from generated `src/types/database.ts` + `src/config/supabase.ts`, NOT guessed):** `listings` has `title, location, neighborhood, cross_streets, full_address, contact_name, contact_phone, price, asking_price, call_for_price, listing_type ('rental'|'sale'), is_active, is_featured, featured_expires_at, approved, created_at, user_id`. `profiles` has `full_name, email, phone, agency, role, is_admin, is_banned, can_manage_agency, can_post_sales, created_at`. `listing_images` has `image_url, is_featured, sort_order, created_at`. Owner join uses FK `listings_user_id_fkey`.
- **RPC precedent:** repo migrations already use `CREATE OR REPLACE FUNCTION ... SECURITY DEFINER` with an internal `is_admin` check on `auth.uid()` (e.g. `20260604120000_create_subscription_trial_eligibility_fn.sql`). New search RPC follows the same pattern.
- **Environment constraint:** `.env` points the local app at the LIVE project `pxlxdlrjmrkxyygdhvku` — remote CLI is forbidden against it. Migration is delivered as a file + copy-paste SQL for the dashboard SQL editor (same runbook pattern as the monetization launch). The new Listings section must degrade gracefully (clear banner) if the RPC isn't installed yet.
- **No `CLAUDE.md` exists** at the repo root (checked main checkout and worktree). No unit-test framework in `package.json` — verification is `npm run build`, `npm run lint`, and Playwright browser testing.
- **Shared `Toast.tsx`** is success-only (no tone). Admin shell gets its own small toast context supporting success/error, matching the panel's current behavior.

## CURRENT STATE ANALYSIS

One 100KB component owns five surfaces' worth of state (40+ `useState` hooks), fetches all tables eagerly on mount (slow first paint, row-cap truncation on big tables), mixes `alert()`/`confirm()` UX with toasts, and the other five admin pages are separate full page loads with inconsistent headers. Tables are functional but dense, with no bulk operations, no column controls, owner-sort only working client-side over a truncated dataset, and only phone search for listings.

## DUPLICATE / OVERLAPPING SYSTEMS CHECK

- `SalesManagement`, `ConciergeManagement`, `PipelineManagement`, `AdminFeatureModal`, `AdminListingMapModal`, `GrantDaysModal`, `ChargeListingModal`, `UserSearchSelect` already exist in `src/components/admin/` — **reused as-is, not rebuilt.**
- The 5 standalone admin pages are **nested, not rewritten.**
- Admin listings search is intentionally separate from public browse (`useBrowseFilters`, `BrowseListings`/`BrowseSales`) — admin needs unapproved/inactive rows and owner-field search that public RLS paths must never expose. No mobile/desktop twin exists for admin (single responsive surface). `BrowseListings`/`BrowseSales` untouched.
- Greps run: `grep -rn "admin" src/App.tsx`, `find src -iname "*admin*"`, `grep -n "to=\"/admin\"" src/components/shared/Layout.tsx` (header links at Layout.tsx:391,612 keep working — path unchanged).

## PROPOSED SOLUTION

Nested-route dashboard. `/admin/*` mounts one lazy `AdminArea` chunk containing `AdminLayout` (guard once, sidebar, toast context, `<Outlet/>` in a `Suspense`). Each section is its own lazy component that fetches only its own data on mount. Listings/Users get new server-side query services; listings use one new RPC (`admin_search_listings`) because cross-table owner search + owner-column sort + accurate counts can't be done with PostgREST alone. Old URLs (`/admin?tab=x` and all existing `/admin/...` paths) redirect/keep working. Visuals: same brand palette and components, modern dashboard polish (sticky table headers, status pills, skeleton loaders, kebab-free explicit icon actions retained, proper empty states, `confirm()`→`ConfirmDialog`, `alert()`→toasts).

Considered and rejected: client-side-only refactor without RPC (keeps the 1,000-row truncation the panel already warns about; can't sort by owner server-side); a generic DataTable library (new dependency, fights existing Tailwind idiom).

## ASSUMPTIONS

1. The Listings section continues to show **residential listings only** (`listings` table), as today; commercial listings appear in Pending only. (Parity.)
2. Bulk actions ship on **Listings** (activate / deactivate / delete) and **Pending** (approve / reject). No bulk actions on Users — bulk delete/role-change of users is too destructive for v1.
3. "Active users" stat stays = total users (the code comments it as simplified; not inventing a new metric).
4. The lifecycle-days editor stays on Overview (it lives there today).
5. The new SQL must be pasted into the Supabase SQL editor by the user before the new Listings tab works against live data (runbook step in final report). Until then the Listings section shows an explicit "search function not installed" banner instead of breaking. Everything else works without the migration.
6. The admin area stays inside the site `Layout` (global header/footer remain visible), with the sidebar inside the content region. Desktop-first; below `lg` the sidebar becomes a slide-over drawer.
7. Sales/Concierge sidebar items are always visible to admins (today they're always reachable via Overview tools regardless of the sales feature flag).

## FILES TO MODIFY

**Create**
- `supabase/migrations/20260611000000_admin_panel_search.sql` — `admin_search_listings` + `admin_list_agencies` RPCs
- `src/services/adminPanel.ts` — all admin-panel data access (stats, users query, listings RPC call, agencies, bulk ops, lifecycle settings)
- `src/pages/admin/AdminLayout.tsx` — guard + shell + toast provider + pending-count badge
- `src/pages/admin/AdminSidebar.tsx` — grouped nav (desktop rail + mobile drawer)
- `src/pages/admin/adminToast.tsx` — tiny context: `useAdminToast()` → `toast(message, tone)`
- `src/pages/admin/AdminArea.tsx` — nested `<Routes>` for everything under `/admin/*`, incl. legacy `?tab=` redirect
- `src/pages/admin/sections/OverviewSection.tsx`
- `src/pages/admin/sections/UsersSection.tsx`
- `src/pages/admin/sections/ListingsSection.tsx`
- `src/pages/admin/sections/PendingSection.tsx`
- `src/pages/admin/hooks/useAdminStats.ts`
- `src/pages/admin/hooks/useAdminUsers.ts`
- `src/pages/admin/hooks/useAdminListings.ts`
- `src/pages/admin/hooks/useAdminPending.ts`
- `src/pages/admin/components/TablePagination.tsx`
- `src/pages/admin/components/SortableHeader.tsx`
- `src/pages/admin/components/StatusPill.tsx`
- `src/pages/admin/components/BulkActionsBar.tsx`
- `src/pages/admin/components/ColumnsMenu.tsx`
- `src/pages/admin/components/AdminSearchInput.tsx`
- `src/pages/admin/components/TableSkeleton.tsx`
- `src/pages/admin/components/EmptyState.tsx`

**Modify**
- `src/App.tsx` — collapse all `/admin*` routes into one `<Route path="/admin/*" element={<AdminArea/>}>` (lazy); keep top-level legacy redirects (`/internal-analytics` etc.) pointing into `/admin/...`

**Delete**
- `src/pages/AdminPanel.tsx` (after extraction)

**Untouched (reused):** all of `src/components/admin/*`, the five standalone admin pages, `useAdminSignInAsUser`, `formatPhoneForDisplay`, services (`sales`, `agencies`, `commercialListings`), `shared/ConfirmDialog`.

## IMPLEMENTATION PLAN

### Task 1 — Migration: `admin_search_listings` + `admin_list_agencies`

**Files:** Create `supabase/migrations/20260611000000_admin_panel_search.sql`

- [ ] **1.1 Write the migration** (complete SQL):

```sql
/*
  # Admin panel server-side search

  admin_search_listings — one round trip for the admin Listings table:
  comprehensive search (listing fields, owner fields, digits-normalized
  phones, exact UUID), filters, server-side sort incl. owner name,
  accurate total count, first image for thumbnails.

  admin_list_agencies — distinct profile agency names for the Users filter
  (replaces fetching every profile row client-side).

  Both SECURITY DEFINER with an internal is_admin gate, matching
  20260604120000_create_subscription_trial_eligibility_fn.sql.
*/

CREATE OR REPLACE FUNCTION public.admin_search_listings(
  p_search       text DEFAULT NULL,
  p_owner_role   text DEFAULT NULL,   -- 'tenant' | 'landlord' | 'agent'
  p_listing_type text DEFAULT NULL,   -- 'rental' | 'sale'
  p_status       text DEFAULT NULL,   -- 'featured' | 'standard'
  p_active       text DEFAULT NULL,   -- 'yes' | 'no'
  p_date_from    date DEFAULT NULL,
  p_date_to      date DEFAULT NULL,
  p_sort         text DEFAULT 'created_at',  -- title|owner|price|created_at|is_active|featured
  p_dir          text DEFAULT 'desc',
  p_limit        int  DEFAULT 25,
  p_offset       int  DEFAULT 0
)
RETURNS TABLE (listing jsonb, total_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_admin boolean := false;
  v_term     text := nullif(btrim(coalesce(p_search, '')), '');
  v_digits   text := nullif(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
BEGIN
  SELECT coalesce(p.is_admin, false) INTO v_is_admin
  FROM profiles p WHERE p.id = auth.uid();
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    to_jsonb(l.*) || jsonb_build_object(
      'owner', CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', o.id, 'full_name', o.full_name, 'role', o.role,
        'agency', o.agency, 'email', o.email, 'phone', o.phone) END,
      'thumbnail_url', (
        SELECT li.image_url FROM listing_images li
        WHERE li.listing_id = l.id
        ORDER BY li.is_featured DESC, li.sort_order ASC, li.created_at ASC
        LIMIT 1)
    ) AS listing,
    count(*) OVER() AS total_count
  FROM listings l
  LEFT JOIN profiles o ON o.id = l.user_id
  WHERE
    (p_owner_role   IS NULL OR o.role = p_owner_role)
    AND (p_listing_type IS NULL OR l.listing_type = p_listing_type)
    AND (p_status IS NULL
         OR (p_status = 'featured' AND l.is_featured AND l.featured_expires_at > now())
         OR (p_status = 'standard' AND NOT (l.is_featured AND coalesce(l.featured_expires_at > now(), false))))
    AND (p_active IS NULL OR l.is_active = (p_active = 'yes'))
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to   IS NULL OR l.created_at < (p_date_to + 1))
    AND (
      v_term IS NULL
      OR l.id::text = lower(v_term)
      OR l.title ILIKE '%' || v_term || '%'
      OR l.location ILIKE '%' || v_term || '%'
      OR l.neighborhood ILIKE '%' || v_term || '%'
      OR coalesce(l.cross_streets, '') ILIKE '%' || v_term || '%'
      OR coalesce(l.full_address, '') ILIKE '%' || v_term || '%'
      OR coalesce(l.contact_name, '') ILIKE '%' || v_term || '%'
      OR coalesce(o.full_name, '') ILIKE '%' || v_term || '%'
      OR coalesce(o.email, '') ILIKE '%' || v_term || '%'
      OR coalesce(o.agency, '') ILIKE '%' || v_term || '%'
      OR (v_digits IS NOT NULL AND length(v_digits) >= 3 AND (
           regexp_replace(coalesce(l.contact_phone, ''), '\D', '', 'g') LIKE '%' || v_digits || '%'
        OR regexp_replace(coalesce(o.phone, ''), '\D', '', 'g') LIKE '%' || v_digits || '%'))
    )
  ORDER BY
    CASE WHEN p_sort = 'title'      AND p_dir = 'asc'  THEN lower(l.title) END ASC,
    CASE WHEN p_sort = 'title'      AND p_dir = 'desc' THEN lower(l.title) END DESC,
    CASE WHEN p_sort = 'owner'      AND p_dir = 'asc'  THEN lower(coalesce(o.full_name, '')) END ASC,
    CASE WHEN p_sort = 'owner'      AND p_dir = 'desc' THEN lower(coalesce(o.full_name, '')) END DESC,
    CASE WHEN p_sort = 'price'      AND p_dir = 'asc'  THEN coalesce(l.price, l.asking_price, 0) END ASC,
    CASE WHEN p_sort = 'price'      AND p_dir = 'desc' THEN coalesce(l.price, l.asking_price, 0) END DESC,
    CASE WHEN p_sort = 'created_at' AND p_dir = 'asc'  THEN l.created_at END ASC,
    CASE WHEN p_sort = 'is_active'  AND p_dir = 'asc'  THEN l.is_active::int END ASC,
    CASE WHEN p_sort = 'is_active'  AND p_dir = 'desc' THEN l.is_active::int END DESC,
    CASE WHEN p_sort = 'featured'   AND p_dir = 'asc'  THEN (l.is_featured AND coalesce(l.featured_expires_at > now(), false))::int END ASC,
    CASE WHEN p_sort = 'featured'   AND p_dir = 'desc' THEN (l.is_featured AND coalesce(l.featured_expires_at > now(), false))::int END DESC,
    l.created_at DESC
  LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_agencies()
RETURNS TABLE (agency text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  SELECT coalesce(p.is_admin, false) INTO v_is_admin
  FROM profiles p WHERE p.id = auth.uid();
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT DISTINCT pr.agency FROM profiles pr
  WHERE pr.agency IS NOT NULL AND btrim(pr.agency) <> ''
  ORDER BY 1;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_listings(text,text,text,text,text,date,date,text,text,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_listings(text,text,text,text,text,date,date,text,text,int,int) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_list_agencies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_agencies() TO authenticated;
```

- [ ] **1.2 Do NOT run any remote CLI.** The file is committed; the same SQL is pasted into the live SQL editor by the user (final-report runbook step). UUID equality guard: wrap `l.id::text = lower(v_term)` comparison — `v_term` may not be a UUID, text compare is safe.
- [ ] **1.3 Commit:** `db: add admin_search_listings + admin_list_agencies RPCs` → push.

### Task 2 — Service layer: `src/services/adminPanel.ts`

**Files:** Create `src/services/adminPanel.ts`

- [ ] **2.1** Implement, exporting (signatures fixed here, used verbatim by hooks):

```ts
export interface AdminListingRow extends Listing { thumbnail_url?: string | null }
export interface AdminListingsQuery {
  search: string; ownerRole: string; listingType: string; status: string;
  active: string; dateFrom: string; dateTo: string;
  sort: 'title'|'owner'|'price'|'created_at'|'is_active'|'featured';
  dir: 'asc'|'desc'; page: number; perPage: number;
}
export interface AdminUsersQuery {
  search: string; role: string; agency: string;
  sort: 'full_name'|'role'|'agency'|'status'|'created_at'|'phone';
  dir: 'asc'|'desc'; page: number; perPage: number;
}
export const adminPanelService = {
  getStats(): Promise<{ totalUsers: number; totalListings: number; featuredListings: number; activeUsers: number }>,
  getLifecycleSettings(): Promise<{ id: string; rental_active_days: number; sale_active_days: number }>,
  saveLifecycleSettings(id: string, rental: number, sale: number): Promise<void>,
  searchListings(q: AdminListingsQuery): Promise<{ rows: AdminListingRow[]; total: number; rpcMissing?: boolean }>,
  listAgencies(): Promise<string[]>,            // rpc admin_list_agencies, [] on error
  searchUsers(q: AdminUsersQuery): Promise<{ rows: Profile[]; total: number }>,
  getPendingCount(): Promise<number>,           // head count listings approved=false + commercial pending count
  bulkSetListingsActive(ids: string[], active: boolean): Promise<void>,
  bulkDeleteListings(ids: string[]): Promise<void>,
};
```

Implementation notes (all concrete):
  - `getStats`: 3 head-count queries (`profiles` count, `listings` count, currently-featured = `listings` filtered `is_featured.eq.true` + `featured_expires_at.gt.now()` head count — replaces today's fetch-all-then-filter); `activeUsers = totalUsers`.
  - `searchListings`: `supabase.rpc('admin_search_listings', {...})`, map `row.listing` jsonb → `AdminListingRow`, `total` from first row's `total_count` (0 when empty). If error code is `PGRST202`/`42883` (function missing) return `{ rows: [], total: 0, rpcMissing: true }`.
  - `searchUsers`: PostgREST query on `profiles` with the exact column list used today (`id, full_name, email, role, phone, agency, is_admin, is_banned, created_at, can_manage_agency, can_post_sales`), `{ count: 'exact' }`, `.range((page-1)*perPage, page*perPage-1)`. Search: `.or('full_name.ilike.%t%,email.ilike.%t%,phone.ilike.%t%,agency.ilike.%t%')` (sanitize `,()` from term). Sorts: `status` → `.order('is_admin',{ascending:dir==='desc'}).order('is_banned',...)`; others direct `.order(field)`.
  - Bulk ops: `.update({ is_active })/.delete()` with `.in('id', ids)`.

- [ ] **2.2** The Supabase client is typed (`createClient<Database>` in `src/config/supabase.ts:15`) and `npm run db:types` would hit the live project's CLI (forbidden). Hand-add `admin_search_listings` and `admin_list_agencies` entries to the `Functions` section of `src/types/database.ts`, matching generator output shape (`Args` / `Returns`), so `supabase.rpc(...)` typechecks. The next legitimate regen (after the SQL is applied) emits the identical shape.
- [ ] **2.3** `npm run build && npm run lint` → green.
- [ ] **2.4 Commit:** `services: add adminPanel service (stats, users query, listings RPC, bulk ops)` → push.

### Task 3 — Shared admin UI primitives

**Files:** Create the 8 files in `src/pages/admin/components/` + `src/pages/admin/adminToast.tsx`

- [ ] **3.1** Build (all presentational, brand `#4E4B43` accents):
  - `TablePagination` — props `{ page, totalPages, total, shownFrom, shownTo, onPage, noun }`; Previous/Next + windowed page numbers (reuse the 5-window math from AdminPanel.tsx:1823–1848).
  - `SortableHeader` — props `{ label, field, sort, dir, onSort, className? }`; `<th>` button with `ArrowUp/ArrowDown` lucide icons (replaces text arrows), `aria-sort`.
  - `StatusPill` — props `{ tone: 'green'|'red'|'amber'|'gray'|'blue', children }` mapping to the existing `bg-*-100 text-*-800` pill classes.
  - `BulkActionsBar` — props `{ count, actions: {label, icon, tone, onClick}[], onClear }`; sticky bar that slides in above the table when `count > 0`.
  - `ColumnsMenu` — props `{ columns: {key,label}[], visible: Set<string>, onToggle, storageKey }`; checkbox dropdown, persists to `localStorage(storageKey)`.
  - `AdminSearchInput` — props `{ value, onChange, placeholder }`; Search icon + clear X (pattern from AdminPanel.tsx:1107–1131).
  - `TableSkeleton` — props `{ rows?, cols? }`; pulse rows for loading states.
  - `EmptyState` — props `{ icon, title, message, action? }` (pattern from AdminPanel.tsx:1888–1892).
  - `adminToast.tsx` — `AdminToastProvider` + `useAdminToast()`; renders the fixed top-right toast div from AdminPanel.tsx:943–951 (success green / error red, 3s auto-dismiss).
- [ ] **3.2** Build + lint green. **Commit:** `feat: shared admin table/UI primitives` → push.

### Task 4 — Section hooks

**Files:** Create the 4 hooks in `src/pages/admin/hooks/`

- [ ] **4.1** `useAdminStats` — fetch `getStats` + `getLifecycleSettings` on mount; expose `{ stats, loading, rentalDays, saleDays, setRentalDays, setSaleDays, saveLifecycle, saving }` with the exact 7–365-integer validation from `handleSaveListingLifecycle` (toast on error/success).
- [ ] **4.2** `useAdminUsers` — state = `AdminUsersQuery` (default sort `created_at desc`, page 1, perPage 25); 300ms debounce on `search`; refetch on any query change; expose `{ rows, total, totalPages, loading, query, setFilter, setSort, setPage, refresh, agencies }` (agencies from `listAgencies()` once). Mutation helpers preserved from today's logic, operating on local rows with optimistic update + rollback: `updateRole`, `toggleAgencyAccess` (incl. `ensureAgencyForOwner`), `toggleSalesAccess`, `removeUser` (edge fn `delete-user`). `alert()` → toast.
- [ ] **4.3** `useAdminListings` — state = `AdminListingsQuery` (default `created_at desc`); debounced search; expose rows/total/loading/query setters + `rpcMissing`, plus `selection: Set<string>` helpers (`toggleOne`, `toggleAllOnPage`, `clear`) and actions `toggleActive(id)`, `remove(id)`, `bulkActivate/bulkDeactivate/bulkDelete(ids)` — each refetches current page after success and toasts.
- [ ] **4.4** `useAdminPending` — port today's logic verbatim (parallel residential + commercial fetch, merge, client search/sort/paginate — pending sets are small) + `approve(item)`, `reject(item)` (edge fn / delete per type), `bulkApprove(items)`, `bulkReject(items)` (sequential loop, progress toast). Expose pending count for the sidebar badge via `getPendingCount` (used in layout, light head queries).
- [ ] **4.5** Build + lint green. **Commit:** `feat: per-section admin data hooks` → push.

### Task 5 — Sections

**Files:** Create the 4 files in `src/pages/admin/sections/`

- [ ] **5.1** `OverviewSection` — port stat cards (`StatCard` moves here), lifecycle card, Admin Tools grid. Tools navigate to routes (`/admin/analytics`, `/admin/content-management`, `/admin/digest`, `/admin/sales`, `/admin/concierge`, `/admin/subscriptions`, `/post-old`). Uses `useAdminStats` only — overview no longer loads tables.
- [ ] **5.2** `UsersSection` — filter card (AdminSearchInput searches name/email/phone/agency server-side, role select, agency select), table with sticky header (`thead` `sticky top-0 z-10 bg-gray-50`), all today's columns/actions preserved (role select, both access toggles incl. sales-flag dimming via `salesService.isSalesFeatureEnabled()`, status pills, sign-in-as w/ existing confirm text, delete w/ `ConfirmDialog`), banned tint, server pagination via `TablePagination`. Self-action guards preserved (`user.id === profile.id` disabled).
- [ ] **5.3** `ListingsSection` — toolbar: AdminSearchInput (placeholder "Search anything — address, title, owner, email, phone, ID…"), filters (owner role, type rental|sale, status, active, date range) in a collapsible filter row with active-count + clear-all; `ColumnsMenu` (storage key `hadirot.admin.listings.columns`) over optional columns (Phone, Type, Neighborhood, Created); density toggle (comfortable/compact = `py-4`/`py-2`, storage key `hadirot.admin.listings.density`). Table: checkbox column + `BulkActionsBar` (Activate, Deactivate, Delete w/ ConfirmDialog), thumbnail+title+location cell (40×40 rounded img, `Home` icon fallback), owner cell w/ role/agency + Archived pill, price cell fixed by type (`$X/month` rental, `$X` sale via `asking_price`, "Call for Price"), Active pill, Featured pill (current-featured logic), per-row actions identical to today (View/Edit/Feature/Power/GrantDays/Charge/Delete — modals wired in this section). If `rpcMissing`: amber banner "The listing search function hasn't been installed in the database yet — run the SQL in supabase/migrations/20260611000000_admin_panel_search.sql (SQL editor) and refresh."
- [ ] **5.4** `PendingSection` — port table w/ color-coded borders, COMM badges, search, sort, pagination; checkbox column + bulk Approve/Reject (ConfirmDialog with count); Map modal (residential), approve/reject single actions; ✅/❌ emoji buttons → lucide `CheckCircle`/`XCircle` icon buttons (green/red); approve success toast replaces fixed banner.
- [ ] **5.5** Build + lint green. **Commit:** `feat: admin overview/users/listings/pending sections` → push.

### Task 6 — Shell, routing, deletion of the monolith

**Files:** Create `AdminLayout.tsx`, `AdminSidebar.tsx`, `AdminArea.tsx`; modify `src/App.tsx`; delete `src/pages/AdminPanel.tsx`

- [ ] **6.1** `AdminSidebar` — grouped items (exact list):
  - **Dashboard:** Overview (`/admin`, `TrendingUp`)
  - **Manage:** Users (`/admin/users`, `Users`), Listings (`/admin/listings`, `Home`), Pending (`/admin/pending`, `Eye`, amber count badge), Pipeline (`/admin/pipeline`, `GitBranch`)
  - **Revenue:** Subscriptions (`/admin/subscriptions`, `Crown`), Sales (`/admin/sales`, `DollarSign`), Concierge (`/admin/concierge`, `Briefcase`)
  - **Content:** Content Management (`/admin/content-management`, `FileText`), Digest (`/admin/digest`, `Mail`), Digest Settings (`/admin/digest-settings`, `Settings`)
  - **Insights:** Analytics (`/admin/analytics`, `BarChart3`)
  `NavLink` active style `bg-[#4E4B43] text-white rounded-lg`; inactive `text-gray-600 hover:bg-gray-100`. Desktop: `hidden lg:flex w-60 shrink-0 sticky top-[header] self-start`. Mobile: hamburger row + slide-over drawer w/ backdrop (closes on navigate).
- [ ] **6.2** `AdminLayout` — single admin guard (port AdminPanel.tsx:167–172 + null returns), `AdminToastProvider`, pending-count fetch (refresh on route change into `/admin/pending`), flex row: sidebar + `<main className="flex-1 min-w-0"><Suspense fallback={spinner}><Outlet/></Suspense></main>`, "Admin Panel" heading w/ Shield icon above content.
- [ ] **6.3** `AdminArea` — lazy-imports every section + the 5 existing pages; routes:

```tsx
<Routes>
  <Route element={<AdminLayout />}>
    <Route index element={<LegacyTabRedirect />} />        {/* renders OverviewSection when no/overview tab; Navigate to /admin/<tab> for users|listings|pending|sales|concierge|pipeline */}
    <Route path="users" element={<UsersSection />} />
    <Route path="listings" element={<ListingsSection />} />
    <Route path="pending" element={<PendingSection />} />
    <Route path="sales" element={<SalesManagement />} />
    <Route path="concierge" element={<ConciergeManagement />} />
    <Route path="pipeline" element={<PipelineManagement />} />
    <Route path="subscriptions" element={<AdminSubscriptions />} />
    <Route path="content-management" element={<ContentManagement />} />
    <Route path="digest" element={<DigestManager />} />
    <Route path="digest-settings" element={<DigestGlobalSettings />} />
    <Route path="analytics" element={<InternalAnalytics />} />
    <Route path="digest-manager" element={<Navigate to="/admin/digest" replace />} />
    <Route path="static-pages" element={<Navigate to="/admin/content-management?tab=static-pages" replace />} />
    <Route path="featured-settings" element={<Navigate to="/admin/content-management?tab=featured" replace />} />
    <Route path="*" element={<Navigate to="/admin" replace />} />
  </Route>
</Routes>
```

- [ ] **6.4** `App.tsx` — remove the 6 admin lazy imports + 9 admin routes; add `const AdminArea = lazy(...)` + `<Route path="/admin/*" element={<AdminArea />} />`. Top-level legacy redirects (`/internal-analytics`, `/analytics`, `/static-pages`, `/featured-settings`) stay.
- [ ] **6.5** Delete `src/pages/AdminPanel.tsx`. Grep repo for `AdminPanel` imports — only App.tsx should have referenced it.
- [ ] **6.6** Build + lint green. **Commit:** `feat: admin dashboard shell with sidebar routes; remove AdminPanel monolith` → push.

### Task 7 — Browser verification + polish

- [ ] **7.1** `npm run dev` (background) + webapp-testing skill (Playwright), desktop 1440×900 and mobile 375×667:
  - run the full TESTING CHECKLIST below; capture screenshots of each section; assert zero new console errors (the `rpcMissing` banner is expected if the SQL isn't applied yet — verify the banner itself).
- [ ] **7.2** Fix any regressions found; re-test.
- [ ] **7.3** Final `npm run build && npm run lint`. **Commit:** `test: admin dashboard browser-verification fixes` → push.
- [ ] **7.4** Run verification-before-completion checklist; deliver final report incl. SQL-runbook step (paste migration into SQL editor).

## TESTING CHECKLIST

Desktop + mobile viewport each:
- `/admin` redirects non-admins home; admin sees Overview with correct stat numbers; lifecycle save (valid + out-of-range value → error toast); every Admin Tools card navigates.
- Sidebar: every item routes **without full page reload** (assert no document navigation), active state correct, pending badge count matches Pending list, mobile drawer opens/closes.
- Legacy URLs: `/admin?tab=users`, `?tab=listings`, `?tab=pending`, `?tab=sales`, `?tab=concierge`, `?tab=pipeline`, `/admin/digest-manager`, `/admin/static-pages`, `/internal-analytics` all land correctly.
- Users: search by partial name, email, phone digits, agency; role + agency filters; every column sort; pagination past page 1; change a role; toggle both access switches (and verify revert on simulated failure isn't needed manually — just success path); sign-in-as confirm appears (cancel it); delete confirm (cancel); banned row tint; self row has disabled controls.
- Listings: global search by address fragment, owner email, phone digits, exact listing UUID; each filter; date range; every sortable column; column show/hide persists after reload; density toggle; select page → bulk deactivate → rows update; bulk delete confirm (cancel, then a real one on a test listing if available); each row action incl. Feature modal, Grant Days, Charge, Edit link, View link; sale-type listing shows `$X` not `$X/month`; empty state (impossible search term).
- Pending: search, sort, single approve (success toast), reject (confirm), bulk approve 2 items, Map modal opens for residential, COMM badge on commercial rows.
- Embedded pages: Subscriptions, Content Management (incl. its internal tabs via `?tab=`), Digest, Digest Settings, Analytics all render and function inside the shell.
- No data loads for sections you haven't visited (check network tab on first paint of `/admin`).
