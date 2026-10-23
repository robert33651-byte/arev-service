// Фото работ без интернета: снимок сохраняется в телефоне и уходит сам, когда появится связь.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase, rpc } from './supabase';
import { deviceId } from './device';

const K = 'arev.outbox';
const K_ERR = 'arev.outboxErr';
const read = async () => { try { return JSON.parse((await AsyncStorage.getItem(K)) || '[]'); } catch (e) { return []; } };
const write = async (q) => { try { await AsyncStorage.setItem(K, JSON.stringify(q)); } catch (e) {} };

export const isNetErr = (e) => /Network request failed|network|fetch|timeout|Failed to fetch|Load failed/i.test(String((e && (e.message || e.error)) || e || ''));

export async function boxCount() { return (await read()).length; }

// item: {uri, kind, object, note, ticket, fix:{lat,lng,acc,mocked}, takenAt}
export async function addToBox(item) {
  const dir = FileSystem.documentDirectory + 'outbox/';
  try { await FileSystem.makeDirectoryAsync(dir, { intermediates: true }); } catch (e) {}
  const id = String(Date.now()) + Math.floor(Math.random() * 1000);
  const dest = dir + id + '.jpg';
  await FileSystem.copyAsync({ from: item.uri, to: dest });
  const q = await read();
  q.push({ ...item, uri: dest, id });
  await write(q);
  return q.length;
}

let running = false;
// Отправить очередь. Возвращает {sent, left, failed}.
export async function flushBox(uid) {
  if (running || !uid) return { sent: 0, left: await boxCount(), failed: 0 };
  running = true;
  let sent = 0, failed = 0;
  try {
    let q = await read();
    for (const it of q.slice()) {
      try {
        const b64 = await FileSystem.readAsStringAsync(it.uri, { encoding: FileSystem.EncodingType.Base64 });
        const path = uid + '/work-' + it.kind + '-' + it.id + '.jpg';
        const up = await supabase.storage.from('photos').upload(path, decode(b64), { contentType: 'image/jpeg', upsert: false });
        if (up.error && !/exist|duplicate/i.test(String(up.error && up.error['message'] || ''))) throw up.error;
        await rpc('add_work_photo', {
          p_path: path, p_kind: it.kind, p_object: it.object, p_note: it.note, p_lat: it.fix.lat, p_lng: it.fix.lng,
          p_acc: it.fix.acc, p_mocked: it.fix.mocked, p_device: deviceId(), p_ticket: it.ticket || null, p_taken_at: new Date(it.takenAt).toISOString(),
        });
        sent++;
      } catch (e) {
        if (isNetErr(e)) break; // связи нет — попробуем позже
        failed++;
        try { await AsyncStorage.setItem(K_ERR, String((e && e.message) || e)); } catch (x) {}
      }
      q = q.filter((x) => x.id !== it.id);
      await write(q);
      try { await FileSystem.deleteAsync(it.uri, { idempotent: true }); } catch (e) {}
    }
    return { sent, left: q.length, failed };
  } finally {
    running = false;
  }
}
