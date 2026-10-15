-- ===== Pros: Home & Property vs Health & Wellness =====
alter table public.contractors
  add column if not exists category text not null default 'home'
    check (category in ('home', 'health')),
  add column if not exists insurance text;

drop function if exists public.contractors_list();
create function public.contractors_list()
returns table (
  id uuid,
  name text,
  trade text,
  category text,
  phone text,
  email text,
  website text,
  service_area text,
  insurance text,
  notes text,
  created_at timestamptz,
  referred_by uuid,
  referrer_name text,
  referrer_station text,
  referrer_avatar text,
  rec_count int,
  i_recommend boolean
)
language sql stable security definer set search_path = ''
as $$
  select x.* from (
    select
      c.id, c.name, c.trade, c.category, c.phone, c.email, c.website,
      c.service_area, c.insurance, c.notes, c.created_at,
      c.referred_by,
      p.full_name as referrer_name,
      p.station as referrer_station,
      p.avatar_url as referrer_avatar,
      (select count(*)::int from public.contractor_recommendations r
         where r.contractor_id = c.id) as rec_count,
      exists (select 1 from public.contractor_recommendations r
              where r.contractor_id = c.id and r.user_id = auth.uid()) as i_recommend
    from public.contractors c
    left join public.profiles p on p.id = c.referred_by
    where public.is_verified()
  ) x
  order by x.rec_count desc, x.created_at desc;
$$;

revoke execute on function public.contractors_list() from public, anon;
grant execute on function public.contractors_list() to authenticated;

-- ===== Forum unread tracking =====
create table if not exists public.forum_reads (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  channel_id uuid not null references public.forum_channels(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);
alter table public.forum_reads enable row level security;
-- No direct table access; the functions below handle it.

-- Mark a channel as read up to now
create or replace function public.mark_channel_read(ch uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.forum_reads (user_id, channel_id, last_read_at)
  select auth.uid(), ch, now()
  where public.can_see_channel(ch)
  on conflict (user_id, channel_id) do update set last_read_at = excluded.last_read_at;
$$;

-- When did I last read this channel? (new members start from when they joined)
create or replace function public.channel_last_read(ch uuid)
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select r.last_read_at from public.forum_reads r
       where r.user_id = auth.uid() and r.channel_id = ch),
    (select p.created_at from public.profiles p where p.id = auth.uid())
  );
$$;

-- Unread count per channel I can see (my own messages never count)
create or replace function public.forum_unread_counts()
returns table (channel_id uuid, unread int)
language sql stable security definer set search_path = ''
as $$
  select
    c.id,
    (select count(*)::int from public.forum_messages m
       where m.channel_id = c.id
         and m.author_id <> auth.uid()
         and m.created_at > coalesce(
           (select r.last_read_at from public.forum_reads r
              where r.user_id = auth.uid() and r.channel_id = c.id),
           (select p.created_at from public.profiles p where p.id = auth.uid())
         ))
  from public.forum_channels c
  where public.can_see_channel(c.id);
$$;

revoke execute on function public.mark_channel_read(uuid) from public, anon;
revoke execute on function public.channel_last_read(uuid) from public, anon;
revoke execute on function public.forum_unread_counts() from public, anon;
grant execute on function public.mark_channel_read(uuid) to authenticated;
grant execute on function public.channel_last_read(uuid) to authenticated;
grant execute on function public.forum_unread_counts() to authenticated;
update public.contractors set trade = 'General Contractor' where trade = 'General';
update public.contractors set trade = 'Pest Control' where trade = 'Pest';