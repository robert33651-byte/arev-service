import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, Pressable, RefreshControl, Image, Alert, Linking, StatusBar as RNStatusBar, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { supabase, rpc, errText, phoneEmail, normPhone } from './src/supabase';
import { deviceId, getFix, officeWifiOk, distM, permStatus, askPermissions } from './src/device';
import { startTrack, stopTrack, flushTrack } from './src/track';
import { CameraSheet, uploadPhoto } from './src/photo';
import { C, Btn, Card, H1, H2, Label, Muted, T, Field, Flag, Chip } from './src/ui';

const CATS = { inverter: 'Не работает инвертор', output: 'Упала выработка', panel: 'Повреждена панель', wiring: 'Проводка и разъёмы', battery: 'Аккумулятор', cleaning: 'Чистка панелей', checkup: 'Плановый техосмотр', expand: 'Расширение или чужая станция', other: 'Другое' };
const ST = { new: ['Новый', 'info'], assigned: ['Взят', 'info'], enroute: ['В пути', 'warn'], onsite: ['На месте', 'warn'], done: ['Выполнен', 'ok'], closed: ['Закрыт', 'note'], cancelled: ['Отменён', 'note'] };
const p2 = (n) => String(n).padStart(2, '0');
const hm = (ts) => { if (!ts) return '—'; const d = new Date(ts); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
const dur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + ' мин' : Math.floor(m / 60) + ' ч ' + p2(m % 60) + ' мин'; };
const money = (n) => (n == null ? '—' : Math.round(n).toLocaleString('ru-RU') + ' ֏');
const fDist = (m) => (m == null ? '—' : m < 1000 ? m + ' м' : (m / 1000).toFixed(1).replace('.', ',') + ' км');

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

