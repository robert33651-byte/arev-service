-- Упрощение приложения работника: фото при выполнении задачи и заказа больше не обязательны.
-- Запускать после schema.sql (можно повторно).

create or replace function public.ticket_step(p_id uuid, p_step text, p_lat double precision, p_lng double precision,
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
    -- фото до/после больше не обязательны: их можно приложить по желанию
    if coalesce(p_price,0) <= 0 then return jsonb_build_object('error','NEED_PRICE'); end if;
    if exists(select 1 from public.purchases where ticket_id = p_id and status = 'bought') then
      return jsonb_build_object('error','PURCHASE_NOT_DELIVERED');
    end if;
    update public.tickets set status = 'done', done_at = now(), done_lat = p_lat, done_lng = p_lng,
           done_dist = public.dist_m(p_lat, p_lng, lat, lng), price = p_price, work = p_work where id = p_id returning * into r;
  else
    return jsonb_build_object('error','WRONG_STEP');
  end if;
  return to_jsonb(r);
end $$;

create or replace function public.complete_task(p_id uuid, p_photo text, p_lat double precision, p_lng double precision,
  p_acc real, p_mocked boolean, p_device text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.staff; t public.tasks; e text; sh uuid; pname text;
begin
  s := public._staff();
  e := public._guard(s, p_device, p_mocked); if e is not null then return jsonb_build_object('error', e); end if;
  if p_photo is not null then
    e := public._check_photo(p_photo); if e is not null then return jsonb_build_object('error', e); end if;
  end if;
  select id into sh from public.shifts where staff_id = s.id and end_at is null;
  if sh is null then return jsonb_build_object('error','NO_OPEN_SHIFT'); end if;
  select * into t from public.tasks where id = p_id and staff_id = s.id for update;
  if t.id is null or t.status <> 'new' then return jsonb_build_object('error','CANNOT_COMPLETE'); end if;
  select name into pname from public.places where id = t.place_id;
  update public.tasks set status = 'done', done_at = now(), done_photo = p_photo, done_lat = p_lat, done_lng = p_lng,
         done_dist = public.dist_m(p_lat, p_lng, t.lat, t.lng), done_note = nullif(trim(p_note),'')
   where id = t.id returning * into t;
  if p_photo is not null then
    insert into public.work_photos(staff_id, path, kind, object, note, shift_id, lat, lng, acc, device)
    values (s.id, p_photo, 'after', coalesce(pname, t.title), coalesce(nullif(trim(p_note),''), t.title), sh, p_lat, p_lng, p_acc, p_device);
  end if;
  return to_jsonb(t);
end $$;
