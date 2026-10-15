-- Location fields for referrals
alter table public.contractors
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists zip text,
  add column if not exists lat double precision,
  add column if not exists lng double precision;

-- Returns locations for all referrals (approved members only)
create or replace function public.contractor_locations()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'address', c.address, 'city', c.city,
    'zip', c.zip, 'lat', c.lat, 'lng', c.lng)), '[]'::jsonb)
  from contractors c
  where exists (select 1 from profiles p
                where p.id = auth.uid()
                  and p.verification_status = 'approved');
$$;

revoke all on function public.contractor_locations() from public, anon;
grant execute on function public.contractor_locations() to authenticated;