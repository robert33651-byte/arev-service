/**
 * Arev Service — Google Таблица, подключённая к базе (Supabase).
 *
 * Таблица — «витрина»: данные приходят из базы сами (каждые 5 минут и после каждой правки).
 * Менеджер может работать прямо в таблице:
 *   • изменить Առաջադրանք / Կատարող / Ավարտ / վիճակ / Առաջնահերթություն в существующей строке
 *   • добавить новую задачу строкой: название + исполнитель (и срок, если нужен)
 * Остальные листы (обсуждения, архив, поездки, топливо, закупки) только для чтения.
 *
 * УСТАНОВКА: Расширения → Apps Script → вставить этот файл → заполнить API_URL и SECRET ниже →
 * выбрать функцию setup → Выполнить → разрешить доступ.
 */

// ==================== НАСТРОЙКИ ====================
const API_URL = 'https://ВАШ_ПРОЕКТ.supabase.co/functions/v1/sheet-api';
const SECRET  = 'ВСТАВЬТЕ_SHEET_SECRET';
const TZ      = 'Asia/Yerevan';

// ==================== ЛИСТЫ ====================
const SH_TASKS = 'Առաջադրանքներ';
const SH_DISC  = 'Քննարկումներ';
const SH_ARCH  = 'Արխիվ';
const SH_EMP   = 'Աշխատակիցներ';
const SH_TRIPS = 'Ճանապարհ';
const SH_FUEL  = 'Վառելիք';
const SH_BUYS  = 'Գնումներ';
const SH_WEEK  = 'Շաբաթական հաշվետվություն';
const SH_MONTH = 'Ամսական հաշվետվություն';
const SH_STAT  = 'ՎԻՃԱԿԱԳՐՈՒԹՅՈՒՆ (ԱՎՏՈՄԱՏ ՀԱՇՎԱՐԿ)';
const HEAD = 4, DATA = 5;               // шапка в 4-й строке, данные с 5-й (как в офисном варианте)
const GREEN = '#0F7B3F';

const ST_NEW = 'Նոր', ST_REVIEW = 'Զեկուցվող', ST_DONE = 'Կատարված';
const STATUS_CODE = {}; STATUS_CODE[ST_NEW] = 'new'; STATUS_CODE[ST_REVIEW] = 'report'; STATUS_CODE[ST_DONE] = 'done';
const STATUS_LABEL = { new: ST_NEW, report: ST_REVIEW, done: ST_DONE };
const PRIO_CODE = { 'Սովորական': 'normal', 'Կարևոր': 'important', 'Հրատապ': 'urgent' };
const PRIO_LABEL = { normal: 'Սովորական', important: 'Կարևոր', urgent: 'Հրատապ' };
const PRIO_W = { urgent: 0, important: 1, normal: 2 };

const EVT = {
  created: function () { return 'Առաջադրանքը ստեղծվեց'; },
  self_added: function () { return 'Աշխատակիցն ինքն ավելացրեց'; },
  assigned: function (b) { return 'Նշանակվեց՝ ' + b; },
  seen: function () { return '👀 Բացեց'; },
  reported: function () { return '✅ Զեկուցեց կատարման մասին'; },
  confirmed: function () { return '✔ Ընդունվեց'; },
  reopened: function () { return '↩ Վերադարձվեց աշխատանքի'; },
  reminder: function () { return '⏰ Հիշեցում ուղարկվեց'; },
  overdue: function (b) { return '⏰ Ժամկետանց՝ ' + b; },
  purchase: function (b) { return '🛒 Գնում՝ ' + b; },
  place_set: function (b) { return '📍 Վայր՝ ' + b; },
  disc_open: function () { return '💬 Քննարկում բացվեց'; },
  disc_closed: function () { return '✔ Հարցը լուծվեց'; },
  due_changed: function (b) { return 'Ժամկետը կամ կարևորությունը փոխվեց՝ ' + b; },
  done_field: function () { return '✅ Կատարվեց տեղում (GPS)'; },
  status: function (b) { return 'Կարգավիճակ՝ ' + b; }
};
const BUY_STATUS = { bought: 'Գնված', partial: 'Մասամբ', delivered: 'Հանձնված', accepted: 'Ընդունված', cancelled: 'Չեղարկված' };
const BUY_DEST = { warehouse: 'Պահեստ', site: 'Օբյեկտ', ticket: 'Պատվեր' };

// ==================== ОБЩЕЕ ====================
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function toast(m) { try { ss().toast(m, 'Arev', 6); } catch (e) { /* без окна */ } }

function api(action, extra) {
  const res = UrlFetchApp.fetch(API_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-sheet-secret': SECRET },
    payload: JSON.stringify(Object.assign({ action: action }, extra || {}))
  });
  let body;
  try { body = JSON.parse(res.getContentText()); } catch (e) { body = { error: String(res.getContentText()).slice(0, 200) }; }
  if (res.getResponseCode() >= 300 || (body && body.error)) throw new Error((body && body.error) || ('HTTP ' + res.getResponseCode()));
  return body;
}

