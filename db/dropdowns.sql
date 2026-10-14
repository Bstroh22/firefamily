-- Verification status: pending / approved / rejected
create type public.verification_status_type as enum ('pending', 'approved', 'rejected');

alter table public.profiles drop constraint if exists profiles_verification_status_check;
alter table public.profiles alter column verification_status drop default;
alter table public.profiles
  alter column verification_status type public.verification_status_type
  using verification_status::public.verification_status_type;
alter table public.profiles alter column verification_status set default 'pending';

-- Position: BLS FF / FF/PM / FAE / CAPTAIN
create type public.rank_type as enum ('BLS FF', 'FF/PM', 'FAE', 'CAPTAIN');

alter table public.profiles drop constraint if exists profiles_rank_check;
alter table public.profiles drop constraint if exists profiles_requested_rank_check;
alter table public.profiles
  alter column rank type public.rank_type using rank::public.rank_type;
alter table public.profiles
  alter column requested_rank type public.rank_type using requested_rank::public.rank_type;

-- Keep the channel check working with the new position type
create or replace function public.my_rank()
returns text
language sql stable security definer set search_path = ''
as $$
  select rank::text from public.profiles where id = auth.uid();
$$;