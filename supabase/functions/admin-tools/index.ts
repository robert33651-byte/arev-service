// Arev Service — серверная функция для админки.
// Как развернуть: Supabase → Edge Functions → Deploy a new function → Via Editor,
// имя функции: admin-tools, вставить этот файл целиком → Deploy.
// Секрет: Edge Functions → Secrets → ANTHROPIC_API_KEY = ваш ключ Claude API.
//
// Что умеет:
//   action "ai"        — ИИ проверяет фото одометров, чеков АЗС и чеков закупок, которые ещё не проверены
//   action "reset_pin" — новый PIN-код сотруднику, который его забыл
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') || '';
const MODEL = Deno.env.get('AI_MODEL') || 'claude-sonnet-5-5';

const PROMPT_ODO = 'Это фото приборной панели автомобиля, которое сотрудник сделал для отметки пробега в начале или конце смены. Определи: 1) общий пробег на одометре в километрах (ODO, не суточный TRIP); 2) похоже ли, что это фотография экрана телефона, монитора или распечатанного снимка, а не реальной панели; 3) видна ли вообще приборная панель. Ответь только JSON: {"odo": число или null, "isScreen": true или false, "isDashboard": true или false, "note": "коротко по-русски, если что-то подозрительно, иначе пустая строка"}';
const PROMPT_RCPT = 'Это фото кассового чека с автозаправки, сделанное сотрудником. Извлеки данные чека и ответь только JSON: {"isReceipt": true или false, "date": "ДД.ММ.ГГГГ" или null, "time": "ЧЧ:ММ" или null, "liters": число или null (литры или кубометры топлива), "sum": число или null (итоговая сумма), "fuel": "вид топлива" или null, "station": "название АЗС" или null, "nonFuel": true или false (есть ли в чеке товары или услуги кроме топлива), "isScreen": true или false (фото экрана или снимка вместо бумажного чека), "note": "коротко по-русски, если что-то подозрительно, иначе пустая строка"}';

const PROMPT_BUY = 'Это фото чека, накладной или счёта на покупку товара (материалы для монтажа солнечных станций), которое сотрудник сделал при закупке. Извлеки данные и ответь только JSON: {"isReceipt": true или false (это чек, накладная или счёт), "date": "ДД.ММ.ГГГГ" или null, "sum": число или null (итоговая сумма к оплате), "seller": "продавец" или null, "items": [{"name": "товар", "qty": число или null, "unit": "ед." или null, "price": число или null}], "handwritten": true или false (написано от руки, без печати или кассовых данных), "isScreen": true или false (фото экрана или снимка вместо бумажного документа), "note": "коротко по-русски, если что-то подозрительно (исправления, разные почерки, сумма не сходится с позициями), иначе пустая строка"}';

function b64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function parseJson(t: string) {
  try { return JSON.parse(t); } catch (_) { /* ниже */ }
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) { /* */ } }
  return { note: 'Не удалось разобрать ответ ИИ' };
}

async function askClaude(prompt: string, imageB64: string) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 900,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageB64 } },
        { type: 'text', text: prompt },
      ] }],
    }),
  });
  if (!r.ok) throw new Error('Claude API ' + r.status + ': ' + (await r.text()).slice(0, 300));
  const d = await r.json();
  const text = (d.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('');
  return parseJson(text);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    // проверяем, что вызывает администратор
    const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: isAdmin } = await userClient.rpc('is_admin');
    if (!isAdmin) return json({ error: 'Только для администратора' }, 403);
    const admin = createClient(URL_, SERVICE);
    const body = await req.json().catch(() => ({}));

    if (body.action === 'reset_pin') {
      const pin = String(body.pin || '');
      if (!/^\d{6,12}$/.test(pin)) return json({ error: 'PIN-код — от 6 до 12 цифр' }, 400);
      const { error } = await admin.auth.admin.updateUserById(String(body.staff_id), { password: pin });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (body.action === 'ai') {
      if (!ANTHROPIC) return json({ error: 'Не задан секрет ANTHROPIC_API_KEY' }, 400);
      const since = new Date(Date.now() - 31 * 864e5).toISOString();
      const limit = Math.min(Number(body.limit) || 15, 30);
      const [sh, fu, done, bu] = await Promise.all([
        admin.from('shifts').select('start_photo,end_photo').gte('start_at', since),
        admin.from('fuel').select('photo').gte('at', since),
        admin.from('ai_checks').select('photo'),
        admin.from('purchases').select('photo').eq('source', 'shop').gte('created_at', since),
      ]);
      const checked = new Set((done.data || []).map((x: { photo: string }) => x.photo));
      const todo: { photo: string; kind: 'odo' | 'receipt' | 'purchase' }[] = [];
      (sh.data || []).forEach((s: { start_photo: string; end_photo: string }) => {
        if (s.start_photo && !checked.has(s.start_photo)) todo.push({ photo: s.start_photo, kind: 'odo' });
        if (s.end_photo && !checked.has(s.end_photo)) todo.push({ photo: s.end_photo, kind: 'odo' });
      });
      (fu.data || []).forEach((f: { photo: string }) => { if (f.photo && !checked.has(f.photo)) todo.push({ photo: f.photo, kind: 'receipt' }); });
      (bu.data || []).forEach((b: { photo: string }) => { if (b.photo && !checked.has(b.photo)) todo.push({ photo: b.photo, kind: 'purchase' }); });
      const batch = todo.slice(0, limit);
      let ok = 0; const errors: string[] = [];
      for (const it of batch) {
        try {
          const { data: file, error } = await admin.storage.from('photos').download(it.photo);
          if (error || !file) throw new Error('фото не найдено');
          const result = await askClaude(it.kind === 'odo' ? PROMPT_ODO : it.kind === 'purchase' ? PROMPT_BUY : PROMPT_RCPT, b64(await file.arrayBuffer()));
          await admin.from('ai_checks').upsert({ photo: it.photo, kind: it.kind, result });
          ok++;
        } catch (e) { errors.push(String((e as Error).message || e)); }
      }
      return json({ ok: true, checked: ok, left: Math.max(0, todo.length - batch.length), errors: errors.slice(0, 3) });
    }
    return json({ error: 'Неизвестное действие' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
