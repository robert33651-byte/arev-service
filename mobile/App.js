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
import { registerPush, onTaskNotificationTap, lastTaskTap } from './src/tasks';

const CATS = { inverter: 'Не работает инвертор', output: 'Упала выработка', panel: 'Повреждена панель', wiring: 'Проводка и разъёмы', battery: 'Аккумулятор', cleaning: 'Чистка панелей', checkup: 'Плановый техосмотр', expand: 'Расширение или чужая станция', other: 'Другое' };
const ST = { new: ['Новый', 'info'], assigned: ['Взят', 'info'], enroute: ['В пути', 'warn'], onsite: ['На месте', 'warn'], done: ['Выполнен', 'ok'], closed: ['Закрыт', 'note'], cancelled: ['Отменён', 'note'] };
const p2 = (n) => String(n).padStart(2, '0');
const hm = (ts) => { if (!ts) return '—'; const d = new Date(ts); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
const dur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + ' мин' : Math.floor(m / 60) + ' ч ' + p2(m % 60) + ' мин'; };
const money = (n) => (n == null ? '—' : Math.round(n).toLocaleString('ru-RU') + ' ֏');
const fDist = (m) => (m == null ? '—' : m < 1000 ? m + ' м' : (m / 1000).toFixed(1).replace('.', ',') + ' км');
const ymd = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const MONTHS_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const initials = (n) => String(n || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const mapsTo = (lat, lng, q) => Linking.openURL(lat != null ? 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q || ''));

export default function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.pine, paddingTop: RNStatusBar.currentHeight || 0 }}>
      <StatusBar style="light" />
      {session === undefined ? <Splash /> : session ? <Main session={session} /> : <Auth />}
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
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Назад" style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
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
    if (normPhone(phone).length < 11) return Alert.alert('Телефон', 'Введите номер полностью, например +374 91 123456');
    if (!/^\d{6,}$/.test(pin)) return Alert.alert('PIN-код', 'PIN-код — минимум 6 цифр');
    if (mode === 'reg' && pin !== pin2) return Alert.alert('PIN-код', 'PIN-коды не совпадают');
    setBusy(true);
    try {
      const email = phoneEmail(phone);
      const r = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password: pin })
        : await supabase.auth.signUp({ email, password: pin });
      if (r.error) throw r.error;
      if (mode === 'reg' && !r.data.session) Alert.alert('Почти готово', 'Аккаунт создан. Войдите с этим номером и PIN-кодом.');
    } catch (e) {
      Alert.alert('Не получилось', errText(e));
    } finally { setBusy(false); }
  };
  return (
    <>
      <Header title="Arev Service" sub="Приложение сотрудника" />
      <Page>
        <H1>{mode === 'login' ? 'Вход' : 'Новый сотрудник'}</H1>
        <Muted>{mode === 'login' ? 'Войдите по номеру телефона и PIN-коду.' : 'Придумайте PIN-код из 6 цифр. Его нужно запомнить: им вы будете входить в приложение.'}</Muted>
        <Field label="Телефон" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+374 91 123456" autoComplete="tel" />
        <Field label="PIN-код" value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={12} placeholder="••••••" />
        {mode === 'reg' ? <Field label="Повторите PIN-код" value={pin2} onChangeText={setPin2} keyboardType="number-pad" secureTextEntry maxLength={12} /> : null}
        <Btn title={mode === 'login' ? 'Войти' : 'Создать аккаунт'} onPress={go} busy={busy} big />
        <Btn kind="ghost" title={mode === 'login' ? 'Я новый сотрудник' : 'У меня уже есть аккаунт'} onPress={() => setMode(mode === 'login' ? 'reg' : 'login')} />
        <Muted style={{ textAlign: 'center' }}>Забыли PIN-код? Обратитесь к руководителю.</Muted>
      </Page>
    </>
  );
}

