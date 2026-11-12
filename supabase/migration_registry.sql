-- Реестр объектов и оборудования, живая карта «где все сейчас», журнал действий администраторов.
-- Запускать после schema.sql и migration_talks.sql. Можно запускать повторно.

-- ======================= 1. Объекты и оборудование =======================
-- places = объекты (клиенты, поставщики, склад). Добавляем карточку клиента.
alter table public.places add column if not exists client_name text;
alter table public.places add column if not exists phone text;
alter table public.places add column if not exists address text;
alter table public.places add column if not exists installed_at date;      -- дата монтажа станции
alter table public.places add column if not exists power_kw numeric;       -- мощность станции, кВт
alter table public.places add column if not exists service_months int;     -- плановое обслуживание раз в N месяцев (пусто — не нужно)

create table if not exists public.equipment(
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  kind text not null default 'other' check (kind in ('panel','inverter','battery','mount','meter','other')),
  model text not null,
  serial text,
  qty int not null default 1,
  installed_at date,
  warranty_until date,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists equipment_place on public.equipment(place_id);
alter table public.equipment enable row level security;

-- связь записей с объектом
alter table public.work_photos add column if not exists place_id uuid references public.places(id) on delete set null;
alter table public.purchases   add column if not exists place_id uuid references public.places(id) on delete set null;
create index if not exists work_photos_place on public.work_photos(place_id);
create index if not exists purchases_place on public.purchases(place_id);
-- разговоры (migration_talks.sql) могут быть ещё не включены — тогда этот блок пропускается
do $$ begin
  if to_regclass('public.talks') is not null then
    alter table public.talks add column if not exists place_id uuid references public.places(id) on delete set null;
    create index if not exists talks_place on public.talks(place_id);
  end if;
end $$;

-- объект по названию (мастер выбирает объект из списка, в запись попадает его название)
create or replace function public._place_by_name(p text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.places where active and lower(trim(name)) = lower(trim(coalesce(p,''))) order by created_at limit 1
$$;
revoke all on function public._place_by_name from public, anon, authenticated;

create or replace function public._link_place() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.place_id is null then
    if tg_table_name = 'purchases' then new.place_id := public._place_by_name(new.site);
    else new.place_id := public._place_by_name(new.object); end if;
  end if;
  return new;
end $$;
drop trigger if exists link_place on public.work_photos;
create trigger link_place before insert on public.work_photos for each row execute function public._link_place();
drop trigger if exists link_place on public.purchases;
create trigger link_place before insert on public.purchases for each row execute function public._link_place();
do $$ begin
  if to_regclass('public.talks') is not null then
    drop trigger if exists link_place on public.talks;
    create trigger link_place before insert on public.talks for each row execute function public._link_place();
  end if;
end $$;

-- старые записи
update public.work_photos set place_id = public._place_by_name(object) where place_id is null and object is not null;
update public.purchases set place_id = public._place_by_name(site) where place_id is null and site is not null;
do $$ begin
  if to_regclass('public.talks') is not null then
    update public.talks set place_id = public._place_by_name(object) where place_id is null and object is not null;
  end if;
end $$;

-- ======================= 2. Живая карта: последняя точка каждого сотрудника =======================
create or replace function public.last_positions()
returns table(staff_id uuid, at timestamptz, lat double precision, lng double precision, acc real, speed real, mocked boolean)
language sql stable security definer set search_path = public as $$
  select distinct on (t.staff_id) t.staff_id, coalesce(t.device_at, t.at), t.lat, t.lng, t.acc, t.speed, t.mocked
  from public.track_points t
  where public.is_admin() and t.at > now() - interval '2 days'
  order by t.staff_id, t.at desc
$$;
revoke all on function public.last_positions from public, anon;
grant execute on function public.last_positions to authenticated;

-- ======================= 3. Журнал действий администраторов =======================
create table if not exists public.admin_log(
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid,
  actor text,                      -- имя администратора на момент действия
  action text not null,            -- insert | update | delete | и действия серверных функций
  tbl text not null,
  row_id text,
  title text,                      -- что это за запись: имя сотрудника, название объекта…
  changes jsonb                    -- что изменилось: {поле: {from, to}}
);
create index if not exists admin_log_at on public.admin_log(at desc);
alter table public.admin_log enable row level security;

-- имя администратора (admins.name → имя из регистрации → e-mail)
create or replace function public._admin_name(p_uid uuid) returns text
language sql stable security definer set search_path = public, auth as $$
  select coalesce((select nullif(trim(name), '') from public.admins where user_id = p_uid),
                  (select nullif(trim(raw_user_meta_data->>'name'), '') from auth.users where id = p_uid),
                  (select email from auth.users where id = p_uid), 'Администратор')
$$;
revoke all on function public._admin_name from public, anon, authenticated;

-- пишется триггерами при изменениях от администратора; запись из серверных функций — через admin_log_write
create or replace function public._admin_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); o jsonb; n jsonb; ch jsonb := '{}'::jsonb; k text; ttl text; rid text;
begin
  if uid is null or not public.is_admin() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then o := to_jsonb(old); n := null; else n := to_jsonb(new); o := case when tg_op = 'UPDATE' then to_jsonb(old) end; end if;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at') and (o->k) is distinct from (n->k) then
        ch := ch || jsonb_build_object(k, jsonb_build_object('from', o->k, 'to', n->k));
      end if;
    end loop;
    if ch = '{}'::jsonb then return new; end if;
  elsif tg_op = 'INSERT' then
    ch := n - 'id' - 'created_at';
  else
    ch := o - 'id';
  end if;
  rid := coalesce(n->>'id', o->>'id');
  ttl := coalesce(n->>'name', o->>'name', n->>'title', o->>'title', n->>'supplier', o->>'supplier', n->>'model', o->>'model', n->>'num', o->>'num', n->>'object', o->>'object');
  insert into public.admin_log(user_id, actor, action, tbl, row_id, title, changes)
  values (uid, public._admin_name(uid), lower(tg_op), tg_table_name, rid, ttl, ch);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['staff','purchases','tasks','config','places','equipment','tickets','talks','fuel','admins'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists admin_audit on public.%I', t);
      execute format('create trigger admin_audit after insert or update or delete on public.%I for each row execute function public._admin_audit()', t);
    end if;
  end loop;
end $$;

-- запись из серверной функции admin-tools (там действует service role, auth.uid() пустой)
create or replace function public.admin_log_write(p_uid uuid, p_action text, p_tbl text, p_row_id text, p_title text, p_changes jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.admin_log(user_id, actor, action, tbl, row_id, title, changes)
  values (p_uid, public._admin_name(p_uid), p_action, p_tbl, p_row_id, p_title, p_changes)
$$;
revoke all on function public.admin_log_write from public, anon, authenticated;

-- ======================= права =======================
do $$ begin
  drop policy if exists equipment_read on public.equipment;
  create policy equipment_read on public.equipment for select to authenticated
    using (public.is_admin() or exists(select 1 from public.staff st where st.id = auth.uid() and st.status = 'approved'));
  drop policy if exists equipment_admin on public.equipment;
  create policy equipment_admin on public.equipment for all to authenticated using (public.is_admin()) with check (public.is_admin());
  drop policy if exists admin_log_read on public.admin_log;
  create policy admin_log_read on public.admin_log for select to authenticated using (public.is_admin());
end $$;
