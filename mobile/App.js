import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, Pressable, RefreshControl, Image, Alert, Linking, StatusBar as RNStatusBar, AppState, BackHandler, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Application from 'expo-application';
import { StatusBar } from 'expo-status-bar';
import { supabase, rpc, errText, phoneEmail, normPhone } from './src/supabase';
import { deviceId, getFix, officeWifiOk, distM, permStatus, askPermissions } from './src/device';
import { startTrack, stopTrack, flushTrack } from './src/track';
import { CameraSheet, uploadPhoto, preparePhoto, uploadPrepared } from './src/photo';
import { C, Btn, Card, H1, H2, Label, Muted, T, Field, Flag, Chip, Icon, Tile, Action, Row, Check, TabBar } from './src/ui';
import { setupNotify, planReminders, notifyGranted } from './src/notify';
import { addToBox, flushBox, boxCount, isNetErr } from './src/outbox';
import TasksScreen from './src/TasksScreen';
import { tr, loc, getLang, setLang, loadLang, onLang } from './src/i18n';
import { startTalk, stopTalk, uploadTalk, requestTalkAi, talkRecording, TALK_MAX_MS } from './src/talk';
import { registerPush, onTaskNotificationTap, lastTaskTap } from './src/tasks';

const CATS = { inverter: 'Не работает инвертор', output: 'Упала выработка', panel: 'Повреждена панель', wiring: 'Проводка и разъёмы', battery: 'Аккумулятор', cleaning: 'Чистка панелей', checkup: 'Плановый техосмотр', expand: 'Расширение или чужая станция', other: 'Другое' };
const ST = { new: ['Новый', 'info'], assigned: ['Взят', 'info'], enroute: ['В пути', 'warn'], onsite: ['На месте', 'warn'], done: ['Выполнен', 'ok'], closed: ['Закрыт', 'note'], cancelled: ['Отменён', 'note'] };
const p2 = (n) => String(n).padStart(2, '0');
const hm = (ts) => { if (!ts) return '—'; const d = new Date(ts); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
const dur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + tr(' мин') : Math.floor(m / 60) + tr(' ч ') + p2(m % 60) + tr(' мин'); };
const money = (n) => (n == null ? '—' : Math.round(n).toLocaleString('ru-RU') + ' ֏');
const fDist = (m) => (m == null ? '—' : m < 1000 ? m + tr(' м') : (m / 1000).toFixed(1).replace('.', ',') + tr(' км'));
const ymd = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const MONTHS_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const initials = (n) => String(n || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const mapsTo = (lat, lng, q) => Linking.openURL(lat != null ? 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q || ''));

export default function App() {
  const [session, setSession] = useState(undefined);
  const [lang, setLangState] = useState(null);
  useEffect(() => {
    loadLang().then(setLangState);
    const off = onLang(setLangState);
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => { sub.subscription.unsubscribe(); off(); };
  }, []);
  return (
    <SafeAreaView key={lang || 'x'} style={{ flex: 1, backgroundColor: C.pine, paddingTop: RNStatusBar.currentHeight || 0 }}>
      <StatusBar style="light" />
      {session === undefined || !lang ? <Splash /> : session ? <Main session={session} /> : <Auth />}
    </SafeAreaView>
  );
}

function Splash() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.pineInk, fontSize: 22, fontWeight: '700' }}>Arev Service</Text></View>;
}

function Header({ title, sub, right, onBack }) {
  return (
    <View style={{ backgroundColor: C.pine, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel={tr('Назад')} style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="arrow-back" size={24} color={C.pineInk} />
        </Pressable>
      ) : (
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.sun, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="sunny" size={18} color={C.pine} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.pineInk, fontWeight: '700', fontSize: 17 }} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={{ color: C.pineInk, opacity: 0.7, fontSize: 12 }} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

function Page({ children, onRefresh, refreshing }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}>
      {children}
    </ScrollView>
  );
}

/* ---------------- вход и регистрация ---------------- */
function Auth() {
  const [mode, setMode] = useState('login');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (normPhone(phone).length < 11) return Alert.alert(tr('Телефон'), tr('Введите номер полностью, например +374 91 123456'));
    if (!/^\d{6,}$/.test(pin)) return Alert.alert(tr('PIN-код'), tr('PIN-код — минимум 6 цифр'));
    if (mode === 'reg' && pin !== pin2) return Alert.alert(tr('PIN-код'), tr('PIN-коды не совпадают'));
    setBusy(true);
    try {
      const email = phoneEmail(phone);
      const r = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password: pin })
        : await supabase.auth.signUp({ email, password: pin });
      if (r.error) throw r.error;
      if (mode === 'reg' && !r.data.session) Alert.alert(tr('Почти готово'), tr('Аккаунт создан. Войдите с этим номером и PIN-кодом.'));
    } catch (e) {
      Alert.alert(tr('Не получилось'), errText(e));
    } finally { setBusy(false); }
  };
  return (
    <>
      <Header title="Arev Service" sub={tr('Приложение сотрудника')} />
      <Page>
        <H1>{mode === 'login' ? tr('Вход') : tr('Новый сотрудник')}</H1>
        <Muted>{mode === 'login' ? tr('Войдите по номеру телефона и PIN-коду.') : tr('Придумайте PIN-код из 6 цифр. Его нужно запомнить: им вы будете входить в приложение.')}</Muted>
        <Field label={tr('Телефон')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+374 91 123456" autoComplete="tel" />
        <Field label={tr('PIN-код')} value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={12} placeholder="••••••" />
        {mode === 'reg' ? <Field label={tr('Повторите PIN-код')} value={pin2} onChangeText={setPin2} keyboardType="number-pad" secureTextEntry maxLength={12} /> : null}
        <Btn title={mode === 'login' ? tr('Войти') : tr('Создать аккаунт')} onPress={go} busy={busy} big />
        <Btn kind="ghost" title={mode === 'login' ? tr('Я новый сотрудник') : tr('У меня уже есть аккаунт')} onPress={() => setMode(mode === 'login' ? 'reg' : 'login')} />
        <Muted style={{ textAlign: 'center' }}>{tr('Забыли PIN-код? Обратитесь к руководителю.')}</Muted>
      </Page>
    </>
  );
}

/* ---------------- основное приложение ---------------- */
const TAB_TITLE = { home: 'Arev Service', tasks: 'Задачи', day: 'Мой день', history: 'История', profile: 'Профиль' };
const SUB_TITLE = { shift: 'Смена', fuel: 'Заправка', ticket: 'Заказ', purchase: 'Закупка', take: 'Со склада', deliver: 'Сдать материал', work: 'Фото работ', talk: 'Разговор с клиентом', task: 'Задача', help: 'Как пользоваться', perms: 'Разрешения' };

function Main({ session }) {
  const uid = session.user.id;
  const [st, setSt] = useState({ loading: true });
  const [tab, setTab] = useState('home');
  const [view, setView] = useState({ name: 'home' });
  const [refreshing, setRefreshing] = useState(false);
  const [boxN, setBoxN] = useState(0);
  const [openTask, setOpenTask] = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const d0 = new Date(); d0.setHours(0, 0, 0, 0);
      const [staffR, cfgR, shiftR, myR, poolR, buyR, wpR, plR, fuR, ntR, tlR] = await Promise.all([
        supabase.from('staff').select('*').eq('id', uid).maybeSingle(),
        supabase.from('config').select('*').eq('id', 1).maybeSingle(),
        supabase.from('shifts').select('*').eq('staff_id', uid).order('start_at', { ascending: false }).limit(10),
        supabase.from('tickets').select('*').eq('staff_id', uid).order('created_at', { ascending: false }).limit(30),
        supabase.rpc('get_pool'),
        supabase.from('purchases').select('*').eq('staff_id', uid).in('status', ['bought', 'partial']).order('created_at'),
        supabase.from('work_photos').select('id,at,kind,object,note,path').eq('staff_id', uid).gte('at', d0.toISOString()).order('at', { ascending: false }),
        supabase.from('places').select('id,name,kind,lat,lng,radius').eq('active', true).order('name'),
        supabase.from('fuel').select('liters,amount,at').eq('staff_id', uid).gte('at', d0.toISOString()),
        supabase.rpc('my_tasks'),
        supabase.from('talks').select('id,at,object,duration_s,status').eq('staff_id', uid).gte('at', d0.toISOString()).order('at', { ascending: false }),
      ]);
      const shifts = shiftR.data || [];
      const next = {
        loading: false,
        staff: staffR.data || null,
        cfg: cfgR.data || {},
        shifts,
        open: shifts.find((x) => !x.end_at) || null,
        mine: myR.data || [],
        pool: poolR.data || [],
        buys: buyR.data || [],
        wph: wpR.data || [],
        places: plR.data || [],
        tasks: [],   // задачи теперь только во вкладке «Задачи»
        nToday: (ntR.data || []).filter((t) => t.status === 'new' && (!t.due || String(t.due).slice(0, 10) <= ymd(new Date()))).length,
        fuelToday: fuR.data || [],
        talks: tlR.data || [],
        nTasks: (ntR.data || []).filter((t) => t.status === 'new').length,
        err: staffR.error ? errText(staffR.error) : null,
      };
      setSt(next);
      if (next.staff && next.staff.status === 'approved') {
        // офис, склад и поставщики — там напоминание «долго стоите без фото» не нужно
        const c = next.cfg;
        const known = [];
        if (c.office_lat != null) known.push({ lat: c.office_lat, lng: c.office_lng, r: Math.max(250, c.office_radius || 150) });
        if (c.warehouse_lat != null) known.push({ lat: c.warehouse_lat, lng: c.warehouse_lng, r: 250 });
        next.places.filter((p) => p.kind === 'warehouse' || p.kind === 'supplier').forEach((p) => known.push({ lat: p.lat, lng: p.lng, r: p.radius || 200 }));
        AsyncStorage.setItem('arev.known', JSON.stringify(known)).catch(() => {});
        planReminders({
          cfg: c, open: next.open, buys: next.buys, wphCount: next.wph.length,
          startedToday: shifts.some((x) => new Date(x.start_at) >= d0),
          tasksLeft: next.nToday,
        });
      }
    } catch (e) {
      setSt((p) => ({ ...p, loading: false, err: errText(e) }));
    }
  }, [uid]);

  const syncBox = useCallback(async () => {
    try {
      const r = await flushBox(uid);
      setBoxN(r.left);
      if (r.sent) load();
    } catch (e) {}
  }, [uid, load]);

  useEffect(() => {
    load();
    syncBox();
    boxCount().then(setBoxN);
    timer.current = setInterval(load, 30000);
    const sub = AppState.addEventListener('change', (a) => { if (a === 'active') { load(); flushTrack().catch(() => {}); syncBox(); } });
    const net = NetInfo.addEventListener((n) => { if (n.isConnected) syncBox(); });
    return () => { clearInterval(timer.current); sub.remove(); net(); };
  }, [load, syncBox]);

  const approved = st.staff && st.staff.status === 'approved';
  useEffect(() => { if (approved) setupNotify(); }, [approved]);

  // push-уведомления о задачах: токен в базу, нажатие на уведомление открывает задачу
  useEffect(() => {
    if (!approved) return undefined;
    registerPush();
    const go = (id) => { setView({ name: 'home' }); setTab('tasks'); setOpenTask(id); };
    lastTaskTap().then((id) => { if (id) go(id); });
    return onTaskNotificationTap(go);
  }, [approved]);

  // если смена открыта, но запись маршрута остановилась (перезагрузка телефона) — включаем снова
  useEffect(() => { if (st.open) startTrack(); }, [st.open && st.open.id]);

  // кнопка «назад» на телефоне возвращает на вкладку
  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (view.name !== 'home') { setView({ name: 'home' }); return true; }
      if (tab !== 'home') { setTab('home'); return true; }
      return false;
    });
    return () => h.remove();
  }, [view.name, tab]);

  const refresh = async () => { setRefreshing(true); await load(); await syncBox(); setRefreshing(false); };
  const nav = (name, p) => setView({ name, ...(p || {}) });
  const goTab = (t) => { setTab(t); setView({ name: 'home' }); };
  const ctx = { uid, setOpenTask, phone: String(session.user.email || '').split('@')[0], st, load, nav, goTab, refreshing, refresh, boxN, setBoxN, syncBox };

  if (st.loading) return <Splash />;
  if (!st.staff) return <Register ctx={ctx} />;
  if (st.staff.status !== 'approved') return <Waiting ctx={ctx} />;

  if (view.name !== 'home') {
    let body = null;
    if (view.name === 'shift') body = <ShiftScreen ctx={ctx} />;
    else if (view.name === 'fuel') body = <FuelScreen ctx={ctx} />;
    else if (view.name === 'ticket') body = <TicketScreen ctx={ctx} id={view.id} pooled={view.pooled} />;
    else if (view.name === 'purchase') body = <PurchaseScreen ctx={ctx} ticket={view.ticket} task={view.task} />;
    else if (view.name === 'take') body = <PurchaseScreen ctx={ctx} ticket={view.ticket} source="warehouse" />;
    else if (view.name === 'deliver') body = <DeliverScreen ctx={ctx} id={view.id} />;
    else if (view.name === 'work') body = <WorkScreen ctx={ctx} ticket={view.ticket} />;
    else if (view.name === 'task') body = <TaskScreen ctx={ctx} id={view.id} />;
    else if (view.name === 'help') body = <Help ctx={ctx} />;
    else if (view.name === 'talk') body = <TalkScreen ctx={ctx} />;
    else if (view.name === 'perms') body = <Page><PermCard always /><NotifyCard /></Page>;
    return (
      <>
        <Header title={tr(SUB_TITLE[view.name] || 'Arev Service')} sub={st.staff.name} onBack={() => nav('home')} />
        {body}
      </>
    );
  }
  let body;
  if (tab === 'day') body = <MyDay ctx={ctx} />;
  else if (tab === 'history') body = <History ctx={ctx} />;
  else if (tab === 'profile') body = <Profile ctx={ctx} />;
  else if (tab === 'tasks') body = <TasksScreen userId={uid} embedded openTaskId={openTask} onOpenedTask={() => setOpenTask(null)} places={st.places} onPurchase={(id) => nav('purchase', { task: id })} />;
  else body = <Home ctx={ctx} />;
  const left = st.buys.length + st.tasks.filter((t) => t.status === 'new').length;
  return (
    <>
      <Header title={tr(TAB_TITLE[tab])} sub={st.staff.name} right={st.cfg.office_phone ? (
        <Pressable onPress={() => callOffice(st.cfg)} hitSlop={10} accessibilityLabel={tr('Позвонить в офис')} style={{ padding: 4 }}>
          <Icon name="call" size={22} color={C.pineInk} />
        </Pressable>
      ) : null} />
      {body}
      <TabBar tab={tab} onTab={goTab} badges={{ home: st.open && left ? left : null, tasks: st.nTasks || null }} />
    </>
  );
}

