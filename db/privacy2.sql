-- Members can only read these profile columns about each other
revoke select on public.profiles from anon, authenticated;
grant select (id, full_name, station, rank, verification_status, is_admin, created_at)
  on public.profiles to authenticated;