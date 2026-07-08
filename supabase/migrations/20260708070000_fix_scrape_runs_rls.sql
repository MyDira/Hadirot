/*
  # [P2 / Track-1] scrape_runs: restrict SELECT to admins (was any authenticated)

  ## Finding (audit 01-database-rls.md)
  The policy "Admins can read scrape runs" on scrape_runs is named admin-only but
  its USING clause is literally `true`, so every authenticated user can read all
  scrape-run metadata (source, pdf_filename, errors jsonb, counts) — 17k+ rows,
  growing unbounded. The admin pipeline UI (src/services/pipeline.ts) is the only
  intended reader.

  ## Fix
  Replace USING (true) with USING (is_admin_cached()) — matching the pattern used
  by scraped_listings. is_admin_cached() reads the server-controlled JWT
  app_metadata.is_admin claim (with a profiles fallback), which the client cannot
  forge.

  ## Reversal (spirit)
  Recreate the policy with USING (true) (reintroduces the over-broad read).

  ## Verification (manual)
    - Non-admin authenticated user: SELECT FROM scrape_runs => 0 rows.
    - Admin: pipeline UI still lists scrape runs.
*/

DROP POLICY IF EXISTS "Admins can read scrape runs" ON public.scrape_runs;
CREATE POLICY "Admins can read scrape runs"
  ON public.scrape_runs
  FOR SELECT
  TO authenticated
  USING (public.is_admin_cached());
