-- Файл в переписке по задаче (любой формат: PDF, Word, Excel, фото...). Можно запускать повторно.
do $$ begin
  alter table public.task_log drop constraint if exists task_log_kind_check;
  alter table public.task_log add constraint task_log_kind_check check (kind in ('event','text','voice','photo','file'));
end $$;

drop function if exists public.task_post_file(uuid, text, text, text);
create function public.task_post_file(p_id uuid, p_path text, p_name text, p_body text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.tasks; s public.staff; e text;
begin
  s := public._staff();
  t := public._task_member(p_id);
  if t.status in ('done','cancelled') or t.archived_at is not null then return jsonb_build_object('error','TASK_CLOSED'); end if;
  if p_path is null or coalesce(trim(p_name),'') = '' then return jsonb_build_object('error','NEED_FILE'); end if;
  e := public._check_photo(p_path); if e is not null then return jsonb_build_object('error', e); end if;
  perform public._log(t.id, s.id, 'staff', 'file', left(trim(p_name), 200), nullif(trim(p_body),''), p_path);
  if t.disc_status <> 'open' then
    update public.tasks set disc_status = 'open' where id = t.id;
    perform public._log(t.id, s.id, 'staff', 'event', 'disc_open', null, null);
  end if;
  perform public._notify(null, true, 'Файл по задаче 📎', s.name || ': ' || t.title, t.id);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.task_post_file from public, anon;
grant execute on function public.task_post_file to authenticated;