/* ---------------- основное приложение ---------------- */
const TAB_TITLE = { home: 'Arev Service', tasks: 'Задачи', day: 'Мой день', history: 'История', profile: 'Профиль' };
const SUB_TITLE = { shift: 'Смена', fuel: 'Заправка', ticket: 'Заказ', purchase: 'Закупка', take: 'Со склада', deliver: 'Сдать материал', work: 'Фото работ', task: 'Задача', help: 'Как пользоваться', perms: 'Разрешения' };

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
      const [staffR, cfgR, shiftR, myR, poolR, buyR, wpR, plR, tkR, fuR, ntR] = await Promise.all([
        supabase.from('staff').select('*').eq('id', uid).maybeSingle(),
        supabase.from('config').select('*').eq('id', 1).maybeSingle(),
        supabase.from('shifts').select('*').eq('staff_id', uid).order('start_at', { ascending: false }).limit(10),
        supabase.from('tickets').select('*').eq('staff_id', uid).order('created_at', { ascending: false }).limit(30),
        supabase.rpc('get_pool'),
        supabase.from('purchases').select('*').eq('staff_id', uid).in('status', ['bought', 'partial']).order('created_at'),
        supabase.from('work_photos').select('id,at,kind,object,note,path').eq('staff_id', uid).gte('at', d0.toISOString()).order('at', { ascending: false }),
        supabase.from('places').select('id,name,kind,lat,lng,radius').eq('active', true).order('name'),
        supabase.from('tasks').select('*').eq('staff_id', uid).eq('day', ymd(new Date())).neq('status', 'cancelled').or('place_id.not.is.null,lat.not.is.null').order('ord').order('created_at'),
        supabase.from('fuel').select('liters,amount,at').eq('staff_id', uid).gte('at', d0.toISOString()),
        supabase.rpc('my_tasks'),
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
        tasks: tkR.data || [],
        fuelToday: fuR.data || [],
        nTasks: (ntR.data || []).filter((t) => !t.place_id && t.lat == null && t.status === 'new').length,
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
          tasksLeft: next.tasks.filter((t) => t.status === 'new').length,
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
  const ctx = { uid, phone: String(session.user.email || '').split('@')[0], st, load, nav, goTab, refreshing, refresh, boxN, setBoxN, syncBox };

  if (st.loading) return <Splash />;
  if (!st.staff) return <Register ctx={ctx} />;
  if (st.staff.status !== 'approved') return <Waiting ctx={ctx} />;

  if (view.name !== 'home') {
    let body = null;
    if (view.name === 'shift') body = <ShiftScreen ctx={ctx} />;
    else if (view.name === 'fuel') body = <FuelScreen ctx={ctx} />;
    else if (view.name === 'ticket') body = <TicketScreen ctx={ctx} id={view.id} pooled={view.pooled} />;
    else if (view.name === 'purchase') body = <PurchaseScreen ctx={ctx} ticket={view.ticket} />;
    else if (view.name === 'take') body = <PurchaseScreen ctx={ctx} ticket={view.ticket} source="warehouse" />;
    else if (view.name === 'deliver') body = <DeliverScreen ctx={ctx} id={view.id} />;
    else if (view.name === 'work') body = <WorkScreen ctx={ctx} ticket={view.ticket} />;
    else if (view.name === 'task') body = <TaskScreen ctx={ctx} id={view.id} />;
    else if (view.name === 'help') body = <Help ctx={ctx} />;
    else if (view.name === 'perms') body = <Page><PermCard always /><NotifyCard /></Page>;
    return (
      <>
        <Header title={SUB_TITLE[view.name] || 'Arev Service'} sub={st.staff.name} onBack={() => nav('home')} />
        {body}
      </>
    );
  }
  let body;
  if (tab === 'day') body = <MyDay ctx={ctx} />;
  else if (tab === 'history') body = <History ctx={ctx} />;
  else if (tab === 'profile') body = <Profile ctx={ctx} />;
  else if (tab === 'tasks') body = <TasksScreen userId={uid} embedded openTaskId={openTask} onOpenedTask={() => setOpenTask(null)} />;
  else body = <Home ctx={ctx} />;
  const left = st.buys.length + st.tasks.filter((t) => t.status === 'new').length;
  return (
    <>
      <Header title={TAB_TITLE[tab]} sub={st.staff.name} right={st.cfg.office_phone ? (
        <Pressable onPress={() => callOffice(st.cfg)} hitSlop={10} accessibilityLabel="Позвонить в офис" style={{ padding: 4 }}>
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
      <H2>Уведомления выключены</H2>
      <Muted>Без них приложение не напомнит начать смену, сдать закупку или снять фото работ.</Muted>
      <Btn kind="ghost" title="Открыть настройки" onPress={() => Linking.openSettings()} />
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
        Alert.alert('Нужно «Разрешить всегда»', 'Откроются настройки приложения. Выберите «Разрешения» → «Местоположение» → «Разрешить в любом режиме» (или «Всегда»).', [{ text: 'Открыть настройки', onPress: () => Linking.openSettings() }]);
      } else if (!r.loc || !r.cam) {
        Alert.alert('Разрешения не выданы', 'Откройте настройки приложения и включите «Камеру» и «Местоположение».', [{ text: 'Открыть настройки', onPress: () => Linking.openSettings() }, { text: 'Позже' }]);
      }
    } finally { setBusy(false); }
  };
  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: allOk ? C.ok : C.warn }}>
      <H2>{allOk ? 'Разрешения выданы' : 'Нужны разрешения'}</H2>
      {row(p.loc, 'Местоположение')}
      {row(p.bg, 'Местоположение «всегда» (для маршрута смены)')}
      {row(p.cam, 'Камера')}
      {row(p.gps, 'GPS включён на телефоне')}
      {!allOk ? <Muted>Без них приложение не сможет отмечать приход, уход и выезды.</Muted> : null}
      {!allOk ? <Btn title="Выдать разрешения" onPress={ask} busy={busy} /> : null}
      {!allOk && p.loc ? <Btn kind="ghost" title="Открыть настройки приложения" onPress={() => Linking.openSettings()} /> : null}
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
    if (!f.name.trim()) return Alert.alert('Анкета', 'Укажите имя и фамилию');
    if (!f.carModel.trim() || !num(f.norm)) return Alert.alert('Анкета', 'Укажите машину и расход на 100 км');
    if (!ok) return Alert.alert('Анкета', 'Нужно согласие');
    setBusy(true);
    try {
      await rpc('register', { p_name: f.name, p_phone: phone, p_car_model: f.carModel, p_car_plate: f.carPlate, p_fuel_type: f.fuel, p_norm: num(f.norm), p_tank: num(f.tank), p_device: deviceId() });
      await askPermissions();
      await ctx.load();
    } catch (e) { Alert.alert('Не получилось', errText(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Header title="Arev Service" sub="Анкета сотрудника" />
      <Page>
        <H1>Анкета сотрудника</H1>
        <Muted>Заполните один раз. Анкета привязывается к этому телефону. После проверки руководителем можно работать.</Muted>
        <Field label="Имя и фамилия" value={f.name} onChangeText={set('name')} />
        <Card>
          <Label>Машина</Label>
          <Field label="Марка и модель" value={f.carModel} onChangeText={set('carModel')} placeholder="Toyota Prius" />
          <Field label="Номер" value={f.carPlate} onChangeText={set('carPlate')} placeholder="35 XX 123" autoCapitalize="characters" />
          <FuelSeg value={f.fuel} onChange={set('fuel')} />
          <Field label={'Расход на 100 км, ' + (f.fuel === 'gas' ? 'м³' : 'л')} value={f.norm} onChangeText={set('norm')} keyboardType="decimal-pad" />
          <Field label={'Объём бака, ' + (f.fuel === 'gas' ? 'м³' : 'л')} value={f.tank} onChangeText={set('tank')} keyboardType="decimal-pad" />
        </Card>
        <Pressable onPress={() => setOk(!ok)} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: C.pine, backgroundColor: ok ? C.pine : 'transparent', marginTop: 2 }} />
          <Muted style={{ flex: 1 }}>Согласен, что во время смены записывается моё местоположение, а фото одометра, чеков и работ сохраняются с координатами и временем и сверяются с выпиской по топливной карте.</Muted>
        </Pressable>
        <Btn title="Отправить" onPress={send} busy={busy} big />
        <Btn kind="ghost" title="Выйти" onPress={() => supabase.auth.signOut()} />
      </Page>
    </>
  );
}
const num = (v) => { const n = parseFloat(String(v || '').replace(',', '.')); return isFinite(n) && n > 0 ? n : null; };

