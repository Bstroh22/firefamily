-- 1. Position columns
alter table public.profiles
  add column if not exists rank text
    check (rank in ('BLS FF', 'FF/PM', 'FAE', 'CAPTAIN')),
  add column if not exists requested_rank text
    check (requested_rank in ('BLS FF', 'FF/PM', 'FAE', 'CAPTAIN'));

-- 2. Members can request a position
grant update (requested_rank) on public.profiles to authenticated;

-- 3. Apply position automatically on approval
create or replace function public.apply_rank_on_approval()
returns trigger
language plpgsql
as $$
begin
  if new.verification_status = 'approved'
     and new.rank is null
     and new.requested_rank is not null then
    new.rank := new.requested_rank;
    new.requested_rank := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_apply_rank on public.profiles;
create trigger profiles_apply_rank
  before update on public.profiles
  for each row execute procedure public.apply_rank_on_approval();

-- 4. Tag channels with their position
alter table public.forum_channels
  add column if not exists required_rank text;

update public.forum_channels
  set required_rank = name
  where name in ('BLS FF', 'FF/PM', 'FAE', 'CAPTAIN');

-- 5. Helper checks
create or replace function public.my_rank()
returns text
language sql stable security definer set search_path = ''
as $$
  select rank from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.can_see_channel(ch uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_verified() and exists (
    select 1 from public.forum_channels c
    where c.id = ch
      and (c.required_rank is null
           or c.required_rank = public.my_rank()
           or public.is_admin())
  );
$$;

-- 6. Position-aware forum security rules
drop policy if exists "Approved users can view channels" on public.forum_channels;
create policy "Members see channels for their position"
  on public.forum_channels for select
  using (public.can_see_channel(id));

drop policy if exists "Approved users can read messages" on public.forum_messages;
create policy "Members read messages in their channels"
  on public.forum_messages for select
  using (public.can_see_channel(channel_id));

drop policy if exists "Approved users can post messages" on public.forum_messages;
create policy "Members post in their channels"
  on public.forum_messages for insert
  with check (author_id = auth.uid() and public.can_see_channel(channel_id));