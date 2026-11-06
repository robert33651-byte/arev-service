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
  var keys = Object.keys(D).filter(function (k) { return k && /[А-Яа-яЁё]/.test(k) && D[k]; });
  keys.sort(function (a, b) { return b.length - a.length; });
  var CYR = 'А-Яа-яЁё';
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); }
  var re = keys.length ? new RegExp(keys.map(function (k) {
    var p = esc(k);
    if (/^[А-Яа-яЁё]/.test(k)) p = '(?<![' + CYR + '])' + p;
    if (/[А-Яа-яЁё]$/.test(k)) p += '(?![' + CYR + '])';
    return p;
  }).join('|'), 'g') : null;
  var cache = Object.create(null);
  function t(s) {
    if (!s || !re || !/[А-Яа-яЁё]/.test(s)) return s;
    var c = cache[s]; if (c !== undefined) return c;
    var out = s.replace(re, function (m) { return D[m]; });
    if (out === s) { // фрагмент мог быть записан без пробелов по краям
      var m2 = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
      if (m2 && D[m2[2]]) out = m2[1] + D[m2[2]] + m2[3];
    }
    if (Object.keys(cache).length > 5000) cache = Object.create(null);
    cache[s] = out; return out;
  }
  window.tr = t;
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  function node(n) {
    if (n.nodeType === 3) {
      var p = n.parentNode && n.parentNode.nodeName;
      if (p === 'SCRIPT' || p === 'STYLE') return;
      var v = n.nodeValue, o = t(v); if (o !== v) n.nodeValue = o;
    } else if (n.nodeType === 1) {
      var nm = n.nodeName; if (nm === 'SCRIPT' || nm === 'STYLE') return;
      for (var i = 0; i < ATTRS.length; i++) {
        var a = n.getAttribute(ATTRS[i]);
        if (a) { var b = t(a); if (b !== a) n.setAttribute(ATTRS[i], b); }
      }
      if (nm === 'INPUT' && (n.type === 'button' || n.type === 'submit') && n.value) n.value = t(n.value);
      for (var c = n.firstChild; c; c = c.nextSibling) node(c);
    }
  }
  var obs = new MutationObserver(function (list) {
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.type === 'characterData') node(m.target);
      else if (m.type === 'attributes') { var a = m.target.getAttribute(m.attributeName); if (a) { var b = t(a); if (b !== a) m.target.setAttribute(m.attributeName, b); } }
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
