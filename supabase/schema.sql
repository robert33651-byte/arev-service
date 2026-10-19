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
  kind text not null check (kind in ('odo','receipt')),
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
             'start_shift','end_shift','add_fuel','add_track','get_pool','take_ticket','refuse_ticket','ticket_step','add_ticket_photo','_route_km')
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
  elsif s.device_id is not null and p_device is not null and s.device_id <> p_device then
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
         route_km = public._route_km(s.id, r.start_at, now())
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
declare s public.staff; n int := 0; p jsonb; mocked int := 0;
begin
  s := public._staff();
  if s.device_id is not null and p_device is not null and s.device_id <> p_device then return jsonb_build_object('error','OTHER_DEVICE'); end if;
  for p in select * from jsonb_array_elements(coalesce(p_points,'[]'::jsonb)) loop
    insert into public.track_points(staff_id, device_at, lat, lng, acc, speed, mocked)
    values (s.id, to_timestamp((p->>'t')::double precision / 1000), (p->>'lat')::double precision, (p->>'lng')::double precision,
            (p->>'acc')::real, (p->>'spd')::real, coalesce((p->>'mock')::boolean, false));
    if coalesce((p->>'mock')::boolean, false) then mocked := mocked + 1; end if;
    n := n + 1;
  end loop;
  if mocked > 0 then
    insert into public.alerts(staff_id, kind, message) values (s.id, 'mock', 'В треке смены ' || mocked || ' точек с подменой местоположения');
  end if;
  return jsonb_build_object('ok', true, 'n', n);
end $$;

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

-- права на вызов функций
revoke all on function public.register, public.update_car, public.start_shift, public.end_shift, public.add_fuel,
  public.add_track, public.get_pool, public.take_ticket, public.refuse_ticket, public.ticket_step, public.add_ticket_photo from public, anon;
grant execute on function public.register, public.update_car, public.start_shift, public.end_shift, public.add_fuel,
  public.add_track, public.get_pool, public.take_ticket, public.refuse_ticket, public.ticket_step, public.add_ticket_photo, public.is_admin to authenticated;
revoke all on function public._staff, public._guard, public._check_photo, public._route_km from public, anon, authenticated;

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
  if em like '%@staff.arevservice.app' then return jsonb_build_object('error','STAFF_ACCOUNT'); end if;
  insert into public.admins(user_id) values (auth.uid());
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.claim_first_admin from public, anon;
grant execute on function public.claim_first_admin to authenticated;
