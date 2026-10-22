-- Reset the map pin when the address OR the city/ZIP changes
create or replace function public.contractors_clear_location()
returns trigger language plpgsql as $$
begin
  if new.service_area is distinct from old.service_area
     or new.address is distinct from old.address then
    new.lat := null;
    new.lng := null;
  end if;
  return new;
end $$;