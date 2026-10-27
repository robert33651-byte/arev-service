// Напоминания на телефоне: начать смену, закончить смену, фото работ, несданная закупка.
// Работают без интернета: расписание хранится на самом телефоне.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { tr, getLang } from './i18n';
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function setupNotify() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: tr('Напоминания'),
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 200, 250],
        lightColor: '#e9a11b',
      });
    }
    const p = await Notifications.getPermissionsAsync();
    if (p.status !== 'granted' && p.canAskAgain !== false) await Notifications.requestPermissionsAsync();
  } catch (e) {}
}

export async function notifyGranted() {
  try { return (await Notifications.getPermissionsAsync()).status === 'granted'; } catch (e) { return true; }
}

const trigger = (date) => {
  const T = Notifications.SchedulableTriggerInputTypes;
  return T ? { type: T.DATE, date, channelId: 'default' } : { date, channelId: 'default' };
};

export async function notifyNow(title, body) {
  try { await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null }); } catch (e) {}
}

let lastSig = '';
// Пересобрать расписание по текущему состоянию. Вызывается после каждой загрузки данных.
export async function planReminders({ cfg, open, startedToday, buys, wphCount, tasksLeft }) {
  const sig = JSON.stringify([getLang(), cfg && cfg.work_start, cfg && cfg.work_end, open && open.id, startedToday, (buys || []).map((b) => b.id), wphCount > 0, tasksLeft, new Date().toDateString()]);
  if (sig === lastSig) return;
  lastSig = sig;
  try {
    const list = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of list) {
      const d = n.content && n.content.data;
      if (d && d.arev) await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
    const now = Date.now();
    const add = async (date, title, body, key) => {
      if (date.getTime() <= now + 30000) return;
      await Notifications.scheduleNotificationAsync({ content: { title, body, data: { arev: key } }, trigger: trigger(date) });
    };
    const [sh, sm] = String((cfg && cfg.work_start) || '09:00').split(':').map(Number);
    const [eh, em] = String((cfg && cfg.work_end) || '18:00').split(':').map(Number);
    // «Смена не начата» на 7 рабочих дней вперёд; сегодня — только если смены ещё не было
    for (let i = 0; i < 8; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const wd = d.getDay();
      if (wd === 0 || wd === 6) continue;
      if (i === 0 && (open || startedToday)) continue;
      d.setHours(sh || 9, (sm || 0) + 10, 0, 0);
      await add(d, tr('Смена не начата'), tr('Начните смену в офисе: фото одометра и показания.'), 'start' + i);
    }
    if (open) {
      const e = new Date(); e.setHours(eh || 18, (em || 0) + 20, 0, 0);
      await add(e, tr('Не забудьте закончить смену'), tr('Вернитесь в офис и отметьте конец смены с фото одометра.'), 'end');
      if (!wphCount) {
        const t = new Date(new Date(open.start_at).getTime() + 3 * 3600000);
        await add(t, tr('Нет фото работ'), tr('За смену ещё нет ни одного фото работ. Снимите работу до и после.'), 'photo');
      }
      if (tasksLeft) {
        const t = new Date(); t.setHours((eh || 18) - 1, em || 0, 0, 0);
        await add(t, tr('Остались задачи'), tr('Не выполнено задач на сегодня: ') + tasksLeft + '.', 'tasks');
      }
    }
    for (const b of buys || []) {
      const t = new Date(new Date(b.created_at).getTime() + 3 * 3600000);
      const what = (b.lines || []).map((l) => l.name).join(', ');
      await add(t, tr('Не сдана закупка'), what + tr('. Сдайте на склад или отметьте на объекте.'), 'buy' + b.id);
    }
  } catch (e) {}
}
