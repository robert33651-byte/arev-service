// Экран «Мои задачи» для сотрудника: всё, что раньше делал Telegram-бот.
// Подключение: в любом месте приложения  <TasksScreen userId={session.user.id} />
// Язык интерфейса: поменяйте TASKS_LANG ниже ('ru' или 'hy').
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, Modal, Image, ActivityIndicator, RefreshControl,
  KeyboardAvoidingView, Platform, Alert, AppState, StyleSheet, Linking,
} from 'react-native';
import { supabase, errText } from './supabase';
import { CameraSheet } from './photo';
import { C } from './ui';
import {
  myTasks, taskLog, signedUrls, taskSeen, taskReport, taskPost, taskSelfAdd, uploadTaskPhoto,
  startVoice, stopVoice, uploadVoice, playVoice,
} from './tasks';

export const TASKS_LANG = 'ru';

const TXT = {
  ru: {
    title: 'Мои задачи', add: '＋ Себе', empty: 'Открытых задач нет', loadErr: 'Не удалось загрузить задачи', due: 'Срок', noDue: 'без срока', overdue: 'просрочено',
    with: 'вместе с', waitReview: '⏳ Ожидает проверки менеджера', discOpen: '💬 Обсуждение открыто: ждите ответа менеджера',
    msgHint: 'Напишите сообщение…', send: 'Отправить', photo: 'Фото', voice: 'Голосовое', stop: '⏹ Стоп и отправить', done: '✅ Готово',
    doneTitle: 'Отметить как готовое', note: 'Комментарий (не обязательно)', sendDone: '✅ Отправить менеджеру', cancel: 'Отмена',
    newTitle: 'Новая задача для себя', what: 'Что нужно сделать', deadline: 'Срок', today: 'Сегодня', d1: '1 день', d3: '3 дня', noDl: 'Без срока',
    priority: 'Важность', normal: 'Обычная', important: 'Важно', urgent: 'Срочно', save: 'Добавить', history: 'История', manager: 'Менеджер',
    route: '🗺 Маршрут', doneGps: '✅ Готово на месте (фото)', place: 'Место', rec: '● Запись', close: 'Закрыть', error: 'Ошибка', opened: '👀 открыто', listen: '▶ Слушать', playing: '⏸ Играет…', photoAdded: 'Фото добавлено', reportSent: 'Отправлено менеджеру',
    selfNote: 'Менеджер увидит, что вы добавили задачу сами', noteLbl: 'Заметка', youLbl: 'Вы',
    ev: { created: 'Задача создана', self_added: 'Добавлена сотрудником', assigned: (b) => 'Назначено: ' + b, seen: '👀 Открыта', reported: '✅ Сообщено о готовности', confirmed: '✔ Принято менеджером', reopened: '↩ Возвращена в работу', reminder: '⏰ Напоминание', disc_open: '💬 Обсуждение открыто', disc_closed: '✔ Вопрос решён', due_changed: (b) => 'Срок или важность изменены: ' + b, done_field: '✅ Выполнено на месте', status: (b) => 'Статус: ' + b },
  },
  hy: {
    title: 'Իմ առաջադրանքները', add: '＋ Ինձ', empty: 'Բաց առաջադրանքներ չկան', loadErr: 'Չհաջողվեց բեռնել առաջադրանքները', due: 'Ժամկետ', noDue: 'առանց ժամկետի', overdue: 'ժամկետանց',
    with: 'հետ', waitReview: '⏳ Սպասում է մենեջերի ստուգմանը', discOpen: '💬 Քննարկումը բաց է. սպասեք մենեջերի պատասխանին',
    msgHint: 'Գրեք հաղորդագրություն…', send: 'Ուղարկել', photo: 'Լուսանկար', voice: 'Ձայնային', stop: '⏹ Կանգնեցնել և ուղարկել', done: '✅ Կատարված է',
    doneTitle: 'Նշել որպես կատարված', note: 'Նշում (ոչ պարտադիր)', sendDone: '✅ Ուղարկել մենեջերին', cancel: 'Չեղարկել',
    newTitle: 'Նոր առաջադրանք ինձ համար', what: 'Ի՞նչ անել', deadline: 'Ժամկետ', today: 'Այսօր', d1: '1 օր', d3: '3 օր', noDl: 'Առանց ժամկետի',
    priority: 'Կարևորություն', normal: 'Սովորական', important: 'Կարևոր', urgent: 'Հրատապ', save: 'Ավելացնել', history: 'Պատմություն', manager: 'Մենեջեր',
    route: '🗺 Երթուղի', doneGps: '✅ Կատարված է տեղում (լուսանկար)', place: 'Վայր', rec: '● Ձայնագրություն', close: 'Փակել', error: 'Սխալ', opened: '👀 բացվել է', listen: '▶ Լսել', playing: '⏸ Նվագում է…', photoAdded: 'Լուսանկարը ավելացվեց', reportSent: 'Ուղարկվեց մենեջերին',
    selfNote: 'Մենեջերը կտեսնի, որ դուք ինքներդ եք ավելացրել', noteLbl: 'Նշում', youLbl: 'Դուք',
    ev: { created: 'Առաջադրանքը ստեղծվեց', self_added: 'Ավելացվեց աշխատակցի կողմից', assigned: (b) => 'Նշանակվեց՝ ' + b, seen: '👀 Բացվեց', reported: '✅ Զեկուցվեց կատարման մասին', confirmed: '✔ Ընդունվեց մենեջերի կողմից', reopened: '↩ Վերադարձվեց աշխատանքի', reminder: '⏰ Հիշեցում', disc_open: '💬 Քննարկում բացվեց', disc_closed: '✔ Հարցը լուծվեց', due_changed: (b) => 'Ժամկետը կամ կարևորությունը փոխվեց՝ ' + b, done_field: '✅ Կատարվեց տեղում', status: (b) => 'Կարգավիճակ՝ ' + b },
  },
};
const L = TXT[TASKS_LANG] || TXT.ru;