const p2 = function (n) { return (n < 10 ? '0' : '') + n; };
function fd(iso)  { return iso ? Utilities.formatDate(new Date(iso), TZ, 'dd.MM.yyyy') : ''; }
function fdt(iso) { return iso ? Utilities.formatDate(new Date(iso), TZ, 'dd.MM.yyyy HH:mm') : ''; }
function fhm(iso) { return iso ? Utilities.formatDate(new Date(iso), TZ, 'HH:mm') : ''; }
function fshort(iso) { return iso ? Utilities.formatDate(new Date(iso), TZ, 'dd.MM HH:mm') : ''; }
function ymdToDate(s) { if (!s) return ''; const a = String(s).slice(0, 10).split('-').map(Number); return new Date(a[0], a[1] - 1, a[2], 12, 0, 0); }
function first(n) { return String(n || '').split(/\s+/)[0]; }
function num(v) { const x = Number(v); return isFinite(x) ? x : 0; }

// Позиции ссылок в тексте с эмодзи: проверяем один раз, считает ли Google в UTF-16 или в символах
let OFFS16 = null;
function utf16Offsets() {
  if (OFFS16 !== null) return OFFS16;
  try { SpreadsheetApp.newRichTextValue().setText('a\uD83D\uDE00b').setLinkUrl(3, 4, 'https://example.com').build(); OFFS16 = true; } catch (e) { OFFS16 = false; }
  return OFFS16;
}
function cpIndex(text, i) { return utf16Offsets() ? i : Array.from(text.slice(0, i)).length; }
// Поставить ссылку; если не вышло, остаётся обычный текст (синхронизация не прерывается)
function setLink(b, text, s, e, u) {
  try { b.setLinkUrl(cpIndex(text, s), cpIndex(text, e), u); } catch (err) { Logger.log('link skipped: ' + err); }
}

// Ячейка со ссылками: «🎤1  🎤2» (каждое слово — своя ссылка)
function linksRich(urls, icon) {
  const list = (urls || []).filter(Boolean);
  let text = '', marks = [];
  list.forEach(function (u, i) { const t = icon + (i + 1); marks.push({ s: text.length, e: text.length + t.length, u: u }); text += t + (i < list.length - 1 ? '  ' : ''); });
  const b = SpreadsheetApp.newRichTextValue().setText(text);
  marks.forEach(function (m) { setLink(b, text, m.s, m.e, m.u); });
  return b.build();
}
function plainRich(t) { return SpreadsheetApp.newRichTextValue().setText(t == null ? '' : String(t)).build(); }

// Подготовка листа: создать, очистить, заголовок, шапка, ширины
function prepare(name, title, headers, widths) {
  let sh = ss().getSheetByName(name);
  if (!sh) sh = ss().insertSheet(name);
  try { sh.getBandings().forEach(function (b) { b.remove(); }); } catch (e) { /* нет */ }
  sh.clearConditionalFormatRules();
  sh.clear();
  try { sh.getDataRange().clearDataValidations(); } catch (e) { /* нет */ }
  sh.getRange(1, 1, 1, headers.length).merge();
  sh.getRange(1, 1).setValue(title).setFontSize(14).setFontWeight('bold').setFontColor(GREEN);
  sh.setRowHeight(2, 6); sh.setRowHeight(3, 6);
  sh.getRange(HEAD, 1, 1, headers.length).setValues([headers])
    .setBackground(GREEN).setFontColor('#FFFFFF').setFontWeight('bold')
    .setVerticalAlignment('middle').setHorizontalAlignment('center').setWrap(true);
  sh.setRowHeight(HEAD, 42);
  sh.setFrozenRows(HEAD);
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  return sh;
}
function put(sh, rows, ncols) {
  if (!rows.length) return;
  sh.getRange(DATA, 1, rows.length, ncols).setValues(rows);
  sh.getRange(DATA, 1, rows.length, ncols).setWrap(true).setVerticalAlignment('top');
  try { sh.getRange(DATA, 1, rows.length, ncols).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREEN, false, false); } catch (e) { /* уже есть */ }
}
function lockedNote(sh, ncols) { sh.getRange(2, 1).setValue('Только для чтения: данные приходят из базы автоматически').setFontColor('#777777').setFontSize(9); }

