-- ============ PUSH NOTIFICATIONS ============
create extension if not exists pg_net;

-- 1. Phones that can receive pushes
create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;  -- no policies: only functions touch it

create or replace function public.register_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  insert into push_tokens (token, user_id, updated_at)
  select p_token, auth.uid(), now() where auth.uid() is not null
  on conflict (token) do update set user_id = auth.uid(), updated_at = now();
$$;

create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from push_tokens where token = p_token and user_id = auth.uid();
$$;

revoke all on function public.register_push_token(text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

-- 2. Each member's notification settings
create table if not exists public.notification_prefs (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  dms boolean not null default true,
  forums boolean not null default true,
  listings boolean not null default true,
  referrals boolean not null default false,
  admin boolean not null default true
);
alter table public.notification_prefs enable row level security;
drop policy if exists "own prefs read" on public.notification_prefs;
drop policy if exists "own prefs insert" on public.notification_prefs;
drop policy if exists "own prefs update" on public.notification_prefs;
create policy "own prefs read" on public.notification_prefs for select to authenticated using (user_id = auth.uid());
create policy "own prefs insert" on public.notification_prefs for insert to authenticated with check (user_id = auth.uid());
create policy "own prefs update" on public.notification_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3. Per-channel mutes (matches your channel id type automatically)
do $$
declare t text;
begin
  select format_type(atttypid, atttypmod) into t
  from pg_attribute where attrelid = 'public.forum_channels'::regclass and attname = 'id';
  execute format(
    'create table if not exists public.channel_mutes (
       user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
       channel_id %s not null references public.forum_channels(id) on delete cascade,
       primary key (user_id, channel_id))', t);
end $$;
alter table public.channel_mutes enable row level security;
drop policy if exists "own mutes read" on public.channel_mutes;
drop policy if exists "own mutes insert" on public.channel_mutes;
drop policy if exists "own mutes delete" on public.channel_mutes;
create policy "own mutes read" on public.channel_mutes for select to authenticated using (user_id = auth.uid());
create policy "own mutes insert" on public.channel_mutes for insert to authenticated with check (user_id = auth.uid());
create policy "own mutes delete" on public.channel_mutes for delete to authenticated using (user_id = auth.uid());

-- 4. Hide lock-screen previews for sensitive channels
alter table public.forum_channels add column if not exists hide_previews boolean not null default false;
update public.forum_channels set hide_previews = true where name ilike 'health%';

-- 5. The sender (talks to Expo's free push service)
create or replace function public.send_push(p_users uuid[], p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare msgs jsonb;
begin
  for msgs in
    select jsonb_agg(jsonb_build_object('to', t.token, 'title', p_title, 'body', p_body,
                                        'sound', 'default', 'data', p_data))
    from (select token, (row_number() over () - 1) / 100 as grp
          from push_tokens where user_id = any(p_users)) t
    group by t.grp
  loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := msgs,
      headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb);
  end loop;
exception when others then
  null;  -- a push problem must never block a post or message
end $$;

create or replace function public.push_admins(p_title text, p_body text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare recips uuid[];
begin
  select array_agg(p.id) into recips
  from profiles p left join notification_prefs np on np.user_id = p.id
  where coalesce(p.is_admin, false) and coalesce(np.admin, true);
  if recips is not null then perform send_push(recips, p_title, p_body, p_data); end if;
end $$;

revoke all on function public.send_push(uuid[], text, text, jsonb) from public, anon, authenticated;
revoke all on function public.push_admins(text, text, jsonb) from public, anon, authenticated;

-- 6. Direct messages
create or replace function public.push_on_dm() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record; recipient uuid; sender_name text;
begin
  if exists (select 1 from direct_messages d
             where d.conversation_id = new.conversation_id and d.sender_id = new.sender_id
               and d.id <> new.id and d.created_at > now() - interval '1 minute') then
    return new;  -- one alert per burst
  end if;
  select * into c from conversations where id = new.conversation_id;
  recipient := case when c.user_a = new.sender_id then c.user_b else c.user_a end;
  if exists (select 1 from notification_prefs where user_id = recipient and not dms) then return new; end if;
  select full_name into sender_name from profiles where id = new.sender_id;
  perform send_push(array[recipient],
    'New message from ' || coalesce(sender_name, 'a member'),
    case when c.kind in ('listing', 'rental') and c.subject_title is not null
         then 'About: ' || c.subject_title else 'Tap to read it' end,
    jsonb_build_object('type', 'dm', 'conversation_id', new.conversation_id));
  return new;
exception when others then return new;
end $$;
drop trigger if exists push_on_dm on public.direct_messages;
create trigger push_on_dm after insert on public.direct_messages
  for each row execute function public.push_on_dm();

-- 7. Forum posts
create or replace function public.push_on_forum() returns trigger
language plpgsql security definer set search_path = public as $$
declare ch record; who text; recips uuid[];
begin
  if exists (select 1 from forum_messages m
             where m.channel_id = new.channel_id and m.id <> new.id
               and m.created_at > now() - interval '3 minutes') then
    return new;  -- busy channel: only alert at the start of a conversation
  end if;
  select * into ch from forum_channels where id = new.channel_id;
  select full_name into who from profiles where id = new.author_id;
  select array_agg(p.id) into recips
  from profiles p left join notification_prefs np on np.user_id = p.id
  where p.verification_status = 'approved'
    and p.id <> new.author_id
    and coalesce(np.forums, true)
    and (ch.required_rank is null or coalesce(p.is_admin, false) or p.rank::text = ch.required_rank::text)
    and not exists (select 1 from channel_mutes cm where cm.user_id = p.id and cm.channel_id = new.channel_id)
    and not coalesce(p.last_channel_id = new.channel_id
                     and p.last_channel_seen_at > now() - interval '2 minutes', false);
  if recips is null then return new; end if;
  perform send_push(recips, ch.name,
    case when ch.hide_previews then 'New message — open the app to read it'
         else coalesce(who, 'Someone') || ': ' || left(new.body, 140) end,
    jsonb_build_object('type', 'forum', 'channel_id', new.channel_id));
  return new;
exception when others then return new;
end $$;
drop trigger if exists push_on_forum on public.forum_messages;
create trigger push_on_forum after insert on public.forum_messages
  for each row execute function public.push_on_forum();

-- 8. New listings
create or replace function public.push_on_listing() returns trigger
language plpgsql security definer set search_path = public as $$
declare recips uuid[];
begin
  if exists (select 1 from listings l where l.seller_id = new.seller_id and l.id <> new.id
             and l.created_at > now() - interval '10 minutes') then return new; end if;
  select array_agg(p.id) into recips
  from profiles p left join notification_prefs np on np.user_id = p.id
  where p.verification_status = 'approved' and p.id <> new.seller_id and coalesce(np.listings, true);
  if recips is null then return new; end if;
  perform send_push(recips, 'New in Marketplace',
    new.title || coalesce(' · $' || new.price::text, ''),
    jsonb_build_object('type', 'listing', 'id', new.id));
  return new;
exception when others then return new;
end $$;
drop trigger if exists push_on_listing on public.listings;
create trigger push_on_listing after insert on public.listings
  for each row execute function public.push_on_listing();

-- 9. New rentals
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
  perform send_push(recips, 'New vacation rental',
    new.title || coalesce(' · ' || new.location, ''),
    jsonb_build_object('type', 'rental', 'id', new.id));
  return new;
exception when others then return new;
end $$;
drop trigger if exists push_on_rental on public.rentals;
create trigger push_on_rental after insert on public.rentals
  for each row execute function public.push_on_rental();

-- 10. New referrals (off by default)
create or replace function public.push_on_referral() returns trigger
language plpgsql security definer set search_path = public as $$
declare recips uuid[];
begin
  select array_agg(p.id) into recips
  from profiles p left join notification_prefs np on np.user_id = p.id
  where p.verification_status = 'approved' and p.id <> new.referred_by and coalesce(np.referrals, false);
  if recips is null then return new; end if;
  perform send_push(recips, 'New referral',
    new.name || ' · ' || new.trade,
    jsonb_build_object('type', 'referral', 'id', new.id));
  return new;
exception when others then return new;
end $$;
drop trigger if exists push_on_referral on public.contractors;
create trigger push_on_referral after insert on public.contractors
  for each row execute function public.push_on_referral();

-- 11. Admin alerts + "You're approved"
create or replace function public.push_on_new_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform push_admins('New member to approve',
    coalesce(new.full_name, 'Someone') || coalesce(' · ' || new.station, ''),
    jsonb_build_object('type', 'admin'));
  return new;
exception when others then return new;
end $$;
drop trigger if exists push_on_new_member on public.profiles;
create trigger push_on_new_member after insert on public.profiles
  for each row execute function public.push_on_new_member();

create or replace function public.push_on_profile_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.requested_rank is not null and new.requested_rank is distinct from old.requested_rank then
    perform push_admins('Position change request',
      coalesce(new.full_name, 'A member') || ' requested ' || new.requested_rank::text,
      jsonb_build_object('type', 'admin'));
  end if;
  if new.verification_status::text = 'approved' and old.verification_status::text is distinct from 'approved' then
    perform send_push(array[new.id], 'You''re approved! 🎉',
      'Welcome to SoCal FireFamily. Open the app to get started.',
      jsonb_build_object('type', 'approved'));
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists push_on_profile_change on public.profiles;
create trigger push_on_profile_change after update of requested_rank, verification_status on public.profiles
  for each row execute function public.push_on_profile_change();

create or replace function public.push_on_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform push_admins('New report', 'A member reported a ' || replace(new.target_kind::text, '_', ' '),
    jsonb_build_object('type', 'admin'));
  return new;
exception when others then return new;
end $$;
drop trigger if exists push_on_report on public.reports;
create trigger push_on_report after insert on public.reports
  for each row execute function public.push_on_report();