-- Касса: наличные выдаёт один кассир, получатель подтверждает в приложении, директор видит всё в админке.
-- Запускать после schema.sql и migration_tasks_v2.sql. Можно запускать повторно, данные не удаляются.
--  * staff.is_cashier — галочка «Кассир» (ставит администратор в карточке сотрудника)
--  * cash_ledger — журнал: пополнения кассы (topup) и выдачи сотрудникам (issue). Удалять и править нельзя:
--    ошибка исправляется отменой (voided_at), запись остаётся в журнале
--  * остаток = пополнения − выдачи (без отменённых); только драмы

alter table public.staff add column if not exists is_cashier boolean not null default false;
-- вход с компьютера (веб-страница кассы): разрешает администратор в карточке сотрудника
alter table public.staff add column if not exists web_access boolean not null default false;
alter table public.config add column if not exists cash_purposes jsonb not null default
  '["Закупка материалов","Командировка","Топливо","Зарплата / аванс","Прочее"]'::jsonb;
alter table public.config add column if not exists cash_confirm_hours int not null default 24;

create table if not exists public.cash_ledger(
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  kind text not null check (kind in ('topup','issue')),
  amount int not null check (amount > 0 and amount <= 100000000),
  staff_id uuid references public.staff(id) on delete set null,     -- получатель (у пополнения пусто)
  staff_name text,                                                    -- имя получателя на момент выдачи
  cashier_id uuid references public.staff(id) on delete set null,
  by_name text,                                                       -- кто внёс запись: кассир или администратор
  purpose text,
  note text,
  task_id uuid references public.tasks(id) on delete set null,
  status text not null default 'confirmed' check (status in ('pending','confirmed','disputed')),
  confirmed_at timestamptz,
  confirmed_by_admin boolean not null default false,
  dispute_note text,
  voided_at timestamptz,
  void_reason text,
  void_by text
);
create index if not exists cash_at on public.cash_ledger(at desc);
create index if not exists cash_staff on public.cash_ledger(staff_id, at desc);
create index if not exists cash_pending on public.cash_ledger(at) where status = 'pending' and voided_at is null;
alter table public.cash_ledger enable row level security;

-- читать: администратор и кассир — всё, получатель — свои выдачи. Писать напрямую нельзя: только функции ниже.
do $$ begin
  drop policy if exists cash_read on public.cash_ledger;
  create policy cash_read on public.cash_ledger for select to authenticated
    using (public.is_admin()
           or staff_id = auth.uid()
           or exists(select 1 from public.staff c where c.id = auth.uid() and c.is_cashier and c.status = 'approved'));
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('cash_issue','cash_confirm','cash_void','cash_admin_confirm','cash_topup','cash_balance','cash_people','_cash_bal','_cash_guard')
  loop execute 'drop function ' || f.sig || ' cascade'; end loop;
end $$;

-- проверка телефона для операций кассы; 'web' — вход с компьютера, только если разрешён администратором
create function public._cash_guard(s public.staff, p_device text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if p_device = 'web' then
    if s.web_access then return null; end if;
    return 'WEB_NOT_ALLOWED';
  end if;
  return public._guard(s, p_device, false);
end $$;

-- остаток кассы
create function public._cash_bal() returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when kind = 'topup' then amount else -amount end), 0)
    from public.cash_ledger where voided_at is null
$$;

-- остаток видят кассир и администратор
create function public.cash_balance() returns bigint
language plpgsql stable security definer set search_path = public as $$
declare s public.staff;
begin
  if not public.is_admin() then
    select * into s from public.staff where id = auth.uid();
    if s.id is null or s.status <> 'approved' or not s.is_cashier then raise exception 'NOT_CASHIER'; end if;
  end if;
  return public._cash_bal();
end $$;

-- список сотрудников для выбора получателя
create function public.cash_people() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.staff;
begin
  if not public.is_admin() then
    select * into s from public.staff where id = auth.uid();
    if s.id is null or s.status <> 'approved' or not s.is_cashier then raise exception 'NOT_CASHIER'; end if;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name)
                     from public.staff where status = 'approved' and id is distinct from auth.uid()), '[]'::jsonb);