// ==================== СИНХРОНИЗАЦИЯ ====================
function syncAll() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(25000)) return;
  try { syncLocked(); } finally { lock.releaseLock(); }
}
function syncLocked() {
  const d = api('export');
  const errs = [];
  // каждый лист строится отдельно: ошибка одного не мешает остальным
  [['Աշխատակիցներ', renderStaff], ['Առաջադրանքներ', renderTasks], ['Քննարկումներ', renderDisc], ['Արխիվ', renderArchive],
   ['Շաբաթական', renderWeekly], ['Ամսական', renderMonthly], ['Ճանապարհ', renderTrips], ['Վառելիք', renderFuel], ['Գնումներ', renderBuys], ['Վիճակագրություն', renderSummary]].forEach(function (x) {
    try { x[1](d); } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      errs.push(x[0] + ': ' + msg); Logger.log(x[0] + ' → ' + (e && e.stack ? e.stack : e));
      // ошибка видна прямо в листе (ячейка A1), чтобы не искать в журнале
      try { const sh = ss().getSheetByName(x[0]); if (sh) sh.getRange(1, 1).setValue('⚠ ՍԽԱԼ: ' + msg.slice(0, 250)).setFontColor('#C62828'); } catch (e2) { /* нет */ }
    }
  });
  PropertiesService.getScriptProperties().setProperty('lastError', errs.join(' | '));
  PropertiesService.getScriptProperties().setProperty('lastSync', new Date().toISOString());
  const s = ss().getSheetByName(SH_TASKS);
  if (s) s.getRange(2, 1).setValue('Обновлено: ' + fdt(d.now)).setFontColor('#777777').setFontSize(9);
  if (errs.length) { try { ss().toast(errs.join(' | ').slice(0, 300), 'Arev: սխալ', 20); } catch (e) { /* нет */ } throw new Error(errs.join(' | ')); }
}

// ---------- Առաջադրանքներ (живые задачи, редактируются) ----------
const TASK_H = ['№', 'Առաջադրանք', 'Կատարող', 'Ավարտ', 'վիճակ', '👀 Ընդունված', 'Նշում ընթացքի/սպասման',
  'Զեկուցում իրավիճակի և ավարտի մասին', '🎤 Ձայնային', '🖼 Ֆոտո', 'Ավարտի օր', 'Առաջնահերթություն', 'Քննարկում', 'ID'];
const C_TITLE = 2, C_WHO = 3, C_DUE = 4, C_ST = 5, C_PRIO = 12, C_ID = 14;

function readDrafts(sh) {
  // строки, которые менеджер начал вводить, но ещё не создал задачу (нет ID): не стираем при обновлении
  const last = sh.getLastRow();
  if (last < DATA) return [];
  const v = sh.getRange(DATA, 1, last - DATA + 1, C_ID).getValues();
  return v.filter(function (r) { return !r[C_ID - 1] && String(r[C_TITLE - 1]).trim(); });
}

function renderTasks(d) {
  const old = ss().getSheetByName(SH_TASKS);
  const drafts = old ? readDrafts(old) : [];
  const sh = prepare(SH_TASKS, '📋 ԱՌԱՋԱԴՐԱՆՔՆԵՐ', TASK_H, [42, 300, 140, 100, 120, 170, 240, 250, 110, 90, 100, 120, 100, 60]);
  const live = d.tasks.filter(function (t) { return !t.archived_at && t.status !== 'cancelled'; });
  live.sort(function (a, b) {
    return (PRIO_W[a.priority] - PRIO_W[b.priority]) || String(a.due || '9999').localeCompare(String(b.due || '9999')) || a.n - b.n;
  });
  const rows = [], voices = [], photos = [];
  live.forEach(function (t, i) {
    const seen = [];
    if (t.seen) seen.push('👀 ' + first(t.assignee) + ' ' + fshort(t.seen));
    if (t.assignee2 && t.seen2) seen.push('👀 ' + first(t.assignee2) + ' ' + fshort(t.seen2));
    const m = t.last_msg;
    const note = (t.note ? t.note : '') + (m ? (t.note ? '\n' : '') + '💬 ' + m.who + ': ' + (m.body || (m.kind === 'voice' ? '🎤' : '🖼')) : '');
    const rep = t.done_note ? (t.report_at ? fshort(t.report_at) + ' — ' : '') + t.done_note : (t.status === 'report' ? fshort(t.report_at) + ' — զեկուցվել է' : '');
    rows.push([i + 1, t.title, t.assignee + (t.assignee2 ? ', ' + t.assignee2 : ''), ymdToDate(t.due), STATUS_LABEL[t.status] || ST_NEW,
      seen.join('\n'), note, rep, '', '', t.report_at || t.done_at ? ymdToDate(String(t.report_at || t.done_at).slice(0, 10)) : '',
      PRIO_LABEL[t.priority] || 'Սովորական', t.disc === 'open' ? '💬 բաց' : '', t.id]);
    voices.push([linksRich(t.voices, '🎤')]); photos.push([linksRich(t.photos, '🖼')]);
  });
  put(sh, rows, TASK_H.length);
  if (rows.length) {
    sh.getRange(DATA, 9, rows.length, 1).setRichTextValues(voices);
    sh.getRange(DATA, 10, rows.length, 1).setRichTextValues(photos);
    sh.getRange(DATA, 4, rows.length, 1).setNumberFormat('dd.MM.yyyy');
    sh.getRange(DATA, 11, rows.length, 1).setNumberFormat('dd.MM.yyyy');
  }
  // черновики менеджера возвращаем под данные
  if (drafts.length) {
    const at = DATA + rows.length;
    sh.getRange(at, 1, drafts.length, C_ID).setValues(drafts.map(function (r) { return r.slice(0, C_ID); }));
    sh.getRange(at, 4, drafts.length, 1).setNumberFormat('dd.MM.yyyy');
  }
  // 100 пустых строк снизу для новых задач: оформление и выпадающие списки
  const N = Math.max(100, rows.length + drafts.length + 100);
  sh.getRange(DATA, 1, N, TASK_H.length).setWrap(true).setVerticalAlignment('top');
  const mk = function (arr) { return SpreadsheetApp.newDataValidation().requireValueInList(arr, true).setAllowInvalid(false).build(); };
  const emp = ss().getSheetByName(SH_EMP);
  if (emp) sh.getRange(DATA, C_WHO, N, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(emp.getRange(DATA, 1, 300, 1), true).setAllowInvalid(true).build());
  sh.getRange(DATA, C_ST, N, 1).setDataValidation(mk([ST_NEW, ST_REVIEW, ST_DONE]));
  sh.getRange(DATA, C_PRIO, N, 1).setDataValidation(mk(['Սովորական', 'Կարևոր', 'Հրատապ']));
  try { sh.getBandings().forEach(function (x) { x.remove(); }); } catch (e) { /* нет */ }
  try { sh.getRange(DATA, 1, N, TASK_H.length).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREEN, false, false); } catch (e) { Logger.log('banding: ' + e); }
  const col = function (c, v, bg, fg) { return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(v).setBackground(bg).setFontColor(fg || '#000000').setRanges([sh.getRange(DATA, c, N, 1)]).build(); };
  sh.setConditionalFormatRules([
    col(C_ST, ST_NEW, '#BDBDBD', '#FFFFFF'), col(C_ST, ST_REVIEW, '#FFD60A'), col(C_ST, ST_DONE, '#34C759', '#FFFFFF'),
    col(C_PRIO, 'Հրատապ', '#E53935', '#FFFFFF'), col(C_PRIO, 'Կարևոր', '#FB8C00', '#FFFFFF'),
    col(13, '💬 բաց', '#FFEBEE', '#C62828'),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$F' + DATA + '<>""').setBackground('#D7F5DD').setRanges([sh.getRange(DATA, 6, N, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($D' + DATA + '<>"",$D' + DATA + '<TODAY(),$E' + DATA + '<>"' + ST_DONE + '")')
      .setBackground('#FFCDD2').setRanges([sh.getRange(DATA, 1, N, TASK_H.length)]).build()
  ]);
  try { sh.hideColumns(C_ID); } catch (e) { /* нет */ }
}

