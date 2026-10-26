import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, STAFF_EMAIL_DOMAIN } from './config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

AppState.addEventListener('change', (s) => {
  if (s === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

// +374 91 123456, 091 123456, 91123456 → 37491123456
export function normPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9 && d.startsWith('0')) d = '374' + d.slice(1);
  if (d.length === 8) d = '374' + d;
  return d;
}
export const phoneEmail = (phone) => normPhone(phone) + '@' + STAFF_EMAIL_DOMAIN;

const ERR = {
  NOT_REGISTERED: 'Сначала заполните анкету.',
  NOT_APPROVED: 'Руководитель ещё не подтвердил вашу анкету.',
  OTHER_DEVICE: 'Вы зарегистрированы на другом телефоне. Обратитесь к руководителю.',
  MOCK_LOCATION: 'На телефоне включена подмена местоположения. Отключите её, иначе отметка невозможна. Руководитель получил уведомление.',
  PHOTO_NOT_FOUND: 'Фото не загрузилось. Сфотографируйте ещё раз.',
  PHOTO_TOO_OLD: 'Фото устарело. Сфотографируйте ещё раз.',
  NEED_ODO: 'Введите показания одометра.',
  SHIFT_ALREADY_OPEN: 'Смена уже идёт.',
  NO_OPEN_SHIFT: 'Сначала начните смену.',
  ODO_LESS_THAN_START: 'Показания меньше, чем утром. Проверьте цифры.',
  ACTIVE_ORDER: 'Сначала завершите текущий заказ.',
  NEED_LITERS: 'Укажите, сколько залито.',
  ALREADY_TAKEN: 'Этот заказ уже взял другой сотрудник.',
  CANNOT_REFUSE: 'От этого заказа уже нельзя отказаться.',
  NOT_YOUR_TICKET: 'Это не ваш заказ.',
  WRONG_STEP: 'Этот шаг сейчас недоступен. Обновите экран.',
  NEED_PHOTOS: 'Нужно хотя бы одно фото до и одно после работы.',
  NEED_PRICE: 'Укажите сумму.',
  NOT_ONSITE: 'Это можно сделать, только когда по заказу нажато «Я на месте».',
  NEED_OBJECT: 'Укажите объект: имя клиента или адрес.',
  NEED_SUPPLIER: 'Укажите магазин или поставщика.',
  NEED_LINES: 'Укажите, что купили: название и количество.',
  NEED_AMOUNT: 'Укажите сумму из чека.',
  BAD_TICKET: 'Этот заказ уже завершён или не ваш.',
  CANNOT_DELIVER: 'Эта закупка уже отмечена.',
  BAD_USED: 'Проверьте количество: от 0 до купленного.',
  PURCHASE_NOT_DELIVERED: 'Сначала отметьте на объекте докупленный материал (блок «Материал для заказа»).',
  NEED_NAME_PHONE: 'Укажите имя и телефон.',
  NOT_YOUR_TASK: 'Это не ваша задача.',
  WRONG_STATUS: 'Статус задачи уже изменился. Обновите список.',
  TASK_CLOSED: 'Задача уже закрыта менеджером.',
  EMPTY: 'Напишите сообщение.',
  NEED_FILE: 'Файл не загрузился. Повторите.',
  NEED_TITLE: 'Напишите, что нужно сделать.',
  WRONG_KIND: 'Не удалось отправить. Повторите.',
  MIC_DENIED: 'Нет доступа к микрофону. Разрешите его в настройках телефона.',
};
export function errText(e) {
  const m = (e && (e.error || e.message)) || String(e || '');
  for (const k of Object.keys(ERR)) if (m.includes(k)) return ERR[k];
  if (/Invalid login credentials/i.test(m)) return 'Неверный телефон или PIN-код.';
  if (/already registered|already been registered/i.test(m)) return 'Этот номер уже зарегистрирован. Войдите с PIN-кодом.';
  if (/Password should be/i.test(m)) return 'PIN-код должен быть не короче 6 цифр.';
  if (/Network request failed|fetch/i.test(m)) return 'Нет интернета. Проверьте связь и повторите.';
  return 'Ошибка: ' + m;
}

// Вызов серверной функции. Сервер возвращает {error: 'КОД'} или данные.
export async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  if (data && typeof data === 'object' && !Array.isArray(data) && data.error) throw new Error(data.error);
  return data;
}
