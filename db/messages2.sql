-- What each conversation is about
alter table public.conversations
  add column if not exists kind text not null default 'direct'
    check (kind in ('direct', 'listing', 'rental')),
  add column if not exists subject_id uuid,
  add column if not exists subject_title text;

-- Allow separate conversations per item (not just one per pair of people)
alter table public.conversations drop constraint if exists conversations_user_a_user_b_key;
create unique index if not exists conversations_unique_subject
  on public.conversations (
    user_a, user_b, kind,
    coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Start (or reopen) a conversation about a specific item, or a direct one
drop function if exists public.start_conversation(uuid);
create or replace function public.start_conversation(
  other uuid,
  conv_kind text default 'direct',
  subject uuid default null,
  title text default null
)
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
  if conv_kind not in ('direct', 'listing', 'rental') then
    raise exception 'Invalid conversation type';
  end if;
  if not exists (select 1 from public.profiles where id = other and verification_status = 'approved') then
    raise exception 'That member is not available';
  end if;

  if me < other then a := me; b := other; else a := other; b := me; end if;

  select c.id into conv
  from public.conversations c
  where c.user_a = a and c.user_b = b
    and c.kind = conv_kind
    and c.subject_id is not distinct from subject;

  if conv is null then
    insert into public.conversations (user_a, user_b, kind, subject_id, subject_title)
    values (a, b, conv_kind, subject, title)
    returning id into conv;
  end if;

  return conv;
end;
$$;

-- Inbox now includes what each conversation is about
drop function if exists public.my_conversations();
create or replace function public.my_conversations()
returns table (
  id uuid,
  other_id uuid,
  other_name text,
  other_station text,
  kind text,
  subject_title text,
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
    c.kind,
    c.subject_title,
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

revoke execute on function public.start_conversation(uuid, text, uuid, text) from public, anon;
revoke execute on function public.my_conversations() from public, anon;
grant execute on function public.start_conversation(uuid, text, uuid, text) to authenticated;
grant execute on function public.my_conversations() to authenticated;