// ---------- Քննարկումներ (кто, что, кому, когда) ----------
function renderDisc(d) {
  const H = ['Ամսաթիվ', 'Ժամ', 'Առաջադրանք', 'Ումից', 'Դեր', 'Ումին', 'Տեսակ', 'Տեքստ', 'Ֆայլ'];
  const sh = prepare(SH_DISC, '💬 ՔՆՆԱՐԿՈՒՄՆԵՐ', H, [95, 60, 260, 150, 90, 170, 90, 380, 90]);
  const tmap = {}; d.tasks.forEach(function (t) { tmap[t.id] = t; });
  const items = d.log.filter(function (l) { return tmap[l.task_id] && (l.kind !== 'event' || l.code === 'disc_open' || l.code === 'disc_closed'); });
  items.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  const rows = [], files = [];
  items.forEach(function (l) {
    const t = tmap[l.task_id];
    const to = l.role === 'staff' ? 'Մենեջեր' : (t.assignee + (t.assignee2 ? ', ' + t.assignee2 : ''));
    const kind = l.kind === 'voice' ? '🎤 Ձայն' : l.kind === 'photo' ? '🖼 Ֆոտո' : l.kind === 'text' ? 'Տեքստ' : 'Իրադարձություն';
    const text = l.kind === 'event' ? (EVT[l.code] ? EVT[l.code](l.body || '') : l.code) : (l.body || '');
    rows.push([fd(l.at), fhm(l.at), t.title, l.who, l.role === 'admin' ? 'մենեջեր' : l.role === 'staff' ? 'աշխատակից' : 'համակարգ', to, kind, text, '']);
    files.push([l.url ? linksRich([l.url], l.kind === 'voice' ? '🎤 ' : '🖼 ') : plainRich('')]);
  });
  put(sh, rows, H.length);
  if (rows.length) {
    sh.getRange(DATA, 9, rows.length, 1).setRichTextValues(files);
    sh.getRange(DATA, 1, rows.length, 1).setNumberFormat('@');
  }
  lockedNote(sh, H.length);
}

