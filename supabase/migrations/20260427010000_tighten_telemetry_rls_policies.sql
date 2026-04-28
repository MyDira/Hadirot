-- Tighten two RLS policies that effectively allow anything because their
-- WITH CHECK was `true`. Surfaced by Supabase security advisor (Section 2.1).
--
-- Both tables have an optional user_id column — the WITH CHECK should require
-- that, when user_id IS NOT NULL, it matches the calling user. Anonymous
-- inserts (user_id IS NULL) are still allowed since both surfaces have
-- legitimate anonymous use cases (article feedback while logged out, modal
-- interactions tracked by fingerprint for anon visitors).

-- knowledge_base_feedback
DROP POLICY IF EXISTS "Authenticated users can submit feedback" ON public.knowledge_base_feedback;

CREATE POLICY "Users can submit feedback for themselves"
  ON public.knowledge_base_feedback
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- modal_user_interactions
DROP POLICY IF EXISTS "Users can insert own interactions" ON public.modal_user_interactions;

CREATE POLICY "Users can insert own interactions"
  ON public.modal_user_interactions
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);
