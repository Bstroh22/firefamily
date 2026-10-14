-- 1. Remove extra spaces from channel names
update public.forum_channels set name = trim(name);

-- 2. Tag the Captains channel as CAPTAIN-only
update public.forum_channels
  set required_rank = 'CAPTAIN'
  where name ilike 'captain%';

-- 3. Remove the leftover channels (and any test messages in them)
delete from public.forum_channels where name in ('Off Duty', 'Training');

-- 4. Approving a promotion = just set rank; the request clears itself
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

  if new.requested_rank is not null and new.requested_rank = new.rank then
    new.requested_rank := null;
  end if;

  return new;
end;
$$;

-- 5. Clear any request that already matches the current rank
update public.profiles set requested_rank = null where requested_rank = rank;

-- 6. Show the results
select name as channel, required_rank from public.forum_channels order by created_at;
select full_name, rank, requested_rank from public.profiles;