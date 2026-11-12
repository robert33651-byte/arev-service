-- Arev Service — ВСЯ база одним файлом. Собран автоматически из schema.sql и миграций (2026-11-12).
-- Supabase → SQL Editor → New query → вставить целиком → Run. Можно запускать повторно, данные не удаляются.
-- Порядок внутри: schema → tasks v2 → tasks geo → tasks v3 → admin name → talks → registry.

-- ===================================================================
-- >>> schema.sql
-- ===================================================================
-- =====================================================================
-- Arev Service — схема базы данных для Supabase
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Файл можно запускать повторно: он ничего не удаляет из ваших данных.
--
-- Принципы защиты:
--  * Сотрудник не может напрямую писать в таблицы. Все действия идут через
--    серверные функции (RPC), которые сами ставят время now() сервера,
--    сами считают расстояния и отказывают при подмене GPS.
--  * Записанное нельзя изменить или удалить со стороны сотрудника.
--  * Сотрудник видит только свои данные. Админ видит всё.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- служебное ----------
create or replace function public.dist_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns integer language sql immutable as $$
  select case when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
  else round(2*6371000*asin(sqrt(power(sin(radians(lat2-lat1)/2),2)
       + cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2))))::int end
$$;

-- ---------- админы ----------
create table if not exists public.admins(
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.admins where user_id = auth.uid())
$$;

-- ---------- настройки (одна строка) ----------
create table if not exists public.config(
  id int primary key default 1 check (id = 1),
  company text not null default 'Arev Service',
  office_lat double precision,
  office_lng double precision,
  office_wifi text,                       -- имя или BSSID офисной сети, по желанию
  office_radius int not null default 150,
  client_radius int not null default 200,
  work_start time not null default '09:00',
  work_end time not null default '18:00',
  grace_min int not null default 10,
  photo_max_age_min int not null default 10,
  max_idle_min int not null default 120,
  route_k numeric not null default 1.3,
  default_norm numeric not null default 9,
  updated_at timestamptz not null default now()
);
insert into public.config(id) values (1) on conflict (id) do nothing;
alter table public.config enable row level security;

