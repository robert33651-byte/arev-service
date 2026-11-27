-- Запросы денег: работник просит → кассир передаёт директору со своим комментарием → директор одобряет / отклоняет / «ждать»
-- (может изменить сумму) → кассир выдаёт наличные (обычная запись кассы, работник подтверждает получение).
-- Директор может и сам создать выдачу для сотрудника (с комментарием или голосовым).
-- Запускать после migration_cash.sql. Можно запускать повторно, данные не удаляются.
--  * cash_requests — сами запросы; удалять нельзя, только менять статус
--  * cash_request_log — переписка и события по запросу (текст, голос)
--  * архив: у работника основной список — текущий месяц, старые запросы остаются в архиве (отбор по дате)
--  * напоминание директору каждый час, пока запрос не решён (pg_cron); кассиру — пока одобренное не выдано

create table if not exists public.cash_requests(
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  requester_id uuid references public.staff(id) on delete set null,   -- кому нужны деньги
  requester_name text not null,
  origin text not null default 'worker' check (origin in ('worker','boss')),
  amount_asked int not null check (amount_asked > 0 and amount_asked <= 100000000),
  amount_approved int check (amount_approved > 0 and amount_approved <= 100000000),
  purpose text not null,
  status text not null default 'new' check (status in ('new','forwarded','waiting','approved','rejected','paid','cancelled')),
  forwarded_at timestamptz,
  decided_at timestamptz,
  decided_by text,
  paid_at timestamptz,
  issue_id uuid references public.cash_ledger(id) on delete set null,
  last_reminded_at timestamptz
);
create index if not exists cash_requests_created on public.cash_requests(created_at desc);
create index if not exists cash_requests_who on public.cash_requests(requester_id, created_at desc);
create index if not exists cash_requests_open on public.cash_requests(status) where status in ('new','forwarded','waiting','approved');
alter table public.cash_requests add column if not exists task_id uuid;
alter table public.tasks add column if not exists money int;   -- сколько денег директор выделил на эту задачу
alter table public.cash_requests enable row level security;