const callOffice = (cfg) => { if (cfg && cfg.office_phone) Linking.openURL('tel:' + String(cfg.office_phone).replace(/[^\d+]/g, '')); };

function NotifyCard() {
  const [ok, setOk] = useState(true);
  useEffect(() => { notifyGranted().then(setOk); }, []);
  if (ok) return null;
  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: C.warn }}>
      <H2>{tr('Уведомления выключены')}</H2>
      <Muted>{tr('Без них приложение не напомнит начать смену, сдать закупку или снять фото работ.')}</Muted>
      <Btn kind="ghost" title={tr('Открыть настройки')} onPress={() => Linking.openSettings()} />
    </Card>
  );
}

/* ---------------- разрешения ---------------- */
function PermCard({ always }) {
  const [p, setP] = useState(null);
  const [busy, setBusy] = useState(false);
  const check = useCallback(() => { permStatus().then(setP); }, []);
  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (a) => { if (a === 'active') check(); });
    return () => sub.remove();
  }, [check]);
  if (!p) return null;
  const allOk = p.loc && p.bg && p.cam && p.gps;
  if (allOk && !always) return null;
  const row = (ok, text) => (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, color: ok ? C.ok : C.bad, width: 22 }}>{ok ? '✓' : '✕'}</Text>
      <T style={{ flex: 1 }}>{text}</T>
    </View>
  );
  const ask = async () => {
    setBusy(true);
    try {
      const r = await askPermissions();
      setP(r);
      if (r.loc && !r.bg) {
        Alert.alert(tr('Нужно «Разрешить всегда»'), tr('Откроются настройки приложения. Выберите «Разрешения» → «Местоположение» → «Разрешить в любом режиме» (или «Всегда»).'), [{ text: tr('Открыть настройки'), onPress: () => Linking.openSettings() }]);
      } else if (!r.loc || !r.cam) {
        Alert.alert(tr('Разрешения не выданы'), tr('Откройте настройки приложения и включите «Камеру» и «Местоположение».'), [{ text: tr('Открыть настройки'), onPress: () => Linking.openSettings() }, { text: tr('Позже') }]);
      }
    } finally { setBusy(false); }
  };
  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: allOk ? C.ok : C.warn }}>
      <H2>{allOk ? tr('Разрешения выданы') : tr('Нужны разрешения')}</H2>
      {row(p.loc, tr('Местоположение'))}
      {row(p.bg, tr('Местоположение «всегда» (для маршрута смены)'))}
      {row(p.cam, tr('Камера'))}
      {row(p.gps, tr('GPS включён на телефоне'))}
      {!allOk ? <Muted>{tr('Без них приложение не сможет отмечать приход, уход и выезды.')}</Muted> : null}
      {!allOk ? <Btn title={tr('Выдать разрешения')} onPress={ask} busy={busy} /> : null}
      {!allOk && p.loc ? <Btn kind="ghost" title={tr('Открыть настройки приложения')} onPress={() => Linking.openSettings()} /> : null}
    </Card>
  );
}

