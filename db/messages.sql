-- One conversation per pair of members
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (length(body) > 0),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists direct_messages_conv_time
  on public.direct_messages (conversation_id, created_at desc);

alter table public.conversations enable row level security;
alter table public.direct_messages enable row level security;

-- Is the current user one of the two people in this conversation?
create or replace function public.is_participant(conv uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conv and auth.uid() in (c.user_a, c.user_b)
  );
$$;

-- Security rules: only the two participants
drop policy if exists "Participants see their conversations" on public.conversations;
create policy "Participants see their conversations"
  on public.conversations for select
  using (public.is_verified() and auth.uid() in (user_a, user_b));

drop policy if exists "Participants read messages" on public.direct_messages;
create policy "Participants read messages"
  on public.direct_messages for select
  using (public.is_verified() and public.is_participant(conversation_id));

drop policy if exists "Participants send messages" on public.direct_messages;
create policy "Participants send messages"
  on public.direct_messages for insert
  with check (public.is_verified() and sender_id = auth.uid() and public.is_participant(conversation_id));

drop policy if exists "Senders delete their messages" on public.direct_messages;
create policy "Senders delete their messages"
  on public.direct_messages for delete
  using (sender_id = auth.uid());

-- Keep "last message" time up to date
create or replace function public.bump_conversation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists direct_messages_bump on public.direct_messages;
create trigger direct_messages_bump
  after insert on public.direct_messages
  for each row execute procedure public.bump_conversation();

-- Start (or reopen) a conversation with another approved member
create or replace function public.start_conversation(other uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  a uuid;
  b uuid;
  conv uuid;
begin
  if me is null or not public.is_verified() then
    raise exception 'Not allowed';
  end if;
  if other = me then
    raise exception 'You cannot message yourself';
  end if;
  if not exists (select 1 from public.profiles where id = other and verification_status = 'approved') then
    raise exception 'That member is not available';
  end if;

  if me < other then a := me; b := other; else a := other; b := me; end if;

  insert into public.conversations (user_a, user_b) values (a, b)
    on conflict (user_a, user_b) do nothing;

  select id into conv from public.conversations where user_a = a and user_b = b;
  return conv;
end;
$$;

-- Inbox: my conversations with the other person's name, last message, unread count
create or replace function public.my_conversations()
returns table (
  id uuid,
  other_id uuid,
  other_name text,
  other_station text,
  last_message text,
  last_message_at timestamptz,
  unread int
)
language sql stable security definer set search_path = ''
as $$
  select
    c.id,
    o.id,
    o.full_name,
    o.station,
    (select m.body from public.direct_messages m
       where m.conversation_id = c.id
       order by m.created_at desc limit 1),
    c.last_message_at,
    (select count(*)::int from public.direct_messages m
       where m.conversation_id = c.id
         and m.sender_id <> auth.uid()
         and m.read_at is null)
  from public.conversations c
  join public.profiles o
    on o.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
  where auth.uid() in (c.user_a, c.user_b)
    and exists (select 1 from public.direct_messages m where m.conversation_id = c.id)
  order by c.last_message_at desc;
$$;

-- Total unread messages (for the tab badge)
create or replace function public.my_unread_count()
returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int
  from public.direct_messages m
  join public.conversations c on c.id = m.conversation_id
  where auth.uid() in (c.user_a, c.user_b)
    and m.sender_id <> auth.uid()
    and m.read_at is null;
$$;

-- Mark the other person's messages as read
create or replace function public.mark_conversation_read(conv uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.direct_messages
    set read_at = now()
    where conversation_id = conv
      and sender_id <> auth.uid()
      and read_at is null
      and public.is_participant(conv);
$$;

-- Only signed-in members can use these
revoke execute on function public.is_participant(uuid) from public, anon;
revoke execute on function public.start_conversation(uuid) from public, anon;
revoke execute on function public.my_conversations() from public, anon;
revoke execute on function public.my_unread_count() from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.is_participant(uuid) to authenticated;
grant execute on function public.start_conversation(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.my_unread_count() to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;