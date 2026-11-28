-- Повторяющиеся задачи (для кассира, бухгалтера и т.п.): шаблон «каждый месяц такого-то числа».
-- Задача сама появляется у исполнителя за несколько дней до срока; исполнитель может перенести срок —
-- директору приходит простое уведомление. В админке такие задачи видны, только когда по ним есть вопрос,
-- они выполнены или просрочены.
-- Запускать после migration_requests.sql. Можно запускать повторно.

create table if not exists public.task_templates(
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  title text not null,
  note text,
  days int[] not null,                 -- числа месяца: {1,10,20}; 29–31 в коротком месяце = последний день
  lead_days int not null default 3 check (lead_days between 0 and 15),  -- за сколько дней до срока показать задачу
  active boolean not null default true
);
alter table public.task_templates enable row level security;
do $$ begin
  drop policy if exists ttpl_admin on public.task_templates;
  create policy ttpl_admin on public.task_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());
  drop policy if exists ttpl_read on public.task_templates;
  create policy ttpl_read on public.task_templates for select to authenticated using (staff_id = auth.uid());
end $$;

alter table public.tasks add column if not exists tpl_id uuid references public.task_templates(id) on delete set null;
alter table public.tasks add column if not exists due_moved_from date;   -- первоначальный срок, если исполнитель перенёс
create index if not exists tasks_tpl on public.tasks(tpl_id, due);

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('tpl_generate','task_move_due') loop
    execute 'drop function ' || r.sig || ' cascade';
  end loop;
end $$;

-- создаёт задачи по шаблонам на этот и следующий месяц, когда до срока осталось не больше lead_days
create function public.tpl_generate() returns int
language plpgsql security definer set search_path = public as $$
declare t record; d int; m date; dd date; n int := 0; tid uuid;
        today date := (now() at time zone 'Asia/Yerevan')::date;
begin
  for t in select tp.* from public.task_templates tp join public.staff s on s.id = tp.staff_id
            where tp.active and s.status = 'approved' loop
    foreach d in array t.days loop
      for m in select generate_series(date_trunc('month', today)::date, (date_trunc('month', today) + interval '1 month')::date, interval '1 month')::date loop
        dd := least(m + (greatest(least(d, 31), 1) - 1), (m + interval '1 month' - interval '1 day')::date);
        if dd >= today and dd - today <= t.lead_days
           and not exists(select 1 from public.tasks x where x.tpl_id = t.id and coalesce(x.due_moved_from, x.due) = dd) then
          insert into public.tasks(staff_id, day, due, title, note, tpl_id)
          values (t.staff_id, dd, dd, t.title, t.note, t.id) returning id into tid;
          perform public._notify(t.staff_id, false, 'Регулярная задача до ' || to_char(dd, 'DD.MM'), t.title, tid);
          n := n + 1;
        end if;
      end loop;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.tpl_generate() from public, anon;
grant execute on function public.tpl_generate() to authenticated;

