-- Admins/moderators can remove anything posted in the app
drop policy if exists "admin delete listings" on public.listings;
create policy "admin delete listings" on public.listings
  for delete to authenticated using (public.is_admin());

drop policy if exists "admin delete rentals" on public.rentals;
create policy "admin delete rentals" on public.rentals
  for delete to authenticated using (public.is_admin());

drop policy if exists "admin delete referrals" on public.contractors;
create policy "admin delete referrals" on public.contractors
  for delete to authenticated using (public.is_admin());

drop policy if exists "admin delete forum posts" on public.forum_messages;
create policy "admin delete forum posts" on public.forum_messages
  for delete to authenticated using (public.is_admin());