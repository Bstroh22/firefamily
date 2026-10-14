-- Reports from members
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_kind text not null
    check (target_kind in ('listing', 'rental', 'forum_message', 'direct_message')),
  target_id uuid not null,
  target_owner_id uuid references public.profiles(id) on delete set null,
  content_snapshot text,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'removed', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

alter table public.reports enable row level security;
-- No direct table access: everything goes through the functions below.

-- Member submits a report (the server looks up the content itself)
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
      into v_owner, v_snapshot
      from public.listings l where l.id = p_target;
  elsif p_kind = 'rental' then
    select r.owner_id, r.title || coalesce(' — ' || r.description, '')
      into v_owner, v_snapshot
      from public.rentals r where r.id = p_target;
  elsif p_kind = 'forum_message' then
    select m.author_id, m.body
      into v_owner, v_snapshot
      from public.forum_messages m
      where m.id = p_target and public.can_see_channel(m.channel_id);
  elsif p_kind = 'direct_message' then
    select m.sender_id, m.body
      into v_owner, v_snapshot
      from public.direct_messages m
      where m.id = p_target and public.is_participant(m.conversation_id);
  else
    raise exception 'Invalid report type';
  end if;

  if v_owner is null then
    raise exception 'That item is no longer available';
  end if;
  if v_owner = me then
    raise exception 'You cannot report your own post';
  end if;

  -- Ignore duplicate open reports from the same person on the same item
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

-- Admin: list open reports
create or replace function public.admin_open_reports()
returns table (
  id uuid,
  target_kind text,
  target_id uuid,
  content_snapshot text,
  reason text,
  details text,
  created_at timestamptz,
  reporter_name text,
  owner_id uuid,
  owner_name text,
  owner_station text,
  report_count int
)
language sql stable security definer set search_path = ''
as $$
  select
    r.id, r.target_kind, r.target_id, r.content_snapshot, r.reason, r.details, r.created_at,
    rp.full_name,
    r.target_owner_id, o.full_name, o.station,
    (select count(*)::int from public.reports r2
       where r2.target_kind = r.target_kind and r2.target_id = r.target_id and r2.status = 'open')
  from public.reports r
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles o on o.id = r.target_owner_id
  where public.is_admin() and r.status = 'open'
  order by r.created_at;
$$;

-- Admin: how many open reports (for the badge)
create or replace function public.admin_open_report_count()
returns int
language sql stable security definer set search_path = ''
as $$
  select case when public.is_admin()
    then (select count(*)::int from public.reports where status = 'open')
    else 0 end;
$$;

-- Admin: remove the content (or dismiss) and close all reports on that item
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

revoke execute on function public.submit_report(text, uuid, text, text) from public, anon;
revoke execute on function public.admin_open_reports() from public, anon;
revoke execute on function public.admin_open_report_count() from public, anon;
revoke execute on function public.admin_resolve_report(uuid, boolean) from public, anon;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;
grant execute on function public.admin_open_reports() to authenticated;
grant execute on function public.admin_open_report_count() to authenticated;
grant execute on function public.admin_resolve_report(uuid, boolean) to authenticated;