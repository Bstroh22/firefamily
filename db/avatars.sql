-- Profile photo
alter table public.profiles add column if not exists avatar_url text;

-- Members can see each other's photos, and set their own
grant select (avatar_url) on public.profiles to authenticated;
grant update (avatar_url) on public.profiles to authenticated;

-- Photo storage (2 MB limit, images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/*'])
on conflict (id) do nothing;

-- Members can upload/delete photos only in their own folder
drop policy if exists "Members upload their own avatar" on storage.objects;
create policy "Members upload their own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Members delete their own avatar" on storage.objects;
create policy "Members delete their own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Admin queue now includes the photo
drop function if exists public.admin_pending();
create function public.admin_pending()
returns table (
  kind text,
  id uuid,
  full_name text,
  station text,
  employee_id text,
  rank text,
  requested_rank text,
  avatar_url text,
  created_at timestamptz
)
language sql stable
security definer set search_path = ''
as $$
  select
    case when p.verification_status = 'pending' then 'member' else 'rank' end,
    p.id, p.full_name, p.station, p.employee_id,
    p.rank::text, p.requested_rank::text, p.avatar_url, p.created_at
  from public.profiles p
  where public.is_admin()
    and (
      p.verification_status = 'pending'
      or (p.verification_status = 'approved' and p.requested_rank is not null)
    )
  order by p.created_at;
$$;

revoke execute on function public.admin_pending() from public, anon;
grant execute on function public.admin_pending() to authenticated;