create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from push_tokens where token = p_token;
$$;
grant execute on function public.unregister_push_token(text) to anon, authenticated;