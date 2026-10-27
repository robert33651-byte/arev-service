import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, StyleSheet } from 'react-native';

import { tr } from './i18n';
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

/* ---------- иконки, плитки, нижнее меню ---------- */
export const Icon = ({ name, size = 22, color = C.ink, style }) => <Ionicons name={name} size={size} color={color} style={style} />;

// Плитка с цифрой: «Фото работ 3»
export function Tile({ icon, value, label, tone = 'note', onPress }) {
  const fg = { ok: C.ok, warn: C.warn, bad: C.bad, info: C.info, note: C.ink }[tone];
  const bg = { ok: C.okSoft, warn: C.warnSoft, bad: C.badSoft, info: C.infoSoft, note: C.surface }[tone];
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [u.tile, { backgroundColor: bg, opacity: pressed ? 0.85 : 1 }]}>
      <Icon name={icon} size={20} color={fg} />
      <Text style={{ fontSize: 22, fontWeight: '800', color: fg, marginTop: 6 }} numberOfLines={1}>{value}</Text>
      <Text style={{ fontSize: 12.5, color: C.muted }} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

// Большая кнопка действия с иконкой
export function Action({ icon, title, sub, onPress, kind = 'plain' }) {
  const primary = kind === 'primary';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [u.action, primary && { backgroundColor: C.sun, borderColor: C.sun }, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={[u.actIc, { backgroundColor: primary ? 'rgba(255,255,255,0.35)' : C.surface2 }]}>
        <Icon name={icon} size={24} color={primary ? C.sunInk : C.pine} />
      </View>
      <Text style={{ fontSize: 15.5, fontWeight: '700', color: primary ? C.sunInk : C.ink }}>{title}</Text>
      {sub ? <Text style={{ fontSize: 12, color: primary ? C.sunInk : C.muted, opacity: 0.85 }} numberOfLines={1}>{sub}</Text> : null}
    </Pressable>
  );
}

// Строка списка с иконкой слева
export function Row({ icon, iconColor = C.pine, title, sub, right, onPress, last }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [u.row, !last && { borderBottomWidth: 1, borderBottomColor: C.line }, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[u.rowIc, { backgroundColor: C.surface2 }]}><Icon name={icon} size={18} color={iconColor} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 15, color: C.ink, fontWeight: '600' }}>{title}</Text>
        {sub ? <Text style={{ fontSize: 13, color: C.muted }}>{sub}</Text> : null}
      </View>
      {right}
      {onPress && !right ? <Icon name="chevron-forward" size={18} color={C.muted} /> : null}
    </Pressable>
  );
}

// Пункт чек-листа
export function Check({ done, text, sub }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 4 }}>
      <Icon name={done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={done ? C.ok : C.muted} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: done ? C.muted : C.ink, textDecorationLine: done ? 'line-through' : 'none' }}>{text}</Text>
        {sub ? <Text style={{ fontSize: 12.5, color: C.muted }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export const TABS = [['home', 'Главная', 'home'], ['tasks', 'Задачи', 'checkbox'], ['day', 'Мой день', 'today'], ['history', 'История', 'calendar'], ['profile', 'Профиль', 'person']];
export function TabBar({ tab, onTab, badges }) {
  return (
    <View style={u.tabs}>
      {TABS.map(([k, l, ic]) => {
        const on = tab === k;
        const b = badges && badges[k];
        return (
          <Pressable key={k} onPress={() => onTab(k)} style={u.tab} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <View>
              <Icon name={on ? ic : ic + '-outline'} size={24} color={on ? C.pine : C.muted} />
              {b ? <View style={u.badge}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{b}</Text></View> : null}
            </View>
            <Text style={{ fontSize: 11.5, color: on ? C.pine : C.muted, fontWeight: on ? '700' : '500' }}>{tr(l)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const u = StyleSheet.create({
  tile: { flex: 1, minWidth: '46%', borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12 },
  action: { flex: 1, minWidth: '46%', backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14, gap: 4 },
  actIc: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  rowIc: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6, paddingBottom: 10 },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 },
  badge: { position: 'absolute', top: -4, right: -10, backgroundColor: C.bad, borderRadius: 9, minWidth: 18, height: 18, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
});