-- исполнитель переносит срок регулярной задачи (выходной, праздник): директору — простое уведомление
create function public.task_move_due(p_id uuid, p_due date, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; t public.tasks; old date;
        today date := (now() at time zone 'Asia/Yerevan')::date;
begin
  s := public._staff();
  if s.status <> 'approved' then return jsonb_build_object('error', 'NOT_APPROVED'); end if;
  select * into t from public.tasks where id = p_id and (staff_id = s.id or staff2_id = s.id) and status = 'new' for update;
  if t.id is null then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if t.tpl_id is null then return jsonb_build_object('error', 'NOT_RECURRING'); end if;
  if p_due is null or p_due < today or p_due > today + 45 then return jsonb_build_object('error', 'BAD_DATE'); end if;
  old := t.due;
  if old = p_due then return to_jsonb(t); end if;
  update public.tasks set due = p_due, day = p_due, due_moved_from = coalesce(due_moved_from, old), overdue_remind_on = null
   where id = t.id returning * into t;
  perform public._notify(null, true, s.name || ' перенёс(ла) срок: ' || to_char(old, 'DD.MM') || ' → ' || to_char(p_due, 'DD.MM'),
                         t.title || case when coalesce(trim(p_reason), '') <> '' then ' — ' || left(trim(p_reason), 200) else '' end, t.id);
  return to_jsonb(t);
end $$;
revoke all on function public.task_move_due from public, anon;
grant execute on function public.task_move_due to authenticated;

do $$ begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'task-recurring';
    perform cron.schedule('task-recurring', '15 3 * * *', 'select public.tpl_generate()');
  end if;
end $$;

-- ---------- Запуск кассы с прошлой даты ----------
-- config.cash_backfill_from: пока задано, кассир может вносить приход и расход задним числом (не раньше этой даты).
-- Такие записи помечены «Внесено задним числом» и сразу видны директору. Выключить: update config set cash_backfill_from = null.
alter table public.config add column if not exists cash_backfill_from date;
alter table public.cash_ledger add column if not exists backfilled boolean not null default false;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('cash_backfill','cash_start','backfill_decide') loop
    execute 'drop function ' || r.sig || ' cascade';
  end loop;
end $$;

-- запись задним числом сначала ждёт подтверждения директора и только потом попадает в кассу
create table if not exists public.cash_backfill_req(
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  op_date date not null,
  kind text not null check (kind in ('topup','issue')),
  amount int not null check (amount > 0 and amount <= 100000000),
  who text,
  purpose text not null,
  cashier_id uuid references public.staff(id) on delete set null,
  by_name text,
  status text not null default 'wait' check (status in ('wait','ok','no')),
  decided_at timestamptz,
  decided_by text,
  ledger_id uuid
);
alter table public.cash_backfill_req add column if not exists amount_asked int;   -- сколько вписал кассир, если директор изменил сумму
alter table public.cash_backfill_req add column if not exists decide_note text;   -- комментарий директора
alter table public.cash_backfill_req enable row level security;
do $$ begin
  drop policy if exists cbf_read on public.cash_backfill_req;
  create policy cbf_read on public.cash_backfill_req for select to authenticated
    using (public.is_admin() or exists(select 1 from public.staff c where c.id = auth.uid() and c.is_cashier and c.status = 'approved'));
end $$;

create function public.cash_backfill(p_kind text, p_amount int, p_date date, p_purpose text, p_who text default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; e text; c public.config; x public.cash_backfill_req;
        today date := (now() at time zone 'Asia/Yerevan')::date;
begin
  s := public._staff();
  if not s.is_cashier then return jsonb_build_object('error', 'NOT_CASHIER'); end if;
  e := public._cash_guard(s, p_device); if e is not null then return jsonb_build_object('error', e); end if;
  select * into c from public.config where id = 1;
  if c.cash_backfill_from is null then return jsonb_build_object('error', 'BACKFILL_OFF'); end if;
  if p_date is null or p_date < c.cash_backfill_from or p_date > today then return jsonb_build_object('error', 'BAD_DATE'); end if;
  if p_kind not in ('topup','issue') then return jsonb_build_object('error', 'BAD_KIND'); end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then return jsonb_build_object('error', 'BAD_AMOUNT'); end if;
  if coalesce(trim(p_purpose), '') = '' then return jsonb_build_object('error', 'NEED_PURPOSE'); end if;
  insert into public.cash_backfill_req(op_date, kind, amount, who, purpose, cashier_id, by_name)
  values (p_date, p_kind, p_amount, nullif(left(trim(coalesce(p_who, '')), 100), ''), left(trim(p_purpose), 200), s.id, s.name)
  returning * into x;
  perform public._notify(null, true, case when p_kind = 'topup' then 'Подтвердите приход за ' else 'Подтвердите расход за ' end || to_char(p_date, 'DD.MM') || ': ' || p_amount || ' ֏',
                         s.name || ': ' || left(trim(p_purpose), 200) || coalesce(' · ' || x.who, ''), null);
  return to_jsonb(x);
end $$;
revoke all on function public.cash_backfill from public, anon;
grant execute on function public.cash_backfill to authenticated;

create function public.backfill_decide(p_id uuid, p_ok boolean, p_amount int default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x public.cash_backfill_req; l public.cash_ledger; who text; amt int; nt text;
begin
  if not public.is_admin() then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  who := public._actor_name(auth.uid());
  select * into x from public.cash_backfill_req where id = p_id and status = 'wait' for update;
  if x.id is null then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  amt := coalesce(p_amount, x.amount); nt := nullif(left(trim(coalesce(p_note, '')), 300), '');
  if amt <= 0 or amt > 100000000 then return jsonb_build_object('error', 'BAD_AMOUNT'); end if;
  if p_ok then
    insert into public.cash_ledger(at, kind, amount, staff_name, cashier_id, by_name, purpose, note, status, confirmed_at, backfilled)
    values ((x.op_date::text || ' 12:00')::timestamp at time zone 'Asia/Yerevan', x.kind, amt, x.who, x.cashier_id, x.by_name, x.purpose,
            'Внесено задним числом', 'confirmed', now(), true)
    returning * into l;
  end if;
  update public.cash_backfill_req set status = case when p_ok then 'ok' else 'no' end, decided_at = now(), decided_by = who, ledger_id = l.id, decide_note = nt,
         amount_asked = case when p_ok and amt <> amount then amount else amount_asked end, amount = case when p_ok then amt else amount end
   where id = x.id returning * into x;
  if x.cashier_id is not null then
    perform public._notify(x.cashier_id, false, case when p_ok then 'Директор подтвердил запись за ' else 'Директор отклонил запись за ' end || to_char(x.op_date, 'DD.MM'),
                           x.amount || ' ֏ · ' || x.purpose || coalesce(' — ' || nt, ''), null);
  end if;
  return to_jsonb(x);
end $$;
revoke all on function public.backfill_decide from public, anon;
grant execute on function public.backfill_decide to authenticated;

-- Начать кассу заново с даты и остатка. Старые записи не удаляются, а аннулируются (их видно в журнале).
-- Запускается только вручную из SQL-редактора: select public.cash_start('2026-11-24', -120670);
create function public.cash_start(p_date date, p_balance int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.cash_ledger set voided_at = now(), void_reason = 'Касса начата заново с ' || to_char(p_date, 'DD.MM.YYYY'), void_by = 'Система'
   where voided_at is null;
  get diagnostics n = row_count;
  if p_balance <> 0 then
    insert into public.cash_ledger(at, kind, amount, by_name, purpose, note, status, confirmed_at, backfilled)
    values ((p_date::text || ' 00:01')::timestamp at time zone 'Asia/Yerevan', case when p_balance > 0 then 'topup' else 'issue' end, abs(p_balance),
            'Система', 'Начальный остаток на ' || to_char(p_date, 'DD.MM.YYYY'), 'Начальный остаток', 'confirmed', now(), true);
  end if;
  update public.config set cash_backfill_from = p_date where id = 1;
  return jsonb_build_object('voided', n, 'balance', public._cash_bal());
end $$;
revoke all on function public.cash_start from public, anon, authenticated;
