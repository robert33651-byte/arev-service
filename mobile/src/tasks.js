// Задачи сотрудника: всё, что раньше делал Telegram-бот, теперь внутри приложения.
// Только логика (без экранов): экраны подключаются к этим функциям.
// Нужны пакеты: expo-av, expo-notifications, expo-device, expo-constants
//   npx expo install expo-av expo-notifications expo-device expo-constants
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { decode } from 'base64-arraybuffer';
import { supabase, rpc } from './supabase';
import { uploadPhoto } from './photo';
import { deviceId } from './device';

// ---------- чтение ----------
// Мои открытые задачи вместе с именами исполнителей: [{id,title,note,due,priority,status,disc_status,name1,name2,seen_at,seen2_at,...}]
// Все открытые задачи, в том числе с местом: обсуждение доступно по каждой.
export async function myTasks() { return (await rpc('my_tasks')) || []; }

// Переписка и события по задаче в порядке времени
export async function taskLog(taskId) {
  const { data, error } = await supabase.from('task_log').select('*').eq('task_id', taskId).order('at').order('id');
  if (error) throw error;
  return data || [];
}

// Ссылка на файл (голос или фото) на час. Для списка файлов лучше signedUrls.
export async function signedUrls(paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return {};
  const { data } = await supabase.storage.from('photos').createSignedUrls(list, 3600);
  const out = {};
  (data || []).forEach((x) => { if (x.signedUrl) out[x.path] = x.signedUrl; });
  return out;
}

// ---------- действия ----------
export const taskSeen = (id) => rpc('task_seen', { p_id: id });                       // 👀 открыл (вызывать при открытии карточки)
export const taskReport = (id, photoPath, note) => rpc('task_report', { p_id: id, p_photo: photoPath || null, p_note: note || null }); // ✅ Готово
// ✅ Готово с фото на месте: фото + геолокация (проверка подмены и расстояния до места на сервере)
// 📍 Добавить место к задаче: из списка мест (placeId) или по текущему GPS (fix)
export const taskSetPlace = (id, placeId, fix) => rpc('task_set_place', { p_id: id, p_place: placeId || null, p_lat: fix ? fix.lat : null, p_lng: fix ? fix.lng : null, p_mocked: fix ? !!fix.mocked : false, p_device: deviceId() });
export const taskReportGeo = (id, photoPath, fix, note) => rpc('task_report_geo', { p_id: id, p_photo: photoPath, p_lat: fix.lat, p_lng: fix.lng, p_acc: fix.acc, p_mocked: !!fix.mocked, p_device: deviceId(), p_note: note || null });
export const taskPost = (id, kind, body, path) => rpc('task_post', { p_id: id, p_kind: kind, p_body: body || null, p_path: path || null }); // 💬 текст / голос / фото
export const taskSelfAdd = (title, note, due, priority) => rpc('task_self_add', { p_title: title, p_note: note || null, p_due: due || null, p_priority: priority || 'normal' });

// Фото к задаче (только камера, как везде в приложении): возвращает путь для taskPost/taskReport
export async function uploadTaskPhoto(uri, userId) { return (await uploadPhoto(uri, userId, 'task')).path; }

// ---------- голос ----------
let recording = null;
export async function startVoice() {
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) throw new Error('MIC_DENIED');
  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
  const r = new Audio.Recording();
  await r.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY); // m4a: играет и на iPhone, и на Android
  await r.startAsync();
  recording = r;
}
export async function stopVoice() {
  if (!recording) return null;
  const r = recording; recording = null;
  try { await r.stopAndUnloadAsync(); } catch (e) { /* уже остановлена */ }
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  const uri = r.getURI();
  return uri ? { uri } : null;
}
export const isRecording = () => !!recording;

// Загрузить записанный файл и вернуть путь для taskPost(..., 'voice', ...)
export async function uploadVoice(uri, userId) {
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const path = userId + '/task-voice-' + Date.now() + '.m4a';
  const { error } = await supabase.storage.from('photos').upload(path, decode(b64), { contentType: 'audio/mp4', upsert: false });
  if (error) throw error;
  return path;
}

// Проиграть голосовое по ссылке из signedUrls. Возвращает функцию остановки.
export async function playVoice(url, onDone) {
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
  const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
  sound.setOnPlaybackStatusUpdate((s) => { if (s.didJustFinish) { sound.unloadAsync(); if (onDone) onDone(); } });
  return () => sound.unloadAsync();
}

// ---------- push-уведомления ----------
// Вызвать один раз после входа сотрудника. Возвращает токен или null, если разрешения нет.
export async function registerPush() {
  try {
    if (!Device.isDevice) return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('tasks', { name: 'Задачи', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250] });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    const projectId = (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.eas && Constants.expoConfig.extra.eas.projectId) || (Constants.easConfig && Constants.easConfig.projectId);
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    await rpc('save_push_token', { p_token: token });
    return token;
  } catch (e) { return null; }
}

// Уведомления показываются, даже когда приложение открыто
export function setupNotificationHandler() {
  Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }) });
}

// Приложение было закрыто и открылось по нажатию на уведомление
export async function lastTaskTap() {
  try {
    const r = await Notifications.getLastNotificationResponseAsync();
    const d = r && r.notification && r.notification.request.content.data;
    return (d && d.taskId) || null;
  } catch (e) { return null; }
}

// Нажатие на уведомление: cb(taskId) откроет нужную задачу. Возвращает функцию отписки.
export function onTaskNotificationTap(cb) {
  const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
    const id = resp && resp.notification && resp.notification.request.content.data && resp.notification.request.content.data.taskId;
    if (id) cb(id);
  });
  return () => sub.remove();
}
