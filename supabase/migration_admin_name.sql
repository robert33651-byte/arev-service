-- Имя администратора: вписывается при регистрации в админке и показывается в переписке по задачам.
-- Можно запускать повторно.
alter table public.admins add column if not exists name text;

-- имя автора для журнала задач: сотрудник → имя админа → имя из регистрации → начало e-mail
create or replace function public._actor_name(p_uid uuid) returns text
language sql stable security definer set search_path = public, auth as $$
  select coalesce((select name from public.staff where id = p_uid),
                  (select nullif(trim(name), '') from public.admins where user_id = p_uid),
                  (select nullif(trim(raw_user_meta_data->>'name'), '') from auth.users where id = p_uid),
                  (select split_part(email, '@', 1) from auth.users where id = p_uid),
                  'Система')
$$;
revoke all on function public._actor_name from public, anon, authenticated;

-- админ сам задаёт или меняет своё имя (из админки)
create or replace function public.set_my_admin_name(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if length(trim(coalesce(p_name, ''))) < 2 then return jsonb_build_object('error', 'NEED_NAME'); end if;
  update public.admins set name = trim(p_name) where user_id = auth.uid();
  if not found then return jsonb_build_object('error', 'NOT_ADMIN'); end if;
  -- старые записи в переписке тоже получают новое имя
  update public.task_log set actor_name = trim(p_name) where actor_id = auth.uid() and actor_role = 'admin';
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.set_my_admin_name from public, anon;
grant execute on function public.set_my_admin_name to authenticated;
