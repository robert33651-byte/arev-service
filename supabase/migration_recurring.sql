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
           where n.nspname = 'public' and p.proname in ('cash_backfill','cash_start') loop
    execute 'drop function ' || r.sig || ' cascade';
  end loop;
end $$;

create function public.cash_backfill(p_kind text, p_amount int, p_date date, p_purpose text, p_who text default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; e text; c public.config; x public.cash_ledger;
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
  insert into public.cash_ledger(at, kind, amount, staff_name, cashier_id, by_name, purpose, note, status, confirmed_at, backfilled)
  values ((p_date::text || ' 12:00')::timestamp at time zone 'Asia/Yerevan', p_kind, p_amount,
          nullif(left(trim(coalesce(p_who, '')), 100), ''), s.id, s.name, left(trim(p_purpose), 200), 'Внесено задним числом', 'confirmed', now(), true)
  returning * into x;
  perform public._notify(null, true, case when p_kind = 'topup' then 'Приход задним числом: ' else 'Расход задним числом: ' end || p_amount || ' ֏ за ' || to_char(p_date, 'DD.MM'),
                         s.name || ': ' || left(trim(p_purpose), 200) || coalesce(' · ' || x.staff_name, ''), null);
  return to_jsonb(x);
end $$;
revoke all on function public.cash_backfill from public, anon;
grant execute on function public.cash_backfill to authenticated;

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