create table if not exists public.cash_request_log(
  id bigserial primary key,
  request_id uuid not null references public.cash_requests(id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text not null default 'Система',
  actor_role text not null default 'system' check (actor_role in ('worker','cashier','admin','system')),
  kind text not null default 'event' check (kind in ('event','text','voice')),
  code text,
  body text,
  path text
);
create index if not exists cash_request_log_req on public.cash_request_log(request_id, at);
alter table public.cash_request_log enable row level security;

do $$ begin
  drop policy if exists creq_read on public.cash_requests;
  create policy creq_read on public.cash_requests for select to authenticated
    using (public.is_admin() or requester_id = auth.uid()
           or exists(select 1 from public.staff c where c.id = auth.uid() and c.is_cashier and c.status = 'approved'));
  drop policy if exists creq_log_read on public.cash_request_log;
  create policy creq_log_read on public.cash_request_log for select to authenticated
    using (public.is_admin() or exists(select 1 from public.cash_requests r where r.id = request_id and
           (exists(select 1 from public.staff c where c.id = auth.uid() and c.is_cashier and c.status = 'approved')
            -- работник видит этапы и переписку с кассиром, но не слова и не голос директора: касса — связующее звено
            or (r.requester_id = auth.uid() and (cash_request_log.actor_role <> 'admin' or cash_request_log.kind = 'event')))));
  -- голосовые сообщения читают участники запроса и администратор
  drop policy if exists photos_read_creq on storage.objects;
  create policy photos_read_creq on storage.objects for select to authenticated
    using (bucket_id = 'photos' and exists(
      select 1 from public.cash_request_log l join public.cash_requests r on r.id = l.request_id
       where l.path = storage.objects.name
         and (public.is_admin()
              or exists(select 1 from public.staff c where c.id = auth.uid() and c.is_cashier and c.status = 'approved')
              or (r.requester_id = auth.uid() and l.actor_role <> 'admin'))));
  end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('req_create','req_cancel','req_forward','req_decide','req_issue','req_say','req_admin_create','_req_log','_req_notify_cashiers','req_reminders','exp_add','exp_close')
  loop execute 'drop function ' || f.sig || ' cascade'; end loop;
end $$;

create function public._req_log(p_req uuid, p_uid uuid, p_role text, p_kind text, p_code text, p_body text, p_path text)
returns void language sql security definer set search_path = public as $$
  insert into public.cash_request_log(request_id, actor_id, actor_name, actor_role, kind, code, body, path)
  values (p_req, p_uid, case when p_uid is null then 'Система' else public._actor_name(p_uid) end, coalesce(p_role, 'system'), p_kind, p_code, p_body, p_path)
$$;

create function public._req_notify_cashiers(p_title text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  for c in select id from public.staff where is_cashier and status = 'approved' loop
    perform public._notify(c.id, false, p_title, p_body, null);
  end loop;
end $$;

-- 1) работник просит деньги → уведомление кассиру
create function public.req_create(p_amount int, p_purpose text, p_note text default null, p_device text default null, p_voice text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; e text; r public.cash_requests;
begin
  s := public._staff();
  if s.is_cashier then return jsonb_build_object('error', 'CASHIER_CANNOT'); end if;
  if s.status <> 'approved' then return jsonb_build_object('error', 'NOT_APPROVED'); end if;
  e := public._cash_guard(s, p_device); if e is not null then return jsonb_build_object('error', e); end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then return jsonb_build_object('error', 'BAD_AMOUNT'); end if;
  if coalesce(trim(p_purpose), '') = '' then return jsonb_build_object('error', 'NEED_PURPOSE'); end if;
  if p_voice is not null then
    e := public._check_photo(p_voice); if e is not null then return jsonb_build_object('error', e); end if;
  end if;
  insert into public.cash_requests(requester_id, requester_name, origin, amount_asked, purpose)
  values (s.id, s.name, 'worker', p_amount, left(trim(p_purpose), 200)) returning * into r;
  perform public._req_log(r.id, s.id, 'worker', 'event', 'created', p_amount::text, null);
  if coalesce(trim(p_note), '') <> '' then
    perform public._req_log(r.id, s.id, 'worker', 'text', null, left(trim(p_note), 500), null);
  end if;
  if p_voice is not null then
    perform public._req_log(r.id, s.id, 'worker', 'voice', null, null, p_voice);
  end if;
  perform public._req_notify_cashiers('Запрос денег: ' || s.name || ', ' || p_amount || ' ֏', left(trim(p_purpose), 200));
  return to_jsonb(r);
end $$;

-- работник отменяет свой запрос, пока деньги не выданы
create function public.req_cancel(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.staff; r public.cash_requests;
begin
  s := public._staff();
  update public.cash_requests set status = 'cancelled'
   where id = p_id and requester_id = s.id and origin = 'worker' and status in ('new','forwarded','waiting') returning * into r;
  if r.id is null then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  perform public._req_log(r.id, s.id, 'worker', 'event', 'cancelled', null, null);
  perform public._req_notify_cashiers('Запрос отменён: ' || r.requester_name, r.amount_asked || ' ֏');
  return to_jsonb(r);
end $$;

-- 2) кассир передаёт запрос директору со своими словами / голосовым → уведомление директору, далее напоминание каждый час
create function public.req_forward(p_id uuid, p_note text default null, p_voice text default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; e text; r public.cash_requests;
begin
  s := public._staff();
  if not s.is_cashier then return jsonb_build_object('error', 'NOT_CASHIER'); end if;
  e := public._cash_guard(s, p_device); if e is not null then return jsonb_build_object('error', e); end if;
  if p_voice is not null then
    e := public._check_photo(p_voice); if e is not null then return jsonb_build_object('error', e); end if;
  end if;
  update public.cash_requests set status = 'forwarded', forwarded_at = now(), last_reminded_at = now()
   where id = p_id and status in ('new','waiting') returning * into r;
  if r.id is null then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  perform public._req_log(r.id, s.id, 'cashier', 'event', 'forwarded', null, null);
  if coalesce(trim(p_note), '') <> '' then
    perform public._req_log(r.id, s.id, 'cashier', 'text', null, left(trim(p_note), 500), null);
  end if;
  if p_voice is not null then
    perform public._req_log(r.id, s.id, 'cashier', 'voice', null, null, p_voice);
  end if;
  perform public._notify(r.requester_id, false, 'Ваш запрос передан директору', r.amount_asked || ' ֏: ' || r.purpose, null);
  perform public._notify(null, true, 'Запрос денег: ' || r.requester_name || ', ' || r.amount_asked || ' ֏', r.purpose || coalesce(' · кассир: ' || nullif(left(trim(coalesce(p_note, '')), 120), ''), ''), null);
  return to_jsonb(r);
end $$;

-- 3) директор решает: approve / reject / wait; при одобрении может изменить сумму
-- p_extra + p_task: директор добавляет сверху сумму и отдельную задачу на неё (например, «купить ещё отвёртки»)
create function public.req_decide(p_id uuid, p_decision text, p_amount int default null, p_note text default null, p_extra int default null, p_task text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.cash_requests; who text; amt int; ex int; tid uuid;
begin
  if not public.is_admin() then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  if p_decision not in ('approve','reject','wait') then return jsonb_build_object('error', 'BAD_DECISION'); end if;
  who := public._actor_name(auth.uid());
  select * into r from public.cash_requests where id = p_id and status in ('new','forwarded','waiting') for update;
  if r.id is null then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if p_decision = 'approve' then
    amt := coalesce(p_amount, r.amount_asked);
    ex := greatest(coalesce(p_extra, 0), 0);
    if ex > 0 and coalesce(trim(p_task), '') = '' then return jsonb_build_object('error', 'NEED_TASK'); end if;
    amt := amt + ex;
    if amt <= 0 or amt > 100000000 then return jsonb_build_object('error', 'BAD_AMOUNT'); end if;
    update public.cash_requests set status = 'approved', amount_approved = amt, decided_at = now(), decided_by = who, last_reminded_at = now()
     where id = r.id returning * into r;
    perform public._req_log(r.id, auth.uid(), 'admin', 'event', 'approved', amt::text, null);
    if coalesce(trim(p_task), '') <> '' and r.requester_id is not null then
      insert into public.tasks(staff_id, day, title, note, created_by, money)
      values (r.requester_id, current_date, left(trim(p_task), 200), 'К запросу: ' || r.purpose, auth.uid(), nullif(ex, 0))
      returning id into tid;
      update public.cash_requests set task_id = coalesce(task_id, tid) where id = r.id returning * into r;
      perform public._req_log(r.id, auth.uid(), 'admin', 'event', 'extra_task', ex::text, null);
      perform public._req_log(r.id, auth.uid(), 'admin', 'text', null, 'Доп. задача: ' || left(trim(p_task), 200) || case when ex > 0 then ' (+' || ex || ' ֏)' else '' end, null);
      perform public._notify(r.requester_id, false, 'Новая задача от директора' || case when ex > 0 then ': +' || ex || ' ֏' else '' end, left(trim(p_task), 200), null);
      perform public._req_notify_cashiers('Директор добавил к запросу ' || r.requester_name || case when ex > 0 then ' +' || ex || ' ֏' else '' end, left(trim(p_task), 200));
    end if;
    perform public._notify(r.requester_id, false, 'Запрос одобрен: ' || amt || ' ֏', coalesce(nullif(left(trim(coalesce(p_note, '')), 200), ''), 'Кассир скоро выдаст деньги.'), null);
    perform public._req_notify_cashiers('К выдаче: ' || r.requester_name || ', ' || amt || ' ֏', r.purpose);
  elsif p_decision = 'reject' then
    update public.cash_requests set status = 'rejected', decided_at = now(), decided_by = who where id = r.id returning * into r;
    perform public._req_log(r.id, auth.uid(), 'admin', 'event', 'rejected', null, null);
    perform public._notify(r.requester_id, false, 'Запрос отклонён', coalesce(nullif(left(trim(coalesce(p_note, '')), 200), ''), r.amount_asked || ' ֏'), null);
    perform public._req_notify_cashiers('Запрос отклонён: ' || r.requester_name, r.amount_asked || ' ֏');
  else
    update public.cash_requests set status = 'waiting', decided_at = now(), decided_by = who, last_reminded_at = now() where id = r.id returning * into r;
    perform public._req_log(r.id, auth.uid(), 'admin', 'event', 'waiting', null, null);
    perform public._notify(r.requester_id, false, 'Запрос: подождите', coalesce(nullif(left(trim(coalesce(p_note, '')), 200), ''), 'Директор попросил подождать.'), null);
    perform public._req_notify_cashiers('Директор: подождать по запросу ' || r.requester_name, r.amount_asked || ' ֏');
  end if;
  if coalesce(trim(p_note), '') <> '' then
    perform public._req_log(r.id, auth.uid(), 'admin', 'text', null, left(trim(p_note), 500), null);
  end if;
  return to_jsonb(r);
end $$;

-- директор сам создаёт выдачу для сотрудника (уже одобрена): кассир получает «к выдаче»
create function public.req_admin_create(p_staff uuid, p_amount int, p_purpose text, p_note text default null, p_voice text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.staff; r public.cash_requests; e text; who text; tid uuid;
begin
  if not public.is_admin() then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  select * into t from public.staff where id = p_staff and status = 'approved' and not is_cashier;
  if t.id is null then return jsonb_build_object('error', 'BAD_RECIPIENT'); end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then return jsonb_build_object('error', 'BAD_AMOUNT'); end if;
  if coalesce(trim(p_purpose), '') = '' then return jsonb_build_object('error', 'NEED_PURPOSE'); end if;
  if p_voice is not null then
    e := public._check_photo(p_voice); if e is not null then return jsonb_build_object('error', e); end if;
  end if;
  who := public._actor_name(auth.uid());
  insert into public.cash_requests(requester_id, requester_name, origin, amount_asked, amount_approved, purpose, status, decided_at, decided_by, last_reminded_at)
  values (t.id, t.name, 'boss', p_amount, p_amount, left(trim(p_purpose), 200), 'approved', now(), who, now()) returning * into r;
  -- работнику сразу ставится задача: видно, на что выделены деньги; позже директор видит, кто выполнил и сколько потратил
  insert into public.tasks(staff_id, day, title, note, created_by, money)
  values (t.id, current_date, left(trim(p_purpose), 200), nullif(left(trim(coalesce(p_note, '')), 500), ''), auth.uid(), p_amount)
  returning id into tid;
  update public.cash_requests set task_id = tid where id = r.id returning * into r;
  perform public._req_log(r.id, auth.uid(), 'admin', 'event', 'boss_created', p_amount::text, null);
  if coalesce(trim(p_note), '') <> '' then
    perform public._req_log(r.id, auth.uid(), 'admin', 'text', null, left(trim(p_note), 500), null);
  end if;
  if p_voice is not null then
    perform public._req_log(r.id, auth.uid(), 'admin', 'voice', null, null, p_voice);
  end if;
  perform public._req_notify_cashiers('Директор: выдать ' || t.name || ', ' || p_amount || ' ֏', left(trim(p_purpose), 200));
  perform public._notify(t.id, false, 'Директор выделил вам ' || p_amount || ' ֏', left(trim(p_purpose), 200), null);
  return to_jsonb(r);
end $$;

-- 4) кассир выдаёт одобренную сумму: создаётся обычная выдача, работник подтверждает получение в приложении
create function public.req_issue(p_id uuid, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; r public.cash_requests; res jsonb;
begin
  s := public._staff();
  if not s.is_cashier then return jsonb_build_object('error', 'NOT_CASHIER'); end if;
  select * into r from public.cash_requests where id = p_id and status = 'approved' for update;
  if r.id is null or r.requester_id is null then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  res := public.cash_issue(r.requester_id, r.amount_approved, r.purpose, 'По запросу', null, p_device);
  if res ? 'error' then return res; end if;
  update public.cash_requests set status = 'paid', paid_at = now(), issue_id = (res->>'id')::uuid where id = r.id returning * into r;
  perform public._req_log(r.id, s.id, 'cashier', 'event', 'paid', r.amount_approved::text, null);
  return to_jsonb(r);
end $$;

-- комментарий в переписке запроса (работник — к своему; кассир и директор — к любому открытому)
create function public.req_say(p_id uuid, p_body text default null, p_voice text default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; r public.cash_requests; e text; role text; uid uuid := auth.uid();
begin
  select * into r from public.cash_requests where id = p_id;
  if r.id is null then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if public.is_admin() then role := 'admin';
  else
    s := public._staff();
    if s.is_cashier then
      role := 'cashier';
      e := public._cash_guard(s, p_device); if e is not null then return jsonb_build_object('error', e); end if;
    elsif r.requester_id = s.id then role := 'worker';
    else return jsonb_build_object('error', 'NOT_FOUND'); end if;
  end if;
  if r.status in ('paid','cancelled','rejected') then return jsonb_build_object('error', 'REQ_CLOSED'); end if;
  if coalesce(trim(p_body), '') = '' and p_voice is null then return jsonb_build_object('error', 'EMPTY'); end if;
  if p_voice is not null then
    e := public._check_photo(p_voice); if e is not null then return jsonb_build_object('error', e); end if;
  end if;
  if coalesce(trim(p_body), '') <> '' then
    perform public._req_log(r.id, uid, role, 'text', null, left(trim(p_body), 500), null);
  end if;
  if p_voice is not null then perform public._req_log(r.id, uid, role, 'voice', null, null, p_voice); end if;
  if role = 'worker' then
    perform public._req_notify_cashiers('Запрос ' || r.requester_name || ': сообщение', left(coalesce(trim(p_body), 'голосовое'), 120));
    if r.status in ('forwarded','waiting') then perform public._notify(null, true, 'Запрос ' || r.requester_name || ': сообщение', left(coalesce(trim(p_body), 'голосовое'), 120), null); end if;
  elsif role = 'cashier' then
    perform public._notify(r.requester_id, false, 'Кассир по запросу', left(coalesce(trim(p_body), 'голосовое'), 120), null);
  else
    perform public._notify(r.requester_id, false, 'Директор по запросу', left(coalesce(trim(p_body), 'голосовое'), 120), null);
    perform public._req_notify_cashiers('Директор по запросу ' || r.requester_name, left(coalesce(trim(p_body), 'голосовое'), 120));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- напоминания: директору каждый час, пока запрос не решён; кассиру — пока одобренное не выдано
create function public.req_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select * from public.cash_requests
            where status in ('forwarded','waiting') and coalesce(last_reminded_at, created_at) < now() - interval '1 hour'
  loop
    perform public._notify(null, true, 'Напоминание: запрос денег ждёт решения ⏰', r.requester_name || ', ' || r.amount_asked || ' ֏', null);
    perform public._req_log(r.id, null, 'system', 'event', 'reminder', null, null);
    update public.cash_requests set last_reminded_at = now() where id = r.id; n := n + 1;
  end loop;
  for r in select * from public.cash_requests
            where status = 'approved' and coalesce(last_reminded_at, decided_at) < now() - interval '1 hour'
  loop
    perform public._req_notify_cashiers('Напоминание: выдать ' || r.requester_name || ', ' || r.amount_approved || ' ֏ ⏰', r.purpose);
    update public.cash_requests set last_reminded_at = now() where id = r.id; n := n + 1;
  end loop;
  return n;
end $$;

do $$ begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'cash-req-reminders';
    perform cron.schedule('cash-req-reminders', '0 * * * *', 'select public.req_reminders()');
  else
    raise notice 'pg_cron не включён: включите его в Database → Extensions и запустите файл ещё раз';
  end if;
end $$;

-- ожидаемые (предстоящие) приходы: наличными и на банк. В остаток кассы не входят.
-- Наличный приход при получении превращается в обычное пополнение кассы; банковский просто закрывается.
create table if not exists public.cash_expected(
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('cash','bank')),
  amount int not null check (amount > 0 and amount <= 100000000),
  source text not null,
  due date,
  by_name text,
  status text not null default 'open' check (status in ('open','received','cancelled')),
  closed_at timestamptz,
  closed_by text
);
alter table public.cash_expected enable row level security;
do $$ begin
  drop policy if exists cexp_read on public.cash_expected;
  create policy cexp_read on public.cash_expected for select to authenticated
    using (public.is_admin() or exists(select 1 from public.staff c where c.id = auth.uid() and c.is_cashier and c.status = 'approved'));
end $$;

create function public.exp_add(p_kind text, p_amount int, p_source text, p_due date default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; e text; who text; x public.cash_expected;
begin
  if public.is_admin() then who := public._actor_name(auth.uid());
  else
    s := public._staff();
    if not s.is_cashier then return jsonb_build_object('error', 'NOT_CASHIER'); end if;
    e := public._cash_guard(s, p_device); if e is not null then return jsonb_build_object('error', e); end if;
    who := s.name;
  end if;
  if p_kind not in ('cash','bank') then return jsonb_build_object('error', 'BAD_KIND'); end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then return jsonb_build_object('error', 'BAD_AMOUNT'); end if;
  if coalesce(trim(p_source), '') = '' then return jsonb_build_object('error', 'NEED_NOTE'); end if;
  insert into public.cash_expected(kind, amount, source, due, by_name) values (p_kind, p_amount, left(trim(p_source), 200), p_due, who) returning * into x;
  return to_jsonb(x);
end $$;

create function public.exp_close(p_id uuid, p_received boolean, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; e text; who text; x public.cash_expected; res jsonb;
begin
  if public.is_admin() then who := public._actor_name(auth.uid());
  else
    s := public._staff();
    if not s.is_cashier then return jsonb_build_object('error', 'NOT_CASHIER'); end if;
    e := public._cash_guard(s, p_device); if e is not null then return jsonb_build_object('error', e); end if;
    who := s.name;
  end if;
  select * into x from public.cash_expected where id = p_id and status = 'open' for update;
  if x.id is null then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if p_received and x.kind = 'cash' then
    res := public.cash_topup(x.amount, 'Ожидаемый приход: ' || x.source, p_device);
    if res ? 'error' then return res; end if;
  end if;
  update public.cash_expected set status = case when p_received then 'received' else 'cancelled' end, closed_at = now(), closed_by = who where id = x.id returning * into x;
  return to_jsonb(x);
end $$;
revoke all on function public.exp_add, public.exp_close from public, anon;
grant execute on function public.exp_add, public.exp_close to authenticated;

revoke all on function public.req_create, public.req_cancel, public.req_forward, public.req_decide, public.req_issue,
  public.req_say, public.req_admin_create from public, anon;
grant execute on function public.req_create, public.req_cancel, public.req_forward, public.req_decide, public.req_issue,
  public.req_say, public.req_admin_create to authenticated;
revoke all on function public._req_log, public._req_notify_cashiers, public.req_reminders from public, anon, authenticated;