end $$;

-- выдача наличных: только кассир
create function public.cash_issue(p_staff uuid, p_amount int, p_purpose text, p_note text, p_task uuid, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; r public.staff; e text; row public.cash_ledger; bal bigint;
begin
  s := public._staff();
  if not s.is_cashier then return jsonb_build_object('error', 'NOT_CASHIER'); end if;
  e := public._cash_guard(s, p_device); if e is not null then return jsonb_build_object('error', e); end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then return jsonb_build_object('error', 'BAD_AMOUNT'); end if;
  if coalesce(trim(p_purpose), '') = '' then return jsonb_build_object('error', 'NEED_PURPOSE'); end if;
  bal := public._cash_bal();
  if p_staff is null then
    -- расход на нужды офиса: получателя нет, подтверждать некому, запись сразу считается выданной
    insert into public.cash_ledger(kind, amount, staff_id, staff_name, cashier_id, by_name, purpose, note, task_id, status, confirmed_at)
    values ('issue', p_amount, null, 'Офис', s.id, s.name, left(trim(p_purpose), 200), nullif(left(trim(coalesce(p_note, '')), 300), ''), p_task, 'confirmed', now())
    returning * into row;
    if p_amount > bal then
      insert into public.alerts(staff_id, level, kind, message)
      values (s.id, 'warn', 'cash', 'Выдача ' || p_amount || ' ֏ больше остатка кассы (' || bal || ' ֏). Пополнение кассы не внесено?');
    end if;
    return to_jsonb(row);
  end if;
  select * into r from public.staff where id = p_staff and status = 'approved';
  if r.id is null or r.id = s.id then return jsonb_build_object('error', 'BAD_RECIPIENT'); end if;
  insert into public.cash_ledger(kind, amount, staff_id, staff_name, cashier_id, by_name, purpose, note, task_id, status)
  values ('issue', p_amount, r.id, r.name, s.id, s.name, left(trim(p_purpose), 200), nullif(left(trim(coalesce(p_note, '')), 300), ''), p_task, 'pending')
  returning * into row;
  if p_amount > bal then
    insert into public.alerts(staff_id, level, kind, message)
    values (s.id, 'warn', 'cash', 'Выдача ' || p_amount || ' ֏ больше остатка кассы (' || bal || ' ֏). Пополнение кассы не внесено?');
  end if;
  perform public._notify(r.id, false, 'Вам выдали ' || p_amount || ' ֏', 'Касса: ' || left(trim(p_purpose), 200) || '. Подтвердите получение в приложении.', null);
  return to_jsonb(row);
end $$;

-- получатель подтверждает или оспаривает выдачу
create function public.cash_confirm(p_id uuid, p_ok boolean, p_note text, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; e text; row public.cash_ledger;
begin
  s := public._staff();
  e := public._cash_guard(s, p_device); if e is not null then return jsonb_build_object('error', e); end if;
  select * into row from public.cash_ledger
   where id = p_id and kind = 'issue' and staff_id = s.id and status = 'pending' and voided_at is null for update;
  if row.id is null then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if coalesce(p_ok, false) then
    update public.cash_ledger set status = 'confirmed', confirmed_at = now() where id = row.id returning * into row;
  else
    if coalesce(trim(p_note), '') = '' then return jsonb_build_object('error', 'NEED_NOTE'); end if;
    update public.cash_ledger set status = 'disputed', confirmed_at = now(), dispute_note = left(trim(p_note), 300)
     where id = row.id returning * into row;
    insert into public.alerts(staff_id, level, kind, message)
    values (s.id, 'bad', 'cash', 'Не подтвердил(а) получение ' || row.amount || ' ֏ (' || coalesce(row.purpose, '') || '): ' || row.dispute_note);
    perform public._notify(null, true, s.name || ': выдача ' || row.amount || ' ֏ оспорена', row.dispute_note, null);
    if row.cashier_id is not null then
      perform public._notify(row.cashier_id, false, s.name || ' не подтвердил(а) ' || row.amount || ' ֏', row.dispute_note, null);
    end if;
  end if;
  return to_jsonb(row);
end $$;

-- отмена выдачи: кассир — только свою неподтверждённую, администратор — любую
create function public.cash_void(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; row public.cash_ledger; adm boolean; who text;
begin
  if coalesce(trim(p_reason), '') = '' then return jsonb_build_object('error', 'NEED_NOTE'); end if;
  adm := public.is_admin();
  if adm then who := public._actor_name(auth.uid());
  else
    s := public._staff();
    if not s.is_cashier then return jsonb_build_object('error', 'NOT_CASHIER'); end if;
    who := s.name;
  end if;
  select * into row from public.cash_ledger where id = p_id and voided_at is null for update;
  if row.id is null then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if not adm and not (row.kind = 'issue' and row.cashier_id = s.id and (row.status = 'pending' or row.staff_id is null)) then
    return jsonb_build_object('error', 'CANNOT_VOID');
  end if;
  update public.cash_ledger set voided_at = now(), void_reason = left(trim(p_reason), 300), void_by = who
   where id = row.id returning * into row;
  if row.kind = 'issue' and row.staff_id is not null then
    perform public._notify(row.staff_id, false, 'Выдача ' || row.amount || ' ֏ отменена', row.void_reason, null);
  end if;
  return to_jsonb(row);
end $$;

-- администратор подтверждает выдачу за сотрудника (не обновил приложение) или закрывает спор
create function public.cash_admin_confirm(p_id uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare row public.cash_ledger;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  update public.cash_ledger set status = 'confirmed', confirmed_at = now(), confirmed_by_admin = true,
         dispute_note = case when nullif(trim(coalesce(p_note, '')), '') is null then dispute_note
                             else coalesce(dispute_note || ' → ', '') || 'админ: ' || left(trim(p_note), 200) end
   where id = p_id and kind = 'issue' and voided_at is null and status <> 'confirmed' returning * into row;
  if row.id is null then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  return to_jsonb(row);
end $$;

-- пополнение кассы: только администратор
create function public.cash_topup(p_amount int, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare row public.cash_ledger;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then return jsonb_build_object('error', 'BAD_AMOUNT'); end if;
  insert into public.cash_ledger(kind, amount, by_name, purpose, note, status, confirmed_at)
  values ('topup', p_amount, public._actor_name(auth.uid()), 'Пополнение кассы', nullif(left(trim(coalesce(p_note, '')), 300), ''), 'confirmed', now())
  returning * into row;
  return to_jsonb(row);
end $$;

revoke all on function public.cash_balance, public.cash_people, public.cash_issue, public.cash_confirm, public.cash_void,
  public.cash_admin_confirm, public.cash_topup, public._cash_bal, public._cash_guard from public, anon;
grant execute on function public.cash_balance, public.cash_people, public.cash_issue, public.cash_confirm, public.cash_void,
  public.cash_admin_confirm, public.cash_topup to authenticated;

-- отметка прихода/ухода офисного сотрудника с компьютера: без фото, без одометра, без геолокации
do $$ declare f record; begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'web_shift'
  loop execute 'drop function ' || f.sig || ' cascade'; end loop;
end $$;
create function public.web_shift(p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; r public.shifts;
begin
  s := public._staff();
  if s.kind <> 'office' then return jsonb_build_object('error', 'NOT_OFFICE'); end if;
  if not s.web_access then return jsonb_build_object('error', 'WEB_NOT_ALLOWED'); end if;
  if p_action = 'in' then
    if exists(select 1 from public.shifts where staff_id = s.id and end_at is null) then return jsonb_build_object('error', 'SHIFT_ALREADY_OPEN'); end if;
    insert into public.shifts(staff_id, start_device) values (s.id, 'web') returning * into r;
  elsif p_action = 'out' then
    update public.shifts set end_at = now(), end_device = 'web' where staff_id = s.id and end_at is null returning * into r;
    if r.id is null then return jsonb_build_object('error', 'NO_OPEN_SHIFT'); end if;
  else
    return jsonb_build_object('error', 'BAD_ACTION');
  end if;
  return to_jsonb(r);
end $$;
revoke all on function public.web_shift from public, anon;
grant execute on function public.web_shift to authenticated;
