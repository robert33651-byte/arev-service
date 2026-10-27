// Язык приложения: армянский (по умолчанию) или русский. Переключатель — в «Профиле».
// tr('русский текст') возвращает перевод из hy.js; если перевода нет — русский текст.
import AsyncStorage from '@react-native-async-storage/async-storage';
import HY from './hy';

const KEY = 'arev.lang';
let lang = 'hy';
const subs = new Set();

export const getLang = () => lang;
export const loc = () => (lang === 'hy' ? 'hy-AM' : 'ru-RU');

export async function loadLang() {
  try { const v = await AsyncStorage.getItem(KEY); if (v === 'ru' || v === 'hy') lang = v; } catch (e) {}
  return lang;
}

export function setLang(l) {
  if (l !== 'ru' && l !== 'hy') return;
  lang = l;
  AsyncStorage.setItem(KEY, l).catch(() => {});
  subs.forEach((f) => { try { f(l); } catch (e) {} });
}

export function onLang(f) { subs.add(f); return () => subs.delete(f); }

export function tr(s) {
  if (lang === 'ru' || s == null || typeof s !== 'string') return s;
  const v = HY[s];
  if (v != null) return v;
  // строки с пробелами по краям (« мин», «: ») переводим по сути и возвращаем пробелы
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (m && (m[1] || m[3])) { const w = HY[m[2]]; if (w != null) return m[1] + w + m[3]; }
  return s;
}
