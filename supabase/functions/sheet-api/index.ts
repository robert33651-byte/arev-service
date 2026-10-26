// Arev Service — мост между базой и Google Таблицей.
// Как развернуть: Supabase → Edge Functions → Deploy a new function → Via Editor,
// имя: sheet-api, вставить этот файл целиком → Deploy.
// ВАЖНО: в настройках функции отключить «Verify JWT» (защита идёт своим секретом).
//
// Секрет (Edge Functions → Secrets):  SHEET_SECRET = любая длинная случайная строка.
// Тот же секрет вписывается в скрипт таблицы (Sheets.gs).
//
// Что умеет (POST, заголовок x-sheet-secret):
//   ping         — проверка связи
//   export       — данные для листов таблицы (задачи, обсуждения, смены, топливо, закупки, сотрудники)
//   update_task  — правка задачи из таблицы (название, исполнители, срок, важность, статус)
//   create_task  — новая задача, добавленная строкой в таблице (исполнитель получит уведомление)
// GET ?f=путь&s=подпись — открывает фото или голосовое по ссылке из таблицы (подпись выдаётся при export,
//   ссылка действует, пока не поменяется SHEET_SECRET, но сама по себе даёт доступ только к одному файлу).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('SHEET_SECRET') || '';
const db = createClient(URL_, SERVICE);
const enc = new TextEncoder();
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

async function sig(path: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, enc.encode(path));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
async function link(path: string | null | undefined) {
  return path ? `${URL_}/functions/v1/sheet-api?f=${encodeURIComponent(path)}&s=${await sig(path)}` : null;
}

// Supabase отдаёт не больше 1000 строк за запрос, поэтому читаем частями
// deno-lint-ignore no-explicit-any
async function pages(mk: () => any): Promise<any[]> {
  // deno-lint-ignore no-explicit-any
  let out: any[] = [];
  for (let i = 0; i < 100000; i += 1000) {
    const r = await mk().range(i, i + 999);
    if (r.error) throw new Error(r.error.message);
    out = out.concat(r.data || []);
    if ((r.data || []).length < 1000) break;
  }
  return out;
}

const iso = (d: number) => new Date(Date.now() - d * 864e5).toISOString();

async function doExport() {
  const since365 = iso(365), since120 = iso(120);
  const [staff, tasks, shifts, fuel, buys] = await Promise.all([
    pages(() => db.from('staff').select('id,name,phone,status,car_model,car_plate,fuel_type,norm_approved').order('name')),
    pages(() => db.from('tasks').select('*').neq('status', 'cancelled').or(`archived_at.is.null,archived_at.gte.${since365}`).order('created_at')),
    pages(() => db.from('shifts').select('*').gte('start_at', since120).order('start_at')),
    pages(() => db.from('fuel').select('*').gte('at', since120).order('at')),
    pages(() => db.from('purchases').select('*').gte('created_at', since120).order('created_at')),
  ]);
  const name = new Map<string, string>(staff.map((s) => [s.id, s.name]));
  const ids = tasks.map((t) => t.id);
  // deno-lint-ignore no-explicit-any
  let log: any[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    log = log.concat(await pages(() => db.from('task_log').select('*').in('task_id', chunk).order('at').order('id')));
  }
  const logOut = await Promise.all(log.map(async (l) => ({
    task_id: l.task_id, at: l.at, who: l.actor_name, role: l.actor_role, kind: l.kind, code: l.code, body: l.body, url: await link(l.path),
  })));
  // deno-lint-ignore no-explicit-any
  const byTask = new Map<string, any[]>();
  logOut.forEach((l) => { if (!byTask.has(l.task_id)) byTask.set(l.task_id, []); byTask.get(l.task_id)!.push(l); });

  const tasksOut = tasks.map((t, i) => {
    const L = byTask.get(t.id) || [];
    const talk = L.filter((l) => l.kind !== 'event');
    const last = talk.length ? talk[talk.length - 1] : null;
    return {
      id: t.id, n: i + 1, title: t.title, note: t.note, priority: t.priority, status: t.status, disc: t.disc_status,
      assignee: name.get(t.staff_id) || '', assignee2: t.staff2_id ? name.get(t.staff2_id) || '' : '',
      due: t.due, created_at: t.created_at, report_at: t.report_at, done_at: t.done_at, archived_at: t.archived_at,
      seen: t.seen_at, seen2: t.seen2_at, self_added: t.self_added, done_note: t.done_note,
      voices: L.filter((l) => l.kind === 'voice').map((l) => l.url),
      photos: L.filter((l) => l.kind === 'photo').map((l) => l.url),
      last_msg: last ? { who: last.who, role: last.role, kind: last.kind, body: last.body, at: last.at } : null,
    };
  });
  const shiftsOut = shifts.map((s) => ({
    id: s.id, who: name.get(s.staff_id) || '', start_at: s.start_at, end_at: s.end_at, start_odo: s.start_odo, end_odo: s.end_odo,
    route_km: s.route_km, gps_km: s.gps_km, start_dist: s.start_dist, end_dist: s.end_dist,
  }));
  const fuelOut = fuel.map((f) => ({ id: f.id, who: name.get(f.staff_id) || '', at: f.at, liters: f.liters, amount: f.amount }));
  const buysOut = await Promise.all(buys.map(async (b) => ({
    id: b.id, who: name.get(b.staff_id) || '', at: b.created_at, supplier: b.supplier, amount: b.amount, status: b.status, dest: b.dest,
    site: b.site, source: b.source, shortage: b.shortage, lines: b.lines, photo: await link(b.photo),
  })));
  return {
    now: new Date().toISOString(),
    staff: staff.map((s) => ({ name: s.name, phone: s.phone, status: s.status, car: [s.car_model, s.car_plate].filter(Boolean).join(' '), norm: s.norm_approved })),
    tasks: tasksOut, log: logOut, shifts: shiftsOut, fuel: fuelOut, purchases: buysOut,
  };
}

