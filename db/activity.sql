-- App-wide activity
alter table public.profiles add column if not exists last_seen_at timestamptz;

create or replace function public.touch_last_seen()
returns void
language sql
security definer set search_path = ''
as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;

create or replace function public.active_member_count(minutes int default 5)
returns int
language sql stable
security definer set search_path = ''
as $$
  select case when public.is_verified() then
    (select count(*)::int
       from public.profiles
       where verification_status = 'approved'
         and last_seen_at > now() - make_interval(mins => minutes))
  else 0 end;
$$;

-- Per-channel activity ("here now")
alter table public.profiles
  add column if not exists last_channel_id uuid,
  add column if not exists last_channel_seen_at timestamptz;

create or replace function public.touch_channel(ch uuid)
returns void
language sql
security definer set search_path = ''
as $$
  update public.profiles
    set last_channel_id = ch,
        last_channel_seen_at = now(),
        last_seen_at = now()
    where id = auth.uid() and public.can_see_channel(ch);
$$;

create or replace function public.leave_channel()
returns void
language sql
security definer set search_path = ''
as $$
  update public.profiles set last_channel_id = null where id = auth.uid();
$$;

create or replace function public.channel_active_count(ch uuid)
returns int
language sql stable
security definer set search_path = ''
as $$
  select case when public.can_see_channel(ch) then
    (select count(*)::int
       from public.profiles
       where verification_status = 'approved'
         and last_channel_id = ch
         and last_channel_seen_at > now() - interval '2 minutes')
  else 0 end;
$$;

-- Only signed-in members can use these
revoke execute on function public.touch_last_seen() from public, anon;
revoke execute on function public.active_member_count(int) from public, anon;
revoke execute on function public.touch_channel(uuid) from public, anon;
revoke execute on function public.leave_channel() from public, anon;
revoke execute on function public.channel_active_count(uuid) from public, anon;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.active_member_count(int) to authenticated;
grant execute on function public.touch_channel(uuid) to authenticated;
grant execute on function public.leave_channel() to authenticated;
grant execute on function public.channel_active_count(uuid) to authenticated;