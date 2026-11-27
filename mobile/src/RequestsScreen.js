// Запрос денег: работник просит сумму → кассир → директор решает → кассир выдаёт наличными.
// Работник видит все стадии; уведомления приходят push-ом. Каждый месяц список начинается заново, прошлые — в архиве.
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, Pressable, RefreshControl, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native';
import { supabase, rpc, errText } from './supabase';
import { Audio } from 'expo-av';
import { deviceId } from './device';
import { C, Btn, Card, H2, Label, Muted, T, Field, Chip } from './ui';
import { tr, loc } from './i18n';
import { startVoice, stopVoice, uploadVoice } from './tasks';

const money = (n) => (n == null ? '—' : Math.round(n).toLocaleString('ru-RU') + ' ֏');
const ST = {
  new: ['У кассира', 'info'], forwarded: ['У директора', 'warn'], waiting: ['Директор просит подождать', 'warn'],
  approved: ['Одобрено: получите наличными у кассира', 'ok'], rejected: ['Отклонено директором', 'bad'], paid: ['Деньги выданы', 'ok'], cancelled: ['Отменено', 'note'],
};
const EV = { created: 'Запрос создан', forwarded: 'Передан директору', approved: 'Одобрено', rejected: 'Отклонено', waiting: 'Директор: подождать', paid: 'Деньги выданы', cancelled: 'Отменён', boss_created: 'Выдачу назначил директор', reminder: 'Напоминание' };
const ROLE = { worker: 'Вы', cashier: 'Кассир', admin: 'Директор', system: 'Система' };
const RQ_ERR = { BAD_AMOUNT: 'Неверная сумма', NEED_PURPOSE: 'Впишите, на что нужны деньги', REQ_CLOSED: 'Запрос уже закрыт', NOT_FOUND: 'Запрос не найден', EMPTY: 'Впишите сообщение' };
const eText = (e) => { const m = (e && (e.error || e.message)) || ''; for (const k of Object.keys(RQ_ERR)) if (m.includes(k)) return tr(RQ_ERR[k]); return errText(e); };
const fmt = (iso) => { const d = new Date(iso); return d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' }) + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

function VoiceBtn({ path }) {
  const [snd, setSnd] = useState(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => { if (snd) snd.unloadAsync().catch(() => {}); }, [snd]);
  const toggle = async () => {
    try {
      if (snd) {
        const st = await snd.getStatusAsync();
        if (st.isLoaded && st.isPlaying) { await snd.pauseAsync(); setPlaying(false); return; }
        if (st.isLoaded) { if (st.didJustFinish || (st.durationMillis && st.positionMillis >= st.durationMillis)) await snd.setPositionAsync(0); await snd.playAsync(); setPlaying(true); return; }
      }
      const u = await supabase.storage.from('photos').createSignedUrl(path, 3600);
      if (!u.data) throw new Error('no url');
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: u.data.signedUrl }, { shouldPlay: true });
      sound.setOnPlaybackStatusUpdate((x) => { if (x.isLoaded && x.didJustFinish) setPlaying(false); });
      setSnd(sound); setPlaying(true);
    } catch (e) { Alert.alert(tr('Не удалось воспроизвести')); }
  };
  return <Btn title={(playing ? '⏸ ' : '▶ ') + (playing ? tr('Пауза') : tr('Слушать'))} kind="ghost" onPress={toggle} />;
}