const P = {
  bg: '#eef2f0', card: '#ffffff', ink: '#14211d', muted: '#5b6a65', line: '#d9e1dd', pine: (C && C.pine) || '#123a33', sun: (C && C.sun) || '#e9a11b', sunInk: (C && C.sunInk) || '#2e1f00',
  ok: '#2c8a57', okSoft: '#e1f2e8', warn: '#b86d06', warnSoft: '#fbeedb', bad: '#c23d2c', badSoft: '#fbe4e0', info: '#2c67a6', infoSoft: '#e2ecf7', mute: '#e7ecea',
};

const p2 = (n) => String(n).padStart(2, '0');
const fdt = (iso) => { if (!iso) return ''; const d = new Date(iso); return p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); };
const fday = (s) => { if (!s) return ''; const a = String(s).slice(0, 10).split('-'); return a[2] + '.' + a[1] + '.' + a[0]; };
const ymd = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
const plusDays = (n) => ymd(Date.now() + n * 864e5);
const isOver = (t) => t.due && String(t.due).slice(0, 10) < ymd(Date.now());
const PRI = { urgent: [L.urgent, P.bad, P.badSoft], important: [L.important, P.warn, P.warnSoft] };

function Chip({ text, fg, bg }) {
  return <View style={[st.chip, { backgroundColor: bg }]}><Text style={[st.chipT, { color: fg }]}>{text}</Text></View>;
}
function Btn({ label, onPress, kind, disabled, small }) {
  const k = kind === 'ghost' ? st.btnGhost : kind === 'danger' ? st.btnDanger : kind === 'dark' ? st.btnDark : st.btnPrimary;
  const kt = kind === 'ghost' ? st.btnGhostT : kind === 'danger' ? st.btnDangerT : kind === 'dark' ? st.btnDarkT : st.btnPrimaryT;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[st.btn, small && st.btnSm, k, disabled && { opacity: 0.45 }]}>
      <Text style={[st.btnT, kt]}>{label}</Text>
    </Pressable>
  );
}

