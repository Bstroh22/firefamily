select '[' || name || ']' as channel_name, required_rank
from public.forum_channels
order by created_at;

select policyname, cmd
from pg_policies
where tablename = 'forum_channels';

select full_name, rank, requested_rank, verification_status, is_admin
from public.profiles;