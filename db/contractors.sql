-- Contractors shared by members
create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  referred_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  trade text not null default 'Other',
  phone text,
  email text,
  website text,
  service_area text,
  notes text,
  created_at timestamptz not null default now()
);

-- One thumbs-up per member per contractor
create table if not exists public.contractor_recommendations (
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contractor_id, user_id)
);

alter table public.contractors enable row level security;
alter table public.contractor_recommendations enable row level security;

drop policy if exists "Approved users view contractors" on public.contractors;
create policy "Approved users view contractors"
  on public.contractors for select using (public.is_verified());
drop policy if exists "Approved users add contractors" on public.contractors;
create policy "Approved users add contractors"
  on public.contractors for insert with check (public.is_verified() and referred_by = auth.uid());
drop policy if exists "Referrers edit their contractors" on public.contractors;
create policy "Referrers edit their contractors"
  on public.contractors for update using (referred_by = auth.uid()) with check (referred_by = auth.uid());
drop policy if exists "Referrers delete their contractors" on public.contractors;
create policy "Referrers delete their contractors"
  on public.contractors for delete using (referred_by = auth.uid());

drop policy if exists "Approved users view recommendations" on public.contractor_recommendations;
create policy "Approved users view recommendations"
  on public.contractor_recommendations for select using (public.is_verified());
drop policy if exists "Approved users recommend" on public.contractor_recommendations;
create policy "Approved users recommend"
  on public.contractor_recommendations for insert with check (public.is_verified() and user_id = auth.uid());
drop policy if exists "Members remove their recommendation" on public.contractor_recommendations;
create policy "Members remove their recommendation"
  on public.contractor_recommendations for delete using (user_id = auth.uid());

-- The person who refers a contractor automatically recommends them
create or replace function public.auto_recommend_contractor()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.contractor_recommendations (contractor_id, user_id)
  values (new.id, new.referred_by)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists contractors_auto_recommend on public.contractors;
create trigger contractors_auto_recommend
  after insert on public.contractors
  for each row execute procedure public.auto_recommend_contractor();

-- List with referrer details and thumbs-up counts, most recommended first
create or replace function public.contractors_list()
returns table (
  id uuid,
  name text,
  trade text,
  phone text,
  email text,
  website text,
  service_area text,
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
  select
    c.id, c.name, c.trade, c.phone, c.email, c.website, c.service_area, c.notes, c.created_at,
    c.referred_by, p.full_name, p.station, p.avatar_url,
    (select count(*)::int from public.contractor_recommendations r where r.contractor_id = c.id),
    exists (select 1 from public.contractor_recommendations r
            where r.contractor_id = c.id and r.user_id = auth.uid())
  from public.contractors c
  left join public.profiles p on p.id = c.referred_by
  where public.is_verified()
  order by 14 desc, c.created_at desc;
$$;

revoke execute on function public.contractors_list() from public, anon;
grant execute on function public.contractors_list() to authenticated;

-- Allow contractors to be reported and removed by admins
alter table public.reports drop constraint if exists reports_target_kind_check;
alter table public.reports add constraint reports_target_kind_check
  check (target_kind in ('listing', 'rental', 'forum_message', 'direct_message', 'contractor'));

create or replace function public.submit_report(
  p_kind text,
  p_target uuid,
  p_reason text,
  p_details text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_owner uuid;
  v_snapshot text;
begin
  if me is null or not public.is_verified() then
    raise exception 'Not allowed';
  end if;

  if p_kind = 'listing' then
    select l.seller_id, l.title || coalesce(' — ' || l.description, '')
      into v_owner, v_snapshot from public.listings l where l.id = p_target;
  elsif p_kind = 'rental' then
    select r.owner_id, r.title || coalesce(' — ' || r.description, '')
      into v_owner, v_snapshot from public.rentals r where r.id = p_target;
  elsif p_kind = 'forum_message' then
    select m.author_id, m.body into v_owner, v_snapshot
      from public.forum_messages m
      where m.id = p_target and public.can_see_channel(m.channel_id);
  elsif p_kind = 'direct_message' then
    select m.sender_id, m.body into v_owner, v_snapshot
      from public.direct_messages m
      where m.id = p_target and public.is_participant(m.conversation_id);
  elsif p_kind = 'contractor' then
    select c.referred_by, c.name || ' (' || c.trade || ')' || coalesce(' — ' || c.notes, '')
      into v_owner, v_snapshot from public.contractors c where c.id = p_target;
  else
    raise exception 'Invalid report type';
  end if;

  if v_owner is null then
    raise exception 'That item is no longer available';
  end if;
  if v_owner = me then
    raise exception 'You cannot report your own post';
  end if;

  if exists (
    select 1 from public.reports r
    where r.reporter_id = me and r.target_kind = p_kind
      and r.target_id = p_target and r.status = 'open'
  ) then
    return;
  end if;

  insert into public.reports (reporter_id, target_kind, target_id, target_owner_id, content_snapshot, reason, details)
  values (me, p_kind, p_target, v_owner, v_snapshot, p_reason, nullif(trim(p_details), ''));
end;
$$;

create or replace function public.admin_resolve_report(p_report uuid, p_remove boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  rec public.reports%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;

  select * into rec from public.reports where id = p_report;
  if not found then
    raise exception 'Report not found';
  end if;

  if p_remove then
    if rec.target_kind = 'listing' then
      delete from public.listings where id = rec.target_id;
    elsif rec.target_kind = 'rental' then
      delete from public.rentals where id = rec.target_id;
    elsif rec.target_kind = 'forum_message' then
      delete from public.forum_messages where id = rec.target_id;
    elsif rec.target_kind = 'direct_message' then
      delete from public.direct_messages where id = rec.target_id;
    elsif rec.target_kind = 'contractor' then
      delete from public.contractors where id = rec.target_id;
    end if;
  end if;

  update public.reports
    set status = case when p_remove then 'removed' else 'dismissed' end,
        resolved_at = now(),
        resolved_by = auth.uid()
    where target_kind = rec.target_kind
      and target_id = rec.target_id
      and status = 'open';
end;
$$;