// ---------- Արխիվ (завершённые задачи с хронологией) ----------
function chronoRich(t, log) {
  let text = '', marks = [];
  const add = function (line) { if (text) text += '\n'; text += line; };
  log.forEach(function (l) {
    const when = fshort(l.at);
    if (l.kind === 'event') {
      const who = l.role === 'system' ? '' : ' · ' + l.who;
      add(when + '  · ' + (EVT[l.code] ? EVT[l.code](l.body || '') : l.code) + who);
      return;
    }
    const role = l.role === 'admin' ? 'մենեջեր' : 'աշխատակից';
    const to = l.role === 'staff' ? 'մենեջերին' : (t.assignee + (t.assignee2 ? ', ' + t.assignee2 : ''));
    let line = when + '  ' + l.who + ' (' + role + ') → ' + to + ': ';
    if (l.kind === 'text') { add(line + (l.body || '')); return; }
    const label = l.kind === 'voice' ? '🎤 լսել' : '🖼 բացել';
    if (text) text += '\n';
    const s = text.length + line.length;
    text += line + label + (l.body ? ' — ' + l.body : '');
    if (l.url) marks.push({ s: s, e: s + label.length, u: l.url });
  });
  if (text.length > 45000) { text = text.slice(0, 45000) + '\n… (շարունակությունը՝ «Քննարկումներ» թերթում)'; marks = marks.filter(function (m) { return m.e <= 45000; }); }
  const b = SpreadsheetApp.newRichTextValue().setText(text);
  marks.forEach(function (m) { setLink(b, text, m.s, m.e, m.u); });
  return b.build();
}
function renderArchive(d) {
  const H = ['№', 'Առաջադրանք', 'Կատարող', 'Ստեղծվել', 'Զեկուցվել', 'Ավարտ', 'Արխիվ', '🎤 Ձայնային', '🖼 Ֆոտո', 'Քրոնոլոգիա (ով ինչ ում ասաց)'];
  const sh = prepare(SH_ARCH, '🗄 ԱՐԽԻՎ', H, [42, 260, 150, 105, 105, 105, 105, 110, 90, 640]);
  const arch = d.tasks.filter(function (t) { return t.archived_at; }).sort(function (a, b) { return String(b.archived_at).localeCompare(String(a.archived_at)); });
  const by = {}; d.log.forEach(function (l) { (by[l.task_id] = by[l.task_id] || []).push(l); });
  const rows = [], vo = [], ph = [], ch = [];
  arch.forEach(function (t, i) {
    rows.push([i + 1, t.title, t.assignee + (t.assignee2 ? ', ' + t.assignee2 : ''), fd(t.created_at), fd(t.report_at), fd(t.done_at), fd(t.archived_at), '', '', '']);
    vo.push([linksRich(t.voices, '🎤')]); ph.push([linksRich(t.photos, '🖼')]); ch.push([chronoRich(t, by[t.id] || [])]);
  });
  put(sh, rows, H.length);
  if (rows.length) {
    sh.getRange(DATA, 8, rows.length, 1).setRichTextValues(vo);
    sh.getRange(DATA, 9, rows.length, 1).setRichTextValues(ph);
    sh.getRange(DATA, 10, rows.length, 1).setRichTextValues(ch);
  }
  lockedNote(sh, H.length);
}

