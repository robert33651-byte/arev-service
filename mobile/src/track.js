// Фоновая запись маршрута во время смены.
// Android показывает постоянное уведомление «Идёт смена», пока запись включена.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { deviceId, distM } from './device';
import { notifyNow } from './notify';

import { tr, loadLang } from './i18n';
export const TRACK_TASK = 'arev-shift-track';
const QKEY = 'arev.trackQueue';

async function readQ() {
  try { return JSON.parse((await AsyncStorage.getItem(QKEY)) || '[]'); } catch (e) { return []; }
}
async function writeQ(q) {
  try { await AsyncStorage.setItem(QKEY, JSON.stringify(q.slice(-2000))); } catch (e) {}
}

// Отправить накопленные точки на сервер. Без интернета точки ждут в очереди.
export async function flushTrack() {
  const q = await readQ();
  if (!q.length) return 0;
  const batch = q.slice(0, 200);
  const { data, error } = await supabase.rpc('add_track', { p_points: batch, p_device: deviceId() });
  if (error || (data && data.error)) return 0;
  await writeQ(q.slice(batch.length));
  return batch.length;
}

// Задача должна быть объявлена при запуске приложения (см. index.js)
export function defineTrackTask() {
  if (TaskManager.isTaskDefined(TRACK_TASK)) return;
  TaskManager.defineTask(TRACK_TASK, async ({ data, error }) => {
    if (error || !data || !data.locations) return;
    const pts = data.locations.map((l) => ({
      t: l.timestamp,
      lat: l.coords.latitude,
      lng: l.coords.longitude,
      acc: l.coords.accuracy != null ? Math.round(l.coords.accuracy) : null,
      spd: l.coords.speed != null ? Math.round(l.coords.speed * 3.6) : null,
      mock: !!l.mocked,
    }));
    const q = await readQ();
    await writeQ(q.concat(pts));
    try { await checkStay(pts); } catch (e) {}
    try { await flushTrack(); } catch (e) {}
  });
}

// Стоит на одном месте больше часа, не в офисе и без фото работ — напомнить про фото.
async function checkStay(pts) {
  const last = pts.filter((p) => !p.mock && (p.acc == null || p.acc <= 100)).pop();
  if (!last) return;
  const raw = await AsyncStorage.multiGet(['arev.stay', 'arev.lastWork', 'arev.known']);
  let stay = null; try { stay = JSON.parse(raw[0][1] || 'null'); } catch (e) {}
  const lastWork = +raw[1][1] || 0;
  let known = []; try { known = JSON.parse(raw[2][1] || '[]'); } catch (e) {}
  if (!stay || distM(stay, last) > 200) {
    stay = { lat: last.lat, lng: last.lng, t: last.t, n: 0 };
  } else if (!stay.n && last.t - stay.t > 60 * 60000 && lastWork < stay.t && !known.some((k) => distM(k, last) <= (k.r || 250))) {
    stay.n = 1;
    await loadLang();
    await notifyNow(tr('Вы на одном месте больше часа'), tr('Если это объект, не забудьте фото работ: до и после.'));
  }
  await AsyncStorage.setItem('arev.stay', JSON.stringify(stay));
}

export async function startTrack() {
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return false;
    const on = await Location.hasStartedLocationUpdatesAsync(TRACK_TASK).catch(() => false);
    if (on) return true;
    await Location.startLocationUpdatesAsync(TRACK_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 120000,
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: tr('Идёт смена'),
        notificationBody: tr('Arev Service записывает маршрут до конца смены'),
        notificationColor: '#123a33',
        killServiceOnDestroy: false,
      },
    });
    return true;
  } catch (e) {
    return false;
  }
}

export async function stopTrack() {
  try {
    const on = await Location.hasStartedLocationUpdatesAsync(TRACK_TASK);
    if (on) await Location.stopLocationUpdatesAsync(TRACK_TASK);
  } catch (e) {}
  try { await flushTrack(); } catch (e) {}
}