function Thread({ id, uid }) {
  const [log, setLog] = useState(null);
  const [say, setSay] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await supabase.from('cash_request_log').select('at,actor_role,kind,code,body,path').eq('request_id', id).order('at').order('id');
    setLog(r.error ? [] : r.data || []);
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const send = async () => {
    if (!say.trim()) return;
    setBusy(true);
    try { await rpc('req_say', { p_id: id, p_body: say.trim(), p_voice: null, p_device: deviceId() }); setSay(''); await load(); }
    catch (e) { Alert.alert(tr('Не получилось'), eText(e)); } finally { setBusy(false); }
  };
  return (
    <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, gap: 6 }}>
      {log === null ? <Muted>{tr('Загрузка…')}</Muted> : log.length === 0 ? <Muted>{tr('Сообщений пока нет.')}</Muted> : log.map((m, i) => (
        <View key={i}>
          <Muted style={{ fontSize: 11 }}>{fmt(m.at)} · {tr(ROLE[m.actor_role] || m.actor_role)}</Muted>
          {m.kind === 'voice' && m.path ? <VoiceBtn path={m.path} /> : <T>{m.kind === 'text' ? m.body : tr(EV[m.code] || m.code || '') + (['created', 'approved', 'paid', 'boss_created'].includes(m.code) && m.body ? ': ' + money(+m.body) : '')}</T>}
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}><Field label={tr('Ваше сообщение')} value={say} onChangeText={setSay} maxLength={500} /></View>
        <Btn title={tr('Отправить')} onPress={send} busy={busy} kind="ghost" />
      </View>
    </View>
  );
}