function Header({ title, sub, right }) {
  return (
    <View style={{ backgroundColor: C.pine, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.sun }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.pineInk, fontWeight: '700', fontSize: 16 }}>{title}</Text>
        {sub ? <Text style={{ color: C.pineInk, opacity: 0.7, fontSize: 12 }}>{sub}</Text> : null}
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
function Main({ session }) {
  const uid = session.user.id;
  const [st, setSt] = useState({ loading: true });
  const [view, setView] = useState({ name: 'home' });
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const [staffR, cfgR, shiftR, myR, poolR] = await Promise.all([
        supabase.from('staff').select('*').eq('id', uid).maybeSingle(),
        supabase.from('config').select('*').eq('id', 1).maybeSingle(),
        supabase.from('shifts').select('*').eq('staff_id', uid).order('start_at', { ascending: false }).limit(10),
        supabase.from('tickets').select('*').eq('staff_id', uid).order('created_at', { ascending: false }).limit(30),
        supabase.rpc('get_pool'),
      ]);
      const shifts = shiftR.data || [];
      setSt({
        loading: false,
        staff: staffR.data || null,
        cfg: cfgR.data || {},
        shifts,
        open: shifts.find((x) => !x.end_at) || null,
        mine: myR.data || [],
        pool: poolR.data || [],
        err: staffR.error ? errText(staffR.error) : null,
      });
    } catch (e) {
      setSt((p) => ({ ...p, loading: false, err: errText(e) }));
    }
  }, [uid]);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 30000);
    const sub = AppState.addEventListener('change', (a) => { if (a === 'active') { load(); flushTrack().catch(() => {}); } });
    return () => { clearInterval(timer.current); sub.remove(); };
  }, [load]);

  // если смена открыта, но запись маршрута остановилась (перезагрузка телефона) — включаем снова
  useEffect(() => { if (st.open) startTrack(); }, [st.open && st.open.id]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const nav = (name, p) => setView({ name, ...(p || {}) });
  const ctx = { uid, phone: String(session.user.email || '').split('@')[0], st, load, nav, refreshing, refresh };

  if (st.loading) return <Splash />;
  if (!st.staff) return <Register ctx={ctx} />;
  if (st.staff.status !== 'approved') return <Waiting ctx={ctx} />;

  const sub = st.staff.name;
  let body;
  if (view.name === 'shift') body = <ShiftScreen ctx={ctx} />;
  else if (view.name === 'fuel') body = <FuelScreen ctx={ctx} />;
  else if (view.name === 'ticket') body = <TicketScreen ctx={ctx} id={view.id} pooled={view.pooled} />;
  else if (view.name === 'profile') body = <Profile ctx={ctx} />;
  else body = <Home ctx={ctx} />;
  return (
    <>
      <Header title="Arev Service" sub={sub} right={view.name === 'home'
        ? <Pressable onPress={() => nav('profile')} style={{ padding: 6 }}><Text style={{ color: C.pineInk }}>Профиль</Text></Pressable>
        : <Pressable onPress={() => nav('home')} style={{ padding: 6 }}><Text style={{ color: C.pineInk }}>Назад</Text></Pressable>} />
      {body}
    </>
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
  const greet = (() => { const h = new Date().getHours(); return h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'; })();
  const mine = st.mine.filter((t) => ['assigned', 'enroute', 'onsite'].includes(t.status));
  if (!sh) {
    const last = st.shifts.find((x) => x.end_at);
    return (
      <Page onRefresh={ctx.refresh} refreshing={ctx.refreshing}>
        <PermCard />
        <View style={{ backgroundColor: C.pine, borderRadius: 18, padding: 20, gap: 12 }}>
          <Text style={{ color: C.pineInk, fontSize: 21, fontWeight: '700' }}>{greet}, {String(st.staff.name).split(' ')[0]}</Text>
          <Text style={{ color: C.pineInk, opacity: 0.8 }}>Начните смену в офисе: сфотографируйте одометр и введите показания. Место и время запишутся автоматически.</Text>
          <Btn title="Начать смену" onPress={() => nav('shift')} big />
        </View>
        {last ? <Muted style={{ textAlign: 'center' }}>Прошлая смена: {new Date(last.start_at).toLocaleDateString('ru-RU')} {hm(last.start_at)}–{hm(last.end_at)} · одометр {last.end_odo} км</Muted> : null}
      </Page>
    );
  }
  return (
    <Page onRefresh={ctx.refresh} refreshing={ctx.refreshing}>
      <Card style={{ borderLeftWidth: 4, borderLeftColor: C.ok }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View><Label>Смена</Label><Text style={{ fontSize: 20, fontWeight: '700', color: C.ink }}>с {hm(sh.start_at)} <Text style={{ fontSize: 14, color: C.muted, fontWeight: '400' }}>{dur(Date.now() - new Date(sh.start_at).getTime())}</Text></Text></View>
          <Chip kind="ok">идёт</Chip>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn kind="ghost" title="Заправка" onPress={() => nav('fuel')} style={{ flex: 1 }} />
          <Btn kind="ghost" title="Закончить" onPress={() => nav('shift')} style={{ flex: 1 }} />
        </View>
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
      <H2>Новые заказы {st.pool.length ? '(' + st.pool.length + ')' : ''}</H2>
      {st.pool.length ? st.pool.map((t) => (
        <Pressable key={t.id} onPress={() => nav('ticket', { id: t.id, pooled: t })}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T style={{ fontWeight: '700', flex: 1 }}>{CATS[t.category] || t.category}</T>{t.urgent ? <Chip kind="bad">срочно</Chip> : null}</View>
            <Muted>{t.address}</Muted>
            {t.est_min ? <T>{money(t.est_min)} – {money(t.est_max)}</T> : null}
          </Card>
        </Pressable>
      )) : <Muted>Свободных заказов нет. Потяните экран вниз, чтобы обновить.</Muted>}
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
  const submit = async () => {
    const v = parseInt(String(odo).replace(/\D/g, ''), 10);
    if (!shot) return Alert.alert('Фото', 'Сфотографируйте одометр');
    if (!v) return Alert.alert('Одометр', 'Введите показания одометра');
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
      <Card>
        <H2>{s.name}</H2>
        <Muted>+{String(s.phone).replace(/\D/g, '')}</Muted>
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
    </Page>
  );
}
