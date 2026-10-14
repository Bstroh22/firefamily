insert into public.forum_channels (name, description, required_rank) values
  ('Training', 'Classes, drills, and certifications', null),
  ('Off Duty', 'Hobbies, sports, and life outside the station', null);

select name as channel, required_rank from public.forum_channels order by created_at;