// Arev Service — ИИ-отчёт по записи разговора с клиентом.
// Как развернуть: Supabase → Edge Functions → Deploy a new function → Via Editor,
// имя функции: talk-ai, вставить этот файл целиком → Deploy.
//
// Секреты (Edge Functions → Secrets):
//   OPENAI_API_KEY    — ключ OpenAI для распознавания речи (армянский)
//   ANTHROPIC_API_KEY — уже есть (тот же, что для проверки фото)
// По желанию: TRANSCRIBE_MODEL (по умолчанию whisper-1), AI_MODEL (модель Claude).
//
// Вызов: POST { talk_id } от сотрудника, записавшего разговор, или от админа.
// Отвечает сразу, обработка идёт в фоне; результат пишется в talk_ai, статус — в talks.status.
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
const OPENAI = Deno.env.get('OPENAI_API_KEY') || '';
const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') || '';
const STT_MODEL = Deno.env.get('TRANSCRIBE_MODEL') || 'whisper-1';
const MODEL = Deno.env.get('AI_MODEL') || 'claude-sonnet-5-5';

const PROMPT = (ctx: string, text: string) => `Ты помогаешь руководителю компании Arev Service (установка и обслуживание солнечных станций в Армении) контролировать выездных мастеров.
Ниже — расшифровка разговора мастера с клиентом на объекте. Расшифровка сделана автоматически с армянской речи, в ней могут быть ошибки распознавания: учитывай это и не выдумывай того, чего в тексте нет.

Контекст: ${ctx}

Расшифровка:
"""
${text}
"""

Ответь ТОЛЬКО JSON без пояснений, все тексты на русском языке:
{
  "summary": "2–4 предложения: о чём разговор и чем закончился",
  "problem": "что за проблема или запрос у клиента, или null",
  "done": "что мастер сделал или говорит, что сделал, или null",
  "promises": ["что мастер пообещал клиенту (сроки, работы, детали)"],
  "price": "какие суммы и условия оплаты звучали, или null",
  "next_steps": ["что нужно сделать дальше компании или мастеру"],
  "mood": "positive | neutral | negative — настроение клиента",
  "flags": [{"level": "bad | warn", "text": "что настораживает"}],
  "transcript_ru": "перевод всей расшифровки на русский, по репликам, если можно понять, кто говорит — помечай «Мастер:» и «Клиент:»"
}

Что считать флагами:
- bad: мастер предлагает работу или оплату мимо компании («без фирмы», «наличными мне», «дешевле, если напрямую»), просит не сообщать в офис, договаривается о личной подработке; клиент жалуется на обман, грубость, вымогательство; мастер называет цену и просит оплату себе.
- warn: обещания, которые обычно согласуют с офисом (скидки, бесплатные работы, сроки), клиент недоволен или раздражён, спор о цене, мастер говорит неуверенно или некомпетентно, разговор не по работе большую часть времени.
Если ничего подозрительного нет — "flags": [].`;

function parseJson(t: string) {
  try { return JSON.parse(t); } catch (_) { /* ниже */ }
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) { /* */ } }
  return null;
}

async function transcribe(blob: Blob) {
  const fd = new FormData();
  fd.append('file', blob, 'talk.m4a');
  fd.append('model', STT_MODEL);
  fd.append('language', 'hy');
  fd.append('response_format', 'text');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + OPENAI }, body: fd });
  if (!r.ok) throw new Error('Распознавание речи (OpenAI) ' + r.status + ': ' + (await r.text()).slice(0, 300));
  return (await r.text()).trim();
}

async function analyze(ctx: string, text: string) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: 'user', content: PROMPT(ctx, text) }] }),
  });
  if (!r.ok) throw new Error('Claude API ' + r.status + ': ' + (await r.text()).slice(0, 300));
  const d = await r.json();
  const out = (d.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('');
  const j = parseJson(out);
  if (!j) throw new Error('Не удалось разобрать ответ ИИ');
  return j;
}

async function processTalk(admin: ReturnType<typeof createClient>, id: string) {
  try {
    const { data: t } = await admin.from('talks').select('*').eq('id', id).maybeSingle();
    if (!t) return;
    const { data: st } = await admin.from('staff').select('name').eq('id', t.staff_id).maybeSingle();
    const { data: file, error } = await admin.storage.from('photos').download(t.path);
    if (error || !file) throw new Error('Аудио не найдено в хранилище');
    if (file.size > 25 * 1024 * 1024) throw new Error('Запись больше 25 МБ — распознавание не принимает такие файлы');
    const text = await transcribe(new Blob([await file.arrayBuffer()], { type: 'audio/mp4' }));
    if (!text) throw new Error('В записи не распознано речи');
    const when = new Date(t.at).toLocaleString('ru-RU', { timeZone: 'Asia/Yerevan' });
    const ctx = `мастер ${st?.name || '—'}, объект «${t.object || '—'}», ${when}, длительность ${Math.round((t.duration_s || 0) / 60)} мин.`;
    const a = await analyze(ctx, text);
    const flags = Array.isArray(a.flags) ? a.flags.filter((f: { text?: string }) => f && f.text).map((f: { level?: string; text: string }) => ({ level: f.level === 'bad' ? 'bad' : 'warn', text: String(f.text) })) : [];
    const summary = { summary: a.summary || null, problem: a.problem || null, done: a.done || null, promises: a.promises || [], price: a.price || null, next_steps: a.next_steps || [] };
    await admin.from('talk_ai').upsert({ talk_id: id, transcript: text, transcript_ru: a.transcript_ru || null, summary, flags, mood: ['positive', 'neutral', 'negative'].includes(a.mood) ? a.mood : null, model: STT_MODEL + ' + ' + MODEL, at: new Date().toISOString() });
    await admin.from('talks').update({ status: 'done', error: null, processed_at: new Date().toISOString() }).eq('id', id);
  } catch (e) {
    await admin.from('talks').update({ status: 'error', error: String((e as Error).message || e).slice(0, 500) }).eq('id', id);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (!OPENAI) return json({ error: 'Не задан секрет OPENAI_API_KEY' }, 400);
    if (!ANTHROPIC) return json({ error: 'Не задан секрет ANTHROPIC_API_KEY' }, 400);
    const body = await req.json().catch(() => ({}));
    const id = String(body.talk_id || '');
    if (!id) return json({ error: 'Нет talk_id' }, 400);
    // кто вызывает: сам работник (его запись) или админ
    const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u || !u.user) return json({ error: 'Нужен вход' }, 401);
    const admin = createClient(URL_, SERVICE);
    const { data: t } = await admin.from('talks').select('id,staff_id,status').eq('id', id).maybeSingle();
    if (!t) return json({ error: 'Запись не найдена' }, 404);
    const { data: isAdmin } = await userClient.rpc('is_admin');
    if (t.staff_id !== u.user.id && !isAdmin) return json({ error: 'Нет доступа' }, 403);
    if (t.status === 'processing' && !isAdmin) return json({ ok: true, status: 'processing' });
    await admin.from('talks').update({ status: 'processing', error: null }).eq('id', id);
    // отвечаем сразу, обработка идёт в фоне
    // @ts-ignore EdgeRuntime есть в Supabase Edge Functions
    EdgeRuntime.waitUntil(processTalk(admin, id));
    return json({ ok: true, status: 'processing' }, 202);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