const STATUSES = ['new', 'report', 'done'];
const PRIOS = ['normal', 'important', 'urgent'];
const okDate = (v: unknown) => v === undefined || v === null || v === '' || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));

async function staffId(nm: unknown): Promise<string | null | undefined> {
  const n = String(nm || '').trim();
  if (!n) return null;
  const { data } = await db.from('staff').select('id,name,status').eq('status', 'approved');
  const m = (data || []).filter((s: { name: string }) => s.name.trim().toLowerCase() === n.toLowerCase());
  return m.length === 1 ? m[0].id : undefined; // undefined: имя не найдено или не однозначно
}

// deno-lint-ignore no-explicit-any
async function updateTask(b: any) {
  const p = b.patch || {};
  // deno-lint-ignore no-explicit-any
  const row: Record<string, any> = {};
  if ('title' in p) { const t = String(p.title || '').trim(); if (!t) return json({ error: 'Название не может быть пустым' }, 400); row.title = t; }
  if ('note' in p) row.note = String(p.note || '').trim() || null;
  if ('due' in p) { if (!okDate(p.due)) return json({ error: 'Дата должна быть вида ГГГГ-ММ-ДД' }, 400); row.due = p.due || null; }
  if ('priority' in p) { if (!PRIOS.includes(p.priority)) return json({ error: 'Неизвестная важность' }, 400); row.priority = p.priority; }
  if ('staff_name' in p) { const id = await staffId(p.staff_name); if (!id) return json({ error: 'Исполнитель «' + p.staff_name + '» не найден среди одобренных сотрудников' }, 400); row.staff_id = id; }
  if ('staff2_name' in p) { const id = await staffId(p.staff2_name); if (id === undefined) return json({ error: 'Второй исполнитель «' + p.staff2_name + '» не найден' }, 400); row.staff2_id = id; }
  if ('status' in p) {
    if (!STATUSES.includes(p.status)) return json({ error: 'Неизвестный статус' }, 400);
    row.status = p.status;
    const now = new Date().toISOString();
    if (p.status === 'done') { row.done_at = now; row.archived_at = now; row.disc_status = 'closed'; }
    if (p.status === 'report') { row.report_at = now; row.archived_at = null; }
    if (p.status === 'new') { row.report_at = null; row.done_at = null; row.archived_at = null; }
  }
  if (!Object.keys(row).length) return json({ error: 'Нечего менять' }, 400);
  const { data, error } = await db.from('tasks').update(row).eq('id', String(b.id)).select('id');
  if (error) return json({ error: error.message }, 400);
  if (!data || !data.length) return json({ error: 'Задача не найдена' }, 404);
  return json({ ok: true });
}

// deno-lint-ignore no-explicit-any
async function createTask(b: any) {
  const title = String(b.title || '').trim();
  if (!title) return json({ error: 'Напишите, что сделать' }, 400);
  const id1 = await staffId(b.staff_name);
  if (!id1) return json({ error: 'Исполнитель «' + (b.staff_name || '') + '» не найден среди одобренных сотрудников' }, 400);
  const id2 = await staffId(b.staff2_name);
  if (id2 === undefined) return json({ error: 'Второй исполнитель «' + b.staff2_name + '» не найден' }, 400);
  if (!okDate(b.due)) return json({ error: 'Дата должна быть вида ГГГГ-ММ-ДД' }, 400);
  const pr = PRIOS.includes(b.priority) ? b.priority : 'normal';
  const { data, error } = await db.from('tasks').insert({
    title, note: String(b.note || '').trim() || null, staff_id: id1, staff2_id: id2 || null, due: b.due || null, priority: pr,
  }).select('id').single();
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true, id: data.id });
}

Deno.serve(async (req) => {
  if (!SECRET) return json({ error: 'Не задан секрет SHEET_SECRET' }, 500);
  try {
    const u = new URL(req.url);
    if (req.method === 'GET') {
      const f = u.searchParams.get('f') || '', s = u.searchParams.get('s') || '';
      if (!f || !same(s, await sig(f))) return new Response('forbidden', { status: 403 });
      const { data, error } = await db.storage.from('photos').createSignedUrl(f, 600);
      if (error || !data) return new Response('not found', { status: 404 });
      return Response.redirect(data.signedUrl, 302);
    }
    if (req.headers.get('x-sheet-secret') !== SECRET) return json({ error: 'forbidden' }, 403);
    const b = await req.json().catch(() => ({}));
    if (b.action === 'ping') return json({ ok: true });
    if (b.action === 'export') return json(await doExport());
    if (b.action === 'update_task') return await updateTask(b);
    if (b.action === 'create_task') return await createTask(b);
    return json({ error: 'Неизвестное действие' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
