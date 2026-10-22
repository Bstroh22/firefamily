-- Rental type, price period, and filters
alter table public.rentals
  add column if not exists rental_type text not null default 'vacation',
  add column if not exists rate_period text not null default 'night',
  add column if not exists furnished boolean,
  add column if not exists pets_ok boolean,
  add column if not exists bedrooms integer,
  add column if not exists room_only boolean not null default false,
  add column if not exists lat double precision,
  add column if not exists lng double precision;

alter table public.rentals drop constraint if exists rentals_type_check;
alter table public.rentals add constraint rentals_type_check
  check (rental_type in ('vacation', 'short', 'long'));
alter table public.rentals drop constraint if exists rentals_period_check;
alter table public.rentals add constraint rentals_period_check
  check (rate_period in ('night', 'week', 'month'));

-- Reset the map pin when the location changes
create or replace function public.rentals_clear_location()
returns trigger language plpgsql as $$
begin
  if new.location is distinct from old.location then
    new.lat := null;
    new.lng := null;
  end if;
  return new;
end $$;
drop trigger if exists rentals_clear_location on public.rentals;
create trigger rentals_clear_location before update on public.rentals
  for each row execute function public.rentals_clear_location();

-- Lets the app save a map spot the first time one is looked up
create or replace function public.cache_rental_location(
  p_id text, p_lat double precision, p_lng double precision)
returns void language sql security definer set search_path = public as $$
  update rentals r set lat = p_lat, lng = p_lng
   where r.id::text = p_id and r.lat is null
     and p_lat between -90 and 90 and p_lng between -180 and 180
     and exists (select 1 from profiles p where p.id = auth.uid()
                 and p.verification_status = 'approved');
$$;
revoke all on function public.cache_rental_location(text, double precision, double precision) from public, anon;
grant execute on function public.cache_rental_location(text, double precision, double precision) to authenticated;

-- Push alert says which kind of rental it is
create or replace function public.push_on_rental() returns trigger
language plpgsql security definer set search_path = public as $$
declare recips uuid[];
begin
  if exists (select 1 from rentals r where r.owner_id = new.owner_id and r.id <> new.id
             and r.created_at > now() - interval '10 minutes') then return new; end if;
  select array_agg(p.id) into recips
  from profiles p left join notification_prefs np on np.user_id = p.id
  where p.verification_status = 'approved' and p.id <> new.owner_id and coalesce(np.listings, true);
  if recips is null then return new; end if;
  perform send_push(recips,
    case new.rental_type when 'short' then 'New short-term rental'
                         when 'long' then 'New long-term rental'
                         else 'New vacation rental' end,
    new.title || coalesce(' · ' || new.location, ''),
    jsonb_build_object('type', 'rental', 'id', new.id));
  return new;
exception when others then return new;
end $$;