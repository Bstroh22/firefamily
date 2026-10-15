-- If someone edits the service area, clear the saved map location
create or replace function public.contractors_clear_location()
returns trigger language plpgsql as $$
begin
  if new.service_area is distinct from old.service_area then
    new.lat := null;
    new.lng := null;
  end if;
  return new;
end $$;

drop trigger if exists contractors_clear_location on public.contractors;
create trigger contractors_clear_location
  before update on public.contractors
  for each row execute function public.contractors_clear_location();

-- Lets the app save a map location the first time one is looked up
create or replace function public.cache_contractor_location(
  p_id text, p_lat double precision, p_lng double precision)
returns void
language sql security definer set search_path = public
as $$
  update contractors c
     set lat = p_lat, lng = p_lng
   where c.id::text = p_id
     and c.lat is null
     and p_lat between -90 and 90
     and p_lng between -180 and 180
     and exists (select 1 from profiles p
                 where p.id = auth.uid()
                   and p.verification_status = 'approved');
$$;

revoke all on function public.cache_contractor_location(text, double precision, double precision) from public, anon;
grant execute on function public.cache_contractor_location(text, double precision, double precision) to authenticated;