// ---------- Հաշվետվություն: շաբաթական / ամսական (по сотрудникам) ----------
function ymdOf(iso) { return Utilities.formatDate(new Date(iso), TZ, 'yyyy-MM-dd'); }
function weekKey(ymd) {            // понедельник той недели, yyyy-MM-dd
  const p = ymd.split('-'); const t = Date.UTC(+p[0], +p[1] - 1, +p[2]); const wd = (new Date(t).getUTCDay() + 6) % 7;
  const m = new Date(t - wd * 864e5); return m.getUTCFullYear() + '-' + ('0' + (m.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + m.getUTCDate()).slice(-2);
}
function weekLabel(mon) {
  const p = mon.split('-'); const t = Date.UTC(+p[0], +p[1] - 1, +p[2]); const e = new Date(t + 6 * 864e5); const s = new Date(t);
  const f = function (x) { return ('0' + x.getUTCDate()).slice(-2) + '.' + ('0' + (x.getUTCMonth() + 1)).slice(-2); };
  return f(s) + ' – ' + f(e) + '.' + e.getUTCFullYear();
}
const REPORT_H = ['Շրջան', 'Աշխատակից', 'Հերթափոխ', 'Ժամ', 'Կմ (հոդաչափ)', 'Առաջադրանք տրված', 'Կատարված', 'Ժամկետում', 'Ժամկետանց (չկատարված)',
  'Բացում, ր (միջին)', 'Աշխատանքի ֆոտո', 'Գնումներ', 'Գումար ֏', 'Չհանձնված'];
// mode: 'week' | 'month'. Возвращает строки: период по убыванию, внутри — по имени.
function reportRows(d, mode) {
  const keyOf = function (iso) { const y = ymdOf(iso); return mode === 'week' ? weekKey(y) : y.slice(0, 7); };
  const people = d.staff.filter(function (s) { return s.status === 'approved'; }).map(function (s) { return s.name; });
  const m = {};
  const cell = function (k, who) {
    const id = k + '|' + who;
    return m[id] || (m[id] = { k: k, who: who, days: {}, hrs: 0, km: 0, given: 0, done: 0, ontime: 0, late: 0, opens: [], ph: 0, nb: 0, sb: 0, open: 0 });
  };
  const today = ymdOf(d.now);
  d.shifts.forEach(function (s) {
    if (!s.who) return;
    const c = cell(keyOf(s.start_at), s.who); c.days[ymdOf(s.start_at)] = 1;
    const end = s.end_at ? new Date(s.end_at).getTime() : Math.min(new Date(d.now).getTime(), new Date(s.start_at).getTime() + 16 * 36e5);
    c.hrs += (end - new Date(s.start_at).getTime()) / 36e5;
    if (s.start_odo != null && s.end_odo != null && s.end_odo >= s.start_odo) c.km += s.end_odo - s.start_odo;
  });
  d.tasks.forEach(function (t) {
    [[t.assignee, t.seen], [t.assignee2, t.seen2]].forEach(function (a) {
      if (!a[0]) return;
      const c = cell(keyOf(t.created_at), a[0]); c.given++;
      if (a[1]) { const mm = (new Date(a[1]).getTime() - new Date(t.created_at).getTime()) / 60000; if (mm >= 0) c.opens.push(mm); }
      if (t.status === 'done' && (t.done_at || t.archived_at)) {
        const dn = t.done_at || t.archived_at; const cd = cell(keyOf(dn), a[0]); cd.done++;
        if (!t.due || ymdOf(dn) <= String(t.due).slice(0, 10)) cd.ontime++;
      }
      if (t.status === 'new' && !t.archived_at && t.due && String(t.due).slice(0, 10) < today) cell(keyOf(String(t.due).slice(0, 10) + 'T12:00:00Z'), a[0]).late++;
    });
  });
  (d.photos || []).forEach(function (p) { if (p.who) cell(keyOf(p.at), p.who).ph++; });
  d.purchases.forEach(function (b) {
    if (b.status === 'cancelled' || !b.who) return;
    const c = cell(keyOf(b.at), b.who); c.nb++; c.sb += num(b.amount);
    if (b.status === 'bought' || b.status === 'partial') c.open++;
  });
  const keys = {}; Object.keys(m).forEach(function (id) { keys[m[id].k] = 1; });
  const order = Object.keys(keys).sort().reverse().slice(0, mode === 'week' ? 16 : 12);
  const rows = [];
  order.forEach(function (k) {
    const names = people.slice(); Object.keys(m).forEach(function (id) { if (m[id].k === k && names.indexOf(m[id].who) < 0) names.push(m[id].who); });
    names.sort().forEach(function (who) {
      const c = m[k + '|' + who]; if (!c) return;
      const avg = c.opens.length ? Math.round(c.opens.reduce(function (a, b) { return a + b; }, 0) / c.opens.length) : '';
      rows.push([mode === 'week' ? weekLabel(k) : k, who, Object.keys(c.days).length, Math.round(c.hrs * 10) / 10, Math.round(c.km), c.given, c.done, c.ontime, c.late, avg, c.ph, c.nb, Math.round(c.sb), c.open]);
    });
  });
  return rows;
}
function renderReport(d, mode) {
  const sh = prepare(mode === 'week' ? SH_WEEK : SH_MONTH, mode === 'week' ? '📈 ՇԱԲԱԹԱԿԱՆ ՀԱՇՎԵՏՎՈՒԹՅՈՒՆ' : '📈 ԱՄՍԱԿԱՆ ՀԱՇՎԵՏՎՈՒԹՅՈՒՆ', REPORT_H, [150, 150, 90, 80, 100, 110, 100, 100, 130, 110, 110, 90, 100, 100]);
  const rows = reportRows(d, mode);
  put(sh, rows, REPORT_H.length);
  lockedNote(sh, REPORT_H.length);
}
function renderWeekly(d) { renderReport(d, 'week'); }
function renderMonthly(d) { renderReport(d, 'month'); }

// ---------- Աշխատակիցներ ----------
function renderStaff(d) {
  const H = ['Անուն', 'Հեռախոս', 'Կարգավիճակ', 'Մեքենա', 'Ծախս (լ/100)'];
  const sh = prepare(SH_EMP, '👥 ԱՇԽԱՏԱԿԻՑՆԵՐ', H, [200, 140, 120, 180, 100]);
  const label = { approved: 'Հաստատված', pending: 'Սպասում է', rejected: 'Մերժված', blocked: 'Արգելափակված' };
  put(sh, d.staff.map(function (s) { return [s.name, String(s.phone || ''), label[s.status] || s.status, s.car || '', s.norm == null ? '' : s.norm]; }), H.length);
  if (d.staff.length) sh.getRange(DATA, 2, d.staff.length, 1).setNumberFormat('@');
  lockedNote(sh, H.length);
}

// ---------- Ճանապարհ ----------
function renderTrips(d) {
  const H = ['Ամսաթիվ', 'Աշխատակից', 'Սկիզբ', 'Ավարտ', 'Հոդ. սկիզբ', 'Հոդ. ավարտ', 'Կմ (հոդաչափ)', 'Կմ (պատվերներ)', 'Կմ (GPS)', 'Գրասենյակից սկզբում, մ'];
  const sh = prepare(SH_TRIPS, '🚗 ՃԱՆԱՊԱՐՀ ԵՎ ՓՈԽԵՐ', H, [95, 160, 70, 70, 100, 100, 100, 110, 90, 130]);
  const items = d.shifts.slice().sort(function (a, b) { return String(b.start_at).localeCompare(String(a.start_at)); });
  put(sh, items.map(function (s) {
    return [fd(s.start_at), s.who, fhm(s.start_at), s.end_at ? fhm(s.end_at) : 'ընթացքում', s.start_odo == null ? '' : s.start_odo, s.end_odo == null ? '' : s.end_odo,
      s.end_odo != null && s.start_odo != null ? s.end_odo - s.start_odo : '', s.route_km == null ? '' : num(s.route_km), s.gps_km == null ? '' : num(s.gps_km), s.start_dist == null ? '' : s.start_dist];
  }), H.length);
  lockedNote(sh, H.length);
}

// ---------- Վառելիք ----------
function renderFuel(d) {
  const H = ['Ամսաթիվ', 'Ժամ', 'Աշխատակից', 'Լիտր', 'Գումար ֏', '֏ / լ'];
  const sh = prepare(SH_FUEL, '⛽ ՎԱՌԵԼԻՔ', H, [95, 60, 170, 80, 110, 80]);
  const items = d.fuel.slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  put(sh, items.map(function (f) { return [fd(f.at), fhm(f.at), f.who, num(f.liters), num(f.amount), num(f.liters) ? Math.round(num(f.amount) / num(f.liters)) : '']; }), H.length);
  lockedNote(sh, H.length);
}

// ---------- Գնումներ ----------
function renderBuys(d) {
  const H = ['Ամսաթիվ', 'Աշխատակից', 'Մատակարար', 'Գումար ֏', 'Կարգավիճակ', 'Ուր', 'Ապրանք', 'Փաստաթուղթ'];
  const sh = prepare(SH_BUYS, '🧾 ԳՆՈՒՄՆԵՐ', H, [95, 160, 170, 100, 110, 130, 360, 100]);
  const items = d.purchases.slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  const rows = [], docs = [];
  items.forEach(function (b) {
    const lines = (b.lines || []).map(function (x) { return x.name + ' — ' + x.qty + (x.unit ? ' ' + x.unit : ''); }).join('\n');
    rows.push([fd(b.at), b.who, b.supplier, num(b.amount), (BUY_STATUS[b.status] || b.status) + (b.shortage ? ' (պակասորդ)' : ''), (BUY_DEST[b.dest] || b.dest) + (b.site ? ': ' + b.site : ''), lines, '']);
    docs.push([b.photo ? linksRich([b.photo], '🧾 ') : plainRich('')]);
  });
  put(sh, rows, H.length);
  if (rows.length) sh.getRange(DATA, 8, rows.length, 1).setRichTextValues(docs);
  lockedNote(sh, H.length);
}

// ---------- ՎԻՃԱԿԱԳՐՈՒԹՅՈՒՆ (по месяцам, считается автоматически) ----------
function renderSummary(d) {
  const H = ['Ամիս', 'Ստեղծված առաջադրանք', 'Կատարված', 'Ժամկետանց կատարված', 'Կմ (հոդաչափ)', 'Վառելիք, լ', 'Վառելիք, ֏', 'Գնումներ, ֏'];
  const sh = prepare(SH_STAT, '📊 ՎԻՃԱԿԱԳՐՈՒԹՅՈՒՆ (ԱՎՏՈՄԱՏ ՀԱՇՎԱՐԿ)', H, [100, 140, 110, 150, 120, 110, 120, 120]);
  const m = {};
  const key = function (iso) { return iso ? Utilities.formatDate(new Date(iso), TZ, 'yyyy-MM') : null; };
  const row = function (k) { return m[k] || (m[k] = { c: 0, d: 0, late: 0, km: 0, l: 0, fm: 0, b: 0 }); };
  d.tasks.forEach(function (t) {
    row(key(t.created_at)).c++;
    if (t.status === 'done' && (t.done_at || t.archived_at)) {
      const r = row(key(t.done_at || t.archived_at)); r.d++;
      if (t.due && String(t.done_at || t.archived_at).slice(0, 10) > String(t.due).slice(0, 10)) r.late++;
    }
  });
  d.shifts.forEach(function (s) { if (s.end_odo != null && s.start_odo != null) row(key(s.start_at)).km += s.end_odo - s.start_odo; });
  d.fuel.forEach(function (f) { const r = row(key(f.at)); r.l += num(f.liters); r.fm += num(f.amount); });
  d.purchases.forEach(function (b) { if (b.status !== 'cancelled') row(key(b.at)).b += num(b.amount); });
  const keys = Object.keys(m).sort().reverse().slice(0, 24);
  put(sh, keys.map(function (k) { const r = m[k]; return [k, r.c, r.d, r.late, r.km, Math.round(r.l * 10) / 10, Math.round(r.fm), Math.round(r.b)]; }), H.length);
  lockedNote(sh, H.length);
}

// ==================== ПРАВКИ ИЗ ТАБЛИЦЫ ====================
function parseDue(v) {
  if (v === '' || v == null) return { ok: true, v: null };
  if (Object.prototype.toString.call(v) === '[object Date]') return { ok: true, v: Utilities.formatDate(v, TZ, 'yyyy-MM-dd') };
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (m) return { ok: true, v: m[3] + '-' + p2(+m[2]) + '-' + p2(+m[1]) };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: true, v: s };
  return { ok: false };
}
function splitNames(v) { return String(v || '').split(/[,;\n]/).map(function (x) { return x.trim(); }).filter(Boolean); }