-- ---------- сотрудники ----------
create table if not exists public.staff(
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone text not null,
  car_model text,
  car_plate text,
  fuel_type text not null default 'petrol' check (fuel_type in ('petrol','gas','lpg','diesel')),
  norm_claimed numeric,                    -- расход, который указал сотрудник
  norm_approved numeric,                   -- расход, который утвердил админ
  tank numeric,
  card_last4 text,                         -- последние цифры топливной карты
  device_id text,                          -- телефон, к которому привязан сотрудник
  status text not null default 'pending' check (status in ('pending','approved','rejected','blocked')),
  note text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
alter table public.staff enable row level security;

-- ---------- смены ----------
create table if not exists public.shifts(
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  start_at timestamptz not null default now(),
  start_odo int not null,
  start_photo text not null,
  start_lat double precision, start_lng double precision, start_acc real,
  start_dist int, start_wifi_ok boolean, start_device text,
  end_at timestamptz,
  end_odo int,
  end_photo text,
  end_lat double precision, end_lng double precision, end_acc real,
  end_dist int, end_wifi_ok boolean, end_device text,
  route_km numeric
);
create unique index if not exists shifts_one_open on public.shifts(staff_id) where end_at is null;
create index if not exists shifts_staff_time on public.shifts(staff_id, start_at desc);
alter table public.shifts enable row level security;

-- ---------- заправки ----------
create table if not exists public.fuel(
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  at timestamptz not null default now(),
  liters numeric not null check (liters > 0 and liters < 500),
  amount int not null check (amount >= 0),
  photo text not null,
  lat double precision, lng double precision, acc real,
  device text,
  shift_id uuid references public.shifts(id)
);
create index if not exists fuel_staff_time on public.fuel(staff_id, at desc);
alter table public.fuel enable row level security;

-- ---------- заказы ----------
create table if not exists public.tickets(
  id uuid primary key default gen_random_uuid(),
  num text not null default ('AS-' || to_char(now(),'DDMM') || '-' || lpad((floor(random()*900)+100)::text,3,'0')),
  created_at timestamptz not null default now(),
  client_name text not null,
  client_phone text not null,
  address text not null,
  lat double precision, lng double precision,
  category text not null default 'other',
  descr text,
  err_code text,
  urgent boolean not null default false,
  est_min int, est_max int,
  status text not null default 'new' check (status in ('new','assigned','enroute','onsite','done','closed','cancelled')),
  staff_id uuid references public.staff(id),
  assigned_at timestamptz,
  enroute_at timestamptz, enroute_lat double precision, enroute_lng double precision,
  onsite_at timestamptz,  onsite_lat double precision,  onsite_lng double precision,  onsite_dist int,
  done_at timestamptz,    done_lat double precision,    done_lng double precision,    done_dist int,
  price int,
  work text,
  closed_at timestamptz,
  confirmed_by text,                       -- 'client' или 'admin'
  rating int check (rating between 1 and 5),
  review text,
  refusals jsonb not null default '[]'::jsonb
);
create index if not exists tickets_status on public.tickets(status, created_at desc);
create index if not exists tickets_staff on public.tickets(staff_id, created_at desc);
alter table public.tickets enable row level security;

create table if not exists public.ticket_photos(
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  staff_id uuid references public.staff(id),
  kind text not null check (kind in ('client','before','after')),
  path text not null,
  lat double precision, lng double precision,
  at timestamptz not null default now()
);
alter table public.ticket_photos enable row level security;

-- ---------- трек смены (точки из фона) ----------
create table if not exists public.track_points(
  id bigserial primary key,
  staff_id uuid not null references public.staff(id) on delete cascade,
  at timestamptz not null default now(),        -- время сервера
  device_at timestamptz,                        -- время телефона
  lat double precision not null, lng double precision not null,
  acc real, speed real, mocked boolean not null default false
);
create index if not exists track_staff_time on public.track_points(staff_id, at desc);
create index if not exists track_time on public.track_points(at);
alter table public.track_points enable row level security;

-- ---------- подозрительные события (подмена GPS, чужой телефон) ----------
create table if not exists public.alerts(
  id bigserial primary key,
  staff_id uuid references public.staff(id) on delete cascade,
  at timestamptz not null default now(),
  level text not null default 'bad' check (level in ('bad','warn')),
  kind text not null,
  message text not null
);
alter table public.alerts enable row level security;

-- ---------- проверки ИИ и выписка ----------
create table if not exists public.ai_checks(
  photo text primary key,
  kind text not null check (kind in ('odo','receipt','purchase')),
  result jsonb not null,
  at timestamptz not null default now()
);
alter table public.ai_checks enable row level security;

create table if not exists public.card_tx(
  id text primary key,
  at timestamptz not null,
  card text,
  liters numeric not null,
  amount int,
  station text,
  product text,
  imported_at timestamptz not null default now(),
  file text
);
create index if not exists card_tx_at on public.card_tx(at desc);
alter table public.card_tx enable row level security;

-- ---------- закупки товара ----------
create table if not exists public.purchases(
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  created_at timestamptz not null default now(),
  supplier text not null,
  lines jsonb not null default '[]'::jsonb,          -- [{name, qty, unit}]
  amount int not null default 0,
  photo text not null,                                -- накладная или чек
  lat double precision, lng double precision, acc real, device text,
  shift_id uuid references public.shifts(id),
  dest text not null default 'warehouse',            -- куда везёт: warehouse склад, site объект, ticket объект по заказу
  site text,                                          -- объект: клиент или адрес (если без заказа)
  ticket_id uuid references public.tickets(id),                                   -- для какого заказа (если на объект)
  status text not null default 'bought' check (status in ('bought','partial','delivered','accepted','cancelled')),
  delivered_at timestamptz, delivered_photo text,
  delivered_lat double precision, delivered_lng double precision, delivered_dist int,
  used_lines jsonb,                                   -- сколько использовано на объекте (по строкам)
  left_lines jsonb,                                   -- остаток, который надо сдать на склад
  left_at timestamptz, left_photo text, left_lat double precision, left_lng double precision, left_dist int,
  accepted_at timestamptz, accepted_lines jsonb, shortage boolean, accept_note text
);
create index if not exists purchases_staff_time on public.purchases(staff_id, created_at desc);
create index if not exists purchases_status on public.purchases(status, created_at desc);
create index if not exists purchases_ticket on public.purchases(ticket_id);

-- ---------- места: объекты клиентов, поставщики, склад. Стоянки здесь не считаются подозрительными ----------
create table if not exists public.places(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'client' check (kind in ('client','supplier','warehouse','other')),
  lat double precision not null,
  lng double precision not null,
  radius int not null default 200,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.places enable row level security;

-- ---------- задачи на день от руководителя ----------
create table if not exists public.tasks(
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  day date not null default current_date,
  place_id uuid references public.places(id) on delete set null,
  title text not null,
  note text,
  lat double precision, lng double precision,
  ord int not null default 0,
  status text not null default 'new' check (status in ('new','done','cancelled')),
  created_at timestamptz not null default now(),
  done_at timestamptz, done_photo text, done_lat double precision, done_lng double precision, done_dist int, done_note text
);
create index if not exists tasks_staff_day on public.tasks(staff_id, day);
alter table public.tasks enable row level security;

-- ---------- фото проделанных работ (с заказом или без) ----------
create table if not exists public.work_photos(
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  at timestamptz not null default now(),
  path text not null,
  kind text not null default 'other' check (kind in ('before','after','other')),
  object text,                                        -- объект: клиент или адрес
  note text,
  ticket_id uuid references public.tickets(id),
  shift_id uuid references public.shifts(id),
  lat double precision, lng double precision, acc real, device text
);
create index if not exists work_photos_staff_time on public.work_photos(staff_id, at desc);
alter table public.work_photos enable row level security;
alter table public.purchases enable row level security;

-- новые настройки и поля (для баз, созданных прошлой версией схемы)
alter table public.config add column if not exists warehouse_lat double precision;
alter table public.config add column if not exists warehouse_lng double precision;
alter table public.config add column if not exists purchase_max_hours int not null default 24;
alter table public.config add column if not exists long_stop_min int not null default 30;
alter table public.config add column if not exists stop_min int not null default 20;
alter table public.shifts add column if not exists gps_km numeric;
alter table public.purchases add column if not exists site text;
alter table public.purchases add column if not exists source text not null default 'shop';
alter table public.purchases drop constraint if exists purchases_source_check;
alter table public.purchases add constraint purchases_source_check check (source in ('shop','warehouse'));
alter table public.config add column if not exists office_phone text;
alter table public.work_photos add column if not exists taken_at timestamptz;
alter table public.purchases drop constraint if exists purchases_dest_check;
alter table public.purchases add constraint purchases_dest_check check (dest in ('warehouse','site','ticket'));
alter table public.ai_checks drop constraint if exists ai_checks_kind_check;
alter table public.ai_checks add constraint ai_checks_kind_check check (kind in ('odo','receipt','purchase'));

-- =====================================================================
-- Права чтения (RLS). Писать напрямую может только админ.
-- =====================================================================
do $$ begin
  -- config
  drop policy if exists config_read on public.config;
  create policy config_read on public.config for select to authenticated using (true);
  drop policy if exists config_admin on public.config;
  create policy config_admin on public.config for all to authenticated using (public.is_admin()) with check (public.is_admin());
  -- admins
  drop policy if exists admins_read on public.admins;
  create policy admins_read on public.admins for select to authenticated using (user_id = auth.uid() or public.is_admin());
  -- staff
  drop policy if exists staff_read on public.staff;
  create policy staff_read on public.staff for select to authenticated using (id = auth.uid() or public.is_admin());
  drop policy if exists staff_admin on public.staff;
  create policy staff_admin on public.staff for update to authenticated using (public.is_admin()) with check (public.is_admin());
  -- shifts / fuel / track / photos: свои или админ, писать только через функции
  drop policy if exists shifts_read on public.shifts;
  create policy shifts_read on public.shifts for select to authenticated using (staff_id = auth.uid() or public.is_admin());
  drop policy if exists fuel_read on public.fuel;
  create policy fuel_read on public.fuel for select to authenticated using (staff_id = auth.uid() or public.is_admin());
  drop policy if exists track_read on public.track_points;
  create policy track_read on public.track_points for select to authenticated using (staff_id = auth.uid() or public.is_admin());
  drop policy if exists tphotos_read on public.ticket_photos;
  create policy tphotos_read on public.ticket_photos for select to authenticated using (public.is_admin() or exists(select 1 from public.tickets t where t.id = ticket_id and t.staff_id = auth.uid()));
  -- tickets: свои заказы; новые заказы сотрудник получает через get_pool() без телефона клиента
  drop policy if exists tickets_read on public.tickets;
  create policy tickets_read on public.tickets for select to authenticated using (staff_id = auth.uid() or public.is_admin());
  drop policy if exists tickets_admin on public.tickets;
  create policy tickets_admin on public.tickets for all to authenticated using (public.is_admin()) with check (public.is_admin());
  -- только админ
  drop policy if exists tasks_read on public.tasks;
  create policy tasks_read on public.tasks for select to authenticated using (staff_id = auth.uid() or public.is_admin());
  drop policy if exists tasks_admin on public.tasks;
  create policy tasks_admin on public.tasks for all to authenticated using (public.is_admin()) with check (public.is_admin());
  drop policy if exists places_read on public.places;
  create policy places_read on public.places for select to authenticated
    using (public.is_admin() or exists(select 1 from public.staff st where st.id = auth.uid() and st.status = 'approved'));
  drop policy if exists places_admin on public.places;
  create policy places_admin on public.places for all to authenticated using (public.is_admin()) with check (public.is_admin());
  drop policy if exists work_photos_read on public.work_photos;
  create policy work_photos_read on public.work_photos for select to authenticated using (staff_id = auth.uid() or public.is_admin());
  drop policy if exists purchases_read on public.purchases;
  create policy purchases_read on public.purchases for select to authenticated using (staff_id = auth.uid() or public.is_admin());
  drop policy if exists purchases_admin on public.purchases;
  create policy purchases_admin on public.purchases for update to authenticated using (public.is_admin()) with check (public.is_admin());
  drop policy if exists alerts_admin on public.alerts;
  create policy alerts_admin on public.alerts for select to authenticated using (public.is_admin());
  drop policy if exists ai_admin on public.ai_checks;
  create policy ai_admin on public.ai_checks for select to authenticated using (public.is_admin());
  drop policy if exists tx_admin on public.card_tx;
  create policy tx_admin on public.card_tx for all to authenticated using (public.is_admin()) with check (public.is_admin());
end $$;

-- =====================================================================
-- Хранилище фото: сотрудник может только ЗАГРУЗИТЬ в свою папку.
-- Изменить или удалить фото нельзя. Время загрузки ставит сервер.
-- =====================================================================
insert into storage.buckets(id, name, public) values ('photos','photos', false) on conflict (id) do nothing;
do $$ begin  -- не больше 30 МБ на файл
  update storage.buckets set file_size_limit = 31457280 where id = 'photos' and file_size_limit is null;
exception when others then null; end $$;
do $$ begin
  drop policy if exists photos_insert on storage.objects;
  create policy photos_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
  drop policy if exists photos_read on storage.objects;
  create policy photos_read on storage.objects for select to authenticated
    using (bucket_id = 'photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
end $$;

-- =====================================================================
-- Серверные функции для приложения сотрудника
-- =====================================================================

-- пересоздаём функции (их типы могли поменяться между версиями)
do $$ declare f record; begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('_me','_staff','_guard','_check_photo','_check_mock','register','update_car',
             'start_shift','end_shift','add_fuel','add_track','get_pool','take_ticket','refuse_ticket','ticket_step','add_ticket_photo','_route_km','_gps_km','add_purchase','deliver_purchase','add_work_photo','complete_task')
  loop execute 'drop function ' || f.sig; end loop;
end $$;

-- текущий сотрудник; ошибка, если не зарегистрирован или не одобрен
create function public._staff() returns public.staff
language plpgsql security definer set search_path = public as $$
declare s public.staff;
begin
  select * into s from public.staff where id = auth.uid();
  if s.id is null then raise exception 'NOT_REGISTERED'; end if;
  if s.status <> 'approved' then raise exception 'NOT_APPROVED'; end if;
  return s;
end $$;

-- проверка телефона и подмены GPS. Не бросает ошибку, а возвращает её код,
-- чтобы запись о тревоге сохранилась и админ её увидел.
create function public._guard(s public.staff, p_device text, p_mocked boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  -- после сброса привязки админом сотрудник привязывается к телефону при первом действии
  if s.device_id is null and p_device is not null then
    update public.staff set device_id = p_device where id = s.id;
  elsif s.device_id is not null and (p_device is null or s.device_id <> p_device) then
    -- пустой номер телефона тоже отказ: иначе привязку можно обойти, вызвав функцию напрямую
    insert into public.alerts(staff_id, kind, message) values (s.id, 'device', 'Попытка действия с другого телефона');
    return 'OTHER_DEVICE';
  end if;
  if coalesce(p_mocked, false) then
    insert into public.alerts(staff_id, kind, message) values (s.id, 'mock', 'Попытка отметки с подменой местоположения');
    return 'MOCK_LOCATION';
  end if;
  return null;
end $$;

-- проверка, что фото действительно только что загружено этим сотрудником
create function public._check_photo(p_path text) returns text
language plpgsql security definer set search_path = public, storage as $$
declare c timestamptz; lim int;
begin
  select photo_max_age_min into lim from public.config where id = 1;
  select created_at into c from storage.objects
   where bucket_id = 'photos' and name = p_path and owner_id = auth.uid()::text;
  if c is null then return 'PHOTO_NOT_FOUND'; end if;
  if c < now() - make_interval(mins => lim) then return 'PHOTO_TOO_OLD'; end if;
  -- одно фото — одна отметка: одометр, чек заправки и чек закупки нельзя использовать повторно
  if exists(select 1 from public.shifts where start_photo = p_path or end_photo = p_path)
     or exists(select 1 from public.fuel where photo = p_path)
     or exists(select 1 from public.purchases where photo = p_path or delivered_photo = p_path or left_photo = p_path) then
    return 'PHOTO_USED';
  end if;
  return null;
end $$;

-- регистрация (сотрудник сам). Телефон привязывается при первой регистрации.
create function public.register(p_name text, p_phone text, p_car_model text, p_car_plate text,
  p_fuel_type text, p_norm numeric, p_tank numeric, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff;
begin
  if auth.uid() is null then return jsonb_build_object('error','NOT_SIGNED_IN'); end if;
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_phone),'') = '' then return jsonb_build_object('error','NEED_NAME_PHONE'); end if;
  insert into public.staff(id, name, phone, car_model, car_plate, fuel_type, norm_claimed, tank, device_id)
  values (auth.uid(), trim(p_name), trim(p_phone), p_car_model, p_car_plate, coalesce(p_fuel_type,'petrol'), p_norm, p_tank, p_device)
  on conflict (id) do update set name = excluded.name, phone = excluded.phone
  returning * into s;
  return to_jsonb(s);
end $$;

-- изменение машины: новый расход ждёт утверждения админом
create function public.update_car(p_car_model text, p_car_plate text, p_fuel_type text, p_norm numeric, p_tank numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.staff set car_model = p_car_model, car_plate = p_car_plate, fuel_type = coalesce(p_fuel_type, fuel_type),
         norm_claimed = p_norm, tank = p_tank
   where id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

-- км по заказам за смену: офис → клиенты → офис × коэффициент дорог
create function public._route_km(p_staff uuid, p_from timestamptz, p_to timestamptz)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare c public.config; m numeric := 0; plat double precision; plng double precision; t record;
begin
  select * into c from public.config where id = 1;
  plat := c.office_lat; plng := c.office_lng;
  for t in select coalesce(onsite_lat, lat) la, coalesce(onsite_lng, lng) lo from public.tickets
            where staff_id = p_staff and onsite_at between p_from and p_to order by onsite_at loop
    if plat is not null and t.la is not null then m := m + public.dist_m(plat, plng, t.la, t.lo); end if;
    plat := coalesce(t.la, plat); plng := coalesce(t.lo, plng);
  end loop;
  if m > 0 and c.office_lat is not null then m := m + public.dist_m(plat, plng, c.office_lat, c.office_lng); end if;
  return round(m * c.route_k / 1000.0, 1);
end $$;

-- начало смены
create function public.start_shift(p_odo int, p_photo text, p_lat double precision, p_lng double precision,
  p_acc real, p_mocked boolean, p_wifi_ok boolean, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; c public.config; prev int; r public.shifts; e text;
begin
  s := public._staff();
  e := public._guard(s, p_device, p_mocked); if e is not null then return jsonb_build_object('error', e); end if;
  e := public._check_photo(p_photo);        if e is not null then return jsonb_build_object('error', e); end if;
  if coalesce(p_odo,0) <= 0 then return jsonb_build_object('error','NEED_ODO'); end if;
  if exists(select 1 from public.shifts where staff_id = s.id and end_at is null) then return jsonb_build_object('error','SHIFT_ALREADY_OPEN'); end if;
  select * into c from public.config where id = 1;
  select end_odo into prev from public.shifts where staff_id = s.id and end_at is not null order by end_at desc limit 1;
  if prev is not null and p_odo < prev then
    insert into public.alerts(staff_id, kind, message) values (s.id, 'odo', 'Утром одометр ' || p_odo || ' км, а прошлым вечером был ' || prev || ' км');
  end if;
  insert into public.shifts(staff_id, start_odo, start_photo, start_lat, start_lng, start_acc, start_dist, start_wifi_ok, start_device)
  values (s.id, p_odo, p_photo, p_lat, p_lng, p_acc, public.dist_m(p_lat, p_lng, c.office_lat, c.office_lng), p_wifi_ok, p_device)
  returning * into r;
  return to_jsonb(r);
end $$;

-- км по GPS-треку: сумма расстояний между точками; без точек с подменой,
-- неточных (хуже 100 м) и невозможных скачков (быстрее 200 км/ч)
create function public._gps_km(p_staff uuid, p_from timestamptz, p_to timestamptz)
returns numeric language sql stable security definer set search_path = public as $$
  with p as (
    select lat, lng, coalesce(device_at, at) t,
           lag(lat) over w plat, lag(lng) over w plng, lag(coalesce(device_at, at)) over w pt
      from public.track_points
     where staff_id = p_staff and coalesce(device_at, at) between p_from and p_to
       and not mocked and coalesce(acc, 0) <= 100
    window w as (order by coalesce(device_at, at))
  )
  select round(coalesce(sum(d), 0) / 1000.0, 1) from (
    select public.dist_m(plat, plng, lat, lng) d, extract(epoch from t - pt) sec from p where plat is not null
  ) x where sec > 0 and d / sec < 55
$$;

-- конец смены
create function public.end_shift(p_odo int, p_photo text, p_lat double precision, p_lng double precision,
  p_acc real, p_mocked boolean, p_wifi_ok boolean, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; c public.config; r public.shifts; e text;
begin
  s := public._staff();
  e := public._guard(s, p_device, p_mocked); if e is not null then return jsonb_build_object('error', e); end if;
  e := public._check_photo(p_photo);        if e is not null then return jsonb_build_object('error', e); end if;
  select * into r from public.shifts where staff_id = s.id and end_at is null;
  if r.id is null then return jsonb_build_object('error','NO_OPEN_SHIFT'); end if;
  if coalesce(p_odo,0) < r.start_odo then return jsonb_build_object('error','ODO_LESS_THAN_START'); end if;
  if exists(select 1 from public.tickets where staff_id = s.id and status in ('enroute','onsite')) then return jsonb_build_object('error','ACTIVE_ORDER'); end if;
  select * into c from public.config where id = 1;
  update public.shifts set end_at = now(), end_odo = p_odo, end_photo = p_photo, end_lat = p_lat, end_lng = p_lng, end_acc = p_acc,
         end_dist = public.dist_m(p_lat, p_lng, c.office_lat, c.office_lng), end_wifi_ok = p_wifi_ok, end_device = p_device,
         route_km = public._route_km(s.id, r.start_at, now()), gps_km = public._gps_km(s.id, r.start_at, now())
   where id = r.id returning * into r;
  return to_jsonb(r);
end $$;

-- заправка
create function public.add_fuel(p_liters numeric, p_amount int, p_photo text, p_lat double precision,
  p_lng double precision, p_acc real, p_mocked boolean, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; r public.fuel; sh uuid; e text;
begin
  s := public._staff();
  e := public._guard(s, p_device, p_mocked); if e is not null then return jsonb_build_object('error', e); end if;
  e := public._check_photo(p_photo);        if e is not null then return jsonb_build_object('error', e); end if;
  if coalesce(p_liters,0) <= 0 or p_liters >= 500 then return jsonb_build_object('error','NEED_LITERS'); end if;
  select id into sh from public.shifts where staff_id = s.id and end_at is null;
  insert into public.fuel(staff_id, liters, amount, photo, lat, lng, acc, device, shift_id)
  values (s.id, p_liters, coalesce(p_amount,0), p_photo, p_lat, p_lng, p_acc, p_device, sh) returning * into r;
  return to_jsonb(r);
end $$;

-- точки фонового трека (пачкой)
create function public.add_track(p_points jsonb, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; n int := 0; p jsonb; mocked int := 0; tp timestamptz;
begin
  s := public._staff();
  if s.device_id is not null and (p_device is null or s.device_id <> p_device) then return jsonb_build_object('error','OTHER_DEVICE'); end if;
  if jsonb_array_length(coalesce(p_points,'[]'::jsonb)) > 2000 then return jsonb_build_object('error','TOO_MANY_POINTS'); end if;
  for p in select * from jsonb_array_elements(coalesce(p_points,'[]'::jsonb)) loop
    -- время точки с телефона: не из будущего и не старше 3 суток (офлайн-очередь), иначе точка не принимается
    tp := to_timestamp((p->>'t')::double precision / 1000);
    if tp is null or tp > now() + interval '5 minutes' or tp < now() - interval '3 days' then continue; end if;
    insert into public.track_points(staff_id, device_at, lat, lng, acc, speed, mocked)
    values (s.id, tp, (p->>'lat')::double precision, (p->>'lng')::double precision,
            (p->>'acc')::real, (p->>'spd')::real, coalesce((p->>'mock')::boolean, false));
    if coalesce((p->>'mock')::boolean, false) then mocked := mocked + 1; end if;
    n := n + 1;
  end loop;
  if mocked > 0 then
    insert into public.alerts(staff_id, kind, message) values (s.id, 'mock', 'В треке смены ' || mocked || ' точек с подменой местоположения');
  end if;
  -- точки могли дойти уже после конца смены (не было связи) — пересчитываем км по GPS у недавних закрытых смен
  if n > 0 then
    update public.shifts sh set gps_km = public._gps_km(s.id, sh.start_at, sh.end_at)
     where sh.staff_id = s.id and sh.end_at is not null and sh.end_at > now() - interval '3 days';
  end if;
  return jsonb_build_object('ok', true, 'n', n);
end $$;

-- приложение увидело подмену местоположения и не дало сделать отметку — руководитель должен об этом узнать
create or replace function public.report_mock() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.staff;
begin
  s := public._staff();
  if not exists(select 1 from public.alerts where staff_id = s.id and kind = 'mock' and at > now() - interval '10 minutes') then
    insert into public.alerts(staff_id, kind, message) values (s.id, 'mock', 'Попытка отметки с подменой местоположения');
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.report_mock from public, anon;
grant execute on function public.report_mock to authenticated;

-- новые заказы для сотрудника на смене (без имени и телефона клиента)
create function public.get_pool()
returns table(id uuid, num text, created_at timestamptz, address text, lat double precision, lng double precision,
              category text, descr text, err_code text, urgent boolean, est_min int, est_max int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists(select 1 from public.staff st where st.id = auth.uid() and st.status = 'approved') then return; end if;
  if not exists(select 1 from public.shifts sh where sh.staff_id = auth.uid() and sh.end_at is null) then return; end if;
  return query select t.id, t.num, t.created_at, t.address, t.lat, t.lng, t.category, t.descr, t.err_code, t.urgent, t.est_min, t.est_max
    from public.tickets t where t.status = 'new' and t.staff_id is null order by t.urgent desc, t.created_at;
end $$;

-- взять заказ (атомарно: двое не возьмут один)
create function public.take_ticket(p_id uuid, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; r public.tickets; e text;
begin
  s := public._staff();
  e := public._guard(s, p_device, false); if e is not null then return jsonb_build_object('error', e); end if;
  if not exists(select 1 from public.shifts where staff_id = s.id and end_at is null) then return jsonb_build_object('error','NO_OPEN_SHIFT'); end if;
  update public.tickets set staff_id = s.id, status = 'assigned', assigned_at = now()
   where id = p_id and status = 'new' and staff_id is null returning * into r;
  if r.id is null then return jsonb_build_object('error','ALREADY_TAKEN'); end if;
  return to_jsonb(r);
end $$;

create function public.refuse_ticket(p_id uuid, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff;
begin
  s := public._staff();
  update public.tickets set staff_id = null, status = 'new', assigned_at = null,
         refusals = refusals || jsonb_build_array(jsonb_build_object('by', s.id, 'at', now()))
   where id = p_id and staff_id = s.id and status = 'assigned';
  if not found then return jsonb_build_object('error','CANNOT_REFUSE'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- шаги заказа: выехал → на месте → завершил
create function public.ticket_step(p_id uuid, p_step text, p_lat double precision, p_lng double precision,
  p_mocked boolean, p_device text, p_price int default null, p_work text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; r public.tickets; e text;
begin
  s := public._staff();
  e := public._guard(s, p_device, p_mocked); if e is not null then return jsonb_build_object('error', e); end if;
  select * into r from public.tickets where id = p_id and staff_id = s.id;
  if r.id is null then return jsonb_build_object('error','NOT_YOUR_TICKET'); end if;
  if p_step = 'enroute' and r.status = 'assigned' then
    update public.tickets set status = 'enroute', enroute_at = now(), enroute_lat = p_lat, enroute_lng = p_lng where id = p_id returning * into r;
  elsif p_step = 'onsite' and r.status = 'enroute' then
    update public.tickets set status = 'onsite', onsite_at = now(), onsite_lat = p_lat, onsite_lng = p_lng,
           onsite_dist = public.dist_m(p_lat, p_lng, lat, lng) where id = p_id returning * into r;
  elsif p_step = 'done' and r.status = 'onsite' then
    if not exists(select 1 from public.ticket_photos where ticket_id = p_id and kind = 'before')
       or not exists(select 1 from public.ticket_photos where ticket_id = p_id and kind = 'after') then
      return jsonb_build_object('error','NEED_PHOTOS');
    end if;
    if coalesce(p_price,0) <= 0 then return jsonb_build_object('error','NEED_PRICE'); end if;
    if exists(select 1 from public.purchases where ticket_id = p_id and status = 'bought') then
      return jsonb_build_object('error','PURCHASE_NOT_DELIVERED');
    end if;
    update public.tickets set status = 'done', done_at = now(), done_lat = p_lat, done_lng = p_lng,
           done_dist = public.dist_m(p_lat, p_lng, lat, lng), price = p_price, work = p_work where id = p_id returning * into r;
  else
    return jsonb_build_object('error','WRONG_STEP');
  end if;
  return to_jsonb(r);
end $$;

-- фото работ до/после
create function public.add_ticket_photo(p_id uuid, p_kind text, p_path text, p_lat double precision,
  p_lng double precision, p_mocked boolean, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; e text;
begin
  s := public._staff();
  e := public._guard(s, p_device, p_mocked); if e is not null then return jsonb_build_object('error', e); end if;
  e := public._check_photo(p_path);        if e is not null then return jsonb_build_object('error', e); end if;
  if p_kind not in ('before','after') then return jsonb_build_object('error','WRONG_KIND'); end if;
  if not exists(select 1 from public.tickets where id = p_id and staff_id = s.id and status = 'onsite') then return jsonb_build_object('error','NOT_ONSITE'); end if;
  insert into public.ticket_photos(ticket_id, staff_id, kind, path, lat, lng) values (p_id, s.id, p_kind, p_path, p_lat, p_lng);
  return jsonb_build_object('ok', true);
end $$;

-- закупка: что, где и за сколько купил (фото накладной или чека обязательно).
-- p_ticket: если товар везут сразу на объект, указывается заказ (свой и ещё не завершённый).
create function public.add_purchase(p_supplier text, p_lines jsonb, p_amount int, p_photo text, p_lat double precision,
  p_lng double precision, p_acc real, p_mocked boolean, p_device text, p_ticket uuid default null, p_site text default null,
  p_source text default 'shop')
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; r public.purchases; e text; sh uuid; d text; src text;
begin
  s := public._staff();
  e := public._guard(s, p_device, p_mocked); if e is not null then return jsonb_build_object('error', e); end if;
  e := public._check_photo(p_photo);        if e is not null then return jsonb_build_object('error', e); end if;
  src := case when p_source = 'warehouse' then 'warehouse' else 'shop' end;
  if src = 'shop' and coalesce(trim(p_supplier),'') = '' then return jsonb_build_object('error','NEED_SUPPLIER'); end if;
  if src = 'warehouse' and p_ticket is null and coalesce(trim(p_site),'') = '' then return jsonb_build_object('error','NEED_OBJECT'); end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then return jsonb_build_object('error','NEED_LINES'); end if;
  if exists(select 1 from jsonb_array_elements(p_lines) x
             where coalesce(trim(x->>'name'),'') = '' or coalesce((x->>'qty')::numeric, 0) <= 0) then
    return jsonb_build_object('error','NEED_LINES');
  end if;
  if src = 'shop' and coalesce(p_amount,0) <= 0 then return jsonb_build_object('error','NEED_AMOUNT'); end if;
  if p_ticket is not null and not exists(select 1 from public.tickets where id = p_ticket and staff_id = s.id
                                          and status in ('assigned','enroute','onsite')) then
    return jsonb_build_object('error','BAD_TICKET');
  end if;
  d := case when p_ticket is not null then 'ticket' when coalesce(trim(p_site),'') <> '' then 'site' else 'warehouse' end;
  select id into sh from public.shifts where staff_id = s.id and end_at is null;
  insert into public.purchases(staff_id, supplier, lines, amount, photo, lat, lng, acc, device, shift_id, dest, ticket_id, site, source)
  values (s.id, case when src = 'warehouse' then 'Склад' else trim(p_supplier) end, p_lines, coalesce(p_amount,0), p_photo,
          p_lat, p_lng, p_acc, p_device, sh, d, p_ticket, nullif(trim(p_site),''), src)
  returning * into r;
  return to_jsonb(r);
end $$;

-- сдать закупку: фото товара на месте, место проверяется сервером.
-- на склад: расстояние до склада (или офиса).
-- на объект: только когда мастер «на месте» по этому заказу; p_used — сколько использовано
--   по каждой строке; остаток становится обязательством «сдать на склад» (статус partial).
-- остаток (partial): сдаётся на склад тем же вызовом.
create function public.deliver_purchase(p_id uuid, p_photo text, p_lat double precision, p_lng double precision,
  p_acc real, p_mocked boolean, p_device text, p_used jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; c public.config; r public.purchases; t public.tickets; e text;
        used jsonb; lft jsonb; has_left boolean;
begin
  s := public._staff();
  e := public._guard(s, p_device, p_mocked); if e is not null then return jsonb_build_object('error', e); end if;
  e := public._check_photo(p_photo);        if e is not null then return jsonb_build_object('error', e); end if;
  select * into c from public.config where id = 1;
  select * into r from public.purchases where id = p_id and staff_id = s.id for update;
  if r.id is null then return jsonb_build_object('error','CANNOT_DELIVER'); end if;

  if r.status = 'partial' then
    update public.purchases set status = 'delivered', left_at = now(), left_photo = p_photo, left_lat = p_lat, left_lng = p_lng,
           left_dist = public.dist_m(p_lat, p_lng, coalesce(c.warehouse_lat, c.office_lat), coalesce(c.warehouse_lng, c.office_lng))
     where id = r.id returning * into r;
    return to_jsonb(r);
  end if;
  if r.status <> 'bought' then return jsonb_build_object('error','CANNOT_DELIVER'); end if;

  if r.dest = 'warehouse' then
    update public.purchases set status = 'delivered', delivered_at = now(), delivered_photo = p_photo, delivered_lat = p_lat, delivered_lng = p_lng,
           delivered_dist = public.dist_m(p_lat, p_lng, coalesce(c.warehouse_lat, c.office_lat), coalesce(c.warehouse_lng, c.office_lng))
     where id = r.id returning * into r;
    return to_jsonb(r);
  end if;

  if r.dest = 'ticket' then
    select * into t from public.tickets where id = r.ticket_id;
    if t.id is null or t.staff_id is distinct from s.id or t.status <> 'onsite' then
      return jsonb_build_object('error','NOT_ONSITE');
    end if;
  end if;
  -- использовано по строкам; если не передано, считаем, что использовано всё
  if p_used is null then
    used := (select jsonb_agg((x->>'qty')::numeric order by n) from jsonb_array_elements(r.lines) with ordinality a(x, n));
  else
    if jsonb_typeof(p_used) <> 'array' or jsonb_array_length(p_used) <> jsonb_array_length(r.lines) then
      return jsonb_build_object('error','BAD_USED');
    end if;
    if exists(select 1 from jsonb_array_elements(r.lines) with ordinality a(x, n)
               join jsonb_array_elements(p_used) with ordinality b(u, m) on n = m
              where jsonb_typeof(u) <> 'number' or u::text::numeric < 0 or u::text::numeric > (x->>'qty')::numeric) then
      return jsonb_build_object('error','BAD_USED');
    end if;
    used := p_used;
  end if;
  select jsonb_agg(jsonb_build_object('name', x->>'name', 'unit', x->>'unit',
                   'qty', (x->>'qty')::numeric - u::text::numeric) order by n),
         bool_or((x->>'qty')::numeric - u::text::numeric > 0)
    into lft, has_left
    from jsonb_array_elements(r.lines) with ordinality a(x, n)
    join jsonb_array_elements(used) with ordinality b(u, m) on n = m;
  update public.purchases set status = case when has_left then 'partial' else 'delivered' end,
         delivered_at = now(), delivered_photo = p_photo, delivered_lat = p_lat, delivered_lng = p_lng,
         delivered_dist = case when r.dest = 'ticket' then public.dist_m(p_lat, p_lng, t.lat, t.lng) end,
         used_lines = used, left_lines = case when has_left then lft end
   where id = r.id returning * into r;
  return to_jsonb(r);
end $$;

-- фото проделанной работы: камера приложения, место и время пишет сервер
create function public.add_work_photo(p_path text, p_kind text, p_object text, p_note text, p_lat double precision,
  p_lng double precision, p_acc real, p_mocked boolean, p_device text, p_ticket uuid default null, p_taken_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; r public.work_photos; e text; sh uuid; tk timestamptz;
begin
  s := public._staff();
  e := public._guard(s, p_device, p_mocked); if e is not null then return jsonb_build_object('error', e); end if;
  e := public._check_photo(p_path);        if e is not null then return jsonb_build_object('error', e); end if;
  -- снято без интернета: время съёмки с телефона, не старше 48 часов и не из будущего
  tk := least(coalesce(p_taken_at, now()), now());
  if tk < now() - interval '48 hours' then return jsonb_build_object('error','PHOTO_TOO_OLD'); end if;
  select id into sh from public.shifts where staff_id = s.id and start_at <= tk + interval '5 minutes'
     and (end_at is null or end_at >= tk) order by start_at desc limit 1;
  if sh is null then return jsonb_build_object('error','NO_OPEN_SHIFT'); end if;
  if coalesce(trim(p_object),'') = '' and p_ticket is null then return jsonb_build_object('error','NEED_OBJECT'); end if;
  if p_ticket is not null and not exists(select 1 from public.tickets where id = p_ticket and staff_id = s.id) then
    return jsonb_build_object('error','BAD_TICKET');
  end if;
  insert into public.work_photos(staff_id, path, kind, object, note, ticket_id, shift_id, lat, lng, acc, device, taken_at)
  values (s.id, p_path, case when p_kind in ('before','after') then p_kind else 'other' end, nullif(trim(p_object),''),
          nullif(trim(p_note),''), p_ticket, sh, p_lat, p_lng, p_acc, p_device, case when p_taken_at is not null then tk end)
  returning * into r;
  return to_jsonb(r);
end $$;

-- задача выполнена: фото на месте, расстояние до точки задачи считает сервер; фото попадает и в «Фото работ»
create function public.complete_task(p_id uuid, p_photo text, p_lat double precision, p_lng double precision,
  p_acc real, p_mocked boolean, p_device text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; t public.tasks; e text; sh uuid; pname text;
begin
  s := public._staff();
  e := public._guard(s, p_device, p_mocked); if e is not null then return jsonb_build_object('error', e); end if;
  e := public._check_photo(p_photo);        if e is not null then return jsonb_build_object('error', e); end if;
  select id into sh from public.shifts where staff_id = s.id and end_at is null;
  if sh is null then return jsonb_build_object('error','NO_OPEN_SHIFT'); end if;
  select * into t from public.tasks where id = p_id and staff_id = s.id for update;
  if t.id is null or t.status <> 'new' then return jsonb_build_object('error','CANNOT_COMPLETE'); end if;
  select name into pname from public.places where id = t.place_id;
  update public.tasks set status = 'done', done_at = now(), done_photo = p_photo, done_lat = p_lat, done_lng = p_lng,
         done_dist = public.dist_m(p_lat, p_lng, t.lat, t.lng), done_note = nullif(trim(p_note),'')
   where id = t.id returning * into t;
  insert into public.work_photos(staff_id, path, kind, object, note, shift_id, lat, lng, acc, device)
  values (s.id, p_photo, 'after', coalesce(pname, t.title), coalesce(nullif(trim(p_note),''), t.title), sh, p_lat, p_lng, p_acc, p_device);
  return to_jsonb(t);
end $$;

-- права на вызов функций
revoke all on function public.register, public.update_car, public.start_shift, public.end_shift, public.add_fuel,
  public.add_track, public.get_pool, public.take_ticket, public.refuse_ticket, public.ticket_step, public.add_ticket_photo,
  public.add_purchase, public.deliver_purchase, public.add_work_photo, public.complete_task from public, anon;
grant execute on function public.register, public.update_car, public.start_shift, public.end_shift, public.add_fuel,
  public.add_track, public.get_pool, public.take_ticket, public.refuse_ticket, public.ticket_step, public.add_ticket_photo,
  public.add_purchase, public.deliver_purchase, public.add_work_photo, public.complete_task, public.is_admin to authenticated;
revoke all on function public._staff, public._guard, public._check_photo, public._route_km, public._gps_km from public, anon, authenticated;

-- =====================================================================
-- Первый администратор: кнопка «Стать администратором» в админке.
-- Срабатывает только один раз, пока в системе нет ни одного админа,
-- и не срабатывает для аккаунтов сотрудников.
-- =====================================================================
create or replace function public.claim_first_admin() returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare em text;
begin
  if auth.uid() is null then return jsonb_build_object('error','NOT_SIGNED_IN'); end if;
  if exists(select 1 from public.admins) then
    if exists(select 1 from public.admins where user_id = auth.uid()) then return jsonb_build_object('ok', true); end if;
    return jsonb_build_object('error','ADMIN_EXISTS');
  end if;
  select email into em from auth.users where id = auth.uid();
  if em is null or em like '%@staff.arevservice.app' then return jsonb_build_object('error','STAFF_ACCOUNT'); end if;
  -- в работающей системе (есть утверждённые сотрудники) первого админа назначают только через SQL Editor
  if exists(select 1 from public.staff where status = 'approved') then return jsonb_build_object('error','ADMIN_EXISTS'); end if;
  insert into public.admins(user_id) values (auth.uid());
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.claim_first_admin from public, anon;
grant execute on function public.claim_first_admin to authenticated;

-- ===================================================================
-- >>> migration_tasks_v2.sql
-- ===================================================================
-- =====================================================================
-- Arev Service — миграция «Задачи 2.0» (всё из Telegram-бота внутри приложения)
-- Запускать ПОСЛЕ schema.sql: Supabase → SQL Editor → New query → Run.
-- Файл можно запускать повторно. Данные не удаляются, приложение 1.4.0
-- продолжает работать (старые функции и поля не меняются).
--
-- Что добавляется:
--  * staff: push-токен, telegram_id (необязательный канал-дублёр)
--  * tasks: второй исполнитель, срок, приоритет, «прочитано» (👀), статус
--    «report» (Զեկուցվող), обсуждение, архив, напоминания
--  * task_log: единая хронология (события + текст + голос + фото)
--  * notify_queue: очередь уведомлений (push; Telegram — по желанию)
--  * функции: task_seen, task_report, task_post, task_self_add, save_push_token
--  * админ-функции: task_confirm, task_reopen, task_reply, task_close_discussion
--  * триггеры: журнал и уведомления пишутся сами, в том числе при правке из таблицы
--  * почасовое напоминание тем, кто не открыл задачу (pg_cron, если включён)
-- =====================================================================

-- ---------- сотрудники: каналы уведомлений ----------
alter table public.staff add column if not exists push_token text;
alter table public.staff add column if not exists telegram_id bigint;
-- у менеджера обычно нет приложения: уведомления ему идут в Telegram (по желанию) или push, если он вошёл в приложение
alter table public.admins add column if not exists push_token text;
alter table public.admins add column if not exists telegram_id bigint;
alter table public.admins add column if not exists name text;  -- имя менеджера в переписке по задачам

-- ---------- задачи ----------
alter table public.tasks add column if not exists staff2_id uuid references public.staff(id) on delete set null;
alter table public.tasks add column if not exists due date;
alter table public.tasks add column if not exists priority text not null default 'normal';
alter table public.tasks add column if not exists seen_at timestamptz;          -- 👀 исполнитель 1 открыл
alter table public.tasks add column if not exists seen2_at timestamptz;         -- 👀 исполнитель 2 открыл
alter table public.tasks add column if not exists last_remind_at timestamptz;
alter table public.tasks add column if not exists disc_status text not null default 'none';  -- none / open / closed
alter table public.tasks add column if not exists report_at timestamptz;        -- когда сообщили «готово»
alter table public.tasks add column if not exists archived_at timestamptz;
alter table public.tasks add column if not exists created_by uuid;              -- кто поставил (админ или сам сотрудник)
alter table public.tasks add column if not exists self_added boolean not null default false;

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status in ('new','report','done','cancelled'));
alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check check (priority in ('normal','important','urgent'));
alter table public.tasks drop constraint if exists tasks_disc_check;
alter table public.tasks add constraint tasks_disc_check check (disc_status in ('none','open','closed'));

create index if not exists tasks_staff2 on public.tasks(staff2_id) where staff2_id is not null;
create index if not exists tasks_open on public.tasks(status) where archived_at is null;

-- ---------- единая хронология задачи ----------
-- kind: event (системное событие), text, voice, photo
-- code (для event): created, assigned, seen, reported, confirmed, reopened, reminder,
--                   disc_open, disc_closed, status, due_changed, self_added
create table if not exists public.task_log(
  id bigserial primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid,                             -- auth.users id; null = система
  actor_name text not null default 'Система',
  actor_role text not null default 'system' check (actor_role in ('admin','staff','system')),
  kind text not null default 'event' check (kind in ('event','text','voice','photo')),
  code text,
  body text,
  path text                                  -- файл в бакете photos (голос или фото)
);
create index if not exists task_log_task on public.task_log(task_id, at);
alter table public.task_log enable row level security;

-- ---------- очередь уведомлений ----------
-- to_staff = null означает «всем администраторам»
create table if not exists public.notify_queue(
  id bigserial primary key,
  created_at timestamptz not null default now(),
  to_staff uuid references public.staff(id) on delete cascade,
  to_admins boolean not null default false,
  title text not null,
  body text,
  task_id uuid references public.tasks(id) on delete cascade,
  sent_at timestamptz,
  error text
);
create index if not exists notify_pending on public.notify_queue(created_at) where sent_at is null;
alter table public.notify_queue enable row level security;

-- ---------- права чтения (RLS) ----------
do $$ begin
  -- задачи видит основной исполнитель, второй исполнитель и админ
  drop policy if exists tasks_read on public.tasks;
  create policy tasks_read on public.tasks for select to authenticated
    using (staff_id = auth.uid() or staff2_id = auth.uid() or public.is_admin());
  -- хронология: участники задачи и админ; писать напрямую нельзя
  drop policy if exists task_log_read on public.task_log;
  create policy task_log_read on public.task_log for select to authenticated
    using (public.is_admin() or exists(select 1 from public.tasks t
            where t.id = task_id and (t.staff_id = auth.uid() or t.staff2_id = auth.uid())));
  -- очередь видит только админ (отправку делает серверная функция)
  drop policy if exists notify_admin on public.notify_queue;
  create policy notify_admin on public.notify_queue for select to authenticated using (public.is_admin());
end $$;

-- Файлы обсуждения (голос, фото) читают все участники задачи: оба исполнителя и менеджер.
-- Без этого сотрудник не смог бы открыть файл, загруженный менеджером или напарником.
do $$ begin
  drop policy if exists photos_read_tasklog on storage.objects;
  create policy photos_read_tasklog on storage.objects for select to authenticated
    using (bucket_id = 'photos' and exists(
      select 1 from public.task_log l join public.tasks t on t.id = l.task_id
       where l.path = storage.objects.name and (t.staff_id = auth.uid() or t.staff2_id = auth.uid())));
end $$;

-- Админу, как и раньше, разрешены прямые правки tasks (политика tasks_admin).
-- Сотрудник напрямую писать не может: только через функции ниже.

-- =====================================================================
-- Внутренние помощники
-- =====================================================================
do $$ declare f record; begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('_actor_name','_notify','_task_member','_log',
             'task_seen','task_report','task_post','task_self_add','save_push_token',
             'task_confirm','task_reopen','task_reply','task_close_discussion','queue_unseen_reminders','set_admin_telegram','my_tasks',
             '_tasks_audit')
  loop execute 'drop function ' || f.sig || ' cascade'; end loop;
end $$;

-- имя автора для журнала
create function public._actor_name(p_uid uuid) returns text
language sql stable security definer set search_path = public, auth as $$
  select coalesce((select name from public.staff where id = p_uid),
                  (select nullif(trim(name), '') from public.admins where user_id = p_uid),
                  (select nullif(trim(raw_user_meta_data->>'name'), '') from auth.users where id = p_uid),
                  (select split_part(email, '@', 1) from auth.users where id = p_uid),
                  'Система')
$$;

-- запись в очередь уведомлений
create function public._notify(p_staff uuid, p_admins boolean, p_title text, p_body text, p_task uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.notify_queue(to_staff, to_admins, title, body, task_id)
  values (p_staff, p_admins, p_title, p_body, p_task)
$$;

-- запись в хронологию
create function public._log(p_task uuid, p_uid uuid, p_role text, p_kind text, p_code text, p_body text, p_path text)
returns void language sql security definer set search_path = public as $$
  insert into public.task_log(task_id, actor_id, actor_name, actor_role, kind, code, body, path)
  values (p_task, p_uid, case when p_uid is null then 'Система' else public._actor_name(p_uid) end,
          coalesce(p_role, 'system'), p_kind, p_code, p_body, p_path)
$$;

-- является ли текущий сотрудник исполнителем задачи
create function public._task_member(p_id uuid) returns public.tasks
language plpgsql security definer set search_path = public as $$
declare t public.tasks; s public.staff;
begin
  s := public._staff();
  select * into t from public.tasks where id = p_id and (staff_id = s.id or staff2_id = s.id);
  if t.id is null then raise exception 'NOT_YOUR_TASK'; end if;
  return t;
end $$;

-- =====================================================================
-- Триггер: журнал и уведомления пишутся сами (приложение, админка, таблица)
-- =====================================================================
create function public._tasks_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare who uuid := auth.uid(); v_role text := case when public.is_admin() then 'admin' when auth.uid() is null then 'system' else 'staff' end;
        names text; sname text;
begin
  if tg_op = 'INSERT' then
    perform public._log(new.id, coalesce(new.created_by, who), v_role, 'event',
                        case when new.self_added then 'self_added' else 'created' end, new.title, null);
    if new.self_added then
      perform public._notify(null, true, 'Сотрудник добавил себе задачу',
                             public._actor_name(new.staff_id) || ': ' || new.title, new.id);
    else
      perform public._notify(new.staff_id, false, 'Новая задача', new.title, new.id);
      if new.staff2_id is not null then perform public._notify(new.staff2_id, false, 'Новая задача', new.title, new.id); end if;
    end if;
    return new;
  end if;

  -- смена исполнителей
  if new.staff_id is distinct from old.staff_id or new.staff2_id is distinct from old.staff2_id then
    names := public._actor_name(new.staff_id) || case when new.staff2_id is not null then ' + ' || public._actor_name(new.staff2_id) else '' end;
    perform public._log(new.id, who, v_role, 'event', 'assigned', names, null);
    if new.staff_id is distinct from old.staff_id then perform public._notify(new.staff_id, false, 'Вам назначена задача', new.title, new.id); end if;
    if new.staff2_id is not null and new.staff2_id is distinct from old.staff2_id then
      perform public._notify(new.staff2_id, false, 'Вам назначена задача', new.title, new.id);
    end if;
  end if;

  -- смена статуса
  if new.status is distinct from old.status then
    if new.status = 'done' and v_role = 'staff' then
      -- выполнено самим сотрудником по GPS-задаче (старый поток complete_task)
      perform public._log(new.id, who, v_role, 'event', 'done_field', new.status, null);
      perform public._notify(null, true, 'Выполнено на месте ✅', public._actor_name(new.staff_id) || ': ' || new.title, new.id);
    else
      perform public._log(new.id, who, v_role, 'event',
        case new.status when 'report' then 'reported' when 'done' then 'confirmed'
                        when 'new' then 'reopened' else 'status' end, new.status, null);
      if new.status = 'done' then
        perform public._notify(new.staff_id, false, 'Задача принята ✅', new.title, new.id);
        if new.staff2_id is not null then perform public._notify(new.staff2_id, false, 'Задача принята ✅', new.title, new.id); end if;
      elsif new.status = 'new' and old.status in ('report','done') then
        perform public._notify(new.staff_id, false, 'Задача возвращена в работу', new.title, new.id);
        if new.staff2_id is not null then perform public._notify(new.staff2_id, false, 'Задача возвращена в работу', new.title, new.id); end if;
      elsif new.status = 'cancelled' then
        perform public._notify(new.staff_id, false, 'Задача отменена', new.title, new.id);
      end if;
    end if;
  end if;

  -- срок или приоритет
  if (new.due is distinct from old.due or new.priority is distinct from old.priority) and new.status = 'new' then
    perform public._log(new.id, who, v_role, 'event', 'due_changed',
                        coalesce(to_char(new.due, 'DD.MM.YYYY'), 'без срока') || ' · ' || new.priority, null);
    perform public._notify(new.staff_id, false, 'Изменён срок или приоритет', new.title, new.id);
    if new.staff2_id is not null then perform public._notify(new.staff2_id, false, 'Изменён срок или приоритет', new.title, new.id); end if;
  end if;
  return new;
end $$;

drop trigger if exists tasks_audit_ins on public.tasks;
create trigger tasks_audit_ins after insert on public.tasks for each row execute function public._tasks_audit();
drop trigger if exists tasks_audit_upd on public.tasks;
create trigger tasks_audit_upd after update on public.tasks for each row execute function public._tasks_audit();

-- =====================================================================
-- Функции сотрудника
-- =====================================================================

-- 👀 открыл задачу: время фиксируется один раз на каждого исполнителя
create function public.task_seen(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.tasks; s public.staff;
begin
  s := public._staff();
  t := public._task_member(p_id);
  if t.staff_id = s.id and t.seen_at is null then
    update public.tasks set seen_at = now() where id = t.id;
    perform public._log(t.id, s.id, 'staff', 'event', 'seen', null, null);
    perform public._notify(null, true, 'Задачу открыли 👀', s.name || ': ' || t.title, t.id);
  elsif t.staff2_id = s.id and t.seen2_at is null then
    update public.tasks set seen2_at = now() where id = t.id;
    perform public._log(t.id, s.id, 'staff', 'event', 'seen', null, null);
    perform public._notify(null, true, 'Задачу открыли 👀', s.name || ': ' || t.title, t.id);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ✅ готово: одним нажатием, фото и заметка по желанию. Статус «report», ждёт подтверждения менеджера
create function public.task_report(p_id uuid, p_photo text default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.tasks; s public.staff; e text;
begin
  s := public._staff();
  t := public._task_member(p_id);
  if t.status <> 'new' then return jsonb_build_object('error','WRONG_STATUS'); end if;
  if p_photo is not null then
    e := public._check_photo(p_photo); if e is not null then return jsonb_build_object('error', e); end if;
    perform public._log(t.id, s.id, 'staff', 'photo', null, nullif(trim(p_note),''), p_photo);
  elsif nullif(trim(p_note),'') is not null then
    perform public._log(t.id, s.id, 'staff', 'text', null, trim(p_note), null);
  end if;
  update public.tasks set status = 'report', report_at = now(),
         done_photo = coalesce(p_photo, done_photo), done_note = coalesce(nullif(trim(p_note),''), done_note)
   where id = t.id;
  perform public._notify(null, true, 'Сообщили о готовности', s.name || ': ' || t.title, t.id);
  return jsonb_build_object('ok', true);
end $$;

-- 💬 сообщение в обсуждении: текст, голос или фото; первое сообщение открывает обсуждение
create function public.task_post(p_id uuid, p_kind text, p_body text default null, p_path text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.tasks; s public.staff; e text;
begin
  s := public._staff();
  t := public._task_member(p_id);
  if p_kind not in ('text','voice','photo') then return jsonb_build_object('error','WRONG_KIND'); end if;
  if t.status in ('done','cancelled') or t.archived_at is not null then return jsonb_build_object('error','TASK_CLOSED'); end if;
  if p_kind = 'text' and coalesce(trim(p_body),'') = '' then return jsonb_build_object('error','EMPTY'); end if;
  if p_kind <> 'text' then
    if p_path is null then return jsonb_build_object('error','NEED_FILE'); end if;
    e := public._check_photo(p_path); if e is not null then return jsonb_build_object('error', e); end if;
  end if;
  perform public._log(t.id, s.id, 'staff', p_kind, null, nullif(trim(p_body),''), p_path);
  if t.disc_status <> 'open' then
    update public.tasks set disc_status = 'open' where id = t.id;
    perform public._log(t.id, s.id, 'staff', 'event', 'disc_open', null, null);
  end if;
  perform public._notify(null, true, 'Вопрос по задаче 💬', s.name || ': ' || t.title, t.id);
  return jsonb_build_object('ok', true);
end $$;

-- ➕ сотрудник добавляет задачу себе; менеджер получает уведомление
create function public.task_self_add(p_title text, p_note text default null, p_due date default null, p_priority text default 'normal') returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.staff; r public.tasks;
begin
  s := public._staff();
  if coalesce(trim(p_title),'') = '' then return jsonb_build_object('error','NEED_TITLE'); end if;
  insert into public.tasks(staff_id, title, note, due, priority, created_by, self_added)
  values (s.id, trim(p_title), nullif(trim(p_note),''), p_due,
          case when p_priority in ('important','urgent') then p_priority else 'normal' end, s.id, true)
  returning * into r;
  return to_jsonb(r);
end $$;

-- мои задачи с именами исполнителей (сотрудник не видит чужие строки staff, поэтому имена отдаёт функция)
create function public.my_tasks() returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists(select 1 from public.staff st where st.id = auth.uid() and st.status = 'approved') then return; end if;
  return query
    select to_jsonb(t) || jsonb_build_object('name1', s1.name, 'name2', s2.name)
      from public.tasks t
      join public.staff s1 on s1.id = t.staff_id
      left join public.staff s2 on s2.id = t.staff2_id
     where (t.staff_id = auth.uid() or t.staff2_id = auth.uid())
       and t.archived_at is null and t.status in ('new','report')
     order by case t.priority when 'urgent' then 0 when 'important' then 1 else 2 end, t.due nulls last, t.created_at;
end $$;

-- токен push-уведомлений (приложение вызывает при входе)
create function public.save_push_token(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.staff set push_token = p_token where id = auth.uid();
  update public.admins set push_token = p_token where user_id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

-- админ привязывает свой Telegram (узнать id можно у любого бота-«id»); уведомления менеджеру идут туда
create function public.set_admin_telegram(p_telegram_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('error','NOT_ADMIN'); end if;
  update public.admins set telegram_id = p_telegram_id where user_id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- Функции администратора (только is_admin)
-- =====================================================================

-- подтвердить выполнение: задача уходит в архив вместе с хронологией
create function public.task_confirm(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('error','NOT_ADMIN'); end if;
  update public.tasks set status = 'done', done_at = coalesce(done_at, now()), archived_at = now(),
         disc_status = case when disc_status = 'open' then 'closed' else disc_status end
   where id = p_id and status in ('new','report') and archived_at is null;
  if not found then return jsonb_build_object('error','WRONG_STATUS'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- вернуть в работу (например, сделано не так)
create function public.task_reopen(p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('error','NOT_ADMIN'); end if;
  update public.tasks set status = 'new', report_at = null, done_at = null, archived_at = null where id = p_id;
  if not found then return jsonb_build_object('error','NOT_FOUND'); end if;
  if nullif(trim(p_note),'') is not null then
    perform public._log(p_id, auth.uid(), 'admin', 'text', null, trim(p_note), null);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ответ менеджера в обсуждении (текст, голос или фото)
create function public.task_reply(p_id uuid, p_kind text, p_body text default null, p_path text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  if not public.is_admin() then return jsonb_build_object('error','NOT_ADMIN'); end if;
  if p_kind not in ('text','voice','photo') then return jsonb_build_object('error','WRONG_KIND'); end if;
  select * into t from public.tasks where id = p_id;
  if t.id is null then return jsonb_build_object('error','NOT_FOUND'); end if;
  if p_kind = 'text' and coalesce(trim(p_body),'') = '' then return jsonb_build_object('error','EMPTY'); end if;
  if p_kind <> 'text' and p_path is null then return jsonb_build_object('error','NEED_FILE'); end if;
  perform public._log(t.id, auth.uid(), 'admin', p_kind, null, nullif(trim(p_body),''), p_path);
  perform public._notify(t.staff_id, false, 'Ответ менеджера 💬', t.title, t.id);
  if t.staff2_id is not null then perform public._notify(t.staff2_id, false, 'Ответ менеджера 💬', t.title, t.id); end if;
  return jsonb_build_object('ok', true);
end $$;

-- закрыть обсуждение («вопрос решён»): только менеджер
create function public.task_close_discussion(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  if not public.is_admin() then return jsonb_build_object('error','NOT_ADMIN'); end if;
  update public.tasks set disc_status = 'closed' where id = p_id and disc_status = 'open' returning * into t;
  if t.id is null then return jsonb_build_object('error','NO_OPEN_DISCUSSION'); end if;
  perform public._log(t.id, auth.uid(), 'admin', 'event', 'disc_closed', null, null);
  perform public._notify(t.staff_id, false, 'Вопрос решён ✔', t.title, t.id);
  if t.staff2_id is not null then perform public._notify(t.staff2_id, false, 'Вопрос решён ✔', t.title, t.id); end if;
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- Напоминания: через час после назначения и далее каждый час, пока не открыто
-- =====================================================================
create function public.queue_unseen_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare t record; n int := 0; need1 boolean; need2 boolean;
begin
  for t in select * from public.tasks
            where status = 'new' and archived_at is null
              and created_at < now() - interval '1 hour'
              and (last_remind_at is null or last_remind_at < now() - interval '1 hour')
              and (seen_at is null or (staff2_id is not null and seen2_at is null))
  loop
    need1 := t.seen_at is null;
    need2 := t.staff2_id is not null and t.seen2_at is null;
    if need1 then perform public._notify(t.staff_id, false, 'Напоминание: откройте задачу ⏰', t.title, t.id); n := n + 1; end if;
    if need2 then perform public._notify(t.staff2_id, false, 'Напоминание: откройте задачу ⏰', t.title, t.id); n := n + 1; end if;
    perform public._log(t.id, null, 'system', 'event', 'reminder', null, null);
    update public.tasks set last_remind_at = now() where id = t.id;
  end loop;
  return n;
end $$;

-- расписание: раз в час (если расширение pg_cron включено: Database → Extensions → pg_cron)
do $$ begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'task-reminders';
    perform cron.schedule('task-reminders', '0 * * * *', 'select public.queue_unseen_reminders()');
  else
    raise notice 'pg_cron не включён: включите его в Database → Extensions и запустите файл ещё раз';
  end if;
end $$;

-- =====================================================================
-- Архив: завершённые задачи с хронологией (для листа «Արխիվ» и экрана приложения)
-- =====================================================================
create or replace view public.task_archive with (security_invoker = true) as
select t.id, t.title, t.note, t.priority, t.due, t.created_at, t.report_at, t.done_at, t.archived_at,
       public._actor_name(t.staff_id) as assignee, public._actor_name(t.staff2_id) as assignee2,
       (select count(*) from public.task_log l where l.task_id = t.id and l.kind in ('voice','photo')) as media_count,
       (select jsonb_agg(jsonb_build_object('at', l.at, 'who', l.actor_name, 'role', l.actor_role,
                'kind', l.kind, 'code', l.code, 'body', l.body, 'path', l.path) order by l.at)
          from public.task_log l where l.task_id = t.id) as chronology
  from public.tasks t
 where t.archived_at is not null;

-- права на вызов
revoke all on function public.task_seen, public.task_report, public.task_post, public.task_self_add,
  public.save_push_token, public.my_tasks, public.task_confirm, public.task_reopen, public.task_reply,
  public.task_close_discussion, public.set_admin_telegram from public, anon;
grant execute on function public.task_seen, public.task_report, public.task_post, public.task_self_add,
  public.save_push_token, public.my_tasks, public.task_confirm, public.task_reopen, public.task_reply,
  public.task_close_discussion, public.set_admin_telegram to authenticated;
revoke all on function public._actor_name, public._notify, public._log, public._task_member,
  public.queue_unseen_reminders, public._tasks_audit from public, anon, authenticated;

-- ===================================================================
-- >>> migration_tasks_v2_geo.sql
-- ===================================================================
-- «Готово с фото на месте»: фото и геолокация сохраняются для менеджера, задача идёт на проверку (статус report).
-- Запускать после migration_tasks_v2.sql. Можно запускать повторно.
create or replace function public.task_report_geo(p_id uuid, p_photo text, p_lat double precision, p_lng double precision,
  p_acc real, p_mocked boolean, p_device text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; t public.tasks; e text; sh uuid; pname text; d int; tx text;
begin
  s := public._staff();
  t := public._task_member(p_id);
  e := public._guard(s, p_device, p_mocked); if e is not null then return jsonb_build_object('error', e); end if;
  e := public._check_photo(p_photo);        if e is not null then return jsonb_build_object('error', e); end if;
  if t.status <> 'new' then return jsonb_build_object('error','WRONG_STATUS'); end if;
  select id into sh from public.shifts where staff_id = s.id and end_at is null;
  select name into pname from public.places where id = t.place_id;
  d := public.dist_m(p_lat, p_lng, t.lat, t.lng);
  tx := concat_ws(' · ', nullif(trim(p_note),''), case when d is null then '📍 координаты сохранены' else '📍 ' || d || ' м от места' end);
  update public.tasks set status = 'report', report_at = now(), done_photo = p_photo, done_lat = p_lat, done_lng = p_lng,
         done_dist = d, done_note = nullif(trim(p_note),'') where id = t.id;
  perform public._log(t.id, s.id, 'staff', 'photo', null, tx, p_photo);
  insert into public.work_photos(staff_id, path, kind, object, note, shift_id, lat, lng, acc, device)
  values (s.id, p_photo, 'after', coalesce(pname, t.title), coalesce(nullif(trim(p_note),''), t.title), sh, p_lat, p_lng, p_acc, p_device);
  perform public._notify(null, true, 'Сообщили о готовности', s.name || ': ' || t.title || coalesce(' (' || d || ' м от места)', ''), t.id);
  return jsonb_build_object('ok', true, 'dist', d);
end $$;
revoke all on function public.task_report_geo from public, anon;
grant execute on function public.task_report_geo to authenticated;

-- ===================================================================
-- >>> migration_tasks_v3.sql
-- ===================================================================
-- Задачи v3: закупка и место прямо из задачи + новые напоминания.
-- Запускать после migration_tasks_v2.sql (можно повторно).

-- 1) закупка привязывается к задаче и попадает в обычную историю закупок
alter table public.purchases add column if not exists task_id uuid references public.tasks(id) on delete set null;
create index if not exists purchases_task on public.purchases(task_id);

drop function if exists public.add_purchase(text, jsonb, int, text, double precision, double precision, real, boolean, text, uuid, text, text);
drop function if exists public.add_purchase(text, jsonb, int, text, double precision, double precision, real, boolean, text, uuid, text, text, uuid);
create function public.add_purchase(p_supplier text, p_lines jsonb, p_amount int, p_photo text, p_lat double precision,
  p_lng double precision, p_acc real, p_mocked boolean, p_device text, p_ticket uuid default null, p_site text default null,
  p_source text default 'shop', p_task uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; r public.purchases; e text; sh uuid; d text; src text; tk public.tasks; names text;
begin
  s := public._staff();
  e := public._guard(s, p_device, p_mocked); if e is not null then return jsonb_build_object('error', e); end if;
  e := public._check_photo(p_photo);        if e is not null then return jsonb_build_object('error', e); end if;
  src := case when p_source = 'warehouse' then 'warehouse' else 'shop' end;
  if src = 'shop' and coalesce(trim(p_supplier),'') = '' then return jsonb_build_object('error','NEED_SUPPLIER'); end if;
  if src = 'warehouse' and p_ticket is null and coalesce(trim(p_site),'') = '' then return jsonb_build_object('error','NEED_OBJECT'); end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then return jsonb_build_object('error','NEED_LINES'); end if;
  if exists(select 1 from jsonb_array_elements(p_lines) x
             where coalesce(trim(x->>'name'),'') = '' or coalesce((x->>'qty')::numeric, 0) <= 0) then
    return jsonb_build_object('error','NEED_LINES');
  end if;
  if src = 'shop' and coalesce(p_amount,0) <= 0 then return jsonb_build_object('error','NEED_AMOUNT'); end if;
  if p_ticket is not null and not exists(select 1 from public.tickets where id = p_ticket and staff_id = s.id
                                          and status in ('assigned','enroute','onsite')) then
    return jsonb_build_object('error','BAD_TICKET');
  end if;
  if p_task is not null then
    tk := public._task_member(p_task);
    if tk.archived_at is not null then return jsonb_build_object('error','TASK_CLOSED'); end if;
  end if;
  d := case when p_ticket is not null then 'ticket' when coalesce(trim(p_site),'') <> '' then 'site' else 'warehouse' end;
  select id into sh from public.shifts where staff_id = s.id and end_at is null;
  insert into public.purchases(staff_id, supplier, lines, amount, photo, lat, lng, acc, device, shift_id, dest, ticket_id, site, source, task_id)
  values (s.id, case when src = 'warehouse' then 'Склад' else trim(p_supplier) end, p_lines, coalesce(p_amount,0), p_photo,
          p_lat, p_lng, p_acc, p_device, sh, d, p_ticket, nullif(trim(p_site),''), src, p_task)
  returning * into r;
  if p_task is not null then
    select string_agg(x->>'name', ', ') into names from jsonb_array_elements(p_lines) x;
    perform public._log(p_task, s.id, 'staff', 'event', 'purchase',
      case when src = 'warehouse' then 'Со склада: ' else trim(p_supplier) || ' · ' || r.amount || ' ֏ · ' end || left(coalesce(names,''), 120), p_photo);
  end if;
  return to_jsonb(r);
end $$;
revoke all on function public.add_purchase(text, jsonb, int, text, double precision, double precision, real, boolean, text, uuid, text, text, uuid) from public, anon;
grant execute on function public.add_purchase(text, jsonb, int, text, double precision, double precision, real, boolean, text, uuid, text, text, uuid) to authenticated;

-- 2) «Добавить место»: из списка мест или по текущему GPS
create or replace function public.task_set_place(p_id uuid, p_place uuid default null, p_lat double precision default null,
  p_lng double precision default null, p_mocked boolean default false, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; t public.tasks; pl public.places; e text; nm text;
begin
  s := public._staff();
  t := public._task_member(p_id);
  if t.archived_at is not null or t.status not in ('new','report') then return jsonb_build_object('error','TASK_CLOSED'); end if;
  -- место, которое поставил руководитель, сотрудник изменить не может (иначе отметку «на месте» можно сделать где угодно)
  if (t.place_id is not null or t.lat is not null) and not coalesce(t.self_added, false) then
    return jsonb_build_object('error','PLACE_FIXED');
  end if;
  if p_place is not null then
    select * into pl from public.places where id = p_place;
    if pl.id is null then return jsonb_build_object('error','NO_PLACE'); end if;
    update public.tasks set place_id = pl.id, lat = pl.lat, lng = pl.lng where id = t.id;
    nm := pl.name;
  else
    if p_lat is null or p_lng is null then return jsonb_build_object('error','NEED_PLACE'); end if;
    e := public._guard(s, p_device, p_mocked); if e is not null then return jsonb_build_object('error', e); end if;
    update public.tasks set place_id = null, lat = p_lat, lng = p_lng where id = t.id;
    nm := 'по GPS сотрудника';
  end if;
  perform public._log(t.id, s.id, 'staff', 'event', 'place_set', nm, null);
  return jsonb_build_object('ok', true, 'place', nm);
end $$;
revoke all on function public.task_set_place from public, anon;
grant execute on function public.task_set_place to authenticated;

-- 3) Напоминания о неоткрытой задаче: первое через 2 часа, далее каждые 3 часа, только с 09:00 до 20:00 (Ереван).
-- Чтобы изменить: правьте числа ниже (interval '2 hours', '3 hours', часы 9 и 19) и запустите файл ещё раз.
create or replace function public.queue_unseen_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare t record; n int := 0; need1 boolean; need2 boolean; hr int;
begin
  hr := extract(hour from (now() at time zone 'Asia/Yerevan'));
  if hr < 9 or hr > 19 then return 0; end if;
  for t in select * from public.tasks
            where status = 'new' and archived_at is null
              and created_at < now() - interval '2 hours'
              and (last_remind_at is null or last_remind_at < now() - interval '170 minutes')
              and (seen_at is null or (staff2_id is not null and seen2_at is null))
  loop
    need1 := t.seen_at is null;
    need2 := t.staff2_id is not null and t.seen2_at is null;
    if need1 then perform public._notify(t.staff_id, false, 'Напоминание: откройте задачу ⏰', t.title, t.id); n := n + 1; end if;
    if need2 then perform public._notify(t.staff2_id, false, 'Напоминание: откройте задачу ⏰', t.title, t.id); n := n + 1; end if;
    perform public._log(t.id, null, 'system', 'event', 'reminder', null, null);
    update public.tasks set last_remind_at = now() where id = t.id;
  end loop;
  return n;
end $$;

-- 4) Просроченная, но открытая и не выполненная задача: одно напоминание в день, в 09:00 по Еревану (05:00 UTC).
alter table public.tasks add column if not exists overdue_remind_on date;
create or replace function public.queue_overdue_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare t record; n int := 0; today date := (now() at time zone 'Asia/Yerevan')::date;
begin
  for t in select * from public.tasks
            where status = 'new' and archived_at is null and due is not null and due < today
              and seen_at is not null
              and (overdue_remind_on is null or overdue_remind_on < today)
  loop
    perform public._notify(t.staff_id, false, 'Задача просрочена ⏰', t.title || ' (срок ' || to_char(t.due, 'DD.MM') || ')', t.id);
    if t.staff2_id is not null then
      perform public._notify(t.staff2_id, false, 'Задача просрочена ⏰', t.title || ' (срок ' || to_char(t.due, 'DD.MM') || ')', t.id);
    end if;
    perform public._log(t.id, null, 'system', 'event', 'overdue', to_char(t.due, 'DD.MM'), null);
    update public.tasks set overdue_remind_on = today where id = t.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.queue_overdue_reminders() from public, anon, authenticated;
do $$ begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'task-overdue';
    perform cron.schedule('task-overdue', '0 5 * * *', 'select public.queue_overdue_reminders()');
  end if;
end $$;

-- ===================================================================
-- >>> migration_admin_name.sql
-- ===================================================================
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

-- ===================================================================
-- >>> migration_talks.sql
-- ===================================================================
-- Записи разговоров с клиентами и ИИ-отчёт по ним.
-- Запускать после schema.sql. Можно запускать повторно.

create table if not exists public.talks(
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  at timestamptz not null default now(),
  path text not null,                                 -- аудио в хранилище photos
  duration_s int,
  object text,                                        -- объект: клиент или адрес
  consent boolean not null default false,             -- работник отметил: клиент предупреждён и согласен
  lat double precision, lng double precision, acc real, device text,
  shift_id uuid references public.shifts(id),
  status text not null default 'new' check (status in ('new','processing','done','error')),
  error text,
  processed_at timestamptz
);
create index if not exists talks_staff_time on public.talks(staff_id, at desc);
alter table public.talks enable row level security;

-- результат ИИ видит только руководитель (флаги и выводы работнику не показываются)
create table if not exists public.talk_ai(
  talk_id uuid primary key references public.talks(id) on delete cascade,
  transcript text,                                    -- что сказано, на армянском
  transcript_ru text,                                 -- перевод на русский
  summary jsonb,                                      -- краткий отчёт
  flags jsonb not null default '[]'::jsonb,           -- [{level: bad|warn, text}]
  mood text,                                          -- positive | neutral | negative
  model text,
  at timestamptz not null default now()
);
alter table public.talk_ai enable row level security;

do $$ begin
  drop policy if exists talks_read on public.talks;
  create policy talks_read on public.talks for select to authenticated using (staff_id = auth.uid() or public.is_admin());
  drop policy if exists talks_admin on public.talks;
  create policy talks_admin on public.talks for update to authenticated using (public.is_admin()) with check (public.is_admin());
  drop policy if exists talk_ai_admin on public.talk_ai;
  create policy talk_ai_admin on public.talk_ai for select to authenticated using (public.is_admin());
end $$;

-- сохранить запись разговора (аудио уже загружено в хранилище)
drop function if exists public.add_talk(text, text, int, boolean, double precision, double precision, real, boolean, text);
create function public.add_talk(p_path text, p_object text, p_duration int, p_consent boolean,
  p_lat double precision, p_lng double precision, p_acc real, p_mocked boolean, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; r public.talks; e text; sh uuid;
begin
  s := public._staff();
  e := public._guard(s, p_device, p_mocked); if e is not null then return jsonb_build_object('error', e); end if;
  e := public._check_photo(p_path);        if e is not null then return jsonb_build_object('error', e); end if;
  if not coalesce(p_consent, false) then return jsonb_build_object('error','NEED_CONSENT'); end if;
  if coalesce(trim(p_object),'') = '' then return jsonb_build_object('error','NEED_OBJECT'); end if;
  if coalesce(p_duration, 0) < 3 then return jsonb_build_object('error','TOO_SHORT'); end if;
  select id into sh from public.shifts where staff_id = s.id and end_at is null;
  if sh is null then return jsonb_build_object('error','NO_OPEN_SHIFT'); end if;
  insert into public.talks(staff_id, path, duration_s, object, consent, lat, lng, acc, device, shift_id)
  values (s.id, p_path, p_duration, trim(p_object), true, p_lat, p_lng, p_acc, p_device, sh)
  returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.add_talk from public, anon;
grant execute on function public.add_talk to authenticated;

-- связь с объектом (если реестр объектов, migration_registry.sql, уже включён)
alter table public.talks add column if not exists place_id uuid references public.places(id) on delete set null;
create index if not exists talks_place on public.talks(place_id);
do $$ begin
  if to_regproc('public._link_place') is not null then
    drop trigger if exists link_place on public.talks;
    create trigger link_place before insert on public.talks for each row execute function public._link_place();
  end if;
end $$;

-- ===================================================================
-- >>> migration_registry.sql
-- ===================================================================
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
