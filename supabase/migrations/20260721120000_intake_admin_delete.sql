/*
  # Admin hard-delete for scraped_listings (Intake review)

  Admins currently have SELECT/UPDATE on scraped_listings
  (20260311181337_add_pipeline_call_tracking.sql) but no DELETE — the intake
  review screen can only "soft discard" (call_status = 'suppressed'). This
  adds a real DELETE policy so the admin can permanently remove a bad/duplicate
  intake row (the client also purges its storage media before deleting the row).

  Additive + idempotent: safe to re-run.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'scraped_listings'
      AND policyname = 'Admins can delete scraped_listings'
  ) THEN
    CREATE POLICY "Admins can delete scraped_listings"
      ON scraped_listings
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = (SELECT auth.uid())
            AND profiles.is_admin = true
        )
      );
  END IF;
END $$;
