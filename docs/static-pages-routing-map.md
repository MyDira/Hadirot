# Static Pages Routing Map

- **id-as-slug**: `static_pages.id` stores the slug used in URLs.
- **Footer links**: Admin footer entries store absolute paths like `"/about"` or `"/my-page"`.
- **Routing**: A dynamic route `/:id` renders the `StaticPage` component, which loads content by `id`.
- **NotFound**: Unmatched routes render a dedicated `NotFound` page instead of redirecting home.
- **SPA Fallback**: `public/_redirects` includes `/*  /index.html  200` so deep links resolve to the SPA.
