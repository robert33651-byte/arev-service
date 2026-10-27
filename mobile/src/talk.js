// Запись разговора с клиентом: длинная запись в экономном качестве (до часа ≈ 15 МБ).
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

export const TALK_MAX_MS = 60 * 60 * 1000;

const OPTS = {
  isMeteringEnabled: false,
  android: { extension: '.m4a', outputFormat: Audio.AndroidOutputFormat.MPEG_4, audioEncoder: Audio.AndroidAudioEncoder.AAC, sampleRate: 22050, numberOfChannels: 1, bitRate: 32000 },
  ios: { extension: '.m4a', outputFormat: Audio.IOSOutputFormat.MPEG4AAC, audioQuality: Audio.IOSAudioQuality.MEDIUM, sampleRate: 22050, numberOfChannels: 1, bitRate: 32000, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
  web: {},
};

let rec = null;

export async function startTalk(onTick) {
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) throw new Error('MIC_DENIED');
  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: true });
  const r = new Audio.Recording();
  await r.prepareToRecordAsync(OPTS);
  r.setProgressUpdateInterval(1000);
  r.setOnRecordingStatusUpdate((s) => { if (onTick && s && s.isRecording) onTick(s.durationMillis || 0); });
  await r.startAsync();
  rec = r;
  try { await activateKeepAwakeAsync('talk'); } catch (e) {}
}

export async function stopTalk() {
  try { deactivateKeepAwake('talk'); } catch (e) {}
  if (!rec) return null;
  const r = rec; rec = null;
  let ms = 0;
  try { const s = await r.getStatusAsync(); ms = s.durationMillis || 0; } catch (e) {}
  try { await r.stopAndUnloadAsync(); } catch (e) {}
  try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false, staysActiveInBackground: false }); } catch (e) {}
  const uri = r.getURI();
  return uri ? { uri, ms } : null;
}

export const talkRecording = () => !!rec;

// Загрузить запись в хранилище; возвращает путь
export async function uploadTalk(uri, userId) {
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const path = userId + '/talk-' + Date.now() + '.m4a';
  const { error } = await supabase.storage.from('photos').upload(path, decode(b64), { contentType: 'audio/mp4', upsert: false });
  if (error) throw error;
  return path;
}

// Запустить ИИ-отчёт (ответ не ждём: обработка идёт на сервере)
export async function requestTalkAi(id) {
  try { await supabase.functions.invoke('talk-ai', { body: { talk_id: id } }); } catch (e) {}
}
