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
