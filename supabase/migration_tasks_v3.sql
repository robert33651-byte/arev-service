-- Задачи v3: закупка и место прямо из задачи + новые напоминания.
-- Запускать после migration_tasks_v2.sql (можно повторно).

-- 1) закупка привязывается к задаче и попадает в обычную историю закупок
alter table public.purchases add column if not exists task_id uuid references public.tasks(id) on delete set null;
create index if not exists purchases_task on public.purchases(task_id);

drop function if exists public.add_purchase(text, jsonb, int, text, double precision, double precision, real, boolean, text, uuid, text, text);
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
