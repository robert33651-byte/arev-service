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
    names := public._actor_name(new.staff_id) || coalesce(' + ' || public._actor_name(new.staff2_id), '');
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
