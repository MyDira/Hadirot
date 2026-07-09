-- Atomic listing-view increment (bughunt P2).
--
-- The client previously did a read-modify-write (SELECT views, then
-- UPDATE views = views + 1), which loses increments under concurrent views and
-- writes NaN when `views` is null. This RPC performs the increment in a single
-- atomic statement, coalescing null to 0.

create or replace function public.increment_listing_view(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.listings
  set views = coalesce(views, 0) + 1
  where id = p_id;
$$;

grant execute on function public.increment_listing_view(uuid) to anon, authenticated;
