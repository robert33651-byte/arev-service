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
