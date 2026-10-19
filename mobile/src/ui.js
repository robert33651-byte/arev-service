import React from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, StyleSheet } from 'react-native';

export const C = {
  bg: '#eef2f0', surface: '#ffffff', surface2: '#f6f8f7', ink: '#14211d', muted: '#5b6a65', line: '#d9e1dd',
  pine: '#123a33', pineInk: '#e8f1ed', sun: '#e9a11b', sunInk: '#2e1f00', sunSoft: '#fdf1d8',
  ok: '#2c8a57', okSoft: '#e1f2e8', warn: '#b86d06', warnSoft: '#fbeedb', bad: '#c23d2c', badSoft: '#fbe4e0', info: '#2c67a6', infoSoft: '#e2ecf7',
};

export function Btn({ title, onPress, kind = 'primary', disabled, busy, big, style }) {
  const bg = kind === 'primary' ? C.sun : kind === 'dark' ? C.pine : kind === 'danger' ? C.badSoft : C.surface2;
  const fg = kind === 'primary' ? C.sunInk : kind === 'dark' ? C.pineInk : kind === 'danger' ? C.bad : C.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1, paddingVertical: big ? 18 : 13 }, kind === 'ghost' && { borderWidth: 1, borderColor: C.line }, style]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnT, { color: fg, fontSize: big ? 17 : 15 }]}>{title}</Text>}
    </Pressable>
  );
}

export const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;
export const H1 = ({ children }) => <Text style={s.h1}>{children}</Text>;
export const H2 = ({ children }) => <Text style={s.h2}>{children}</Text>;
export const Label = ({ children }) => <Text style={s.label}>{children}</Text>;
export const Muted = ({ children, style }) => <Text style={[s.muted, style]}>{children}</Text>;
export const T = ({ children, style }) => <Text style={[s.t, style]}>{children}</Text>;

export function Field({ label, ...p }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={s.flabel}>{label}</Text> : null}
      <TextInput placeholderTextColor="#9aa7a2" style={s.inp} {...p} />
    </View>
  );
}

export function Flag({ kind = 'note', children }) {
  const m = { bad: [C.badSoft, C.bad], warn: [C.warnSoft, C.warn], ok: [C.okSoft, C.ok], note: [C.surface2, C.muted] }[kind];
  return (
    <View style={[s.flag, { backgroundColor: m[0] }]}>
      <Text style={{ color: m[1], fontSize: 14, lineHeight: 19 }}>{children}</Text>
    </View>
  );
}

export function Chip({ kind = 'note', children }) {
  const m = { bad: [C.badSoft, C.bad], warn: [C.warnSoft, C.warn], ok: [C.okSoft, C.ok], info: [C.infoSoft, C.info], note: [C.surface2, C.muted] }[kind];
  return (
    <View style={{ backgroundColor: m[0], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: m[1], fontSize: 12, fontWeight: '700' }}>{children}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  btn: { borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnT: { fontWeight: '700' },
  card: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16, gap: 10 },
  h1: { fontSize: 22, fontWeight: '700', color: C.ink },
  h2: { fontSize: 17, fontWeight: '700', color: C.ink },
  label: { fontSize: 11.5, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  muted: { fontSize: 14, color: C.muted, lineHeight: 19 },
  t: { fontSize: 15, color: C.ink, lineHeight: 21 },
  flabel: { fontSize: 13, fontWeight: '600', color: C.ink },
  inp: { borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 12, fontSize: 16, color: C.ink },
  flag: { borderRadius: 11, padding: 12 },
});
