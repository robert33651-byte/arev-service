// Arev Service — рассылка уведомлений из очереди notify_queue.
// Как развернуть: Supabase → Edge Functions → Deploy a new function → Via Editor,
// имя: notify-push, вставить этот файл целиком → Deploy.
// ВАЖНО: в настройках функции отключить «Verify JWT» (защита идёт своим секретом ниже).
//
// Секреты (Edge Functions → Secrets):
//   NOTIFY_SECRET   — любая длинная случайная строка (она же в заголовке вебхука)
//   TG_BOT_TOKEN    — по желанию: токен Telegram-бота, чтобы слать уведомления менеджеру/работникам в Telegram
//
// Запуск: Database → Webhooks → Create: таблица notify_queue, событие Insert,
//   тип Supabase Edge Functions → notify-push, HTTP Headers: x-notify-secret = ваш NOTIFY_SECRET.
//   Каждая новая запись уходит сразу; заодно досылаются все неотправленные.
//
// Куда уходит:
//   работнику  → Expo push (staff.push_token), плюс Telegram, если у него указан telegram_id
//   менеджерам → Telegram (admins.telegram_id) и/или push (admins.push_token)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('NOTIFY_SECRET') || '';
const TG = Deno.env.get('TG_BOT_TOKEN') || '';

type Item = { id: number; to_staff: string | null; to_admins: boolean; title: string; body: string | null; task_id: string | null };
type Target = { push?: string | null; tg?: number | null };

async function sendExpo(msgs: { to: string; title: string; body: string; data: unknown }[]) {
  const errors: string[] = [];
  for (let i = 0; i < msgs.length; i += 100) {
    const chunk = msgs.slice(i, i + 100);
    const r = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(chunk.map((m) => ({ ...m, sound: 'default', priority: 'high', channelId: 'tasks' }))),
    });
    if (!r.ok) { errors.push('Expo ' + r.status); continue; }
    const d = await r.json();
    (d.data || []).forEach((x: { status: string; message?: string }) => { if (x.status !== 'ok') errors.push(x.message || 'Expo error'); });
  }
  return errors;
}

async function sendTg(chat: number, text: string) {
  const r = await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text }),
  });
  if (!r.ok) throw new Error('Telegram ' + r.status);
}

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-notify-secret') !== SECRET) return new Response('forbidden', { status: 403 });
  const db = createClient(URL_, SERVICE);

  const { data: items, error } = await db.from('notify_queue').select('id,to_staff,to_admins,title,body,task_id')
    .is('sent_at', null).order('id').limit(100);
  if (error) return new Response(error.message, { status: 500 });
  if (!items || !items.length) return Response.json({ sent: 0 });

  const staffIds = [...new Set((items as Item[]).map((i) => i.to_staff).filter(Boolean))] as string[];
  const staffMap = new Map<string, Target>();
  if (staffIds.length) {
    const { data } = await db.from('staff').select('id,push_token,telegram_id').in('id', staffIds);
    (data || []).forEach((s: { id: string; push_token: string | null; telegram_id: number | null }) => staffMap.set(s.id, { push: s.push_token, tg: s.telegram_id }));
  }
  let admins: Target[] = [];
  if ((items as Item[]).some((i) => i.to_admins)) {
    const { data } = await db.from('admins').select('push_token,telegram_id');
    admins = (data || []).map((a: { push_token: string | null; telegram_id: number | null }) => ({ push: a.push_token, tg: a.telegram_id }));
  }

  let sent = 0;
  for (const it of items as Item[]) {
    const targets: Target[] = it.to_admins ? admins : (it.to_staff && staffMap.get(it.to_staff) ? [staffMap.get(it.to_staff)!] : []);
    const text = it.body ? `${it.title}\n${it.body}` : it.title;
    const errs: string[] = [];
    const pushes = targets.filter((t) => t.push).map((t) => ({ to: t.push!, title: it.title, body: it.body || '', data: { taskId: it.task_id } }));
    if (pushes.length) errs.push(...await sendExpo(pushes));
    if (TG) {
      for (const t of targets) {
        if (t.tg) { try { await sendTg(t.tg, text); } catch (e) { errs.push(String((e as Error).message)); } }
      }
    }
    const reachable = targets.some((t) => t.push || (TG && t.tg));
    // помечаем отправленным, даже если получателей нет (иначе очередь копится); причина — в error
    await db.from('notify_queue').update({
      sent_at: new Date().toISOString(),
      error: errs.length ? errs.join('; ').slice(0, 300) : reachable ? null : 'нет канала доставки (нет push-токена или Telegram)',
    }).eq('id', it.id);
    if (reachable && !errs.length) sent++;
  }
  return Response.json({ sent, total: items.length });
});
