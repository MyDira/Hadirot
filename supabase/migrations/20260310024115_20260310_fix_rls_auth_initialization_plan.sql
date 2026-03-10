/*
  # Fix Auth RLS Initialization Plan

  Replaces bare `auth.uid()` calls with `(SELECT auth.uid())` in all affected RLS policies.
  This prevents per-row re-evaluation of the auth function, allowing Postgres to evaluate
  it once per statement for significant performance gains at scale.

  Affected tables:
  - stripe_orders
  - stripe_customers
  - stripe_subscriptions
  - concierge_subscriptions (4 policies)
  - concierge_submissions (4 policies)
  - analytics_validation_log (2 policies)
*/

-- ============================================================
-- stripe_customers
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own customer data" ON public.stripe_customers;
CREATE POLICY "Users can view their own customer data"
  ON public.stripe_customers
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()) AND deleted_at IS NULL);

-- ============================================================
-- stripe_orders
-- (joins through stripe_customers, fix inner subquery too)
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own order data" ON public.stripe_orders;
CREATE POLICY "Users can view their own order data"
  ON public.stripe_orders
  FOR SELECT
  TO authenticated
  USING (
    customer_id IN (
      SELECT customer_id FROM public.stripe_customers
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- ============================================================
-- stripe_subscriptions
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own subscription data" ON public.stripe_subscriptions;
CREATE POLICY "Users can view their own subscription data"
  ON public.stripe_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    customer_id IN (
      SELECT customer_id FROM public.stripe_customers
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- ============================================================
-- concierge_subscriptions
-- ============================================================
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.concierge_subscriptions;
CREATE POLICY "Users can view own subscriptions"
  ON public.concierge_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can create own subscriptions" ON public.concierge_subscriptions;
CREATE POLICY "Users can create own subscriptions"
  ON public.concierge_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Admins can update subscriptions" ON public.concierge_subscriptions;
CREATE POLICY "Admins can update subscriptions"
  ON public.concierge_subscriptions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view all subscriptions" ON public.concierge_subscriptions;
CREATE POLICY "Admins can view all subscriptions"
  ON public.concierge_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND is_admin = true
    )
  );

-- ============================================================
-- concierge_submissions
-- ============================================================
DROP POLICY IF EXISTS "Users can view own submissions" ON public.concierge_submissions;
CREATE POLICY "Users can view own submissions"
  ON public.concierge_submissions
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can create own submissions" ON public.concierge_submissions;
CREATE POLICY "Users can create own submissions"
  ON public.concierge_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Admins can update submissions" ON public.concierge_submissions;
CREATE POLICY "Admins can update submissions"
  ON public.concierge_submissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view all submissions" ON public.concierge_submissions;
CREATE POLICY "Admins can view all submissions"
  ON public.concierge_submissions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND is_admin = true
    )
  );

-- ============================================================
-- analytics_validation_log
-- ============================================================
DROP POLICY IF EXISTS "Admins can read validation logs" ON public.analytics_validation_log;
CREATE POLICY "Admins can read validation logs"
  ON public.analytics_validation_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "System can insert validation logs" ON public.analytics_validation_log;
CREATE POLICY "System can insert validation logs"
  ON public.analytics_validation_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND is_admin = true
    )
  );