function FuelSeg({ value, onChange }) {
  const opts = [['petrol', 'Бензин'], ['gas', 'Метан'], ['lpg', 'Пропан'], ['diesel', 'Дизель']];
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: C.ink }}>Топливо</Text>
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
  const txt = s.status === 'pending' ? 'Руководитель проверит анкету. После подтверждения здесь появится кнопка «Начать смену».'
    : s.status === 'blocked' ? 'Доступ приостановлен. ' + (s.note || 'Свяжитесь с офисом.') : 'Анкета не одобрена. ' + (s.note || 'Свяжитесь с офисом.');
  return (
    <>
      <Header title="Arev Service" sub={s.name} />
      <Page onRefresh={ctx.refresh} refreshing={ctx.refreshing}>
        <H1>{s.status === 'pending' ? 'Анкета на проверке' : 'Нет доступа'}</H1>
        <Flag kind={s.status === 'pending' ? 'note' : 'warn'}>{txt}</Flag>
        {s.status === 'pending' ? <PermCard always /> : null}
        <Btn kind="ghost" title="Проверить ещё раз" onPress={ctx.refresh} />
        <Btn kind="ghost" title="Выйти" onPress={() => supabase.auth.signOut()} />
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
  const greet = (() => { const h = new Date().getHours(); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'; })();
  const mine = st.mine.filter((t) => ['assigned', 'enroute', 'onsite'].includes(t.status));
  const tasks = st.tasks;
  const tLeft = tasks.filter((t) => t.status === 'new').length;
  const fuelL = st.fuelToday.reduce((a, r) => a + (+r.liters || 0), 0);
  const unit = st.staff.fuel_type === 'gas' ? 'м³' : 'л';

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
              <Text style={{ color: C.pineInk, opacity: 0.75 }}>{new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
            </View>
          </View>
          {doneToday ? (
            <Text style={{ color: C.pineInk, opacity: 0.85 }}>Смена на сегодня закончена в {hm(last.end_at)}. Хорошего вечера!</Text>
          ) : (
            <Text style={{ color: C.pineInk, opacity: 0.85 }}>Начните смену в офисе: сфотографируйте одометр и введите показания. Место и время запишутся автоматически.</Text>
          )}
          <Btn title={doneToday ? 'Начать ещё одну смену' : 'Начать смену'} onPress={() => nav('shift')} big />
        </View>
        {tasks.length ? <TaskList ctx={ctx} tasks={tasks} preview /> : null}
        {st.buys.length ? <BuyList ctx={ctx} items={st.buys} /> : null}
        {last ? (
          <Card>
            <Label>Прошлая смена</Label>
            <Row icon="time" title={new Date(last.start_at).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }) + ', ' + hm(last.start_at) + '–' + hm(last.end_at)}
              sub={'Одометр ' + last.end_odo + ' км' + (last.gps_km != null ? ' · по GPS ' + String(last.gps_km).replace('.', ',') + ' км' : '')} last />
          </Card>
        ) : null}
        <CallOffice cfg={st.cfg} />
      </Page>
    );
  }
  const mins = Math.max(0, Math.round((Date.now() - new Date(sh.start_at).getTime()) / 60000));
  const checks = [
    { done: true, text: 'Смена начата', sub: 'в ' + hm(sh.start_at) },
    tasks.length ? { done: !tLeft, text: 'Задачи на сегодня', sub: (tasks.length - tLeft) + ' из ' + tasks.length + ' выполнено' } : null,
    { done: st.wph.length > 0, text: 'Фото работ', sub: st.wph.length ? 'снято ' + st.wph.length : 'снимайте до и после каждой работы' },
    { done: !st.buys.length, text: 'Закупки и материал сданы', sub: st.buys.length ? 'не сдано: ' + st.buys.length : 'всё сдано' },
    { done: false, text: 'Закончить смену в офисе', sub: 'фото одометра' },
  ].filter(Boolean);
  return (
    <Page onRefresh={ctx.refresh} refreshing={ctx.refreshing}>
      <PermCard />
      <NotifyCard />
      <View style={{ backgroundColor: C.pine, borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#53c085' }} />
            <Text style={{ color: C.pineInk, opacity: 0.8, fontSize: 13 }}>Смена идёт · с {hm(sh.start_at)}</Text>
          </View>
          <Text style={{ color: C.pineInk, fontSize: 44, fontWeight: '800', letterSpacing: 1 }}>{Math.floor(mins / 60)}:{p2(mins % 60)}</Text>
          <Text style={{ color: C.pineInk, opacity: 0.75, fontSize: 13 }}>{greet}, {first}</Text>
        </View>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.sun, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="sunny" size={34} color={C.pine} />
        </View>
      </View>
      {ctx.boxN ? <Flag kind="warn">Без интернета сохранено фото: {ctx.boxN}. Они отправятся сами, когда появится связь.</Flag> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Tile icon="camera" value={st.wph.length} label="фото работ" tone={st.wph.length ? 'ok' : mins > 180 ? 'warn' : 'note'} onPress={() => ctx.goTab('day')} />
        <Tile icon="checkbox" value={tasks.length ? (tasks.length - tLeft) + '/' + tasks.length : '—'} label="задачи" tone={tasks.length && !tLeft ? 'ok' : 'note'} />
        <Tile icon="cube" value={st.buys.length} label="не сдано" tone={st.buys.length ? 'bad' : 'ok'} />
        <Tile icon="water" value={fuelL ? String(Math.round(fuelL * 10) / 10).replace('.', ',') + ' ' + unit : '—'} label="заправка сегодня" />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Action icon="camera" title="Фото работ" sub="до и после" kind="primary" onPress={() => nav('work')} />
        <Action icon="cart" title="Закупка" sub="купил в магазине" onPress={() => nav('purchase')} />
        <Action icon="archive" title="Со склада" sub="взял материал" onPress={() => nav('take')} />
        <Action icon="water" title="Заправка" sub="чек АЗС" onPress={() => nav('fuel')} />
      </View>
      {tasks.length ? <TaskList ctx={ctx} tasks={tasks} /> : null}
      <BuyList ctx={ctx} items={st.buys} />
      <Card>
        <H2>План на день</H2>
        {checks.map((c, i) => <Check key={i} done={c.done} text={c.text} sub={c.sub} />)}
      </Card>
      {mine.length ? <H2>{mine.length > 1 ? 'Мои заказы' : 'Мой заказ'}</H2> : null}
      {mine.map((t) => (
        <Pressable key={t.id} onPress={() => nav('ticket', { id: t.id })}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Label>{t.num}{t.urgent ? ' · срочно' : ''}</Label><Chip kind={ST[t.status][1]}>{ST[t.status][0]}</Chip></View>
            <T style={{ fontWeight: '700' }}>{CATS[t.category] || t.category}</T>
            <Muted>{t.address}</Muted>
            <T>{t.client_name} · {t.client_phone}</T>
          </Card>
        </Pressable>
      ))}
      {st.pool.length ? <H2>Новые заказы ({st.pool.length})</H2> : null}
      {st.pool.map((t) => (
        <Pressable key={t.id} onPress={() => nav('ticket', { id: t.id, pooled: t })}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T style={{ fontWeight: '700', flex: 1 }}>{CATS[t.category] || t.category}</T>{t.urgent ? <Chip kind="bad">срочно</Chip> : null}</View>
            <Muted>{t.address}</Muted>
            {t.est_min ? <T>{money(t.est_min)} – {money(t.est_max)}</T> : null}
          </Card>
        </Pressable>
      ))}
      <Btn kind="dark" title="Закончить смену" big onPress={() => nav('shift')} />
      <CallOffice cfg={st.cfg} />
    </Page>
  );
}

function CallOffice({ cfg }) {
  if (!cfg || !cfg.office_phone) return null;
  return (
    <Pressable onPress={() => callOffice(cfg)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 }}>
      <Icon name="call" size={18} color={C.info} />
      <Text style={{ color: C.info, fontSize: 15, fontWeight: '600' }}>Позвонить в офис</Text>
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
        <H2>Задачи на сегодня</H2>
        <Chip kind={done === tasks.length ? 'ok' : 'info'}>{done} из {tasks.length}</Chip>
      </View>
      {tasks.map((t, i) => (
        <View key={t.id} style={{ gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, paddingTop: i ? 10 : 0 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Icon name={t.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={t.status === 'done' ? C.ok : C.muted} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 15.5, fontWeight: '700', color: t.status === 'done' ? C.muted : C.ink }}>{t.title}</Text>
              {placeName(t) ? <Muted>{placeName(t)}</Muted> : null}
              {t.note ? <Muted>{t.note}</Muted> : null}
              {t.status === 'done' ? <Text style={{ color: C.ok, fontSize: 13 }}>Выполнено в {hm(t.done_at)}</Text> : null}
            </View>
          </View>
          {t.status === 'new' && !preview ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn kind="ghost" title="Маршрут" onPress={() => mapsTo(t.lat, t.lng, placeName(t) || t.title)} style={{ flex: 1 }} />
              <Btn kind="dark" title="Выполнено" onPress={() => nav('task', { id: t.id })} style={{ flex: 1 }} />
            </View>
          ) : null}
        </View>
      ))}
      {preview ? <Muted>Отмечать задачи можно после начала смены.</Muted> : null}
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
  if (!t) return <Page><Muted>Задача не найдена или уже выполнена.</Muted><Btn kind="ghost" title="На главную" onPress={() => nav('home')} /></Page>;
  const place = st.places.find((x) => x.id === t.place_id);
  const target = t.lat != null ? { lat: t.lat, lng: t.lng } : null;
  const lim = (place && place.radius) || st.cfg.client_radius || 200;
  const onShot = async (uri) => {
    try {
      const fix = await getFix();
      if (fix.mocked) { setCam(false); return Alert.alert('Подмена местоположения', 'Отключите подмену местоположения и сфотографируйте снова.'); }
      const up = await uploadPhoto(uri, uid, 'task');
      setShot({ ...up, fix, dist: distM(fix, target) }); setCam(false);
    } catch (e) { setCam(false); Alert.alert('Не получилось', errText(e)); }
  };
  const submit = async () => {
    if (!shot) return Alert.alert('Фото', 'Сфотографируйте выполненную работу на месте');
    setBusy(true);
    try {
      await rpc('complete_task', { p_id: t.id, p_photo: shot.path, p_lat: shot.fix.lat, p_lng: shot.fix.lng, p_acc: shot.fix.acc, p_mocked: shot.fix.mocked, p_device: deviceId(), p_note: note });
      AsyncStorage.setItem('arev.lastWork', String(Date.now())).catch(() => {});
      await load();
      nav('home');
    } catch (e) { Alert.alert('Не получилось', errText(e)); } finally { setBusy(false); }
  };
  const far = shot && shot.dist != null && shot.dist > lim;
  return (
    <Page>
      <Label>Задача на сегодня</Label>
      <H1>{t.title}</H1>
      <Card>
        {place ? <Row icon="location" title={place.name} sub={t.note || undefined} last /> : t.note ? <T>{t.note}</T> : null}
        <Btn kind="ghost" title="Маршрут в Google Maps" onPress={() => mapsTo(t.lat, t.lng, (place && place.name) || t.title)} />
      </Card>
      <Card>
        <T style={{ fontWeight: '700' }}>Фото выполненной работы</T>
        <Muted>Снимите на месте. Фото попадёт и в «Фото работ».</Muted>
        {shot ? <Image source={{ uri: shot.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10 }} /> : null}
        {shot ? (shot.dist == null ? <Flag kind="note">Координаты сохранены</Flag> : far ? <Flag kind="bad">{fDist(shot.dist)} от точки задачи. Отметка будет записана с отклонением.</Flag> : <Flag kind="ok">На месте · {fDist(shot.dist)}</Flag>) : null}
        <Btn kind={shot ? 'ghost' : 'dark'} title={shot ? 'Переснять' : 'Сфотографировать'} onPress={() => setCam(true)} />
        <Field label="Комментарий (не обязательно)" value={note} onChangeText={setNote} placeholder="Почистил 24 панели" />
      </Card>
      <Btn title="Задача выполнена" big busy={busy} onPress={submit} />
      <CameraSheet visible={cam} title="Работа выполнена" onClose={() => setCam(false)} onShot={onShot} />
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
        return Alert.alert('Подмена местоположения', 'На телефоне включена подмена местоположения. Отключите её в настройках и сфотографируйте снова.');
      }
      const up = await uploadPhoto(uri, uid, ending ? 'odo-end' : 'odo-start');
      setShot({ ...up, fix, dist: distM(fix, office) });
      setCam(false);
    } catch (e) { setCam(false); Alert.alert('Не получилось', errText(e)); }
  };
  const submit = async (force) => {
    const v = parseInt(String(odo).replace(/\D/g, ''), 10);
    if (!shot) return Alert.alert('Фото', 'Сфотографируйте одометр');
    if (!v) return Alert.alert('Одометр', 'Введите показания одометра');
    if (ending && force !== true && force !== 'photos' && !st.wph.length) {
      return Alert.alert('Нет фото работ', 'За сегодня не загружено ни одного фото проделанной работы. Руководитель увидит это. Закончить смену всё равно?',
        [{ text: 'Сначала сниму' }, { text: 'Закончить', onPress: () => submit(st.buys.length ? 'photos' : true) }]);
    }
    if (ending && force !== true && st.buys.length) {
      return Alert.alert('Не сдана закупка', 'Есть купленный товар, который не сдан на склад или на объект (' + st.buys.length + '). Руководитель увидит это. Закончить смену всё равно?',
        [{ text: 'Сначала сдам' }, { text: 'Закончить', onPress: () => submit(true) }]);
    }
    setBusy(true);
    try {
      const wifi = await officeWifiOk(st.cfg.office_wifi);
      const args = { p_odo: v, p_photo: shot.path, p_lat: shot.fix.lat, p_lng: shot.fix.lng, p_acc: shot.fix.acc, p_mocked: shot.fix.mocked, p_wifi_ok: wifi, p_device: deviceId() };
      if (ending) { await rpc('end_shift', args); await stopTrack(); }
      else {
        await rpc('start_shift', args);
        const ok = await startTrack();
        if (!ok) Alert.alert('Разрешите местоположение «Всегда»', 'Без этого маршрут смены не записывается, и руководитель это увидит. Откройте настройки приложения → Разрешения → Местоположение → «Разрешить всегда».', [{ text: 'Открыть настройки', onPress: () => Linking.openSettings() }, { text: 'Позже' }]);
      }
      await load();
      nav('home');
    } catch (e) { Alert.alert('Не получилось', errText(e)); } finally { setBusy(false); }
  };
  const far = shot && shot.dist != null && shot.dist > radius;
  return (
    <Page>
      <H1>{ending ? 'Закончить смену' : 'Начать смену'}</H1>
      <Card>
        <T style={{ fontWeight: '700' }}>1. Фото одометра</T>
        <Muted>{ending ? 'Вернитесь в офис и сфотографируйте одометр.' : 'Сфотографируйте одометр у офиса.'} Место и время запишутся вместе с фото.</Muted>
        {shot ? <Image source={{ uri: shot.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10 }} /> : null}
        {shot ? (shot.dist == null ? <Flag kind="note">Координаты сохранены</Flag> : far ? <Flag kind="bad">{fDist(shot.dist)} от офиса. Отметка будет записана с отклонением.</Flag> : <Flag kind="ok">В офисе · {fDist(shot.dist)}</Flag>) : null}
        <Btn kind={shot ? 'ghost' : 'dark'} title={shot ? 'Переснять' : 'Сфотографировать одометр'} onPress={() => setCam(true)} />
      </Card>
      <Card>
        <Field label="2. Показания одометра, км" value={odo} onChangeText={setOdo} keyboardType="number-pad" placeholder={String(ending ? sh.start_odo : prev || '')} />
        {ending ? <Muted>Утром было {sh.start_odo} км.</Muted> : prev ? <Muted>Прошлым вечером было {prev} км.</Muted> : null}
      </Card>
      <Btn title={ending ? 'Закончить смену' : 'Начать смену'} kind={ending ? 'dark' : 'primary'} onPress={submit} busy={busy} big />
      <CameraSheet visible={cam} title="Одометр" onClose={() => setCam(false)} onShot={onShot} />
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
  const unit = st.staff.fuel_type === 'gas' ? 'м³' : 'л';
  const onShot = async (uri) => {
    try {
      const fix = await getFix();
      if (fix.mocked) { setCam(false); return Alert.alert('Подмена местоположения', 'Отключите подмену местоположения и сфотографируйте снова.'); }
      const up = await uploadPhoto(uri, uid, 'receipt');
      setShot({ ...up, fix }); setCam(false);
    } catch (e) { setCam(false); Alert.alert('Не получилось', errText(e)); }
  };
  const submit = async () => {
    const l = num(liters), a = parseInt(String(sum).replace(/\D/g, ''), 10);
    if (!shot) return Alert.alert('Чек', 'Сфотографируйте чек');
    if (!l) return Alert.alert('Объём', 'Укажите, сколько залито');
    if (!a) return Alert.alert('Сумма', 'Укажите сумму из чека');
    const save = async () => {
      setBusy(true);
      try {
        await rpc('add_fuel', { p_liters: l, p_amount: a, p_photo: shot.path, p_lat: shot.fix.lat, p_lng: shot.fix.lng, p_acc: shot.fix.acc, p_mocked: shot.fix.mocked, p_device: deviceId() });
        await load(); nav('home');
      } catch (e) { Alert.alert('Не получилось', errText(e)); } finally { setBusy(false); }
    };
    if (st.staff.tank && l > st.staff.tank * 1.05) {
      return Alert.alert('Больше, чем бак', 'Указано ' + l + ' ' + unit + ', а бак ' + st.staff.tank + '. Проверьте цифры. Если всё верно, заправка будет отмечена для руководителя.', [{ text: 'Исправить' }, { text: 'Сохранить', onPress: save }]);
    }
    save();
  };
  return (
    <Page>
      <H1>Заправка</H1>
      <Muted>Каждая заправка сверяется с выпиской по топливной карте и с рабочим пробегом.</Muted>
      <Card>
        <T style={{ fontWeight: '700' }}>1. Фото чека</T>
        {shot ? <Image source={{ uri: shot.uri }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 10 }} /> : null}
        <Btn kind={shot ? 'ghost' : 'dark'} title={shot ? 'Переснять' : 'Сфотографировать чек'} onPress={() => setCam(true)} />
      </Card>
      <Card>
        <T style={{ fontWeight: '700' }}>2. Как в чеке</T>
        <Field label={unit === 'м³' ? 'Кубов' : 'Литров'} value={liters} onChangeText={setLiters} keyboardType="decimal-pad" />
        <Field label="Сумма, ֏" value={sum} onChangeText={setSum} keyboardType="number-pad" />
      </Card>
      <Btn title="Сохранить заправку" onPress={submit} busy={busy} big />
      <CameraSheet visible={cam} title="Чек" onClose={() => setCam(false)} onShot={onShot} />
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

  const act = async (fn) => { setBusy(true); try { await fn(); await load(); } catch (e) { Alert.alert('Не получилось', errText(e)); } finally { setBusy(false); } };

  if (!t && pooled) {
    return (
      <Page>
        <Label>{pooled.num}</Label>
        <H1>{CATS[pooled.category] || pooled.category}</H1>
        <Card>
          <T>{pooled.address}</T>
          {pooled.descr ? <Muted>{pooled.descr}</Muted> : null}
          {pooled.err_code ? <T>Код ошибки: {pooled.err_code}</T> : null}
          {pooled.est_min ? <T>Оценка клиенту: {money(pooled.est_min)} – {money(pooled.est_max)}</T> : null}
          <Muted>Имя и телефон клиента откроются, когда вы возьмёте заказ.</Muted>
        </Card>
        <Btn title="Беру заказ" big busy={busy} onPress={() => act(async () => { await rpc('take_ticket', { p_id: pooled.id, p_device: deviceId() }); nav('ticket', { id: pooled.id }); })} />
      </Page>
    );
  }
  if (!t) return <Page><Muted>Заказ не найден. Возможно, его уже взял другой сотрудник.</Muted><Btn kind="ghost" title="На главную" onPress={() => nav('home')} /></Page>;

  const step = (name, extra) => act(async () => {
    const fix = await getFix();
    if (fix.mocked) throw new Error('MOCK_LOCATION');
    if (name === 'onsite' && t.lat != null) {
      const d = distM(fix, { lat: t.lat, lng: t.lng });
      const lim = st.cfg.client_radius || 200;
      if (d != null && d > lim) {
        const go = await new Promise((res) => Alert.alert('Вы далеко от объекта', 'До точки клиента ' + fDist(d) + '. Отметка будет записана с отклонением.', [{ text: 'Я ещё еду', onPress: () => res(false) }, { text: 'Отметить', onPress: () => res(true) }]));
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
    } catch (e) { setCam(null); Alert.alert('Не получилось', errText(e)); }
  };
  const nb = photos.filter((p) => p.kind === 'before').length, na = photos.filter((p) => p.kind === 'after').length;
  const mapUrl = t.lat != null ? 'https://www.google.com/maps/dir/?api=1&destination=' + t.lat + ',' + t.lng : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(t.address);
  return (
    <Page>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Label>{t.num}{t.urgent ? ' · срочно' : ''}</Label><Chip kind={ST[t.status][1]}>{ST[t.status][0]}</Chip></View>
      <H1>{CATS[t.category] || t.category}</H1>
      <Card>
        <T style={{ fontWeight: '700' }}>{t.client_name}</T>
        <Pressable onPress={() => Linking.openURL('tel:' + String(t.client_phone).replace(/[^\d+]/g, ''))}><Text style={{ color: C.info, fontSize: 16 }}>{t.client_phone}</Text></Pressable>
        <T>{t.address}</T>
        <Btn kind="ghost" title="Маршрут в Google Maps" onPress={() => Linking.openURL(mapUrl)} />
        {t.descr ? <Muted>{t.descr}</Muted> : null}
        {t.err_code ? <T>Код ошибки: {t.err_code}</T> : null}
      </Card>
      {['assigned', 'enroute', 'onsite'].includes(t.status) ? <TicketBuys ctx={ctx} t={t} /> : null}
      {t.status === 'assigned' ? <>
        <Btn kind="dark" title="Выехал к клиенту" big busy={busy} onPress={() => step('enroute')} />
        <Btn kind="ghost" title="Отказаться от заказа" onPress={() => Alert.alert('Отказаться?', 'Заказ вернётся в общий список, отказ увидит руководитель.', [{ text: 'Нет' }, { text: 'Отказаться', onPress: () => act(async () => { await rpc('refuse_ticket', { p_id: t.id, p_device: deviceId() }); nav('home'); }) }])} />
      </> : null}
      {t.status === 'enroute' ? <>
        <Muted>В пути с {hm(t.enroute_at)}. Отметка сработает рядом с объектом.</Muted>
        <Btn title="Я на месте" big busy={busy} onPress={() => step('onsite')} />
      </> : null}
      {t.status === 'onsite' ? <>
        <Card>
          <T style={{ fontWeight: '700' }}>Фото до работы: {nb}</T>
          <Btn kind={nb ? 'ghost' : 'dark'} title="Снять фото до" onPress={() => setCam('before')} />
          <T style={{ fontWeight: '700' }}>Фото после работы: {na}</T>
          <Btn kind={na ? 'ghost' : 'dark'} title="Снять фото после" onPress={() => setCam('after')} />
        </Card>
        <Card>
          <Field label="Сумма, ֏" value={price} onChangeText={setPrice} keyboardType="number-pad" />
          <Field label="Что сделано (коротко)" value={work} onChangeText={setWork} multiline placeholder="Заменил 2 коннектора MC4" />
        </Card>
        <Btn title="Завершить" big busy={busy} disabled={!nb || !na} onPress={() => step('done', { p_price: parseInt(String(price).replace(/\D/g, ''), 10) || 0, p_work: work })} />
        {!nb || !na ? <Muted style={{ textAlign: 'center' }}>Нужно хотя бы одно фото до и одно после.</Muted> : null}
      </> : null}
      {t.status === 'done' || t.status === 'closed' ? <Card><T>Сумма: {money(t.price)}</T>{t.work ? <Muted>{t.work}</Muted> : null}<Chip kind={t.status === 'closed' ? 'ok' : 'note'}>{t.status === 'closed' ? 'Клиент подтвердил' : 'Ждём подтверждения'}</Chip></Card> : null}
      <CameraSheet visible={!!cam} title={cam === 'before' ? 'Фото до' : 'Фото после'} onClose={() => setCam(null)} onShot={onShot} />
    </Page>
  );
}

/* ---------------- закупки ---------------- */
const lineText = (l) => l.name + ' — ' + l.qty + (l.unit ? ' ' + l.unit : '');
const buyWhere = (b, mine) => {
  if (b.status === 'partial') return 'Остаток → на склад';
  if (b.dest === 'ticket') { const t = (mine || []).find((x) => x.id === b.ticket_id); return 'На объект' + (t ? ' · ' + t.num : ''); }
  if (b.dest === 'site') return (b.source === 'warehouse' ? 'Со склада → ' : 'На объект · ') + (b.site || '');
  return 'На склад';
};

// список несданного товара на главном экране
function BuyList({ ctx, items }) {
  if (!items || !items.length) return null;
  const maxH = ctx.st.cfg.purchase_max_hours || 24;
  return (
    <>
      <H2>Не сдано ({items.length})</H2>
      {items.map((b) => {
        const late = Date.now() - new Date(b.created_at).getTime() > maxH * 3600000;
        const lines = b.status === 'partial' ? (b.left_lines || []).filter((l) => l.qty > 0) : b.lines || [];
        return (
          <Pressable key={b.id} onPress={() => ctx.nav('deliver', { id: b.id })}>
            <Card style={{ borderLeftWidth: 4, borderLeftColor: late ? C.bad : C.sun }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Label>{buyWhere(b, ctx.st.mine)}</Label>
                {late ? <Chip kind="bad">просрочено</Chip> : <Chip kind="warn">{hm(b.created_at)}</Chip>}
              </View>
              <T style={{ fontWeight: '700' }}>{b.source === 'warehouse' ? 'Материал со склада' : b.supplier + ' · ' + money(b.amount)}</T>
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
      <T style={{ fontWeight: '700' }}>Материал для заказа</T>
      {items.length ? items.map((b) => (
        <Pressable key={b.id} onPress={() => ctx.nav('deliver', { id: b.id })} style={{ paddingVertical: 4 }}>
          <T>{b.supplier} · {money(b.amount)}</T>
          <Muted>{(b.lines || []).map(lineText).join(', ')}</Muted>
          <Text style={{ color: C.info }}>{t.status === 'onsite' ? 'Отметить на объекте →' : 'Отметить можно будет на объекте'}</Text>
        </Pressable>
      )) : <Muted>Если докупаете что-то для этой работы, запишите покупку здесь. Без отметки на объекте заказ не закроется.</Muted>}
      <Btn kind="ghost" title="Докупил материал" onPress={() => ctx.nav('purchase', { ticket: t.id })} />
    </Card>
  );
}

function PurchaseScreen({ ctx, ticket, source }) {
  const { st, uid, load, nav } = ctx;
  const wh = source === 'warehouse';
  const active = st.mine.filter((t) => ['assigned', 'enroute', 'onsite'].includes(t.status));
  const [dest, setDest] = useState(ticket || (wh ? 'site' : 'warehouse'));
  const [site, setSite] = useState((st.wph[0] && st.wph[0].object) || '');
  const [supplier, setSupplier] = useState('');
  const [lines, setLines] = useState([{ name: '', qty: '', unit: 'шт' }]);
  const [sum, setSum] = useState('');
  const [cam, setCam] = useState(false);
  const [shot, setShot] = useState(null);
  const [busy, setBusy] = useState(false);
  const setLine = (i, k) => (v) => setLines((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const onShot = async (uri) => {
    try {
      const fix = await getFix();
      if (fix.mocked) { setCam(false); return Alert.alert('Подмена местоположения', 'Отключите подмену местоположения и сфотографируйте снова.'); }
      const up = await uploadPhoto(uri, uid, wh ? 'take' : 'buy');
      setShot({ ...up, fix }); setCam(false);
    } catch (e) { setCam(false); Alert.alert('Не получилось', errText(e)); }
  };
  const submit = async () => {
    const clean = lines.map((l) => ({ name: String(l.name).trim(), qty: num(l.qty), unit: String(l.unit || '').trim() })).filter((l) => l.name || l.qty);
    const a = parseInt(String(sum).replace(/\D/g, ''), 10);
    if (!shot) return Alert.alert('Фото', wh ? 'Сфотографируйте материал на складе' : 'Сфотографируйте чек или накладную');
    if (!wh && !supplier.trim()) return Alert.alert('Где купили', 'Укажите магазин или поставщика');
    if (!clean.length || clean.some((l) => !l.name || !l.qty)) return Alert.alert('Товар', 'Для каждой строки укажите название и количество');
    if (!wh && !a) return Alert.alert('Сумма', 'Укажите сумму из чека');
    if (dest === 'site' && !site.trim()) return Alert.alert('Объект', 'Укажите, для какого объекта: клиент или адрес');
    setBusy(true);
    try {
      await rpc('add_purchase', { p_source: wh ? 'warehouse' : 'shop', p_supplier: wh ? '' : supplier, p_lines: clean, p_amount: wh ? 0 : a, p_photo: shot.path, p_lat: shot.fix.lat, p_lng: shot.fix.lng, p_acc: shot.fix.acc, p_mocked: shot.fix.mocked, p_device: deviceId(), p_ticket: dest === 'warehouse' || dest === 'site' ? null : dest, p_site: dest === 'site' ? site : null });
      await load();
      if (dest === 'warehouse' || dest === 'site') nav('home'); else nav('ticket', { id: dest });
    } catch (e) { Alert.alert('Не получилось', errText(e)); } finally { setBusy(false); }
  };
  return (
    <Page>
      <H1>{wh ? 'Взять со склада' : 'Закупка'}</H1>
      <Muted>{wh ? 'Запишите материал, который берёте со склада на объект. На объекте отметите его фото, остаток верните на склад.' : 'Каждая покупка должна дойти до склада или до объекта. Там вы отметите её фото, место проверит телефон.'}</Muted>
      <Card>
        <T style={{ fontWeight: '700' }}>1. Куда везёте</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {!wh ? <Btn kind={dest === 'warehouse' ? 'dark' : 'ghost'} title="На склад" onPress={() => setDest('warehouse')} /> : null}
          <Btn kind={dest === 'site' ? 'dark' : 'ghost'} title={wh ? 'На объект' : 'Сразу на объект'} onPress={() => setDest('site')} />
          {active.map((t) => <Btn key={t.id} kind={dest === t.id ? 'dark' : 'ghost'} title={'Заказ ' + t.num} onPress={() => setDest(t.id)} />)}
        </View>
        {dest === 'site' ? <Field label="Объект: клиент или адрес" value={site} onChangeText={setSite} placeholder="Ашот, Абовян, ул. ..." /> : null}
        {dest === 'site' ? <PlacePick places={st.places} value={site} onPick={setSite} /> : null}
        {dest === 'site' ? <Muted>На объекте отметите материал фото. Остаток нужно будет сдать на склад.</Muted> : null}
        {dest !== 'warehouse' && dest !== 'site' ? <Muted>{(active.find((t) => t.id === dest) || {}).address}</Muted> : null}
      </Card>
      <Card>
        <T style={{ fontWeight: '700' }}>{wh ? '2. Фото материала на складе' : '2. Фото чека или накладной'}</T>
        {shot ? <Image source={{ uri: shot.uri }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 10 }} /> : null}
        <Btn kind={shot ? 'ghost' : 'dark'} title={shot ? 'Переснять' : wh ? 'Сфотографировать материал' : 'Сфотографировать чек'} onPress={() => setCam(true)} />
      </Card>
      <Card>
        <T style={{ fontWeight: '700' }}>{wh ? '3. Что берёте' : '3. Что купили, как в чеке'}</T>
        {!wh ? <Field label="Магазин или поставщик" value={supplier} onChangeText={setSupplier} placeholder="Электротовары, ул. ..." /> : null}
        {lines.map((l, i) => (
          <View key={i} style={{ gap: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, paddingTop: i ? 8 : 0 }}>
            <Field label={'Товар ' + (i + 1)} value={l.name} onChangeText={setLine(i, 'name')} placeholder="Кабель солнечный 6 мм²" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Field label="Количество" value={l.qty} onChangeText={setLine(i, 'qty')} keyboardType="decimal-pad" /></View>
              <View style={{ flex: 1 }}><Field label="Ед." value={l.unit} onChangeText={setLine(i, 'unit')} placeholder="шт, м" /></View>
            </View>
            {lines.length > 1 ? <Btn kind="ghost" title="Убрать строку" onPress={() => setLines((p) => p.filter((_, j) => j !== i))} /> : null}
          </View>
        ))}
        <Btn kind="ghost" title="+ Ещё товар" onPress={() => setLines((p) => [...p, { name: '', qty: '', unit: 'шт' }])} />
        {!wh ? <Field label="Сумма по чеку, ֏" value={sum} onChangeText={setSum} keyboardType="number-pad" /> : null}
      </Card>
      <Btn title={wh ? 'Записать' : 'Сохранить закупку'} onPress={submit} busy={busy} big />
      <CameraSheet visible={cam} title={wh ? 'Материал на складе' : 'Чек или накладная'} onClose={() => setCam(false)} onShot={onShot} />
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
  if (!b) return <Page><Muted>Закупка уже сдана.</Muted><Btn kind="ghost" title="На главную" onPress={() => nav('home')} /></Page>;
  const target = toObject
    ? (t && t.lat != null ? { lat: t.lat, lng: t.lng } : null)
    : st.cfg.warehouse_lat != null ? { lat: st.cfg.warehouse_lat, lng: st.cfg.warehouse_lng }
    : st.cfg.office_lat != null ? { lat: st.cfg.office_lat, lng: st.cfg.office_lng } : null;
  const lim = toObject ? st.cfg.client_radius || 200 : st.cfg.office_radius || 150;
  const lines = b.status === 'partial' ? (b.left_lines || []).filter((l) => l.qty > 0) : b.lines || [];
  const onShot = async (uri) => {
    try {
      const fix = await getFix();
      if (fix.mocked) { setCam(false); return Alert.alert('Подмена местоположения', 'Отключите подмену местоположения и сфотографируйте снова.'); }
      const up = await uploadPhoto(uri, uid, toObject ? 'buy-site' : 'buy-store');
      setShot({ ...up, fix, dist: distM(fix, target) }); setCam(false);
    } catch (e) { setCam(false); Alert.alert('Не получилось', errText(e)); }
  };
  const submit = async () => {
    if (!shot) return Alert.alert('Фото', toObject ? 'Сфотографируйте материал на объекте' : 'Сфотографируйте товар на складе');
    let pUsed = null;
    if (toObject) {
      pUsed = used.map((v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : -1; });
      if (pUsed.some((n, i) => n < 0 || n > Number(b.lines[i].qty))) return Alert.alert('Использовано', 'Количество должно быть от 0 до купленного');
    }
    setBusy(true);
    try {
      const r = await rpc('deliver_purchase', { p_id: b.id, p_photo: shot.path, p_lat: shot.fix.lat, p_lng: shot.fix.lng, p_acc: shot.fix.acc, p_mocked: shot.fix.mocked, p_device: deviceId(), p_used: pUsed });
      await load();
      if (r && r.status === 'partial') Alert.alert('Остаток', 'Неиспользованный материал нужно сдать на склад. Он остался в списке «Не сдано».');
      if (b.dest === 'ticket' && toObject) nav('ticket', { id: b.ticket_id }); else nav('home');
    } catch (e) { Alert.alert('Не получилось', errText(e)); } finally { setBusy(false); }
  };
  const far = shot && shot.dist != null && shot.dist > lim;
  return (
    <Page>
      <Label>{buyWhere(b, st.mine)}</Label>
      <H1>{toObject ? 'Материал на объекте' : 'Сдать на склад'}</H1>
      <Card>
        <T style={{ fontWeight: '700' }}>{b.source === 'warehouse' ? 'Материал со склада' : b.supplier + ' · ' + money(b.amount)}</T>
        <Muted>{b.source === 'warehouse' ? 'Взято' : 'Куплено'} {new Date(b.created_at).toLocaleDateString('ru-RU')} в {hm(b.created_at)}</Muted>
        {!toObject ? lines.map((l, i) => <T key={i}>{lineText(l)}</T>) : null}
      </Card>
      {toObject ? (
        ready ? (
          <Card>
            <T style={{ fontWeight: '700' }}>Сколько использовано на объекте</T>
            <Muted>Что осталось, нужно будет сдать на склад.</Muted>
            {b.lines.map((l, i) => (
              <Field key={i} label={l.name + (b.source === 'warehouse' ? ' (взято ' : ' (куплено ') + l.qty + (l.unit ? ' ' + l.unit : '') + ')'} value={used[i]}
                onChangeText={(v) => setUsed((p) => p.map((x, j) => (j === i ? v : x)))} keyboardType="decimal-pad" />
            ))}
          </Card>
        ) : <Flag kind="warn">Отметить материал можно, когда по заказу {t ? t.num : ''} нажато «Я на месте».</Flag>
      ) : null}
      {!toObject || ready ? <>
        <Card>
          <T style={{ fontWeight: '700' }}>{toObject ? 'Фото материала на объекте' : 'Фото товара на складе'}</T>
          <Muted>{toObject ? 'Снимите установленный или разложенный материал так, чтобы было видно место.' : 'Снимите товар на складе. Руководитель сверит количество при приёмке.'}</Muted>
          {shot ? <Image source={{ uri: shot.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10 }} /> : null}
          {shot ? (shot.dist == null ? <Flag kind="note">Координаты сохранены</Flag> : far ? <Flag kind="bad">{fDist(shot.dist)} от {toObject ? 'объекта' : 'склада'}. Отметка будет записана с отклонением.</Flag> : <Flag kind="ok">На месте · {fDist(shot.dist)}</Flag>) : null}
          <Btn kind={shot ? 'ghost' : 'dark'} title={shot ? 'Переснять' : 'Сфотографировать'} onPress={() => setCam(true)} />
        </Card>
        <Btn title={toObject ? 'Отметить на объекте' : 'Сдано на склад'} onPress={submit} busy={busy} big />
      </> : null}
      <CameraSheet visible={cam} title={toObject ? 'Материал на объекте' : 'Товар на складе'} onClose={() => setCam(false)} onShot={onShot} />
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
    if (!object.trim()) return Alert.alert('Объект', 'Укажите объект: имя клиента или адрес');
    setCam(true);
  };
  const onShot = async (uri) => {
    let img = null, fix = null;
    const takenAt = Date.now();
    try {
      fix = await getFix();
      if (fix.mocked) { setCam(false); return Alert.alert('Подмена местоположения', 'Отключите подмену местоположения и сфотографируйте снова.'); }
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
          Alert.alert('Сохранено без интернета', 'Фото сохранено в телефоне и отправится само, когда появится связь. Время и место съёмки записаны.');
        } catch (x) { Alert.alert('Не получилось', 'Нет интернета, и фото не удалось сохранить. Попробуйте ещё раз.'); }
      } else Alert.alert('Не получилось', errText(e));
    }
  };
  const today = st.wph.filter((p) => !object.trim() || p.object === object.trim());
  return (
    <Page>
      <H1>Фото работ</H1>
      <Muted>Снимайте каждую работу до и после. Место и время записываются автоматически, фото из галереи не принимаются.</Muted>
      <Card>
        <Field label="Объект: клиент или адрес" value={object} onChangeText={setObject} placeholder="Ашот, Абовян, ул. ..." />
        <PlacePick places={st.places} value={object} onPick={setObject} />
        <Label>Что на фото</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {KINDS.map(([k, l]) => <Btn key={k} kind={kind === k ? 'dark' : 'ghost'} title={l} onPress={() => setKind(k)} />)}
        </View>
        <Field label="Комментарий (не обязательно)" value={note} onChangeText={setNote} placeholder="Заменил 2 коннектора МС4" />
      </Card>
      <Btn title="Сфотографировать" big onPress={open} />
      {mine.length ? (
        <Card>
          <T style={{ fontWeight: '700' }}>Снято сейчас: {mine.length}</T>
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
      <Muted style={{ textAlign: 'center' }}>За сегодня {object.trim() ? 'по этому объекту ' : ''}загружено: {today.length}</Muted>
      <CameraSheet visible={cam} title={KINDS.find((x) => x[0] === kind)[1]} onClose={() => setCam(false)} onShot={onShot} />
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
        add(x.start_at, 'play-circle', C.pine, 'Начало смены', 'Одометр ' + x.start_odo + ' км');
        if (x.end_at) add(x.end_at, 'stop-circle', C.pine, 'Конец смены', 'Одометр ' + x.end_odo + ' км');
      });
      (wp.data || []).forEach((w) => add(w.at, 'camera', C.ok, 'Фото работ · ' + KIND_RU[w.kind], [w.object, w.note].filter(Boolean).join(' · '), w.path));
      (bu.data || []).forEach((b) => {
        const what = (b.lines || []).map(lineText).join(', ');
        add(b.created_at, b.source === 'warehouse' ? 'archive' : 'cart', C.info, b.source === 'warehouse' ? 'Взял со склада' : 'Закупка · ' + b.supplier, what + (b.source === 'warehouse' ? '' : ' · ' + money(b.amount)), b.photo);
        if (b.delivered_at) add(b.delivered_at, 'checkmark-done', C.info, b.dest === 'warehouse' ? 'Сдал на склад' : 'Материал на объекте', what, b.delivered_photo);
        if (b.left_at) add(b.left_at, 'return-down-back', C.info, 'Остаток сдан на склад', '', b.left_photo);
      });
      (fu.data || []).forEach((r) => add(r.at, 'water', '#8a4fd8', 'Заправка', String(r.liters).replace('.', ',') + (st.staff.fuel_type === 'gas' ? ' м³' : ' л') + ' · ' + money(r.amount), r.photo));
      (tk.data || []).forEach((t) => add(t.done_at, 'checkbox', C.ok, 'Задача выполнена', t.title));
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
      <Text style={{ fontSize: 15, color: C.muted }}>{new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Tile icon="time" value={mins ? Math.floor(mins / 60) + ':' + p2(Math.round(mins % 60)) : '—'} label="на смене" />
        <Tile icon="camera" value={n('camera')} label="фото работ" tone={n('camera') ? 'ok' : 'note'} />
        <Tile icon="cart" value={n('cart') + n('archive')} label="закупки и склад" />
        <Tile icon="water" value={n('water')} label="заправки" />
      </View>
      {ctx.boxN ? <Flag kind="warn">Ждут отправки: {ctx.boxN} фото. В ленте появятся после отправки.</Flag> : null}
      <Card>
        <H2>Лента дня</H2>
        {ev == null ? <Muted>Загружаю…</Muted> : !ev.length ? <Muted>Сегодня пока ничего не отмечено.</Muted> : ev.map((e, i) => (
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
      <Muted style={{ textAlign: 'center' }}>Руководитель видит этот же день в своей программе.</Muted>
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
  const hh = (min) => Math.floor(min / 60) + ' ч ' + p2(Math.round(min % 60)) + ' мин';
  return (
    <Page onRefresh={get} refreshing={busy}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => { setM(new Date(m.getFullYear(), m.getMonth() - 1, 1)); setSel(1); }} hitSlop={12} style={{ padding: 6 }} accessibilityLabel="Предыдущий месяц"><Icon name="chevron-back" size={24} color={C.pine} /></Pressable>
        <Text style={{ fontSize: 19, fontWeight: '700', color: C.ink }}>{MONTHS[m.getMonth()]} {m.getFullYear()}</Text>
        <Pressable disabled={isCur} onPress={() => { setM(new Date(m.getFullYear(), m.getMonth() + 1, 1)); setSel(1); }} hitSlop={12} style={{ padding: 6, opacity: isCur ? 0.3 : 1 }} accessibilityLabel="Следующий месяц"><Icon name="chevron-forward" size={24} color={C.pine} /></Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Tile icon="calendar" value={tot.sh} label="смен" />
        <Tile icon="time" value={Math.round(tot.min / 60)} label="часов" />
        <Tile icon="navigate" value={Math.round(tot.km)} label="км по GPS" />
        <Tile icon="camera" value={tot.ph} label="фото работ" />
      </View>
      <Card style={{ padding: 10 }}>
        <View style={{ flexDirection: 'row' }}>
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((w) => <Text key={w} style={{ width: '14.285%', textAlign: 'center', fontSize: 12, color: C.muted, fontWeight: '700' }}>{w}</Text>)}
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
                  {has ? <Text style={{ fontSize: 10, color: C.ok }}>{Math.round(x.min / 60)} ч</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>
      {data && S ? (
        <Card>
          <H2>{sel} {MONTHS_G[m.getMonth()]}</H2>
          {!S.sh.length ? <Muted>Смены не было.</Muted> : (
            <>
              {S.sh.map((x) => <Row key={x.id} icon="time" title={hm(x.start_at) + ' – ' + (x.end_at ? hm(x.end_at) : 'идёт')} sub={'Одометр ' + x.start_odo + (x.end_odo ? ' → ' + x.end_odo : '')} />)}
              <Row icon="hourglass" title={hh(S.min)} sub="на смене" />
              <Row icon="navigate" title={(Math.round(S.km * 10) / 10).toString().replace('.', ',') + ' км по GPS'} sub={S.odo ? 'по одометру ' + S.odo + ' км' : undefined} />
              <Row icon="camera" title={'Фото работ: ' + S.ph} />
              {S.tk ? <Row icon="checkbox" title={'Задачи: ' + S.td + ' из ' + S.tk} /> : null}
              {S.bu ? <Row icon="cart" title={'Закупки и склад: ' + S.bu} /> : null}
              <Row icon="water" title={S.fl ? 'Заправка: ' + (Math.round(S.fl * 10) / 10).toString().replace('.', ',') + ' · ' + money(S.fs) : 'Заправок не было'} last />
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
    ['play-circle', 'Начало смены', 'Утром в офисе нажмите «Начать смену», сфотографируйте одометр и введите показания. Включится запись маршрута — это уведомление «Идёт смена».'],
    ['camera', 'Фото работ', 'На каждом объекте снимайте «до» и «после». Выберите объект из списка или впишите имя клиента. Без интернета фото сохранится и отправится само.'],
    ['checkbox', 'Задачи', 'Задачи на день ставит руководитель. Нажмите «Маршрут», чтобы доехать, и «Выполнено» на месте — с фото.'],
    ['cart', 'Закупка', 'Купили что-то — сразу внесите: фото чека, что купили и сумма. Потом отметьте фото там, куда привезли: на складе или на объекте.'],
    ['archive', 'Со склада', 'Берёте материал со склада на объект — запишите это. На объекте отметьте фото, остаток верните на склад.'],
    ['water', 'Заправка', 'После каждой заправки — фото чека, литры и сумма. Всё сверяется с выпиской по топливной карте.'],
    ['stop-circle', 'Конец смены', 'Вечером в офисе нажмите «Закончить смену» и сфотографируйте одометр. Перед этим сдайте закупки.'],
    ['notifications', 'Напоминания', 'Приложение напомнит начать и закончить смену, сдать закупку и снять фото работ.'],
    ['shield-checkmark', 'Что записывается', 'Только во время смены: маршрут, время и место отметок. Вне смены местоположение не записывается.'],
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

/* ---------------- профиль ---------------- */
function Profile({ ctx }) {
  const { st, load } = ctx;
  const s = st.staff;
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ carModel: s.car_model || '', carPlate: s.car_plate || '', fuel: s.fuel_type || 'petrol', norm: String(s.norm_claimed || ''), tank: String(s.tank || '') });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const unit = s.fuel_type === 'gas' ? 'м³' : 'л';
  const save = async () => {
    setBusy(true);
    try { await rpc('update_car', { p_car_model: f.carModel, p_car_plate: f.carPlate, p_fuel_type: f.fuel, p_norm: num(f.norm), p_tank: num(f.tank) }); await load(); setEdit(false); Alert.alert('Сохранено', 'Новый расход начнёт учитываться после утверждения руководителем.'); }
    catch (e) { Alert.alert('Не получилось', errText(e)); } finally { setBusy(false); }
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
        {st.cfg.office_phone ? <Row icon="call" title="Позвонить в офис" sub={st.cfg.office_phone} onPress={() => callOffice(st.cfg)} /> : null}
        <Row icon="help-circle" title="Как пользоваться" onPress={() => ctx.nav('help')} />
        <Row icon="shield-checkmark" title="Разрешения и уведомления" onPress={() => ctx.nav('perms')} last />
      </Card>
      {!edit ? (
        <Card>
          <Label>Машина</Label>
          <T style={{ fontWeight: '700' }}>{s.car_model || 'не указана'}{s.car_plate ? ' · ' + s.car_plate : ''}</T>
          <Muted>Расход: {s.norm_approved ? s.norm_approved + ' ' + unit + '/100 км, утверждён' : 'ждёт утверждения'}{s.norm_claimed && s.norm_approved && +s.norm_claimed !== +s.norm_approved ? ' · вы указали ' + s.norm_claimed + ', ждёт утверждения' : ''}</Muted>
          <Btn kind="ghost" title="Изменить машину" onPress={() => setEdit(true)} />
        </Card>
      ) : (
        <Card>
          <Field label="Марка и модель" value={f.carModel} onChangeText={set('carModel')} />
          <Field label="Номер" value={f.carPlate} onChangeText={set('carPlate')} autoCapitalize="characters" />
          <FuelSeg value={f.fuel} onChange={set('fuel')} />
          <Field label="Расход на 100 км" value={f.norm} onChangeText={set('norm')} keyboardType="decimal-pad" />
          <Field label="Объём бака" value={f.tank} onChangeText={set('tank')} keyboardType="decimal-pad" />
          <Btn title="Сохранить" onPress={save} busy={busy} />
        </Card>
      )}
      <Card>
        <Label>Последние смены</Label>
        {st.shifts.length ? st.shifts.map((x) => (
          <View key={x.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T>{new Date(x.start_at).toLocaleDateString('ru-RU')}</T>
            <Muted>{hm(x.start_at)}–{x.end_at ? hm(x.end_at) : '…'}{x.end_odo ? ' · ' + (x.end_odo - x.start_odo) + ' км' : ''}</Muted>
          </View>
        )) : <Muted>Смен пока нет.</Muted>}
      </Card>
      {!st.open ? <Btn kind="ghost" title="Выйти из аккаунта" onPress={() => supabase.auth.signOut()} /> : <Muted style={{ textAlign: 'center' }}>Выйти можно после окончания смены.</Muted>}
      <Muted style={{ textAlign: 'center', fontSize: 12 }}>Arev Service · версия {Application.nativeApplicationVersion || '—'}</Muted>
    </Page>
  );
}
