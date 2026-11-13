import * as Application from 'expo-application';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import NetInfo from '@react-native-community/netinfo';
import { Camera } from 'expo-camera';

import { tr } from './i18n';
NetInfo.configure({ shouldFetchWiFiSSID: true });

// Постоянный идентификатор телефона (сбрасывается только при сбросе телефона к заводским)
export function deviceId() {
  try {
    if (typeof Application.getAndroidId === 'function') return Application.getAndroidId();
    if (Application.androidId) return Application.androidId;
  } catch (e) {}
  return null;
}

// Состояние всех нужных разрешений
export async function permStatus() {
  // bat: приложению разрешено работать без ограничений батареи; saver: на телефоне включён режим энергосбережения
  const r = { loc: false, bg: false, cam: false, gps: true, bat: true, saver: false };
  try { r.loc = (await Location.getForegroundPermissionsAsync()).status === 'granted'; } catch (e) {}
  try { r.bg = (await Location.getBackgroundPermissionsAsync()).status === 'granted'; } catch (e) {}
  try { r.cam = (await Camera.getCameraPermissionsAsync()).status === 'granted'; } catch (e) {}
  try { r.gps = await Location.hasServicesEnabledAsync(); } catch (e) {}
  try { r.bat = !(await Battery.isBatteryOptimizationEnabledAsync()); } catch (e) {}
  try { r.saver = !!(await Battery.isLowPowerModeEnabledAsync()); } catch (e) {}
  return r;
}

// Запросить все разрешения по очереди: местоположение → «всегда» → камера
export async function askPermissions() {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status === 'granted') { try { await Location.requestBackgroundPermissionsAsync(); } catch (e) {} }
  } catch (e) {}
  try { await Camera.requestCameraPermissionsAsync(); } catch (e) {}
  return permStatus();
}

export async function ensureLocationPermission() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') throw new Error(tr('Без доступа к местоположению отметки невозможны. Разрешите доступ в настройках телефона.'));
  const on = await Location.hasServicesEnabledAsync();
  if (!on) throw new Error(tr('Включите геолокацию (GPS) на телефоне.'));
}

// Текущая точка. mocked=true значит, что включена подмена местоположения.
export async function getFix() {
  await ensureLocationPermission();
  let timer;
  const p = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: true }),
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(tr('Не удалось определить местоположение. Выйдите на открытое место и попробуйте ещё раз.'))), 25000); }),
  ]).finally(() => clearTimeout(timer));
  if (p.mocked) { try { require('./supabase').supabase.rpc('report_mock').then(() => {}, () => {}); } catch (e) {} }
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    acc: p.coords.accuracy != null ? Math.round(p.coords.accuracy) : null,
    mocked: !!p.mocked,
    t: p.timestamp || null,   // время точки от GPS: не зависит от того, что выставлено на часах телефона
  };
}

// Видит ли телефон офисную сеть Wi-Fi. officeWifi — имя сети или BSSID из настроек.
// null — проверка не настроена или недоступна.
export async function officeWifiOk(officeWifi) {
  if (!officeWifi) return null;
  try {
    const s = await NetInfo.fetch('wifi');
    const d = (s && s.details) || {};
    const want = String(officeWifi).trim().toLowerCase();
    const ssid = String(d.ssid || '').toLowerCase();
    const bssid = String(d.bssid || '').toLowerCase();
    if (!ssid && !bssid) return false;
    return want.split(',').map((x) => x.trim()).some((w) => w && (w === ssid || w === bssid));
  } catch (e) {
    return null;
  }
}

export function distM(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371000, t = Math.PI / 180;
  const dLa = (b.lat - a.lat) * t, dLo = (b.lng - a.lng) * t;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLo / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}
