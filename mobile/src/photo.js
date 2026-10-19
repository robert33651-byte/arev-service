// Съёмка только камерой (галерея недоступна) и загрузка в защищённое хранилище.
import React, { useRef, useState } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { C } from './ui';

export async function uploadPhoto(uri, userId, kind) {
  const img = await manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.75, format: SaveFormat.JPEG, base64: true });
  const path = userId + '/' + kind + '-' + Date.now() + '.jpg';
  const { error } = await supabase.storage.from('photos').upload(path, decode(img.base64), { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return { path, uri: img.uri };
}

export function CameraSheet({ visible, title, onClose, onShot }) {
  const ref = useRef(null);
  const [perm, requestPerm] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const shoot = async () => {
    if (!ref.current || busy) return;
    setBusy(true);
    try {
      const p = await ref.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      await onShot(p.uri);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={st.wrap}>
        {!perm ? null : !perm.granted ? (
          <View style={st.center}>
            <Text style={st.txt}>Нужен доступ к камере</Text>
            <Pressable style={st.btn} onPress={requestPerm}><Text style={st.btnT}>Разрешить</Text></Pressable>
          </View>
        ) : (
          <CameraView ref={ref} style={st.cam} facing="back" />
        )}
        <View style={st.bar}>
          <Pressable onPress={onClose} style={st.side}><Text style={st.txt}>Отмена</Text></Pressable>
          <Pressable onPress={shoot} disabled={busy} style={st.shutter}>
            {busy ? <ActivityIndicator color={C.pine} /> : <View style={st.inner} />}
          </Pressable>
          <View style={st.side}><Text style={[st.txt, { fontSize: 13 }]} numberOfLines={2}>{title}</Text></View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000' },
  cam: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 24, backgroundColor: '#000' },
  side: { width: 90 },
  txt: { color: '#fff', fontSize: 16 },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  inner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  btn: { backgroundColor: C.sun, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  btnT: { color: C.sunInk, fontWeight: '700' },
});