export default function RequestsScreen({ ctx }) {
  const { uid, load: reloadMain } = ctx;
  const [rows, setRows] = useState([]);
  const [mo, setMo] = useState(0);
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [note, setNote] = useState('');
  const [rec, setRec] = useState(false);       // идёт запись голосового
  const [voiceUri, setVoiceUri] = useState(null); // записанное голосовое к запросу
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [open, setOpen] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    const now = new Date();
    const m0 = new Date(now.getFullYear(), now.getMonth() + mo, 1), m1 = new Date(now.getFullYear(), now.getMonth() + mo + 1, 1);
    const r = await supabase.from('cash_requests').select('*').eq('requester_id', uid).gte('created_at', m0.toISOString()).lt('created_at', m1.toISOString()).order('created_at', { ascending: false });
    setRows(r.data || []);
  }, [uid, mo]);
  useEffect(() => { refresh(); const t = setInterval(refresh, 20000); return () => clearInterval(t); }, [refresh]);
  const sum = parseInt(String(amount).replace(/\D/g, ''), 10) || 0;
  const send = async () => {
    if (!sum) return Alert.alert(tr('Сумма'), tr('Укажите сумму'));
    if (!purpose.trim()) return Alert.alert(tr('На что'), tr('Впишите, на что нужны деньги'));
    if (rec) return Alert.alert(tr('Идёт запись…'), tr('Сначала остановите запись'));
    setBusy(true);
    try {
      const vp = voiceUri ? await uploadVoice(voiceUri, uid) : null;
      await rpc('req_create', { p_amount: sum, p_purpose: purpose.trim(), p_note: note.trim() || null, p_device: deviceId(), p_voice: vp });
      setAmount(''); setPurpose(''); setNote(''); setVoiceUri(null); setMo(0); setShowForm(false); await refresh(); reloadMain && reloadMain();
      Alert.alert(tr('Запрос отправлен кассиру'));
    } catch (e) { Alert.alert(tr('Не получилось'), eText(e)); } finally { setBusy(false); }
  };
  const toggleRec = async () => {
    try {
      if (!rec) { await startVoice(); setVoiceUri(null); setRec(true); return; }
      setRec(false); const r = await stopVoice(); if (r && r.uri) setVoiceUri(r.uri);
    } catch (e) { setRec(false); Alert.alert(tr('Не получилось'), String(e && e.message) === 'MIC_DENIED' ? tr('Нет доступа к микрофону. Разрешите его в настройках телефона.') : eText(e)); }
  };
  const cancel = (r) => Alert.alert(tr('Отменить запрос?'), money(r.amount_asked) + ' · ' + r.purpose, [
    { text: tr('Нет'), style: 'cancel' },
    { text: tr('Отменить запрос'), style: 'destructive', onPress: async () => { try { await rpc('req_cancel', { p_id: r.id }); await refresh(); } catch (e) { Alert.alert(tr('Не получилось'), eText(e)); } } },
  ]);
  const monthName = new Date(new Date().getFullYear(), new Date().getMonth() + mo, 1).toLocaleDateString(loc(), { month: 'long', year: 'numeric' });
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }} />}>
      {showForm ? (
      <Card>
        <H2>{tr('Новый запрос')}</H2>
        <Field label={tr('Сумма, ֏')} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="25000" />
        <Label>{tr('На что нужны деньги')}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['Заправка', 'Закупка материалов', 'Командировка', 'Инструмент'].map((q) => {
            const on = purpose === tr(q);
            return (
              <Pressable key={q} onPress={() => setPurpose(on ? '' : tr(q))} style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: on ? C.pine : C.line, backgroundColor: on ? C.pine : C.surface }}>
                <Text style={{ color: on ? C.pineInk : C.ink, fontWeight: '600' }}>{tr(q)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field label={tr('или впишите своё')} value={purpose} onChangeText={setPurpose} maxLength={200} />
        <Btn title={rec ? '⏹ ' + tr('Остановить запись') : voiceUri ? '🎤 ' + tr('Записать заново') : '🎤 ' + tr('Записать голосовое')} kind={rec ? 'danger' : 'ghost'} onPress={toggleRec} disabled={busy} />
        {voiceUri && !rec ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={{ color: C.ok || '#2c8a57', fontWeight: '700' }}>✓ {tr('Голосовое записано')}</Text>
            <Pressable onPress={() => setVoiceUri(null)} hitSlop={10}><Text style={{ color: C.bad || '#b3261e', fontWeight: '700' }}>{tr('Удалить')}</Text></Pressable>
          </View>
        ) : null}
        <Btn title={tr('Отправить запрос')} onPress={send} busy={busy} big />
        <Btn title={tr('Закрыть')} kind="ghost" onPress={() => setShowForm(false)} />
        <Muted>{tr('Запрос идёт кассиру, затем директору. Вы увидите каждый этап и получите уведомление. Деньги выдаёт кассир наличными.')}</Muted>
      </Card>
      ) : <Btn title={tr('Открыть запрос')} onPress={() => setShowForm(true)} big />}
      <H2>{tr('Мои запросы')}</H2>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => setMo(mo - 1)} hitSlop={10}><Text style={{ color: C.pine, fontSize: 15, fontWeight: '700' }}>‹ {tr('Раньше')}</Text></Pressable>
        <Label>{monthName}{mo < 0 ? ' · ' + tr('архив') : ''}</Label>
        <Pressable onPress={() => setMo(Math.min(0, mo + 1))} hitSlop={10} disabled={mo === 0}><Text style={{ color: mo === 0 ? C.muted : C.pine, fontSize: 15, fontWeight: '700' }}>{tr('Позже')} ›</Text></Pressable>
      </View>
      {rows.length === 0 ? <Muted>{tr('Запросов за этот месяц нет.')}</Muted> : rows.map((r) => {
        const s = ST[r.status] || [r.status, 'note'];
        const live = ['new', 'forwarded', 'waiting'].includes(r.status);
        const amt = r.amount_approved && r.amount_approved !== r.amount_asked ? money(r.amount_approved) + ' (' + tr('просили') + ' ' + money(r.amount_asked) + ')' : money(r.amount_approved || r.amount_asked);
        return (
          <Card key={r.id}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.ink }}>{amt}</Text>
            <T>{r.purpose}</T>
            <Muted>{fmt(r.created_at)}{r.origin === 'boss' ? ' · ' + tr('назначил директор') : ''}</Muted>
            <Chip kind={s[1]}>{tr(s[0])}</Chip>
            {r.status === 'approved' || r.status === 'rejected' || r.status === 'waiting' ? <Text style={{ color: s[1] === 'ok' ? C.ok : s[1] === 'bad' ? C.bad : C.warn, fontWeight: '700' }}>{r.status === 'approved' ? tr('Директор одобрил') : r.status === 'rejected' ? tr('Директор отклонил') : tr('Директор просит подождать')}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Btn title={open === r.id ? tr('Скрыть переписку') : tr('Переписка')} kind="ghost" onPress={() => setOpen(open === r.id ? null : r.id)} />
              {live && r.origin === 'worker' ? <Btn title={tr('Отменить запрос')} kind="ghost" onPress={() => cancel(r)} /> : null}
            </View>
            {open === r.id ? <Thread id={r.id} uid={uid} /> : null}
          </Card>
        );
      })}
    </ScrollView>
  );
}
