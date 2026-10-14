-- Each member can read their OWN full profile
create or replace function public.get_my_profile()
returns setof public.profiles
language sql stable
security definer set search_path = ''
as $$
  select * from public.profiles where id = auth.uid();
$$;

-- Admins can read the pending queue, including employee IDs
create or replace function public.admin_pending()
returns table (
  kind text,
  id uuid,
  full_name text,
  station text,
  employee_id text,
  rank text,
  requested_rank text,
  created_at timestamptz
)
language sql stable
security definer set search_path = ''
as $$
  select
    case when p.verification_status = 'pending' then 'member' else 'rank' end,
    p.id, p.full_name, p.station, p.employee_id,
    p.rank::text, p.requested_rank::text, p.created_at
  from public.profiles p
  where public.is_admin()
    and (
      p.verification_status = 'pending'
      or (p.verification_status = 'approved' and p.requested_rank is not null)
    )
  order by p.created_at;
$$;

revoke execute on function public.get_my_profile() from public, anon;
revoke execute on function public.admin_pending() from public, anon;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.admin_pending() to authenticated;