function onEditInstalled(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== SH_TASKS) return;
  const r0 = e.range.getRow(), nr = e.range.getNumRows(), c0 = e.range.getColumn(), nc = e.range.getNumColumns();
  if (r0 + nr - 1 < DATA) return;
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(25000)) { toast('Զբաղված է, կրկնեք մի փոքր հետո'); return; }
  let changed = false;
  try {
    for (let r = Math.max(r0, DATA); r < r0 + nr; r++) {
      const cols = [];
      for (let c = c0; c < c0 + nc; c++) if ([C_TITLE, C_WHO, C_DUE, C_ST, C_PRIO].indexOf(c) >= 0) cols.push(c);
      if (!cols.length) continue;
      try { if (handleRow(sh, r, cols)) changed = true; } catch (err) { toast('⚠ ' + err.message); changed = true; }
    }
    if (changed) syncLocked();
  } catch (err) { toast('⚠ ' + err.message); }
  finally { lock.releaseLock(); }
}

function handleRow(sh, row, cols) {
  const v = sh.getRange(row, 1, 1, C_ID).getValues()[0];
  const id = String(v[C_ID - 1] || '').trim();
  const title = String(v[C_TITLE - 1] || '').trim();
  const names = splitNames(v[C_WHO - 1]);
  if (!id) {
    // новая задача: нужны название и исполнитель
    if (!title) return false;
    if (!names.length) { toast('Ընտրեք կատարողին «Կատարող» սյունակում, որպեսզի առաջադրանքը ստեղծվի'); return false; }
    const due = parseDue(v[C_DUE - 1]); if (!due.ok) throw new Error('Ամսաթիվը պետք է լինի օր.ամիս.տարի');
    const st = String(v[C_ST - 1] || '').trim();
    if (st && st !== ST_NEW) throw new Error('Նոր առաջադրանքը պետք է սկսվի «' + ST_NEW + '» կարգավիճակով');
    const res = api('create_task', { title: title, staff_name: names[0], staff2_name: names[1] || '', due: due.v, priority: PRIO_CODE[String(v[C_PRIO - 1] || '').trim()] || 'normal' });
    sh.getRange(row, C_ID).setValue(res.id); // чтобы повторная правка не создала дубль
    toast('✅ Առաջադրանքը ստեղծվեց, աշխատակիցը ծանուցվեց');
    return true;
  }
  const patch = {};
  cols.forEach(function (c) {
    if (c === C_TITLE) { if (!title) throw new Error('Առաջադրանքի անունը դատարկ չի կարող լինել'); patch.title = title; }
    if (c === C_WHO) { if (!names.length) throw new Error('Կատարողը պարտադիր է'); patch.staff_name = names[0]; patch.staff2_name = names[1] || ''; }
    if (c === C_DUE) { const d = parseDue(v[C_DUE - 1]); if (!d.ok) throw new Error('Ամսաթիվը պետք է լինի օր.ամիս.տարի'); patch.due = d.v; }
    if (c === C_ST) { const code = STATUS_CODE[String(v[C_ST - 1] || '').trim()]; if (!code) throw new Error('Ընտրեք կարգավիճակը ցանկից'); patch.status = code; }
    if (c === C_PRIO) { const code = PRIO_CODE[String(v[C_PRIO - 1] || '').trim()]; if (!code) throw new Error('Ընտրեք առաջնահերթությունը ցանկից'); patch.priority = code; }
  });
  api('update_task', { id: id, patch: patch });
  toast(patch.status === 'done' ? '✔ Առաջադրանքը ընդունվեց և տեղափոխվեց արխիվ' : '✅ Պահպանվեց, աշխատակիցը ծանուցվեց');
  return true;
}

// ==================== УСТАНОВКА ====================
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Arev')
      .addItem('🔄 Թարմացնել հիմա', 'syncAll')
      .addItem('⚙ Տեղադրել / վերանորոգել', 'setup')
      .addToUi();
  } catch (e) { /* без окна */ }
}

function setup() {
  if (/ВАШ_ПРОЕКТ|ВСТАВЬТЕ/.test(API_URL + SECRET)) throw new Error('Заполните API_URL и SECRET в начале файла');
  api('ping'); // проверка связи и секрета: при ошибке установка остановится с понятным текстом
  try { ss().setSpreadsheetTimeZone(TZ); } catch (e) { /* нет */ }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const f = t.getHandlerFunction();
    if (f === 'syncAll' || f === 'onEditInstalled') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncAll').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('onEditInstalled').forSpreadsheet(ss()).onEdit().create();
  syncAll();
  toast('Պատրաստ է ✅ Աղյուսակը թարմացվում է ավտոմատ');
}
