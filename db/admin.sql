-- Approve or reject a new member (admins only)
create or replace function public.admin_review_member(target uuid, approve boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;

  update public.profiles
    set verification_status = case
      when approve then 'approved'::public.verification_status_type
      else 'rejected'::public.verification_status_type
    end
    where id = target;
end;
$$;

-- Approve or deny a position change (admins only)
create or replace function public.admin_review_rank(target uuid, approve boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;

  if approve then
    update public.profiles
      set rank = requested_rank
      where id = target and requested_rank is not null;
  else
    update public.profiles
      set requested_rank = null
      where id = target;
  end if;
end;
$$;

revoke execute on function public.admin_review_member(uuid, boolean) from public, anon;
revoke execute on function public.admin_review_rank(uuid, boolean) from public, anon;
grant execute on function public.admin_review_member(uuid, boolean) to authenticated;
grant execute on function public.admin_review_rank(uuid, boolean) to authenticated;