/* ---------------- анкета ---------------- */
function Register({ ctx }) {
  const [f, setF] = useState({ name: '', carModel: '', carPlate: '', fuel: 'petrol', norm: '', tank: '' });
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const phone = '+' + ctx.phone;
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const send = async () => {
    if (!f.name.trim()) return Alert.alert(tr('Анкета'), tr('Укажите имя и фамилию'));
    if (!f.carModel.trim() || !num(f.norm)) return Alert.alert(tr('Анкета'), tr('Укажите машину и расход на 100 км'));
    if (!ok) return Alert.alert(tr('Анкета'), tr('Нужно согласие'));
    setBusy(true);
    try {
      await rpc('register', { p_name: f.name, p_phone: phone, p_car_model: f.carModel, p_car_plate: f.carPlate, p_fuel_type: f.fuel, p_norm: num(f.norm), p_tank: num(f.tank), p_device: deviceId() });
      await askPermissions();
      await ctx.load();
    } catch (e) { Alert.alert(tr('Не получилось'), errText(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Header title="Arev Service" sub={tr('Анкета сотрудника')} />
      <Page>
        <H1>{tr('Анкета сотрудника')}</H1>
        <Muted>{tr('Заполните один раз. Анкета привязывается к этому телефону. После проверки руководителем можно работать.')}</Muted>
        <Field label={tr('Имя и фамилия')} value={f.name} onChangeText={set('name')} />
        <Card>
          <Label>{tr('Машина')}</Label>
          <Field label={tr('Марка и модель')} value={f.carModel} onChangeText={set('carModel')} placeholder="Toyota Prius" />
          <Field label={tr('Номер')} value={f.carPlate} onChangeText={set('carPlate')} placeholder="35 XX 123" autoCapitalize="characters" />
          <FuelSeg value={f.fuel} onChange={set('fuel')} />
          <Field label={tr('Расход на 100 км, ') + (f.fuel === 'gas' ? tr('м³') : tr('л'))} value={f.norm} onChangeText={set('norm')} keyboardType="decimal-pad" />
          <Field label={tr('Объём бака, ') + (f.fuel === 'gas' ? tr('м³') : tr('л'))} value={f.tank} onChangeText={set('tank')} keyboardType="decimal-pad" />
        </Card>
        <Pressable onPress={() => setOk(!ok)} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: C.pine, backgroundColor: ok ? C.pine : 'transparent', marginTop: 2 }} />
          <Muted style={{ flex: 1 }}>{tr('Согласен, что во время смены записывается моё местоположение, а фото одометра, чеков и работ сохраняются с координатами и временем и сверяются с выпиской по топливной карте.')}</Muted>
        </Pressable>
        <Btn title={tr('Отправить')} onPress={send} busy={busy} big />
        <Btn kind="ghost" title={tr('Выйти')} onPress={() => supabase.auth.signOut()} />
      </Page>
    </>
  );
}
const num = (v) => { const n = parseFloat(String(v || '').replace(',', '.')); return isFinite(n) && n > 0 ? n : null; };

function FuelSeg({ value, onChange }) {
  const opts = [['petrol', tr('Бензин')], ['gas', tr('Метан')], ['lpg', tr('Пропан')], ['diesel', tr('Дизель')]];
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: C.ink }}>{tr('Топливо')}</Text>
      <View style={{ flexDirection: 'row', backgroundColor: C.surface2, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 3, gap: 3 }}>
        {opts.map((o) => (
          <Pressable key={o[0]} onPress={() => onChange(o[0])} style={{ flex: 1, paddingVertical: 9, borderRadius: 9, backgroundColor: value === o[0] ? C.surface : 'transparent', alignItems: 'center' }}>
            <Text style={{ fontSize: 13.5, color: value === o[0] ? C.ink : C.muted, fontWeight: value === o[0] ? '700' : '400' }}>{o[1]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Waiting({ ctx }) {
  const s = ctx.st.staff;
  const txt = s.status === 'pending' ? tr('Руководитель проверит анкету. После подтверждения здесь появится кнопка «Начать смену».')
    : s.status === 'blocked' ? tr('Доступ приостановлен. ') + (s.note || tr('Свяжитесь с офисом.')) : tr('Анкета не одобрена. ') + (s.note || tr('Свяжитесь с офисом.'));
  return (
    <>
      <Header title="Arev Service" sub={s.name} />
      <Page onRefresh={ctx.refresh} refreshing={ctx.refreshing}>
        <H1>{s.status === 'pending' ? tr('Анкета на проверке') : tr('Нет доступа')}</H1>
        <Flag kind={s.status === 'pending' ? 'note' : 'warn'}>{txt}</Flag>
        {s.status === 'pending' ? <PermCard always /> : null}
        <Btn kind="ghost" title={tr('Проверить ещё раз')} onPress={ctx.refresh} />
        <Btn kind="ghost" title={tr('Выйти')} onPress={() => supabase.auth.signOut()} />
      </Page>
    </>
  );
}

/* ---------------- главный экран ---------------- */
function Home({ ctx }) {
  const { st, nav } = ctx;
  const sh = st.open;
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  const first = String(st.staff.name).split(' ')[0];
  const greet = (() => { const h = new Date().getHours(); return h < 5 ? tr('Доброй ночи') : h < 12 ? tr('Доброе утро') : h < 18 ? tr('Добрый день') : tr('Добрый вечер'); })();
  const mine = st.mine.filter((t) => ['assigned', 'enroute', 'onsite'].includes(t.status));
  const tasks = st.tasks;
  const tLeft = tasks.filter((t) => t.status === 'new').length;
  const fuelL = st.fuelToday.reduce((a, r) => a + (+r.liters || 0), 0);
  const unit = st.staff.fuel_type === 'gas' ? tr('м³') : tr('л');

  if (!sh) {
    const last = st.shifts.find((x) => x.end_at);
    const doneToday = last && new Date(last.start_at).toDateString() === new Date().toDateString();
    return (
      <Page onRefresh={ctx.refresh} refreshing={ctx.refreshing}>
        <PermCard />
        <NotifyCard />
        <View style={{ backgroundColor: C.pine, borderRadius: 20, padding: 20, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: C.sun, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.pine, fontWeight: '800', fontSize: 17 }}>{initials(st.staff.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.pineInk, fontSize: 21, fontWeight: '700' }}>{greet}, {first}</Text>
              <Text style={{ color: C.pineInk, opacity: 0.75 }}>{new Date().toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
            </View>
          </View>
          {doneToday ? (
            <Text style={{ color: C.pineInk, opacity: 0.85 }}>{tr('Смена на сегодня закончена в')}{' '}{hm(last.end_at)}{tr('. Хорошего вечера!')}</Text>
          ) : (
            <Text style={{ color: C.pineInk, opacity: 0.85 }}>{tr('Начните смену в офисе: сфотографируйте одометр и введите показания. Место и время запишутся автоматически.')}</Text>
          )}
          <Btn title={doneToday ? tr('Начать ещё одну смену') : tr('Начать смену')} onPress={() => nav('shift')} big />
        </View>
        {tasks.length ? <TaskList ctx={ctx} tasks={tasks} preview /> : null}
        {st.buys.length ? <BuyList ctx={ctx} items={st.buys} /> : null}
        {last ? (
          <Card>
            <Label>{tr('Прошлая смена')}</Label>
            <Row icon="time" title={new Date(last.start_at).toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'long' }) + ', ' + hm(last.start_at) + '–' + hm(last.end_at)}
              sub={tr('Одометр ') + last.end_odo + tr(' км') + (last.gps_km != null ? tr(' · по GPS ') + String(last.gps_km).replace('.', ',') + tr(' км') : '')} last />
          </Card>
        ) : null}
        <CallOffice cfg={st.cfg} />
      </Page>
    );
  }
  const mins = Math.max(0, Math.round((Date.now() - new Date(sh.start_at).getTime()) / 60000));
  const checks = [
    { done: true, text: tr('Смена начата'), sub: tr('в ') + hm(sh.start_at) },
    tasks.length ? { done: !tLeft, text: tr('Задачи на сегодня'), sub: (tasks.length - tLeft) + tr(' из ') + tasks.length + tr(' выполнено') } : null,
    { done: st.wph.length > 0, text: tr('Фото работ'), sub: st.wph.length ? tr('снято ') + st.wph.length : tr('снимайте до и после каждой работы') },
    { done: !st.buys.length, text: tr('Закупки и материал сданы'), sub: st.buys.length ? tr('не сдано: ') + st.buys.length : tr('всё сдано') },
    { done: false, text: tr('Закончить смену в офисе'), sub: tr('фото одометра') },
  ].filter(Boolean);
  return (
    <Page onRefresh={ctx.refresh} refreshing={ctx.refreshing}>
      <PermCard />
      <NotifyCard />
      <View style={{ backgroundColor: C.pine, borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#53c085' }} />
            <Text style={{ color: C.pineInk, opacity: 0.8, fontSize: 13 }}>{tr('Смена идёт · с')}{' '}{hm(sh.start_at)}</Text>
          </View>
          <Text style={{ color: C.pineInk, fontSize: 44, fontWeight: '800', letterSpacing: 1 }}>{Math.floor(mins / 60)}:{p2(mins % 60)}</Text>
          <Text style={{ color: C.pineInk, opacity: 0.75, fontSize: 13 }}>{greet}, {first}</Text>
        </View>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.sun, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="sunny" size={34} color={C.pine} />
        </View>
      </View>
      {ctx.boxN ? <Flag kind="warn">{tr('Без интернета сохранено фото:')}{' '}{ctx.boxN}{tr('. Они отправятся сами, когда появится связь.')}</Flag> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Tile icon="camera" value={st.wph.length} label={tr('фото работ')} tone={st.wph.length ? 'ok' : mins > 180 ? 'warn' : 'note'} onPress={() => ctx.goTab('day')} />
        <Tile icon="checkbox" value={st.nTasks || 0} label={tr('задачи')} tone={st.nTasks ? 'warn' : 'ok'} onPress={() => ctx.goTab('tasks')} />
        <Tile icon="cube" value={st.buys.length} label={tr('не сдано')} tone={st.buys.length ? 'bad' : 'ok'} onPress={st.buys.length ? () => nav('deliver', { id: st.buys[0].id }) : undefined} />
        <Tile icon="water" value={fuelL ? String(Math.round(fuelL * 10) / 10).replace('.', ',') + ' ' + unit : '—'} label={tr('заправка сегодня')} onPress={() => nav('fuel')} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Action icon="camera" title={tr('Фото работ')} sub={tr('до и после')} kind="primary" onPress={() => nav('work')} />
        <Action icon="cart" title={tr('Закупка')} sub={tr('купил в магазине')} onPress={() => nav('purchase')} />
        <Action icon="archive" title={tr('Со склада')} sub={tr('взял материал')} onPress={() => nav('take')} />
        <Action icon="water" title={tr('Заправка')} sub={tr('чек АЗС')} onPress={() => nav('fuel')} />
        <Action icon="mic" title={tr('Разговор')} sub={tr('запись с клиентом')} onPress={() => nav('talk')} />
        <Action icon="help-circle" title={tr('Помощь')} sub={tr('как пользоваться')} onPress={() => nav('help')} />
      </View>
      {tasks.length ? <TaskList ctx={ctx} tasks={tasks} /> : null}
      <BuyList ctx={ctx} items={st.buys} />
      <Card>
        <H2>{tr('План на день')}</H2>
        {checks.map((c, i) => <Check key={i} done={c.done} text={c.text} sub={c.sub} />)}
      </Card>
      {mine.length ? <H2>{mine.length > 1 ? tr('Мои заказы') : tr('Мой заказ')}</H2> : null}
      {mine.map((t) => (
        <Pressable key={t.id} onPress={() => nav('ticket', { id: t.id })}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Label>{t.num}{t.urgent ? tr(' · срочно') : ''}</Label><Chip kind={ST[t.status][1]}>{tr(ST[t.status][0])}</Chip></View>
            <T style={{ fontWeight: '700' }}>{tr(CATS[t.category] || t.category)}</T>
            <Muted>{t.address}</Muted>
            <T>{t.client_name} · {t.client_phone}</T>
          </Card>
        </Pressable>
      ))}
      {st.pool.length ? <H2>{tr('Новые заказы (')}{st.pool.length})</H2> : null}
      {st.pool.map((t) => (
        <Pressable key={t.id} onPress={() => nav('ticket', { id: t.id, pooled: t })}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T style={{ fontWeight: '700', flex: 1 }}>{tr(CATS[t.category] || t.category)}</T>{t.urgent ? <Chip kind="bad">{tr('срочно')}</Chip> : null}</View>
            <Muted>{t.address}</Muted>
            {t.est_min ? <T>{money(t.est_min)} – {money(t.est_max)}</T> : null}
          </Card>
        </Pressable>
      ))}
      <Btn kind="dark" title={tr('Закончить смену')} big onPress={() => nav('shift')} />
      <CallOffice cfg={st.cfg} />
    </Page>
  );
}

function CallOffice({ cfg }) {
  if (!cfg || !cfg.office_phone) return null;
  return (
    <Pressable onPress={() => callOffice(cfg)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 }}>
      <Icon name="call" size={18} color={C.info} />
      <Text style={{ color: C.info, fontSize: 15, fontWeight: '600' }}>{tr('Позвонить в офис')}</Text>
    </Pressable>
  );
}

/* ---------------- задачи на день ---------------- */
function TaskList({ ctx, tasks, preview }) {
  const { st, nav } = ctx;
  const done = tasks.filter((t) => t.status === 'done').length;
  const placeName = (t) => { const p = st.places.find((x) => x.id === t.place_id); return p ? p.name : ''; };
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <H2>{tr('Задачи на сегодня')}</H2>
        <Chip kind={done === tasks.length ? 'ok' : 'info'}>{done}{' '}{tr('из')}{' '}{tasks.length}</Chip>
      </View>
      {tasks.map((t, i) => (
        <View key={t.id} style={{ gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, paddingTop: i ? 10 : 0 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Icon name={t.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={t.status === 'done' ? C.ok : C.muted} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 15.5, fontWeight: '700', color: t.status === 'done' ? C.muted : C.ink }}>{t.title}</Text>
              {placeName(t) ? <Muted>{placeName(t)}</Muted> : null}
              {t.note ? <Muted>{t.note}</Muted> : null}
              {t.status === 'done' ? <Text style={{ color: C.ok, fontSize: 13 }}>{tr('Выполнено в')}{' '}{hm(t.done_at)}</Text> : null}
            </View>
          </View>
          {t.status === 'new' && !preview ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn kind="ghost" title={tr('Маршрут')} onPress={() => mapsTo(t.lat, t.lng, placeName(t) || t.title)} style={{ flex: 1 }} />
              <Btn kind="dark" title={tr('Выполнено')} onPress={() => nav('task', { id: t.id })} style={{ flex: 1 }} />
            </View>
          ) : null}
        </View>
      ))}
      {preview ? <Muted>{tr('Отмечать задачи можно после начала смены.')}</Muted> : null}
    </Card>
  );
}

function TaskScreen({ ctx, id }) {
  const { st, uid, load, nav } = ctx;
  const t = st.tasks.find((x) => x.id === id);
  const [cam, setCam] = useState(false);
  const [shot, setShot] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!t) return <Page><Muted>{tr('Задача не найдена или уже выполнена.')}</Muted><Btn kind="ghost" title={tr('На главную')} onPress={() => nav('home')} /></Page>;
  const place = st.places.find((x) => x.id === t.place_id);
  const target = t.lat != null ? { lat: t.lat, lng: t.lng } : null;
  const lim = (place && place.radius) || st.cfg.client_radius || 200;
  const onShot = async (uri) => {
    try {
      const fix = await getFix();
      if (fix.mocked) { setCam(false); return Alert.alert(tr('Подмена местоположения'), tr('Отключите подмену местоположения и сфотографируйте снова.')); }
      const up = await uploadPhoto(uri, uid, 'task');
      setShot({ ...up, fix, dist: distM(fix, target) }); setCam(false);
    } catch (e) { setCam(false); Alert.alert(tr('Не получилось'), errText(e)); }
  };
  const submit = async () => {
    if (!shot) return Alert.alert(tr('Фото'), tr('Сфотографируйте выполненную работу на месте'));
    setBusy(true);
    try {
      await rpc('complete_task', { p_id: t.id, p_photo: shot.path, p_lat: shot.fix.lat, p_lng: shot.fix.lng, p_acc: shot.fix.acc, p_mocked: shot.fix.mocked, p_device: deviceId(), p_note: note });
      AsyncStorage.setItem('arev.lastWork', String(Date.now())).catch(() => {});
      await load();
      nav('home');
    } catch (e) { Alert.alert(tr('Не получилось'), errText(e)); } finally { setBusy(false); }
  };
  const far = shot && shot.dist != null && shot.dist > lim;
  return (
    <Page>
      <Label>{tr('Задача на сегодня')}</Label>
      <H1>{t.title}</H1>
      <Card>
        {place ? <Row icon="location" title={place.name} sub={t.note || undefined} last /> : t.note ? <T>{t.note}</T> : null}
        <Btn kind="ghost" title={tr('Маршрут в Google Maps')} onPress={() => mapsTo(t.lat, t.lng, (place && place.name) || t.title)} />
      </Card>
      <Card>
        <T style={{ fontWeight: '700' }}>{tr('Фото выполненной работы')}</T>
        <Muted>{tr('Снимите на месте. Фото попадёт и в «Фото работ».')}</Muted>
        {shot ? <Image source={{ uri: shot.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10 }} /> : null}
        {shot ? (shot.dist == null ? <Flag kind="note">{tr('Координаты сохранены')}</Flag> : far ? <Flag kind="bad">{fDist(shot.dist)}{' '}{tr('от точки задачи. Отметка будет записана с отклонением.')}</Flag> : <Flag kind="ok">{tr('На месте ·')}{' '}{fDist(shot.dist)}</Flag>) : null}
        <Btn kind={shot ? 'ghost' : 'dark'} title={shot ? tr('Переснять') : tr('Сфотографировать')} onPress={() => setCam(true)} />
        <Field label={tr('Комментарий (не обязательно)')} value={note} onChangeText={setNote} placeholder={tr('Почистил 24 панели')} />
      </Card>
      <Btn title={tr('Задача выполнена')} big busy={busy} onPress={submit} />
      <CameraSheet visible={cam} title={tr('Работа выполнена')} onClose={() => setCam(false)} onShot={onShot} />
    </Page>
  );
}

/* ---------------- начало и конец смены ---------------- */
function ShiftScreen({ ctx }) {
  const { st, uid, load, nav } = ctx;
  const sh = st.open;
  const ending = !!sh;
  const [cam, setCam] = useState(false);
  const [shot, setShot] = useState(null); // {path, uri, fix, dist}
  const [odo, setOdo] = useState('');
  const [busy, setBusy] = useState(false);
  const office = st.cfg.office_lat != null ? { lat: st.cfg.office_lat, lng: st.cfg.office_lng } : null;
  const radius = st.cfg.office_radius || 150;
  const prev = (st.shifts.find((x) => x.end_at) || {}).end_odo;

  const onShot = async (uri) => {
    try {
      const fix = await getFix();
      if (fix.mocked) {
        setCam(false);
        return Alert.alert(tr('Подмена местоположения'), tr('На телефоне включена подмена местоположения. Отключите её в настройках и сфотографируйте снова.'));
      }
      const up = await uploadPhoto(uri, uid, ending ? 'odo-end' : 'odo-start');
      setShot({ ...up, fix, dist: distM(fix, office) });
      setCam(false);
    } catch (e) { setCam(false); Alert.alert(tr('Не получилось'), errText(e)); }
  };
  const submit = async (force) => {
    const v = parseInt(String(odo).replace(/\D/g, ''), 10);
    if (!shot) return Alert.alert(tr('Фото'), tr('Сфотографируйте одометр'));
    if (!v) return Alert.alert(tr('Одометр'), tr('Введите показания одометра'));
    if (ending && force !== true && force !== 'photos' && !st.wph.length) {
      return Alert.alert(tr('Нет фото работ'), tr('За сегодня не загружено ни одного фото проделанной работы. Руководитель увидит это. Закончить смену всё равно?'),
        [{ text: tr('Сначала сниму') }, { text: tr('Закончить'), onPress: () => submit(st.buys.length ? 'photos' : true) }]);
    }
    if (ending && force !== true && st.buys.length) {
      return Alert.alert(tr('Не сдана закупка'), tr('Есть купленный товар, который не сдан на склад или на объект (') + st.buys.length + tr('). Руководитель увидит это. Закончить смену всё равно?'),
        [{ text: tr('Сначала сдам') }, { text: tr('Закончить'), onPress: () => submit(true) }]);
    }
    setBusy(true);
    try {
      const wifi = await officeWifiOk(st.cfg.office_wifi);
      const args = { p_odo: v, p_photo: shot.path, p_lat: shot.fix.lat, p_lng: shot.fix.lng, p_acc: shot.fix.acc, p_mocked: shot.fix.mocked, p_wifi_ok: wifi, p_device: deviceId() };
      if (ending) { await rpc('end_shift', args); await stopTrack(); }
      else {
        await rpc('start_shift', args);
        const ok = await startTrack();
        if (!ok) Alert.alert(tr('Разрешите местоположение «Всегда»'), tr('Без этого маршрут смены не записывается, и руководитель это увидит. Откройте настройки приложения → Разрешения → Местоположение → «Разрешить всегда».'), [{ text: tr('Открыть настройки'), onPress: () => Linking.openSettings() }, { text: tr('Позже') }]);
      }
      await load();
      nav('home');
    } catch (e) { Alert.alert(tr('Не получилось'), errText(e)); } finally { setBusy(false); }
  };
  const far = shot && shot.dist != null && shot.dist > radius;
  return (
    <Page>
      <H1>{ending ? tr('Закончить смену') : tr('Начать смену')}</H1>
      <Card>
        <T style={{ fontWeight: '700' }}>{tr('1. Фото одометра')}</T>
        <Muted>{ending ? tr('Вернитесь в офис и сфотографируйте одометр.') : tr('Сфотографируйте одометр у офиса.')}{' '}{tr('Место и время запишутся вместе с фото.')}</Muted>
        {shot ? <Image source={{ uri: shot.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10 }} /> : null}
        {shot ? (shot.dist == null ? <Flag kind="note">{tr('Координаты сохранены')}</Flag> : far ? <Flag kind="bad">{fDist(shot.dist)}{' '}{tr('от офиса. Отметка будет записана с отклонением.')}</Flag> : <Flag kind="ok">{tr('В офисе ·')}{' '}{fDist(shot.dist)}</Flag>) : null}
        <Btn kind={shot ? 'ghost' : 'dark'} title={shot ? tr('Переснять') : tr('Сфотографировать одометр')} onPress={() => setCam(true)} />
      </Card>
      <Card>
        <Field label={tr('2. Показания одометра, км')} value={odo} onChangeText={setOdo} keyboardType="number-pad" placeholder={String(ending ? sh.start_odo : prev || '')} />
        {ending ? <Muted>{tr('Утром было')}{' '}{sh.start_odo}{' '}{tr('км.')}</Muted> : prev ? <Muted>{tr('Прошлым вечером было')}{' '}{prev}{' '}{tr('км.')}</Muted> : null}
      </Card>
      <Btn title={ending ? tr('Закончить смену') : tr('Начать смену')} kind={ending ? 'dark' : 'primary'} onPress={submit} busy={busy} big />
      <CameraSheet visible={cam} title={tr('Одометр')} onClose={() => setCam(false)} onShot={onShot} />
    </Page>
  );
}

/* ---------------- заправка ---------------- */
function FuelScreen({ ctx }) {
  const { st, uid, load, nav } = ctx;
  const [cam, setCam] = useState(false);
  const [shot, setShot] = useState(null);
  const [liters, setLiters] = useState('');
  const [sum, setSum] = useState('');
  const [busy, setBusy] = useState(false);
  const unit = st.staff.fuel_type === 'gas' ? tr('м³') : tr('л');
  const onShot = async (uri) => {
    try {
      const fix = await getFix();
      if (fix.mocked) { setCam(false); return Alert.alert(tr('Подмена местоположения'), tr('Отключите подмену местоположения и сфотографируйте снова.')); }
      const up = await uploadPhoto(uri, uid, 'receipt');
      setShot({ ...up, fix }); setCam(false);
    } catch (e) { setCam(false); Alert.alert(tr('Не получилось'), errText(e)); }
  };
  const submit = async () => {
    const l = num(liters), a = parseInt(String(sum).replace(/\D/g, ''), 10);
    if (!shot) return Alert.alert(tr('Чек'), tr('Сфотографируйте чек'));
    if (!l) return Alert.alert(tr('Объём'), tr('Укажите, сколько залито'));
    if (!a) return Alert.alert(tr('Сумма'), tr('Укажите сумму из чека'));
    const save = async () => {
      setBusy(true);
      try {
        await rpc('add_fuel', { p_liters: l, p_amount: a, p_photo: shot.path, p_lat: shot.fix.lat, p_lng: shot.fix.lng, p_acc: shot.fix.acc, p_mocked: shot.fix.mocked, p_device: deviceId() });
        await load(); nav('home');
      } catch (e) { Alert.alert(tr('Не получилось'), errText(e)); } finally { setBusy(false); }
    };
    if (st.staff.tank && l > st.staff.tank * 1.05) {
      return Alert.alert(tr('Больше, чем бак'), tr('Указано ') + l + ' ' + unit + tr(', а бак ') + st.staff.tank + tr('. Проверьте цифры. Если всё верно, заправка будет отмечена для руководителя.'), [{ text: tr('Исправить') }, { text: tr('Сохранить'), onPress: save }]);
    }
    save();
  };
  return (
    <Page>
      <H1>{tr('Заправка')}</H1>
      <Muted>{tr('Каждая заправка сверяется с выпиской по топливной карте и с рабочим пробегом.')}</Muted>
      <Card>
        <T style={{ fontWeight: '700' }}>{tr('1. Фото чека')}</T>
        {shot ? <Image source={{ uri: shot.uri }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 10 }} /> : null}
        <Btn kind={shot ? 'ghost' : 'dark'} title={shot ? tr('Переснять') : tr('Сфотографировать чек')} onPress={() => setCam(true)} />
      </Card>
      <Card>
        <T style={{ fontWeight: '700' }}>{tr('2. Как в чеке')}</T>
        <Field label={unit === 'м³' ? tr('Кубов') : tr('Литров')} value={liters} onChangeText={setLiters} keyboardType="decimal-pad" />
        <Field label={tr('Сумма, ֏')} value={sum} onChangeText={setSum} keyboardType="number-pad" />
      </Card>
      <Btn title={tr('Сохранить заправку')} onPress={submit} busy={busy} big />
      <CameraSheet visible={cam} title={tr('Чек')} onClose={() => setCam(false)} onShot={onShot} />
    </Page>
  );
}

/* ---------------- заказ ---------------- */
function TicketScreen({ ctx, id, pooled }) {
  const { st, uid, load, nav } = ctx;
  const t = st.mine.find((x) => x.id === id);
  const [photos, setPhotos] = useState([]);
  const [cam, setCam] = useState(null); // 'before' | 'after'
  const [price, setPrice] = useState(t && t.est_min ? String(Math.round((t.est_min + t.est_max) / 2000) * 1000) : '');
  const [work, setWork] = useState('');
  const [busy, setBusy] = useState(false);
  const loadPhotos = useCallback(async () => {
    if (!t) return;
    const { data } = await supabase.from('ticket_photos').select('kind,path,at').eq('ticket_id', t.id).order('at');
    setPhotos(data || []);
  }, [t && t.id]);
  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  const act = async (fn) => { setBusy(true); try { await fn(); await load(); } catch (e) { Alert.alert(tr('Не получилось'), errText(e)); } finally { setBusy(false); } };

  if (!t && pooled) {
    return (
      <Page>
        <Label>{pooled.num}</Label>
        <H1>{tr(CATS[pooled.category] || pooled.category)}</H1>
        <Card>
          <T>{pooled.address}</T>
          {pooled.descr ? <Muted>{pooled.descr}</Muted> : null}
          {pooled.err_code ? <T>{tr('Код ошибки:')}{' '}{pooled.err_code}</T> : null}
          {pooled.est_min ? <T>{tr('Оценка клиенту:')}{' '}{money(pooled.est_min)} – {money(pooled.est_max)}</T> : null}
          <Muted>{tr('Имя и телефон клиента откроются, когда вы возьмёте заказ.')}</Muted>
        </Card>
        <Btn title={tr('Беру заказ')} big busy={busy} onPress={() => act(async () => { await rpc('take_ticket', { p_id: pooled.id, p_device: deviceId() }); nav('ticket', { id: pooled.id }); })} />
      </Page>
    );
  }
  if (!t) return <Page><Muted>{tr('Заказ не найден. Возможно, его уже взял другой сотрудник.')}</Muted><Btn kind="ghost" title={tr('На главную')} onPress={() => nav('home')} /></Page>;

  const step = (name, extra) => act(async () => {
    const fix = await getFix();
    if (fix.mocked) throw new Error('MOCK_LOCATION');
    if (name === 'onsite' && t.lat != null) {
      const d = distM(fix, { lat: t.lat, lng: t.lng });
      const lim = st.cfg.client_radius || 200;
      if (d != null && d > lim) {
        const go = await new Promise((res) => Alert.alert(tr('Вы далеко от объекта'), tr('До точки клиента ') + fDist(d) + tr('. Отметка будет записана с отклонением.'), [{ text: tr('Я ещё еду'), onPress: () => res(false) }, { text: tr('Отметить'), onPress: () => res(true) }]));
        if (!go) return;
      }
    }
    await rpc('ticket_step', { p_id: t.id, p_step: name, p_lat: fix.lat, p_lng: fix.lng, p_mocked: fix.mocked, p_device: deviceId(), ...(extra || {}) });
    if (name === 'done') nav('home');
  });
  const onShot = async (uri) => {
    const kind = cam;
    try {
      const fix = await getFix();
      if (fix.mocked) throw new Error('MOCK_LOCATION');
      const up = await uploadPhoto(uri, uid, kind);
      await rpc('add_ticket_photo', { p_id: t.id, p_kind: kind, p_path: up.path, p_lat: fix.lat, p_lng: fix.lng, p_mocked: fix.mocked, p_device: deviceId() });
      setCam(null); await loadPhotos();
    } catch (e) { setCam(null); Alert.alert(tr('Не получилось'), errText(e)); }
  };
  const nb = photos.filter((p) => p.kind === 'before').length, na = photos.filter((p) => p.kind === 'after').length;
  const mapUrl = t.lat != null ? 'https://www.google.com/maps/dir/?api=1&destination=' + t.lat + ',' + t.lng : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(t.address);
  return (
    <Page>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Label>{t.num}{t.urgent ? tr(' · срочно') : ''}</Label><Chip kind={ST[t.status][1]}>{tr(ST[t.status][0])}</Chip></View>
      <H1>{tr(CATS[t.category] || t.category)}</H1>
      <Card>
        <T style={{ fontWeight: '700' }}>{t.client_name}</T>
        <Pressable onPress={() => Linking.openURL('tel:' + String(t.client_phone).replace(/[^\d+]/g, ''))}><Text style={{ color: C.info, fontSize: 16 }}>{t.client_phone}</Text></Pressable>
        <T>{t.address}</T>
        <Btn kind="ghost" title={tr('Маршрут в Google Maps')} onPress={() => Linking.openURL(mapUrl)} />
        {t.descr ? <Muted>{t.descr}</Muted> : null}
        {t.err_code ? <T>{tr('Код ошибки:')}{' '}{t.err_code}</T> : null}
      </Card>
      {['assigned', 'enroute', 'onsite'].includes(t.status) ? <TicketBuys ctx={ctx} t={t} /> : null}
      {t.status === 'assigned' ? <>
        <Btn kind="dark" title={tr('Выехал к клиенту')} big busy={busy} onPress={() => step('enroute')} />
        <Btn kind="ghost" title={tr('Отказаться от заказа')} onPress={() => Alert.alert(tr('Отказаться?'), tr('Заказ вернётся в общий список, отказ увидит руководитель.'), [{ text: tr('Нет') }, { text: tr('Отказаться'), onPress: () => act(async () => { await rpc('refuse_ticket', { p_id: t.id, p_device: deviceId() }); nav('home'); }) }])} />
      </> : null}
      {t.status === 'enroute' ? <>
        <Muted>{tr('В пути с')}{' '}{hm(t.enroute_at)}{tr('. Отметка сработает рядом с объектом.')}</Muted>
        <Btn title={tr('Я на месте')} big busy={busy} onPress={() => step('onsite')} />
      </> : null}
      {t.status === 'onsite' ? <>
        <Card>
          <T style={{ fontWeight: '700' }}>{tr('Фото до работы:')}{' '}{nb}</T>
          <Btn kind={nb ? 'ghost' : 'dark'} title={tr('Снять фото до')} onPress={() => setCam('before')} />
          <T style={{ fontWeight: '700' }}>{tr('Фото после работы:')}{' '}{na}</T>
          <Btn kind={na ? 'ghost' : 'dark'} title={tr('Снять фото после')} onPress={() => setCam('after')} />
        </Card>
        <Card>
          <Field label={tr('Сумма, ֏')} value={price} onChangeText={setPrice} keyboardType="number-pad" />
          <Field label={tr('Что сделано (коротко)')} value={work} onChangeText={setWork} multiline placeholder={tr('Заменил 2 коннектора MC4')} />
        </Card>
        <Btn title={tr('Завершить')} big busy={busy} disabled={!nb || !na} onPress={() => step('done', { p_price: parseInt(String(price).replace(/\D/g, ''), 10) || 0, p_work: work })} />
        {!nb || !na ? <Muted style={{ textAlign: 'center' }}>{tr('Нужно хотя бы одно фото до и одно после.')}</Muted> : null}
      </> : null}
      {t.status === 'done' || t.status === 'closed' ? <Card><T>{tr('Сумма:')}{' '}{money(t.price)}</T>{t.work ? <Muted>{t.work}</Muted> : null}<Chip kind={t.status === 'closed' ? 'ok' : 'note'}>{t.status === 'closed' ? tr('Клиент подтвердил') : tr('Ждём подтверждения')}</Chip></Card> : null}
      <CameraSheet visible={!!cam} title={cam === 'before' ? tr('Фото до') : tr('Фото после')} onClose={() => setCam(null)} onShot={onShot} />
    </Page>
  );
}

/* ---------------- закупки ---------------- */
const lineText = (l) => l.name + ' — ' + l.qty + (l.unit ? ' ' + l.unit : '');
const buyWhere = (b, mine) => {
  if (b.status === 'partial') return tr('Остаток → на склад');
  if (b.dest === 'ticket') { const t = (mine || []).find((x) => x.id === b.ticket_id); return tr('На объект') + (t ? ' · ' + t.num : ''); }
  if (b.dest === 'site') return (b.source === 'warehouse' ? tr('Со склада → ') : tr('На объект · ')) + (b.site || '');
  return tr('На склад');
};

// список несданного товара на главном экране
function BuyList({ ctx, items }) {
  if (!items || !items.length) return null;
  const maxH = ctx.st.cfg.purchase_max_hours || 24;
  return (
    <>
      <H2>{tr('Не сдано (')}{items.length})</H2>
      {items.map((b) => {
        const late = Date.now() - new Date(b.created_at).getTime() > maxH * 3600000;
        const lines = b.status === 'partial' ? (b.left_lines || []).filter((l) => l.qty > 0) : b.lines || [];
        return (
          <Pressable key={b.id} onPress={() => ctx.nav('deliver', { id: b.id })}>
            <Card style={{ borderLeftWidth: 4, borderLeftColor: late ? C.bad : C.sun }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Label>{buyWhere(b, ctx.st.mine)}</Label>
                {late ? <Chip kind="bad">{tr('просрочено')}</Chip> : <Chip kind="warn">{hm(b.created_at)}</Chip>}
              </View>
              <T style={{ fontWeight: '700' }}>{b.source === 'warehouse' ? tr('Материал со склада') : b.supplier + ' · ' + money(b.amount)}</T>
              <Muted>{lines.map(lineText).join(', ')}</Muted>
            </Card>
          </Pressable>
        );
      })}
    </>
  );
}

// материалы внутри заказа
function TicketBuys({ ctx, t }) {
  const items = ctx.st.buys.filter((b) => b.ticket_id === t.id && b.status === 'bought');
  return (
    <Card>
      <T style={{ fontWeight: '700' }}>{tr('Материал для заказа')}</T>
      {items.length ? items.map((b) => (
        <Pressable key={b.id} onPress={() => ctx.nav('deliver', { id: b.id })} style={{ paddingVertical: 4 }}>
          <T>{b.supplier} · {money(b.amount)}</T>
          <Muted>{(b.lines || []).map(lineText).join(', ')}</Muted>
          <Text style={{ color: C.info }}>{t.status === 'onsite' ? tr('Отметить на объекте →') : tr('Отметить можно будет на объекте')}</Text>
        </Pressable>
      )) : <Muted>{tr('Если докупаете что-то для этой работы, запишите покупку здесь. Без отметки на объекте заказ не закроется.')}</Muted>}
      <Btn kind="ghost" title={tr('Докупил материал')} onPress={() => ctx.nav('purchase', { ticket: t.id })} />
    </Card>
  );
}

function PurchaseScreen({ ctx, ticket, source, task }) {
  const { st, uid, load, nav } = ctx;
  const wh = source === 'warehouse';
  const active = st.mine.filter((t) => ['assigned', 'enroute', 'onsite'].includes(t.status));
  const [dest, setDest] = useState(ticket || (wh ? 'site' : 'warehouse'));
  const [site, setSite] = useState((st.wph[0] && st.wph[0].object) || '');
  const [supplier, setSupplier] = useState('');
  const [lines, setLines] = useState([{ name: '', qty: '', unit: tr('шт') }]);
  const [sum, setSum] = useState('');
  const [cam, setCam] = useState(false);
  const [shot, setShot] = useState(null);
  const [busy, setBusy] = useState(false);
  const setLine = (i, k) => (v) => setLines((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const onShot = async (uri) => {
    try {
      const fix = await getFix();
      if (fix.mocked) { setCam(false); return Alert.alert(tr('Подмена местоположения'), tr('Отключите подмену местоположения и сфотографируйте снова.')); }
      const up = await uploadPhoto(uri, uid, wh ? 'take' : 'buy');
      setShot({ ...up, fix }); setCam(false);
    } catch (e) { setCam(false); Alert.alert(tr('Не получилось'), errText(e)); }
  };
  const submit = async () => {
    const clean = lines.map((l) => ({ name: String(l.name).trim(), qty: num(l.qty), unit: String(l.unit || '').trim() })).filter((l) => l.name || l.qty);
    const a = parseInt(String(sum).replace(/\D/g, ''), 10);
    if (!shot) return Alert.alert(tr('Фото'), wh ? tr('Сфотографируйте материал на складе') : tr('Сфотографируйте чек или накладную'));
    if (!wh && !supplier.trim()) return Alert.alert(tr('Где купили'), tr('Укажите магазин или поставщика'));
    if (!clean.length || clean.some((l) => !l.name || !l.qty)) return Alert.alert(tr('Товар'), tr('Для каждой строки укажите название и количество'));
    if (!wh && !a) return Alert.alert(tr('Сумма'), tr('Укажите сумму из чека'));
    if (dest === 'site' && !site.trim()) return Alert.alert(tr('Объект'), tr('Укажите, для какого объекта: клиент или адрес'));
    setBusy(true);
    try {
      await rpc('add_purchase', { p_source: wh ? 'warehouse' : 'shop', p_supplier: wh ? '' : supplier, p_lines: clean, p_amount: wh ? 0 : a, p_photo: shot.path, p_lat: shot.fix.lat, p_lng: shot.fix.lng, p_acc: shot.fix.acc, p_mocked: shot.fix.mocked, p_device: deviceId(), p_ticket: dest === 'warehouse' || dest === 'site' ? null : dest, p_site: dest === 'site' ? site : null, p_task: task || null });
      await load();
      if (task) { ctx.setOpenTask(task); ctx.goTab('tasks'); }
      else if (dest === 'warehouse' || dest === 'site') nav('home'); else nav('ticket', { id: dest });
    } catch (e) { Alert.alert(tr('Не получилось'), errText(e)); } finally { setBusy(false); }
  };
  return (
    <Page>
      <H1>{wh ? tr('Взять со склада') : tr('Закупка')}</H1>
      <Muted>{wh ? tr('Запишите материал, который берёте со склада на объект. На объекте отметите его фото, остаток верните на склад.') : tr('Каждая покупка должна дойти до склада или до объекта. Там вы отметите её фото, место проверит телефон.')}</Muted>
      <Card>
        <T style={{ fontWeight: '700' }}>{tr('1. Куда везёте')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {!wh ? <Btn kind={dest === 'warehouse' ? 'dark' : 'ghost'} title={tr('На склад')} onPress={() => setDest('warehouse')} /> : null}
          <Btn kind={dest === 'site' ? 'dark' : 'ghost'} title={wh ? tr('На объект') : tr('Сразу на объект')} onPress={() => setDest('site')} />
          {active.map((t) => <Btn key={t.id} kind={dest === t.id ? 'dark' : 'ghost'} title={tr('Заказ ') + t.num} onPress={() => setDest(t.id)} />)}
        </View>
        {dest === 'site' ? <Field label={tr('Объект: клиент или адрес')} value={site} onChangeText={setSite} placeholder={tr('Ашот, Абовян, ул. ...')} /> : null}
        {dest === 'site' ? <PlacePick places={st.places} value={site} onPick={setSite} /> : null}
        {dest === 'site' ? <Muted>{tr('На объекте отметите материал фото. Остаток нужно будет сдать на склад.')}</Muted> : null}
        {dest !== 'warehouse' && dest !== 'site' ? <Muted>{(active.find((t) => t.id === dest) || {}).address}</Muted> : null}
      </Card>
      <Card>
        <T style={{ fontWeight: '700' }}>{wh ? tr('2. Фото материала на складе') : tr('2. Фото чека или накладной')}</T>
        {shot ? <Image source={{ uri: shot.uri }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 10 }} /> : null}
        <Btn kind={shot ? 'ghost' : 'dark'} title={shot ? tr('Переснять') : wh ? tr('Сфотографировать материал') : tr('Сфотографировать чек')} onPress={() => setCam(true)} />
      </Card>
      <Card>
        <T style={{ fontWeight: '700' }}>{wh ? tr('3. Что берёте') : tr('3. Что купили, как в чеке')}</T>
        {!wh ? <Field label={tr('Магазин или поставщик')} value={supplier} onChangeText={setSupplier} placeholder={tr('Электротовары, ул. ...')} /> : null}
        {lines.map((l, i) => (
          <View key={i} style={{ gap: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, paddingTop: i ? 8 : 0 }}>
            <Field label={tr('Товар ') + (i + 1)} value={l.name} onChangeText={setLine(i, 'name')} placeholder={tr('Кабель солнечный 6 мм²')} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Field label={tr('Количество')} value={l.qty} onChangeText={setLine(i, 'qty')} keyboardType="decimal-pad" /></View>
              <View style={{ flex: 1 }}><Field label={tr('Ед.')} value={l.unit} onChangeText={setLine(i, 'unit')} placeholder={tr('шт, м')} /></View>
            </View>
            {lines.length > 1 ? <Btn kind="ghost" title={tr('Убрать строку')} onPress={() => setLines((p) => p.filter((_, j) => j !== i))} /> : null}
          </View>
        ))}
        <Btn kind="ghost" title={tr('+ Ещё товар')} onPress={() => setLines((p) => [...p, { name: '', qty: '', unit: tr('шт') }])} />
        {!wh ? <Field label={tr('Сумма по чеку, ֏')} value={sum} onChangeText={setSum} keyboardType="number-pad" /> : null}
      </Card>
      <Btn title={wh ? tr('Записать') : tr('Сохранить закупку')} onPress={submit} busy={busy} big />
      <CameraSheet visible={cam} title={wh ? tr('Материал на складе') : tr('Чек или накладная')} onClose={() => setCam(false)} onShot={onShot} />
    </Page>
  );
}

function DeliverScreen({ ctx, id }) {
  const { st, uid, load, nav } = ctx;
  const b = st.buys.find((x) => x.id === id);
  const t = b && b.dest === 'ticket' && b.status === 'bought' ? st.mine.find((x) => x.id === b.ticket_id) : null;
  const toObject = !!(b && (b.dest === 'ticket' || b.dest === 'site') && b.status === 'bought');
  const ready = toObject && (b.dest === 'site' || (t && t.status === 'onsite'));
  const [used, setUsed] = useState(() => (b ? (b.lines || []).map((l) => String(l.qty)) : []));
  const [cam, setCam] = useState(false);
  const [shot, setShot] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!b) return <Page><Muted>{tr('Закупка уже сдана.')}</Muted><Btn kind="ghost" title={tr('На главную')} onPress={() => nav('home')} /></Page>;
  const target = toObject
    ? (t && t.lat != null ? { lat: t.lat, lng: t.lng } : null)
    : st.cfg.warehouse_lat != null ? { lat: st.cfg.warehouse_lat, lng: st.cfg.warehouse_lng }
    : st.cfg.office_lat != null ? { lat: st.cfg.office_lat, lng: st.cfg.office_lng } : null;
  const lim = toObject ? st.cfg.client_radius || 200 : st.cfg.office_radius || 150;
  const lines = b.status === 'partial' ? (b.left_lines || []).filter((l) => l.qty > 0) : b.lines || [];
  const onShot = async (uri) => {
    try {
      const fix = await getFix();
      if (fix.mocked) { setCam(false); return Alert.alert(tr('Подмена местоположения'), tr('Отключите подмену местоположения и сфотографируйте снова.')); }
      const up = await uploadPhoto(uri, uid, toObject ? 'buy-site' : 'buy-store');
      setShot({ ...up, fix, dist: distM(fix, target) }); setCam(false);
    } catch (e) { setCam(false); Alert.alert(tr('Не получилось'), errText(e)); }
  };
  const submit = async () => {
    if (!shot) return Alert.alert(tr('Фото'), toObject ? tr('Сфотографируйте материал на объекте') : tr('Сфотографируйте товар на складе'));
    let pUsed = null;
    if (toObject) {
      pUsed = used.map((v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : -1; });
      if (pUsed.some((n, i) => n < 0 || n > Number(b.lines[i].qty))) return Alert.alert(tr('Использовано'), tr('Количество должно быть от 0 до купленного'));
    }
    setBusy(true);
    try {
      const r = await rpc('deliver_purchase', { p_id: b.id, p_photo: shot.path, p_lat: shot.fix.lat, p_lng: shot.fix.lng, p_acc: shot.fix.acc, p_mocked: shot.fix.mocked, p_device: deviceId(), p_used: pUsed });
      await load();
      if (r && r.status === 'partial') Alert.alert(tr('Остаток'), tr('Неиспользованный материал нужно сдать на склад. Он остался в списке «Не сдано».'));
      if (b.dest === 'ticket' && toObject) nav('ticket', { id: b.ticket_id }); else nav('home');
    } catch (e) { Alert.alert(tr('Не получилось'), errText(e)); } finally { setBusy(false); }
  };
  const far = shot && shot.dist != null && shot.dist > lim;
  return (
    <Page>
      <Label>{buyWhere(b, st.mine)}</Label>
      <H1>{toObject ? tr('Материал на объекте') : tr('Сдать на склад')}</H1>
      <Card>
        <T style={{ fontWeight: '700' }}>{b.source === 'warehouse' ? tr('Материал со склада') : b.supplier + ' · ' + money(b.amount)}</T>
        <Muted>{b.source === 'warehouse' ? tr('Взято') : tr('Куплено')} {new Date(b.created_at).toLocaleDateString(loc())}{' '}{tr('в')}{' '}{hm(b.created_at)}</Muted>
        {!toObject ? lines.map((l, i) => <T key={i}>{lineText(l)}</T>) : null}
      </Card>
      {toObject ? (
        ready ? (
          <Card>
            <T style={{ fontWeight: '700' }}>{tr('Сколько использовано на объекте')}</T>
            <Muted>{tr('Что осталось, нужно будет сдать на склад.')}</Muted>
            {b.lines.map((l, i) => (
              <Field key={i} label={l.name + (b.source === 'warehouse' ? tr(' (взято ') : tr(' (куплено ')) + l.qty + (l.unit ? ' ' + l.unit : '') + ')'} value={used[i]}
                onChangeText={(v) => setUsed((p) => p.map((x, j) => (j === i ? v : x)))} keyboardType="decimal-pad" />
            ))}
          </Card>
        ) : <Flag kind="warn">{tr('Отметить материал можно, когда по заказу')}{' '}{t ? t.num : ''}{' '}{tr('нажато «Я на месте».')}</Flag>
      ) : null}
      {!toObject || ready ? <>
        <Card>
          <T style={{ fontWeight: '700' }}>{toObject ? tr('Фото материала на объекте') : tr('Фото товара на складе')}</T>
          <Muted>{toObject ? tr('Снимите установленный или разложенный материал так, чтобы было видно место.') : tr('Снимите товар на складе. Руководитель сверит количество при приёмке.')}</Muted>
          {shot ? <Image source={{ uri: shot.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10 }} /> : null}
          {shot ? (shot.dist == null ? <Flag kind="note">{tr('Координаты сохранены')}</Flag> : far ? <Flag kind="bad">{fDist(shot.dist)}{' '}{tr('от')}{' '}{toObject ? tr('объекта') : tr('склада')}{tr('. Отметка будет записана с отклонением.')}</Flag> : <Flag kind="ok">{tr('На месте ·')}{' '}{fDist(shot.dist)}</Flag>) : null}
          <Btn kind={shot ? 'ghost' : 'dark'} title={shot ? tr('Переснять') : tr('Сфотографировать')} onPress={() => setCam(true)} />
        </Card>
        <Btn title={toObject ? tr('Отметить на объекте') : tr('Сдано на склад')} onPress={submit} busy={busy} big />
      </> : null}
      <CameraSheet visible={cam} title={toObject ? tr('Материал на объекте') : tr('Товар на складе')} onClose={() => setCam(false)} onShot={onShot} />
    </Page>
  );
}

/* ---------------- выбор объекта из списка руководителя ---------------- */
function PlacePick({ places, value, onPick }) {
  const q = String(value || '').trim().toLowerCase();
  const list = (places || []).filter((p) => p.kind !== 'warehouse' && p.name.toLowerCase() !== q && (!q || p.name.toLowerCase().includes(q))).slice(0, 6);
  if (!list.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {list.map((p) => (
        <Pressable key={p.id} onPress={() => onPick(p.name)} style={{ paddingVertical: 7, paddingHorizontal: 11, borderRadius: 999, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line }}>
          <Text style={{ color: C.ink, fontSize: 14 }}>{p.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* ---------------- фото работ ---------------- */
const KINDS = [['before', 'До работы'], ['after', 'После работы'], ['other', 'Другое']];
function WorkScreen({ ctx, ticket }) {
  const { st, uid, load } = ctx;
  const tk = ticket ? st.mine.find((x) => x.id === ticket) : null;
  const [object, setObject] = useState(tk ? tk.client_name + ', ' + tk.address : (st.wph[0] && st.wph[0].object) || '');
  const [kind, setKind] = useState('before');
  const [note, setNote] = useState('');
  const [cam, setCam] = useState(false);
  const [mine, setMine] = useState([]); // снятые сейчас: {uri, kind}
  const open = () => {
    if (!object.trim()) return Alert.alert(tr('Объект'), tr('Укажите объект: имя клиента или адрес'));
    setCam(true);
  };
  const onShot = async (uri) => {
    let img = null, fix = null;
    const takenAt = Date.now();
    try {
      fix = await getFix();
      if (fix.mocked) { setCam(false); return Alert.alert(tr('Подмена местоположения'), tr('Отключите подмену местоположения и сфотографируйте снова.')); }
      img = await preparePhoto(uri);
      AsyncStorage.setItem('arev.lastWork', String(takenAt)).catch(() => {});
      const net = await NetInfo.fetch();
      if (net.isConnected === false) throw new Error('Network request failed');
      const up = await uploadPrepared(img, uid, 'work-' + kind);
      await rpc('add_work_photo', { p_path: up.path, p_kind: kind, p_object: object, p_note: note, p_lat: fix.lat, p_lng: fix.lng, p_acc: fix.acc, p_mocked: fix.mocked, p_device: deviceId(), p_ticket: tk ? tk.id : null });
      setMine((p) => [{ uri: up.uri, kind }, ...p]);
      setCam(false); load();
    } catch (e) {
      setCam(false);
      if (img && fix && isNetErr(e)) {
        // нет связи: сохраняем в телефоне, отправится само
        try {
          const n = await addToBox({ uri: img.uri, kind, object, note, ticket: tk ? tk.id : null, fix, takenAt });
          ctx.setBoxN(n);
          setMine((p) => [{ uri: img.uri, kind, offline: true }, ...p]);
          Alert.alert(tr('Сохранено без интернета'), tr('Фото сохранено в телефоне и отправится само, когда появится связь. Время и место съёмки записаны.'));
        } catch (x) { Alert.alert(tr('Не получилось'), tr('Нет интернета, и фото не удалось сохранить. Попробуйте ещё раз.')); }
      } else Alert.alert(tr('Не получилось'), errText(e));
    }
  };
  const today = st.wph.filter((p) => !object.trim() || p.object === object.trim());
  return (
    <Page>
      <H1>{tr('Фото работ')}</H1>
      <Muted>{tr('Снимайте каждую работу до и после. Место и время записываются автоматически, фото из галереи не принимаются.')}</Muted>
      <Card>
        <Field label={tr('Объект: клиент или адрес')} value={object} onChangeText={setObject} placeholder={tr('Ашот, Абовян, ул. ...')} />
        <PlacePick places={st.places} value={object} onPick={setObject} />
        <Label>{tr('Что на фото')}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {KINDS.map(([k, l]) => <Btn key={k} kind={kind === k ? 'dark' : 'ghost'} title={tr(l)} onPress={() => setKind(k)} />)}
        </View>
        <Field label={tr('Комментарий (не обязательно)')} value={note} onChangeText={setNote} placeholder={tr('Заменил 2 коннектора МС4')} />
      </Card>
      <Btn title={tr('Сфотографировать')} big onPress={open} />
      {mine.length ? (
        <Card>
          <T style={{ fontWeight: '700' }}>{tr('Снято сейчас:')}{' '}{mine.length}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {mine.map((p, i) => (
              <View key={i}>
                <Image source={{ uri: p.uri }} style={{ width: 96, height: 96, borderRadius: 8 }} />
                {p.offline ? <View style={{ position: 'absolute', right: 4, bottom: 4, backgroundColor: C.warn, borderRadius: 10, padding: 3 }}><Icon name="cloud-offline" size={14} color="#fff" /></View> : null}
              </View>
            ))}
          </View>
        </Card>
      ) : null}
      <Muted style={{ textAlign: 'center' }}>{tr('За сегодня')}{' '}{object.trim() ? tr('по этому объекту ') : ''}{tr('загружено:')}{' '}{today.length}</Muted>
      <CameraSheet visible={cam} title={tr(KINDS.find((x) => x[0] === kind)[1])} onClose={() => setCam(false)} onShot={onShot} />
    </Page>
  );
}

/* ---------------- разговор с клиентом ---------------- */
const mmss = (ms) => { const t = Math.floor(ms / 1000); return Math.floor(t / 60) + ':' + p2(t % 60); };
const TALK_ST = { new: ['Отправлено', 'note'], processing: ['Готовится отчёт', 'info'], done: ['Отчёт готов', 'ok'], error: ['Ошибка обработки', 'bad'] };
function TalkScreen({ ctx }) {
  const { st, uid, load } = ctx;
  const [object, setObject] = useState((st.wph[0] && st.wph[0].object) || '');
  const [consent, setConsent] = useState(false);
  const [rec, setRec] = useState(false);
  const [ms, setMs] = useState(0);
  const [file, setFile] = useState(null); // {uri, ms}
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { if (talkRecording()) stopTalk().catch(() => {}); }, []);
  useEffect(() => { if (rec && ms >= TALK_MAX_MS) stop(); }, [ms, rec]);
  const start = async () => {
    if (!object.trim()) return Alert.alert(tr('Объект'), tr('Укажите объект: имя клиента или адрес'));
    if (!consent) return Alert.alert(tr('Согласие клиента'), tr('Сначала предупредите клиента, что разговор записывается, и отметьте его согласие.'));
    if (!st.open) return Alert.alert(tr('Смена'), tr('Записывать разговор можно только во время смены.'));
    try { setFile(null); setMs(0); await startTalk(setMs); setRec(true); }
    catch (e) { Alert.alert(tr('Не получилось'), String(e && e.message) === 'MIC_DENIED' ? tr('Разрешите доступ к микрофону в настройках телефона.') : errText(e)); }
  };
  const stop = async () => {
    setRec(false);
    try { const r = await stopTalk(); if (r) setFile({ uri: r.uri, ms: r.ms || ms }); } catch (e) { Alert.alert(tr('Не получилось'), errText(e)); }
  };
  const send = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fix = await getFix();
      if (fix.mocked) throw new Error('MOCK_LOCATION');
      const path = await uploadTalk(file.uri, uid);
      const r = await rpc('add_talk', { p_path: path, p_object: object, p_duration: Math.round(file.ms / 1000), p_consent: consent, p_lat: fix.lat, p_lng: fix.lng, p_acc: fix.acc, p_mocked: fix.mocked, p_device: deviceId() });
      if (r && r.id) requestTalkAi(r.id);
      setFile(null); setMs(0); setConsent(false);
      await load();
      Alert.alert(tr('Отправлено'), tr('Запись отправлена. Отчёт по разговору получит руководитель.'));
    } catch (e) {
      Alert.alert(tr('Не получилось'), isNetErr(e) ? tr('Нет интернета. Запись сохранена на этом экране — нажмите «Отправить», когда появится связь.') : errText(e));
    } finally { setBusy(false); }
  };
  return (
    <Page>
      <H1>{tr('Разговор с клиентом')}</H1>
      <Muted>{tr('Запишите разговор на объекте: что случилось, что сделали, о чём договорились. Руководитель получит краткий отчёт.')}</Muted>
      <Card>
        <Field label={tr('Объект: клиент или адрес')} value={object} onChangeText={setObject} placeholder={tr('Ашот, Абовян, ул. ...')} editable={!rec} />
        <PlacePick places={st.places} value={object} onPick={setObject} />
      </Card>
      <Card style={{ borderLeftWidth: 4, borderLeftColor: consent ? C.ok : C.warn }}>
        <T style={{ fontWeight: '700' }}>{tr('Согласие клиента')}</T>
        <Muted>{tr('Скажите клиенту перед записью:')}</Muted>
        <Text style={{ fontSize: 16, color: C.ink, fontStyle: 'italic' }}>«Մեր զրույցը ձայնագրվում է սպասարկման որակի համար։ Համաձա՞յն եք»</Text>
        <Pressable onPress={() => !rec && setConsent(!consent)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 4 }} accessibilityRole="checkbox" accessibilityState={{ checked: consent }}>
          <Icon name={consent ? 'checkbox' : 'square-outline'} size={26} color={consent ? C.ok : C.muted} />
          <Text style={{ flex: 1, fontSize: 15, color: C.ink }}>{tr('Клиент предупреждён и согласен на запись')}</Text>
        </Pressable>
      </Card>
      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
        <Pressable onPress={rec ? stop : start} disabled={busy} accessibilityLabel={rec ? tr('Остановить запись') : tr('Начать запись')}
          style={({ pressed }) => ({ width: 112, height: 112, borderRadius: 56, backgroundColor: rec ? C.bad : C.pine, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1, borderWidth: 6, borderColor: rec ? C.badSoft : C.surface2 })}>
          <Icon name={rec ? 'stop' : 'mic'} size={46} color="#fff" />
        </Pressable>
        <Text style={{ fontSize: 28, fontWeight: '800', color: rec ? C.bad : C.ink }}>{mmss(rec ? ms : file ? file.ms : 0)}</Text>
        <Muted>{rec ? tr('Идёт запись. Держите телефон рядом, экран можно не трогать.') : file ? tr('Запись готова') : tr('Нажмите, чтобы начать запись')}</Muted>
      </View>
      {file && !rec ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn kind="ghost" title={tr('Записать заново')} onPress={() => Alert.alert(tr('Удалить запись?'), tr('Текущая запись не будет отправлена.'), [{ text: tr('Нет') }, { text: tr('Удалить'), onPress: () => { setFile(null); setMs(0); } }])} style={{ flex: 1 }} />
          <Btn title={tr('Отправить')} busy={busy} onPress={send} style={{ flex: 1 }} />
        </View>
      ) : null}
      {(st.talks || []).length ? (
        <Card>
          <Label>{tr('Сегодня записано')}</Label>
          {st.talks.map((x, i) => (
            <Row key={x.id} icon="mic" title={(x.object || '—') + ' · ' + hm(x.at)} sub={Math.max(1, Math.round((x.duration_s || 0) / 60)) + tr(' мин')}
              right={<Chip kind={(TALK_ST[x.status] || TALK_ST.new)[1]}>{tr((TALK_ST[x.status] || TALK_ST.new)[0])}</Chip>} last={i === st.talks.length - 1} />
          ))}
        </Card>
      ) : null}
    </Page>
  );
}

/* ---------------- мой день ---------------- */
const KIND_RU = { before: 'до работы', after: 'после работы', other: 'работа' };
function MyDay({ ctx }) {
  const { st, uid } = ctx;
  const [ev, setEv] = useState(null);
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState(false);
  const [big, setBig] = useState(null);
  const get = useCallback(async () => {
    setBusy(true);
    try {
      const d0 = new Date(); d0.setHours(0, 0, 0, 0);
      const iso = d0.toISOString();
      const [wp, bu, fu, tk] = await Promise.all([
        supabase.from('work_photos').select('*').eq('staff_id', uid).gte('at', iso).order('at'),
        supabase.from('purchases').select('*').eq('staff_id', uid).or('created_at.gte.' + iso + ',delivered_at.gte.' + iso + ',left_at.gte.' + iso),
        supabase.from('fuel').select('*').eq('staff_id', uid).gte('at', iso),
        supabase.from('tasks').select('*').eq('staff_id', uid).eq('status', 'done').gte('done_at', iso),
      ]);
      const out = [];
      const add = (at, icon, color, title, sub, photo) => { if (at && new Date(at) >= d0) out.push({ at: new Date(at).getTime(), icon, color, title, sub, photo }); };
      st.shifts.forEach((x) => {
        add(x.start_at, 'play-circle', C.pine, tr('Начало смены'), tr('Одометр ') + x.start_odo + tr(' км'));
        if (x.end_at) add(x.end_at, 'stop-circle', C.pine, tr('Конец смены'), tr('Одометр ') + x.end_odo + tr(' км'));
      });
      (wp.data || []).forEach((w) => add(w.at, 'camera', C.ok, tr('Фото работ · ') + tr(KIND_RU[w.kind]), [w.object, w.note].filter(Boolean).join(' · '), w.path));
      (bu.data || []).forEach((b) => {
        const what = (b.lines || []).map(lineText).join(', ');
        add(b.created_at, b.source === 'warehouse' ? 'archive' : 'cart', C.info, b.source === 'warehouse' ? tr('Взял со склада') : tr('Закупка · ') + b.supplier, what + (b.source === 'warehouse' ? '' : ' · ' + money(b.amount)), b.photo);
        if (b.delivered_at) add(b.delivered_at, 'checkmark-done', C.info, b.dest === 'warehouse' ? tr('Сдал на склад') : tr('Материал на объекте'), what, b.delivered_photo);
        if (b.left_at) add(b.left_at, 'return-down-back', C.info, tr('Остаток сдан на склад'), '', b.left_photo);
      });
      (fu.data || []).forEach((r) => add(r.at, 'water', '#8a4fd8', tr('Заправка'), String(r.liters).replace('.', ',') + (st.staff.fuel_type === 'gas' ? tr(' м³') : tr(' л')) + ' · ' + money(r.amount), r.photo));
      (tk.data || []).forEach((t) => add(t.done_at, 'checkbox', C.ok, tr('Задача выполнена'), t.title));
      (st.talks || []).forEach((x) => add(x.at, 'mic', C.info, tr('Разговор с клиентом'), (x.object || '') + ' · ' + Math.max(1, Math.round((x.duration_s || 0) / 60)) + tr(' мин')));
      out.sort((a, b) => a.at - b.at);
      setEv(out);
      const paths = out.map((e) => e.photo).filter(Boolean);
      if (paths.length) {
        const r = await supabase.storage.from('photos').createSignedUrls(paths, 3600);
        const m = {}; (r.data || []).forEach((x) => { if (x.signedUrl) m[x.path] = x.signedUrl; });
        setUrls(m);
      }
    } catch (e) { setEv((p) => p || []); } finally { setBusy(false); }
  }, [uid, st.shifts]);
  useEffect(() => { get(); }, [get]);
  const today = st.shifts.filter((x) => new Date(x.start_at).toDateString() === new Date().toDateString());
  const mins = today.reduce((a, x) => a + ((x.end_at ? new Date(x.end_at) : new Date()) - new Date(x.start_at)) / 60000, 0);
  const n = (ic) => (ev || []).filter((e) => e.icon === ic).length;
  return (
    <Page onRefresh={get} refreshing={busy}>
      <Text style={{ fontSize: 15, color: C.muted }}>{new Date().toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Tile icon="time" value={mins ? Math.floor(mins / 60) + ':' + p2(Math.round(mins % 60)) : '—'} label={tr('на смене')} />
        <Tile icon="camera" value={n('camera')} label={tr('фото работ')} tone={n('camera') ? 'ok' : 'note'} />
        <Tile icon="cart" value={n('cart') + n('archive')} label={tr('закупки и склад')} />
        <Tile icon="water" value={n('water')} label={tr('заправки')} />
      </View>
      {ctx.boxN ? <Flag kind="warn">{tr('Ждут отправки:')}{' '}{ctx.boxN}{' '}{tr('фото. В ленте появятся после отправки.')}</Flag> : null}
      <Card>
        <H2>{tr('Лента дня')}</H2>
        {ev == null ? <Muted>{tr('Загружаю…')}</Muted> : !ev.length ? <Muted>{tr('Сегодня пока ничего не отмечено.')}</Muted> : ev.map((e, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ alignItems: 'center', width: 40 }}>
              <Text style={{ fontSize: 12.5, color: C.muted, fontWeight: '600' }}>{hm(e.at)}</Text>
              <View style={{ width: 2, flex: 1, backgroundColor: i < ev.length - 1 ? C.line : 'transparent', marginTop: 4 }} />
            </View>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={e.icon} size={18} color={e.color} />
            </View>
            <View style={{ flex: 1, paddingBottom: 14, gap: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{e.title}</Text>
              {e.sub ? <Text style={{ fontSize: 13, color: C.muted }}>{e.sub}</Text> : null}
              {e.photo && urls[e.photo] ? (
                <Pressable onPress={() => setBig(urls[e.photo])}>
                  <Image source={{ uri: urls[e.photo] }} style={{ width: 120, height: 90, borderRadius: 8, backgroundColor: C.surface2 }} />
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </Card>
      <Muted style={{ textAlign: 'center' }}>{tr('Руководитель видит этот же день в своей программе.')}</Muted>
      <Modal visible={!!big} transparent animationType="fade" onRequestClose={() => setBig(null)}>
        <Pressable onPress={() => setBig(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' }}>
          {big ? <Image source={{ uri: big }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </Page>
  );
}

/* ---------------- история ---------------- */
function History({ ctx }) {
  const { uid } = ctx;
  const [m, setM] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(new Date().getDate());
  const [busy, setBusy] = useState(false);
  const get = useCallback(async () => {
    setBusy(true);
    try {
      const a = m.toISOString(), b = new Date(m.getFullYear(), m.getMonth() + 1, 1).toISOString();
      const [sh, wp, bu, fu, tk] = await Promise.all([
        supabase.from('shifts').select('*').eq('staff_id', uid).gte('start_at', a).lt('start_at', b).order('start_at'),
        supabase.from('work_photos').select('at').eq('staff_id', uid).gte('at', a).lt('at', b).limit(5000),
        supabase.from('purchases').select('created_at,amount,source,status').eq('staff_id', uid).gte('created_at', a).lt('created_at', b),
        supabase.from('fuel').select('at,liters,amount').eq('staff_id', uid).gte('at', a).lt('at', b),
        supabase.from('tasks').select('day,status').eq('staff_id', uid).gte('day', ymd(m)).lt('day', ymd(new Date(m.getFullYear(), m.getMonth() + 1, 1))),
      ]);
      setData({ sh: sh.data || [], wp: wp.data || [], bu: bu.data || [], fu: fu.data || [], tk: tk.data || [] });
    } catch (e) { setData({ sh: [], wp: [], bu: [], fu: [], tk: [] }); } finally { setBusy(false); }
  }, [m, uid]);
  useEffect(() => { setData(null); get(); }, [get]);
  const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const off = (m.getDay() + 6) % 7;
  const now = new Date();
  const isCur = m.getFullYear() === now.getFullYear() && m.getMonth() === now.getMonth();
  const dayOf = (ts) => new Date(ts).getDate();
  const D = {};
  for (let d = 1; d <= days; d++) D[d] = { min: 0, km: 0, odo: 0, sh: [], ph: 0, bu: 0, fl: 0, fs: 0, tk: 0, td: 0 };
  if (data) {
    data.sh.forEach((x) => { const d = D[dayOf(x.start_at)]; d.sh.push(x); d.min += ((x.end_at ? new Date(x.end_at) : new Date()) - new Date(x.start_at)) / 60000; d.km += +x.gps_km || 0; if (x.end_odo) d.odo += x.end_odo - x.start_odo; });
    data.wp.forEach((x) => { D[dayOf(x.at)].ph++; });
    data.bu.forEach((x) => { D[dayOf(x.created_at)].bu++; });
    data.fu.forEach((x) => { const d = D[dayOf(x.at)]; d.fl += +x.liters || 0; d.fs += +x.amount || 0; });
    data.tk.forEach((x) => { const d = D[+String(x.day).slice(8, 10)]; if (d) { d.tk++; if (x.status === 'done') d.td++; } });
  }
  const tot = Object.values(D).reduce((a, d) => ({ sh: a.sh + d.sh.length, min: a.min + d.min, km: a.km + d.km, ph: a.ph + d.ph }), { sh: 0, min: 0, km: 0, ph: 0 });
  const cells = [];
  for (let i = 0; i < off; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  const S = D[sel] || null;
  const hh = (min) => Math.floor(min / 60) + tr(' ч ') + p2(Math.round(min % 60)) + tr(' мин');
  return (
    <Page onRefresh={get} refreshing={busy}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => { setM(new Date(m.getFullYear(), m.getMonth() - 1, 1)); setSel(1); }} hitSlop={12} style={{ padding: 6 }} accessibilityLabel={tr('Предыдущий месяц')}><Icon name="chevron-back" size={24} color={C.pine} /></Pressable>
        <Text style={{ fontSize: 19, fontWeight: '700', color: C.ink }}>{tr(MONTHS[m.getMonth()])} {m.getFullYear()}</Text>
        <Pressable disabled={isCur} onPress={() => { setM(new Date(m.getFullYear(), m.getMonth() + 1, 1)); setSel(1); }} hitSlop={12} style={{ padding: 6, opacity: isCur ? 0.3 : 1 }} accessibilityLabel={tr('Следующий месяц')}><Icon name="chevron-forward" size={24} color={C.pine} /></Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Tile icon="calendar" value={tot.sh} label={tr('смен')} />
        <Tile icon="time" value={Math.round(tot.min / 60)} label={tr('часов')} />
        <Tile icon="navigate" value={Math.round(tot.km)} label={tr('км по GPS')} />
        <Tile icon="camera" value={tot.ph} label={tr('фото работ')} />
      </View>
      <Card style={{ padding: 10 }}>
        <View style={{ flexDirection: 'row' }}>
          {[tr('Пн'), tr('Вт'), tr('Ср'), tr('Чт'), tr('Пт'), tr('Сб'), tr('Вс')].map((w) => <Text key={w} style={{ width: '14.285%', textAlign: 'center', fontSize: 12, color: C.muted, fontWeight: '700' }}>{w}</Text>)}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((d, i) => {
            if (!d) return <View key={i} style={{ width: '14.285%', aspectRatio: 1 }} />;
            const x = D[d];
            const has = x.sh.length > 0;
            const isToday = isCur && d === now.getDate();
            const future = isCur && d > now.getDate();
            return (
              <Pressable key={i} onPress={() => setSel(d)} style={{ width: '14.285%', aspectRatio: 1, padding: 2 }}>
                <View style={{ flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: has ? C.okSoft : 'transparent', borderWidth: sel === d ? 2 : isToday ? 1 : 0, borderColor: sel === d ? C.sun : C.pine, opacity: future ? 0.4 : 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: has ? '700' : '400', color: has ? C.ok : C.ink }}>{d}</Text>
                  {has ? <Text style={{ fontSize: 10, color: C.ok }}>{Math.round(x.min / 60)}{' '}{tr('ч')}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>
      {data && S ? (
        <Card>
          <H2>{sel} {tr(MONTHS_G[m.getMonth()])}</H2>
          {!S.sh.length ? <Muted>{tr('Смены не было.')}</Muted> : (
            <>
              {S.sh.map((x) => <Row key={x.id} icon="time" title={hm(x.start_at) + ' – ' + (x.end_at ? hm(x.end_at) : tr('идёт'))} sub={tr('Одометр ') + x.start_odo + (x.end_odo ? ' → ' + x.end_odo : '')} />)}
              <Row icon="hourglass" title={hh(S.min)} sub={tr('на смене')} />
              <Row icon="navigate" title={(Math.round(S.km * 10) / 10).toString().replace('.', ',') + tr(' км по GPS')} sub={S.odo ? tr('по одометру ') + S.odo + tr(' км') : undefined} />
              <Row icon="camera" title={tr('Фото работ: ') + S.ph} />
              {S.tk ? <Row icon="checkbox" title={tr('Задачи: ') + S.td + tr(' из ') + S.tk} /> : null}
              {S.bu ? <Row icon="cart" title={tr('Закупки и склад: ') + S.bu} /> : null}
              <Row icon="water" title={S.fl ? tr('Заправка: ') + (Math.round(S.fl * 10) / 10).toString().replace('.', ',') + ' · ' + money(S.fs) : tr('Заправок не было')} last />
            </>
          )}
        </Card>
      ) : null}
    </Page>
  );
}

/* ---------------- помощь ---------------- */
function Help({ ctx }) {
  const items = [
    ['play-circle', tr('Начало смены'), tr('Утром в офисе нажмите «Начать смену», сфотографируйте одометр и введите показания. Включится запись маршрута — это уведомление «Идёт смена».')],
    ['camera', tr('Фото работ'), tr('На каждом объекте снимайте «до» и «после». Выберите объект из списка или впишите имя клиента. Без интернета фото сохранится и отправится само.')],
    ['checkbox', tr('Задачи'), tr('Задачи на день ставит руководитель. Нажмите «Маршрут», чтобы доехать, и «Выполнено» на месте — с фото.')],
    ['cart', tr('Закупка'), tr('Купили что-то — сразу внесите: фото чека, что купили и сумма. Потом отметьте фото там, куда привезли: на складе или на объекте.')],
    ['archive', tr('Со склада'), tr('Берёте материал со склада на объект — запишите это. На объекте отметьте фото, остаток верните на склад.')],
    ['mic', tr('Разговор с клиентом'), tr('Предупредите клиента, что разговор записывается, отметьте его согласие и нажмите запись. Отчёт по разговору получит руководитель.')],
    ['water', tr('Заправка'), tr('После каждой заправки — фото чека, литры и сумма. Всё сверяется с выпиской по топливной карте.')],
    ['stop-circle', tr('Конец смены'), tr('Вечером в офисе нажмите «Закончить смену» и сфотографируйте одометр. Перед этим сдайте закупки.')],
    ['notifications', tr('Напоминания'), tr('Приложение напомнит начать и закончить смену, сдать закупку и снять фото работ.')],
    ['shield-checkmark', tr('Что записывается'), tr('Только во время смены: маршрут, время и место отметок. Вне смены местоположение не записывается.')],
  ];
  return (
    <Page>
      <Card>
        {items.map(([ic, t, d], i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: C.line }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name={ic} size={20} color={C.pine} /></View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontSize: 15.5, fontWeight: '700', color: C.ink }}>{t}</Text>
              <Text style={{ fontSize: 14, color: C.muted, lineHeight: 19 }}>{d}</Text>
            </View>
          </View>
        ))}
      </Card>
      <CallOffice cfg={ctx.st.cfg} />
    </Page>
  );
}

/* ---------------- язык ---------------- */
function LangRow({ last }) {
  const cur = getLang();
  const opt = (k, label) => (
    <Pressable key={k} onPress={() => setLang(k)} accessibilityRole="radio" accessibilityState={{ selected: cur === k }}
      style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', backgroundColor: cur === k ? C.pine : 'transparent' }}>
      <Text style={{ fontSize: 14.5, fontWeight: '700', color: cur === k ? C.pineInk : C.ink }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name="language" size={18} color={C.pine} /></View>
      <Text style={{ fontSize: 15, color: C.ink, fontWeight: '600', flex: 1 }}>{tr('Язык')}</Text>
      <View style={{ flexDirection: 'row', backgroundColor: C.surface2, borderRadius: 11, padding: 3, gap: 3, width: 190 }}>
        {opt('hy', 'Հայերեն')}
        {opt('ru', 'Русский')}
      </View>
    </View>
  );
}

/* ---------------- профиль ---------------- */
function Profile({ ctx }) {
  const { st, load } = ctx;
  const s = st.staff;
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ carModel: s.car_model || '', carPlate: s.car_plate || '', fuel: s.fuel_type || 'petrol', norm: String(s.norm_claimed || ''), tank: String(s.tank || '') });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const unit = s.fuel_type === 'gas' ? tr('м³') : tr('л');
  const save = async () => {
    setBusy(true);
    try { await rpc('update_car', { p_car_model: f.carModel, p_car_plate: f.carPlate, p_fuel_type: f.fuel, p_norm: num(f.norm), p_tank: num(f.tank) }); await load(); setEdit(false); Alert.alert(tr('Сохранено'), tr('Новый расход начнёт учитываться после утверждения руководителем.')); }
    catch (e) { Alert.alert(tr('Не получилось'), errText(e)); } finally { setBusy(false); }
  };
  return (
    <Page onRefresh={ctx.refresh} refreshing={ctx.refreshing}>
      <View style={{ alignItems: 'center', gap: 6, paddingVertical: 8 }}>
        <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: C.pine, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.sun, fontSize: 28, fontWeight: '800' }}>{initials(s.name)}</Text>
        </View>
        <Text style={{ fontSize: 20, fontWeight: '700', color: C.ink }}>{s.name}</Text>
        <Muted>+{String(s.phone).replace(/\D/g, '')}</Muted>
      </View>
      <Card style={{ paddingVertical: 4 }}>
        {st.cfg.office_phone ? <Row icon="call" title={tr('Позвонить в офис')} sub={st.cfg.office_phone} onPress={() => callOffice(st.cfg)} /> : null}
        <Row icon="help-circle" title={tr('Как пользоваться')} onPress={() => ctx.nav('help')} />
        <Row icon="shield-checkmark" title={tr('Разрешения и уведомления')} onPress={() => ctx.nav('perms')} />
        <LangRow last />
      </Card>
      {!edit ? (
        <Card>
          <Label>{tr('Машина')}</Label>
          <T style={{ fontWeight: '700' }}>{s.car_model || tr('не указана')}{s.car_plate ? ' · ' + s.car_plate : ''}</T>
          <Muted>{tr('Расход:')}{' '}{s.norm_approved ? s.norm_approved + ' ' + unit + tr('/100 км, утверждён') : tr('ждёт утверждения')}{s.norm_claimed && s.norm_approved && +s.norm_claimed !== +s.norm_approved ? tr(' · вы указали ') + s.norm_claimed + tr(', ждёт утверждения') : ''}</Muted>
          <Btn kind="ghost" title={tr('Изменить машину')} onPress={() => setEdit(true)} />
        </Card>
      ) : (
        <Card>
          <Field label={tr('Марка и модель')} value={f.carModel} onChangeText={set('carModel')} />
          <Field label={tr('Номер')} value={f.carPlate} onChangeText={set('carPlate')} autoCapitalize="characters" />
          <FuelSeg value={f.fuel} onChange={set('fuel')} />
          <Field label={tr('Расход на 100 км')} value={f.norm} onChangeText={set('norm')} keyboardType="decimal-pad" />
          <Field label={tr('Объём бака')} value={f.tank} onChangeText={set('tank')} keyboardType="decimal-pad" />
          <Btn title={tr('Сохранить')} onPress={save} busy={busy} />
        </Card>
      )}
      <Card>
        <Label>{tr('Последние смены')}</Label>
        {st.shifts.length ? st.shifts.map((x) => (
          <View key={x.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T>{new Date(x.start_at).toLocaleDateString(loc())}</T>
            <Muted>{hm(x.start_at)}–{x.end_at ? hm(x.end_at) : '…'}{x.end_odo ? ' · ' + (x.end_odo - x.start_odo) + tr(' км') : ''}</Muted>
          </View>
        )) : <Muted>{tr('Смен пока нет.')}</Muted>}
      </Card>
      {!st.open ? <Btn kind="ghost" title={tr('Выйти из аккаунта')} onPress={() => supabase.auth.signOut()} /> : <Muted style={{ textAlign: 'center' }}>{tr('Выйти можно после окончания смены.')}</Muted>}
      <Muted style={{ textAlign: 'center', fontSize: 12 }}>{tr('Arev Service · версия')}{' '}{Application.nativeApplicationVersion || '—'}</Muted>
    </Page>
  );
}
