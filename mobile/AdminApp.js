// Приложение руководителя: вход по отпечатку / блокировке экрана, админка внутри, push-уведомления.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, PermissionsAndroid, Platform, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { tr } from './src/i18n';

const EXTRA = (Constants.expoConfig && Constants.expoConfig.extra) || {};
const URL_ = EXTRA.adminUrl || 'https://arev-service-admin.vercel.app/';
const RELOCK_MS = 60 * 1000; // после минуты в фоне просим отпечаток снова

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function getPushToken() {
  try {
    if (!Device.isDevice) return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('tasks', { name: tr('Запросы и задачи'), importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250] });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    const projectId = (EXTRA.eas && EXTRA.eas.projectId) || (Constants.easConfig && Constants.easConfig.projectId);
    return (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  } catch (e) { return null; }
}

export default function AdminApp() {
  const [locked, setLocked] = useState(true);
  const [msg, setMsg] = useState('');
  const [token, setToken] = useState(undefined); // undefined — ещё узнаём
  const web = useRef(null);
  const canBack = useRef(false);
  const bgAt = useRef(0);
  const busy = useRef(false);

  const unlock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setMsg('');
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      if (level === LocalAuthentication.SecurityLevel.NONE) {
        setMsg(tr('На телефоне не задана защита экрана. Включите отпечаток, PIN или графический ключ в настройках телефона, иначе вход в приложение руководителя закрыт.'));
        return;
      }
      const r = await LocalAuthentication.authenticateAsync({
        promptMessage: tr('Вход в Arev Admin'),
        cancelLabel: tr('Отмена'),
        disableDeviceFallback: false,
      });
      if (r.success) setLocked(false);
      else setMsg(tr('Не удалось подтвердить личность. Нажмите «Войти» и повторите.'));
    } catch (e) {
      setMsg(tr('Ошибка проверки: ') + String(e && e.message || e));
    } finally { busy.current = false; }
  }, []);

  useEffect(() => { unlock(); }, [unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' || s === 'inactive') { if (!bgAt.current) bgAt.current = Date.now(); }
      else if (s === 'active') {
        if (bgAt.current && Date.now() - bgAt.current > RELOCK_MS) { setLocked(true); setTimeout(unlock, 200); }
        bgAt.current = 0;
      }
    });
    return () => sub.remove();
  }, [unlock]);

  useEffect(() => {
    if (locked || token !== undefined) return;
    (async () => {
      if (Platform.OS === 'android') { try { await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO); } catch (e) {} }
      const t = await Promise.race([getPushToken(), new Promise((r) => setTimeout(() => r(null), 8000))]);
      setToken(t || null);
    })();
  }, [locked, token]);

  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!locked && canBack.current && web.current) { web.current.goBack(); return true; }
      return false;
    });
    return () => h.remove();
  }, [locked]);

  if (locked || token === undefined) {
    return (
      <SafeAreaView style={s.lock}>
        <StatusBar barStyle="light-content" backgroundColor="#123a33" />
        <Text style={s.logo}>Arev Admin</Text>
        {locked ? (
          <>
            {!!msg && <Text style={s.msg}>{msg}</Text>}
            <Pressable style={s.btn} onPress={unlock}><Text style={s.btnT}>{tr('Войти')}</Text></Pressable>
          </>
        ) : <ActivityIndicator color="#fff" size="large" />}
      </SafeAreaView>
    );
  }

  const inject = 'window.AREV_NATIVE=true;' + (token ? 'window.AREV_PUSH=' + JSON.stringify(token) + ';' : '') + 'true;';
  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#123a33" />
      <WebView
        ref={web}
        source={{ uri: URL_ }}
        injectedJavaScriptBeforeContentLoaded={inject}
        onNavigationStateChange={(n) => { canBack.current = !!n.canGoBack; }}
        javaScriptEnabled
        domStorageEnabled
        pullToRefreshEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        setSupportMultipleWindows={false}
        startInLoadingState
        renderLoading={() => <View style={s.load}><ActivityIndicator color="#123a33" size="large" /></View>}
        renderError={() => (
          <View style={s.load}><Text style={s.err}>{tr('Нет связи с сервером')}</Text>
            <Pressable style={s.btn} onPress={() => web.current && web.current.reload()}><Text style={s.btnT}>{tr('Обновить')}</Text></Pressable></View>
        )}
        style={{ flex: 1 }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#123a33' },
  lock: { flex: 1, backgroundColor: '#123a33', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 },
  logo: { color: '#fff', fontSize: 30, fontWeight: '700' },
  msg: { color: '#ffd9a0', fontSize: 15, textAlign: 'center' },
  btn: { backgroundColor: '#e9a11b', paddingVertical: 14, paddingHorizontal: 34, borderRadius: 14 },
  btnT: { color: '#123a33', fontSize: 18, fontWeight: '700' },
  load: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', gap: 16 },
  err: { fontSize: 17, color: '#333' },
});
