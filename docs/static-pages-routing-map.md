# Static Pages Routing Map

- **Route handling**: `src/App.tsx` defines `<Route path="/:slug" element={<StaticPage />}>` to render dynamic static pages before the catch‑all.
- **Footer links**: `src/components/shared/Footer.tsx` builds absolute URLs for internal slugs and opens external links in a new tab.
- **Slug loading**: `src/pages/StaticPage.tsx` reads `slug` via `useParams()` and fetches the page from Supabase using `staticPagesService.getStaticPage(slug)`.
- **404 handling**: When no static page matches, `StaticPage` renders `<NotFound />` instead of redirecting. The global catch‑all route in `App.tsx` now shows `<NotFound />` rather than navigating to `/`.
- **Netlify redirects**: `public/_redirects` provides SPA fallback with `/*  /index.html  200` so deep links load the app.
