// Язык админки: русский (по умолчанию) или армянский. Переключатель — в «Настройках».
// Исходные тексты в коде русские; при армянском языке все тексты на странице
// (включая окна, уведомления и подсказки) переводятся по словарю hy.js сразу после появления.
(function () {
  var KEY = 'arevadm.lang';
  var lang = 'ru';
  try { var v = JSON.parse(localStorage.getItem(KEY)); if (v === 'hy' || v === 'ru') lang = v; } catch (e) {}
  window.ARLANG = lang;
  window.setAdminLang = function (l) {
    if (l !== 'ru' && l !== 'hy') return;
    try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) {}
    location.reload();
  };
  if (lang !== 'hy') return;
  document.documentElement.lang = 'hy';
  var D = window.HY_DICT || {};
  var CY = /[А-Яа-яЁё]/, WORD = /[А-Яа-яЁё]+/g;
  function letters(k) { return k.replace(/[^А-Яа-яЁё]/g, '').length; }
  // Индекс: первое русское слово фразы → фразы (длинные вперёд). Поиск идёт по словам текста,
  // а не одним огромным регулярным выражением: на телефоне это в десятки раз быстрее.
  var IDX = Object.create(null);
  Object.keys(D).forEach(function (k) {
    if (!k || !D[k] || !CY.test(k)) return;
    var L = letters(k);
    if (L === 1 && k === k.toUpperCase() && k.length === 1) return;   // буквы-метки на карте: только точное совпадение
    var m = /[А-Яа-яЁё]+/.exec(k);
    (IDX[m[0]] = IDX[m[0]] || []).push({ k: k, pre: m.index, short: L <= 3, b0: CY.test(k[0]), b1: CY.test(k[k.length - 1]) });
  });
  Object.keys(IDX).forEach(function (w) { IDX[w].sort(function (a, b) { return b.k.length - a.k.length; }); });
  // Длинные фразы переводятся всегда. Короткие слова (в, с, из, мин, км…) — только рядом с цифрами
  // или в тексте, где уже нашлась фраза интерфейса: иначе они портили бы имена и тексты сотрудников.
  function pass(s, shortOk) {
    var out = '', last = 0, hit = false, m, i, c, st, en;
    WORD.lastIndex = 0;
    while ((m = WORD.exec(s))) {
      var list = IDX[m[0]]; if (!list) continue;
      for (i = 0; i < list.length; i++) {
        c = list[i]; if (c.short !== shortOk) continue;
        st = m.index - c.pre; if (st < last) continue;
        if (!s.startsWith(c.k, st)) continue;
        en = st + c.k.length;
        if (c.b0 && st > 0 && CY.test(s[st - 1])) continue;
        if (c.b1 && en < s.length && CY.test(s[en])) continue;
        out += s.slice(last, st) + D[c.k]; last = en; hit = true; WORD.lastIndex = Math.max(en, m.index + 1);
        break;
      }
    }
    return hit ? out + s.slice(last) : s;
  }
  var cache = Object.create(null), cacheN = 0;
  function t(s) {
    if (!s || !CY.test(s)) return s;
    var c = cache[s]; if (c !== undefined) return c;
    var out, m2 = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (D[m2[2]]) out = m2[1] + D[m2[2]] + m2[3];   // текст целиком есть в словаре
    else {
      out = pass(s, false);
      if (out !== s || /\d/.test(s)) out = pass(out, true);
      else { var o2 = pass(out, true); if (!CY.test(o2)) out = o2; }   // короткая подпись целиком из коротких слов («по GPS», «— нет —»)
      if (out !== s) out = out.replace(/([^\s]) {2,}/g, '$1 ');
    }
    if (++cacheN > 5000) { cache = Object.create(null); cacheN = 0; }
    cache[s] = out; return out;
  }
  window.tr = t;
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  function node(n) {
    if (n.nodeType === 3) {
      var pe = n.parentNode, p = pe && pe.nodeName;
      if (p === 'SCRIPT' || p === 'STYLE' || p === 'TEXTAREA') return;
      if (pe && pe.closest && pe.closest('[data-noi18n]')) return;
      var v = n.nodeValue, o = t(v); if (o !== v) n.nodeValue = o;
    } else if (n.nodeType === 1) {
      var nm = n.nodeName; if (nm === 'SCRIPT' || nm === 'STYLE') return;
      // то, что ввёл человек (заметки, расшифровки, названия задач), не переводим
      if (n.hasAttribute('data-noi18n') || n.isContentEditable) return;
      for (var i = 0; i < ATTRS.length; i++) {
        var a = n.getAttribute(ATTRS[i]);
        if (a) { var b = t(a); if (b !== a) n.setAttribute(ATTRS[i], b); }
      }
      if (nm === 'INPUT' && (n.type === 'button' || n.type === 'submit') && n.value) n.value = t(n.value);
      if (nm === 'TEXTAREA') return;   // подсказку (placeholder) перевели выше, а введённый текст не трогаем
      for (var c = n.firstChild; c; c = c.nextSibling) node(c);
    }
  }
  var obs = new MutationObserver(function (list) {
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.type === 'characterData') node(m.target);
      else if (m.type === 'attributes') { if (m.target.closest && m.target.closest('[data-noi18n]')) continue; var a = m.target.getAttribute(m.attributeName); if (a) { var b = t(a); if (b !== a) m.target.setAttribute(m.attributeName, b); } }
      else for (var j = 0; j < m.addedNodes.length; j++) node(m.addedNodes[j]);
    }
  });
  function start() {
    document.title = t(document.title);
    node(document.body);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
