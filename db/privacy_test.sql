begin;
set local role authenticated;
select employee_id from public.profiles limit 1;
rollback;