export default function TasksScreen({ userId, embedded, openTaskId, onOpenedTask, places, gpsTaskIds, onGpsDone }) {
  const [uid, setUid] = useState(userId || null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState(null);
  const [log, setLog] = useState([]);
  const [urls, setUrls] = useState({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);            // секунды идущей записи
  const [playing, setPlaying] = useState(null);
  const [cam, setCam] = useState(null);                 // 'post' | 'report' | null
  const [doneOpen, setDoneOpen] = useState(false);
  const [doneNote, setDoneNote] = useState('');
  const [donePhoto, setDonePhoto] = useState(null);     // {path, uri}
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ title: '', note: '', due: '', priority: 'normal' });
  const [zoom, setZoom] = useState(null);
  const stopPlay = useRef(null);
  useEffect(() => {
    if (!recording) { setRecSec(0); return undefined; }
    const t0 = Date.now();
    const i = setInterval(() => setRecSec(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(i);
  }, [recording]);
  const openRef = useRef(null);
  openRef.current = openId;

  useEffect(() => { if (!userId) supabase.auth.getSession().then(({ data }) => { if (data && data.session) setUid(data.session.user.id); }); }, [userId]);

  const load = useCallback(async (quiet) => {
    try { setErr(''); const r = await myTasks(); setTasks(r); }
    catch (e) { if (!quiet) setErr(L.loadErr + ': ' + errText(e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  const loadLog = useCallback(async (id) => {
    try {
      const rows = await taskLog(id);
      if (openRef.current !== id) return;
      setLog(rows);
      const need = rows.map((x) => x.path).filter(Boolean);
      if (need.length) { const u = await signedUrls(need); setUrls((o) => ({ ...o, ...u })); }
    } catch (e) { /* без связи оставляем прежнюю переписку */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => { load(true); if (openRef.current) loadLog(openRef.current); }, 30000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { load(true); if (openRef.current) loadLog(openRef.current); } });
    return () => { clearInterval(t); sub && sub.remove && sub.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fail = (e) => Alert.alert(L.error, errText(e));
  const placeOf = (t) => (places || []).find((p) => p.id === t.place_id) || null;
  const openRoute = (t) => {
    const pl = placeOf(t);
    Linking.openURL(t.lat != null ? 'https://www.google.com/maps/dir/?api=1&destination=' + t.lat + ',' + t.lng : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((pl && pl.name) || t.title)).catch(() => {});
  };
  // открыть задачу по нажатию на уведомление (приходит из главного экрана)
  useEffect(() => { if (openTaskId && !loading) { openTask(openTaskId); if (onOpenedTask) onOpenedTask(); } }, [openTaskId, loading]); // eslint-disable-line react-hooks/exhaustive-deps
  const task = tasks.find((x) => x.id === openId) || null;
  // менеджер принял задачу, пока она открыта: она пропала из списка, закрываем карточку
  useEffect(() => { if (openId && !loading && !task) { setOpenId(null); openRef.current = null; } }, [openId, loading, task]);

  async function openTask(id) {
    setOpenId(id); openRef.current = id; setLog([]); setText(''); setDonePhoto(null); setDoneNote('');
    loadLog(id);
    try {
      await taskSeen(id);   // 👀 фиксируется один раз на сервере
      load(true);
    } catch (e) { /* не критично: повторится при следующем открытии */ }
  }
  function closeTask() {
    if (recording) { setRecording(false); stopVoice().catch(() => {}); }
    if (stopPlay.current) { stopPlay.current(); stopPlay.current = null; setPlaying(null); }
    setOpenId(null); openRef.current = null; load(true);
  }

  async function sendText() {
    const body = text.trim(); if (!body || busy) return;
    setBusy(true);
    try { await taskPost(openId, 'text', body, null); setText(''); await loadLog(openId); load(true); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function onShot(uri) {
    const purpose = cam; setCam(null);
    setBusy(true);
    try {
      const path = await uploadTaskPhoto(uri, uid);
      if (purpose === 'report') { setDonePhoto({ path, uri }); }
      else { await taskPost(openId, 'photo', text.trim() || null, path); setText(''); await loadLog(openId); load(true); }
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function toggleVoice() {
    if (busy && !recording) return;
    if (!recording) {
      try { await startVoice(); setRecording(true); } catch (e) { fail(e); }
      return;
    }
    setRecording(false); setBusy(true);
    try {
      const rec = await stopVoice();
      if (!rec) return;
      const path = await uploadVoice(rec.uri, uid);
      await taskPost(openId, 'voice', text.trim() || null, path); setText('');
      await loadLog(openId); load(true);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function play(path) {
    const url = urls[path]; if (!url) return;
    if (stopPlay.current) { stopPlay.current(); stopPlay.current = null; }
    if (playing === path) { setPlaying(null); return; }
    try { setPlaying(path); stopPlay.current = await playVoice(url, () => setPlaying(null)); } catch (e) { setPlaying(null); fail(e); }
  }
  async function submitDone() {
    if (busy) return;
    setBusy(true);
    try {
      await taskReport(openId, donePhoto ? donePhoto.path : null, doneNote.trim() || null);
      setDoneOpen(false); setDonePhoto(null); setDoneNote('');
      await load(true); await loadLog(openId);
      Alert.alert(L.reportSent);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function submitAdd() {
    const title = form.title.trim(); if (!title || busy) return;
    setBusy(true);
    try {
      await taskSelfAdd(title, form.note.trim() || null, form.due || null, form.priority);
      setAddOpen(false); setForm({ title: '', note: '', due: '', priority: 'normal' }); await load(true);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  const mine1 = task && uid && task.staff_id === uid;
  const partner = task ? (mine1 ? task.name2 : task.name1) : '';
  const seen = task ? (mine1 ? task.seen_at : task.seen2_at) : null;

  return (
    <View style={st.root}>
      <View style={st.head}>
        {embedded ? <View style={{ flex: 1 }} /> : <Text style={[st.h1, { color: '#ffffff' }]}>{L.title}{tasks.length ? ' · ' + tasks.length : ''}</Text>}
        <Btn label={L.add} small onPress={() => setAddOpen(true)} />
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={P.pine} /> : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          {!!err && <View style={[st.flag, { backgroundColor: P.badSoft }]}><Text style={{ color: P.bad }}>{err}</Text></View>}
          {!tasks.length && !err && <Text style={st.empty}>{L.empty}</Text>}
          {tasks.map((t) => {
            const m1 = uid && t.staff_id === uid; const pr = PRI[t.priority]; const other = m1 ? t.name2 : t.name1; const sn = m1 ? t.seen_at : t.seen2_at;
            return (
              <Pressable key={t.id} onPress={() => openTask(t.id)} accessibilityRole="button" accessibilityLabel={t.title} style={st.card}>
                <Text style={st.cardT}>{t.title}</Text>
                {!!t.note && <Text style={st.muted} numberOfLines={2}>{t.note}</Text>}
                {!!placeOf(t) && <Text style={st.muted}>📍 {placeOf(t).name}</Text>}
                <View style={st.row}>
                  {pr && <Chip text={pr[0]} fg={pr[1]} bg={pr[2]} />}
                  {t.status === 'report' && <Chip text={L.waitReview} fg={P.warn} bg={P.warnSoft} />}
                  {t.disc_status === 'open' && <Chip text="💬" fg={P.bad} bg={P.badSoft} />}
                  {!sn && t.status === 'new' && <Chip text="NEW" fg={P.info} bg={P.infoSoft} />}
                </View>
                <Text style={[st.muted, isOver(t) && { color: P.bad, fontWeight: '700' }]}>
                  {L.due}: {t.due ? fday(t.due) + (isOver(t) ? ' · ' + L.overdue : '') : L.noDue}{other ? '  ·  ' + L.with + ' ' + other : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* ----- карточка задачи ----- */}
      <Modal visible={!!task} animationType="slide" onRequestClose={closeTask}>
        {task && (
          <KeyboardAvoidingView style={st.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={st.head}>
              <Pressable onPress={closeTask} accessibilityRole="button" accessibilityLabel={L.close}><Text style={st.back}>‹ {L.close}</Text></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              <Text style={st.h1}>{task.title}</Text>
              <View style={st.row}>
                {PRI[task.priority] && <Chip text={PRI[task.priority][0]} fg={PRI[task.priority][1]} bg={PRI[task.priority][2]} />}
                {!!seen && <Chip text={L.opened + ' ' + fdt(seen)} fg={P.ok} bg={P.okSoft} />}
              </View>
              {!!task.note && <View style={st.flag}><Text style={st.ink}>{task.note}</Text></View>}
              <Text style={st.muted}>{L.due}: {task.due ? fday(task.due) : L.noDue}{partner ? '  ·  ' + L.with + ' ' + partner : ''}</Text>
              {!!placeOf(task) && <Text style={st.muted}>📍 {L.place}: {placeOf(task).name}</Text>}
              {task.status === 'report' && <View style={[st.flag, { backgroundColor: P.warnSoft }]}><Text style={{ color: P.warn }}>{L.waitReview}</Text></View>}
              {task.disc_status === 'open' && <View style={[st.flag, { backgroundColor: P.badSoft }]}><Text style={{ color: P.bad }}>{L.discOpen}</Text></View>}

              <Text style={st.label}>{L.history}</Text>
              {log.map((l) => <LogRow key={l.id} l={l} mine={uid && l.actor_id === uid} urls={urls} playing={playing} onPlay={play} onZoom={setZoom} />)}

              <TextInput style={st.input} value={text} onChangeText={setText} placeholder={L.msgHint} multiline submitBehavior="submit" returnKeyType="send" onSubmitEditing={sendText} accessibilityLabel={L.msgHint} />
              {recording && (
                <View style={[st.flag, { backgroundColor: P.badSoft, flexDirection: 'row', alignItems: 'center', gap: 10 }]} accessibilityLiveRegion="polite">
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: P.bad }} />
                  <Text style={{ color: P.bad, fontWeight: '800', fontSize: 18 }}>{L.rec} {Math.floor(recSec / 60)}:{p2(recSec % 60)}</Text>
                </View>
              )}
              <View style={st.row}>
                <Btn label={L.send} small onPress={sendText} disabled={!text.trim() || busy} />
                <Btn label={'📷 ' + L.photo} small kind="ghost" onPress={() => setCam('post')} disabled={busy} />
                <Btn label={recording ? L.stop + ' · ' + Math.floor(recSec / 60) + ':' + p2(recSec % 60) : '🎤 ' + L.voice} small kind={recording ? 'danger' : 'ghost'} onPress={toggleVoice} disabled={busy && !recording} />
              </View>
              {busy && <ActivityIndicator color={P.pine} />}
              {(task.place_id || task.lat != null) && <Btn label={L.route} kind="ghost" onPress={() => openRoute(task)} />}
              {task.status === 'new' && (gpsTaskIds && gpsTaskIds.includes(task.id) && onGpsDone
                ? <Btn label={L.doneGps} kind="dark" onPress={() => { const id = task.id; closeTask(); onGpsDone(id); }} />
                : <Btn label={L.done} kind="dark" onPress={() => setDoneOpen(true)} />)}
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </Modal>

      {/* ----- «Готово» ----- */}
      <Modal visible={doneOpen} transparent animationType="fade" onRequestClose={() => setDoneOpen(false)}>
        <View style={st.scrim}><View style={st.sheet}>
          <Text style={st.h2}>{L.doneTitle}</Text>
          <TextInput style={st.input} value={doneNote} onChangeText={setDoneNote} placeholder={L.note} multiline accessibilityLabel={L.note} />
          <View style={st.row}>
            <Btn label={'📷 ' + L.photo} small kind="ghost" onPress={() => setCam('report')} disabled={busy} />
            {donePhoto && <Image source={{ uri: donePhoto.uri }} style={st.thumb} accessibilityLabel={L.photoAdded} />}
          </View>
          <Btn label={L.sendDone} onPress={submitDone} disabled={busy} />
          <Btn label={L.cancel} kind="ghost" onPress={() => setDoneOpen(false)} />
        </View></View>
      </Modal>

      {/* ----- задача себе ----- */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View style={st.scrim}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}><View style={st.sheet}>
          <Text style={st.h2}>{L.newTitle}</Text>
          <TextInput style={st.input} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder={L.what} accessibilityLabel={L.what} />
          <TextInput style={st.input} value={form.note} onChangeText={(v) => setForm({ ...form, note: v })} placeholder={L.noteLbl} accessibilityLabel={L.noteLbl} />
          <Text style={st.label}>{L.deadline}</Text>
          <View style={st.row}>
            {[[L.today, plusDays(0)], [L.d1, plusDays(1)], [L.d3, plusDays(3)], [L.noDl, '']].map(([lbl, v]) => (
              <Pressable key={lbl} onPress={() => setForm({ ...form, due: v })} accessibilityRole="button" style={[st.seg, form.due === v && st.segOn]}><Text style={[st.segT, form.due === v && { color: P.sunInk, fontWeight: '700' }]}>{lbl}</Text></Pressable>
            ))}
          </View>
          <Text style={st.label}>{L.priority}</Text>
          <View style={st.row}>
            {[[L.normal, 'normal'], [L.important, 'important'], [L.urgent, 'urgent']].map(([lbl, v]) => (
              <Pressable key={v} onPress={() => setForm({ ...form, priority: v })} accessibilityRole="button" style={[st.seg, form.priority === v && st.segOn]}><Text style={[st.segT, form.priority === v && { color: P.sunInk, fontWeight: '700' }]}>{lbl}</Text></Pressable>
            ))}
          </View>
          <Text style={st.muted}>{L.selfNote}</Text>
          <Btn label={L.save} onPress={submitAdd} disabled={!form.title.trim() || busy} />
          <Btn label={L.cancel} kind="ghost" onPress={() => setAddOpen(false)} />
        </View></ScrollView></View>
      </Modal>

      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        <Pressable style={[st.scrim, { backgroundColor: '#000' }]} onPress={() => setZoom(null)} accessibilityLabel={L.close}>
          {!!zoom && <Image source={{ uri: zoom }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />}
        </Pressable>
      </Modal>

      <CameraSheet visible={!!cam} title={L.photo} onClose={() => setCam(null)} onShot={onShot} />
    </View>
  );
}

function LogRow({ l, mine, urls, playing, onPlay, onZoom }) {
  if (l.kind === 'event') {
    const f = L.ev[l.code];
    const label = typeof f === 'function' ? f(l.body || '') : (f || l.code || '');
    return <Text style={st.event}>{fdt(l.at)} · {label}{l.actor_role !== 'system' && l.code !== 'created' ? ' · ' + l.actor_name : ''}</Text>;
  }
  const who = mine ? L.youLbl : (l.actor_role === 'admin' ? L.manager : l.actor_name);
  const url = l.path ? urls[l.path] : null;
  return (
    <View style={[st.bubble, mine ? st.bubbleMine : st.bubbleOther]}>
      <Text style={st.bubbleWho}>{who} · {fdt(l.at)}</Text>
      {l.kind === 'voice' && (
        <Pressable onPress={() => onPlay(l.path)} disabled={!url} accessibilityRole="button" accessibilityLabel={L.listen} style={st.play}>
          <Text style={st.playT}>{playing === l.path ? L.playing : L.listen}</Text>
        </Pressable>
      )}
      {l.kind === 'photo' && (url
        ? <Pressable onPress={() => onZoom(url)} accessibilityRole="imagebutton" accessibilityLabel={L.photo}><Image source={{ uri: url }} style={st.photo} /></Pressable>
        : <ActivityIndicator color={P.pine} />)}
      {!!l.body && <Text style={st.ink}>{l.body}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: P.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: P.pine },
  h1: { fontSize: 20, fontWeight: '700', color: P.ink },
  h2: { fontSize: 18, fontWeight: '700', color: P.ink },
  back: { color: '#fff', fontSize: 17 },
  card: { backgroundColor: P.card, borderRadius: 14, borderWidth: 1, borderColor: P.line, padding: 14, gap: 8 },
  cardT: { fontSize: 16, fontWeight: '700', color: P.ink },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  muted: { color: P.muted, fontSize: 13 },
  ink: { color: P.ink, fontSize: 15 },
  empty: { textAlign: 'center', color: P.muted, marginTop: 40, fontSize: 15 },
  label: { fontSize: 12, fontWeight: '700', color: P.muted, textTransform: 'uppercase', marginTop: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipT: { fontSize: 12, fontWeight: '700' },
  flag: { borderRadius: 11, padding: 12, backgroundColor: P.mute },
  event: { color: P.muted, fontSize: 12.5 },
  bubble: { borderRadius: 14, padding: 10, gap: 6, maxWidth: '88%' },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: P.okSoft },
  bubbleOther: { alignSelf: 'flex-start', backgroundColor: P.card, borderWidth: 1, borderColor: P.line },
  bubbleWho: { fontSize: 11.5, color: P.muted, fontWeight: '600' },
  photo: { width: 200, height: 200, borderRadius: 10, backgroundColor: P.mute },
  thumb: { width: 56, height: 56, borderRadius: 8 },
  play: { backgroundColor: P.infoSoft, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  playT: { color: P.info, fontWeight: '700' },
  input: { backgroundColor: P.card, borderWidth: 1, borderColor: P.line, borderRadius: 11, padding: 12, fontSize: 16, minHeight: 46, color: P.ink },
  btn: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  btnSm: { paddingVertical: 9, paddingHorizontal: 12, minHeight: 40 },
  btnT: { fontWeight: '700', fontSize: 15 },
  btnPrimary: { backgroundColor: P.sun }, btnPrimaryT: { color: P.sunInk },
  btnDark: { backgroundColor: P.pine }, btnDarkT: { color: '#fff' },
  btnGhost: { backgroundColor: P.card, borderWidth: 1, borderColor: P.line }, btnGhostT: { color: P.ink },
  btnDanger: { backgroundColor: P.badSoft }, btnDangerT: { color: P.bad },
  scrim: { flex: 1, backgroundColor: 'rgba(5,15,12,0.55)', justifyContent: 'center', padding: 16 },
  sheet: { backgroundColor: P.card, borderRadius: 18, padding: 18, gap: 12 },
  seg: { borderWidth: 1, borderColor: P.line, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: P.card },
  segOn: { backgroundColor: P.sun, borderColor: P.sun },
  segT: { color: P.ink, fontSize: 14 },
});
