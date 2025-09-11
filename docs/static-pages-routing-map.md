# Static Pages Routing Map

- **Route handling**: `src/App.tsx` defines `<Route path="/:slug" element={<StaticPage />}>` to render dynamic static pages before the catch‑all.
- **Footer links**: `src/components/shared/Footer.tsx` builds links from Supabase data and now prefixes paths with `/` to ensure absolute URLs.
- **Slug loading**: `src/pages/StaticPage.tsx` reads `slug` via `useParams()` and fetches the page from Supabase using `staticPagesService.getStaticPage(slug)`.
- **404 handling**: When no static page matches, `StaticPage` renders `<NotFound />` instead of redirecting. The global catch‑all route in `App.tsx` now shows `<NotFound />` rather than navigating to `/`.
- **Netlify redirects**: No `netlify.toml` or `public/_redirects` file exists, so no deploy‑time redirect to `/` is configured.
