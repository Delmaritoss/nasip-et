/* Nasip Et: the visitor's own table. Shared by the home page and /menu/.
   State lives only in this browser (localStorage). Nothing is sent anywhere. */
(function () {
  'use strict';
  var doc = document;
  var lang = doc.documentElement.lang === 'tr' ? 'tr' : 'en';
  var KEY = 'nasip.table.v1';
  var T = {
    en: { added: 'On your table', add: 'Add to my table', items: 'dishes', remove: 'Remove one', more: 'Add one' },
    tr: { added: 'Sofranda', add: 'Soframa ekle', items: 'yemek', remove: 'Bir azalt', more: 'Bir ekle' }
  }[lang];

  var data = [];
  try { data = JSON.parse(doc.getElementById('menu-data').textContent); } catch (e) { data = []; }
  var MENU = {};
  data.forEach(function (d) { MENU[d.id] = d; });

  var fmt = new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { style: 'currency', currency: 'TRY', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });
  function money(n) { return fmt.format(n || 0); }
  // The waiter's card is Turkish whatever the page language, numbers included (₺1.300, not ₺1,300).
  var fmtTr = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });
  function moneyTr(n) { return fmtTr.format(n || 0); }

  // ---------------------------------------------------------------- store
  var state = load();
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || '{}');
      var out = {};
      Object.keys(s).forEach(function (id) { if (MENU[id] && s[id] > 0) out[id] = Math.min(20, s[id] | 0); });
      return out;
    } catch (e) { return {}; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode: the table still works for this visit */ } }
  function lines() { return Object.keys(state).map(function (id) { return { id: id, qty: state[id], item: MENU[id] }; }); }
  function count() { return lines().reduce(function (a, l) { return a + l.qty; }, 0); }
  function total() { return lines().reduce(function (a, l) { return a + l.qty * (l.item.p || 0); }, 0); }
  function emit(type, id) { doc.dispatchEvent(new CustomEvent('nasip:table', { detail: { type: type, id: id, state: state } })); }

  function add(id) {
    if (!MENU[id] || MENU[id].na) return;
    state[id] = Math.min(20, (state[id] || 0) + 1);
    save(); render(); emit('add', id); bump();
  }
  function dec(id) {
    if (!state[id]) return;
    state[id] -= 1;
    if (state[id] <= 0) delete state[id];
    save(); render(); emit('remove', id);
  }
  function clear() { state = {}; save(); render(); emit('clear'); }

  // --------------------------------------------------------------- render
  var adisyon = doc.querySelector('[data-adisyon]');
  var pad = doc.querySelector('[data-adisyon-toggle]');
  var panel = doc.getElementById('adisyon-panel');

  function bump() {
    if (!adisyon) return;
    adisyon.classList.remove('is-bump'); void adisyon.offsetWidth; adisyon.classList.add('is-bump');
  }

  function name(item) { return item.tr; }

  function render() {
    var n = count(), t = total();
    doc.querySelectorAll('[data-count]').forEach(function (el) { el.textContent = n; });
    doc.querySelectorAll('[data-total]').forEach(function (el) { el.textContent = money(t); });
    if (adisyon) adisyon.classList.toggle('has-food', n > 0);
    var list = doc.querySelector('[data-lines]');
    if (list) {
      list.innerHTML = '';
      lines().forEach(function (l) {
        var li = doc.createElement('li');
        li.className = 'line';
        var price = l.item.p ? money(l.item.p * l.qty) : '';
        li.innerHTML =
          '<span class="line__name" lang="tr"></span>' +
          '<span class="line__sub"></span>' +
          '<span class="line__qty"><button type="button" data-dec aria-label="' + T.remove + '">−</button><output></output><button type="button" data-inc aria-label="' + T.more + '">+</button></span>';
        li.querySelector('.line__name').textContent = name(l.item);
        li.querySelector('.line__sub').textContent = (lang === 'en' && l.item.en !== l.item.tr ? l.item.en + ' · ' : '') + price;
        li.querySelector('output').textContent = l.qty;
        li.querySelector('[data-dec]').addEventListener('click', function () { dec(l.id); });
        li.querySelector('[data-inc]').addEventListener('click', function () { add(l.id); });
        list.appendChild(li);
      });
    }
    doc.querySelectorAll('[data-add]').forEach(function (b) {
      var q = state[b.getAttribute('data-add')] || 0;
      b.setAttribute('data-qty', q);
      if (b.classList.contains('btn')) {
        if (!b.dataset.label) b.dataset.label = b.textContent;
        b.classList.toggle('is-done', q > 0);
        b.textContent = q > 0 ? T.added + ' · ' + q : b.dataset.label;
      }
    });
    doc.querySelectorAll('[data-waiter]').forEach(function (b) { b.disabled = n === 0; });
  }

  // ------------------------------------------------------------- adisyon
  function setOpen(open) {
    if (!pad || !panel) return;
    pad.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.hidden = !open;
  }
  if (pad) pad.addEventListener('click', function () { setOpen(pad.getAttribute('aria-expanded') !== 'true'); });
  doc.addEventListener('click', function (e) {
    // composedPath is fixed at dispatch, so a line button that re-rendering removed still counts as inside.
    if (adisyon && pad && pad.getAttribute('aria-expanded') === 'true' && e.composedPath().indexOf(adisyon) === -1) setOpen(false);
  });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pad && pad.getAttribute('aria-expanded') === 'true') { setOpen(false); pad.focus(); } });
  if (panel) panel.querySelectorAll('nav a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });

  // -------------------------------------------------------------- waiter
  var dialog = doc.querySelector('[data-waiter-dialog]');
  function openWaiter() {
    if (!dialog || !count()) return;
    var ul = dialog.querySelector('[data-waiter-lines]');
    ul.innerHTML = '';
    lines().forEach(function (l) {
      var li = doc.createElement('li');
      var a = doc.createElement('span'); a.textContent = l.qty + ' × ' + l.item.tr;
      var b = doc.createElement('span'); b.textContent = l.item.p ? moneyTr(l.item.p * l.qty) : '';
      li.appendChild(a); li.appendChild(b); ul.appendChild(li);
    });
    dialog.querySelector('[data-waiter-total]').textContent = moneyTr(total());
    setOpen(false);
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
  }
  doc.addEventListener('click', function (e) {
    var w = e.target.closest('[data-waiter]');
    if (w) { openWaiter(); return; }
    var a = e.target.closest('[data-add]');
    if (a) { add(a.getAttribute('data-add')); return; }
    if (e.target.closest('[data-clear]')) { clear(); return; }
    if (e.target.closest('[data-waiter-close]') && dialog) { dialog.close ? dialog.close() : dialog.removeAttribute('open'); }
  });
  if (dialog) dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

  // ----------------------------------------------------------- phrasebook
  // Only offered when the device really has a Turkish voice; otherwise the
  // buttons stay hidden and the written phrase is the whole feature.
  function trVoice() {
    if (!('speechSynthesis' in window)) return null;
    var v = speechSynthesis.getVoices().filter(function (x) { return /^tr(-|_|$)/i.test(x.lang); });
    return v[0] || null;
  }
  function wireSpeech() {
    var voice = trVoice();
    doc.querySelectorAll('[data-say]').forEach(function (b) { b.hidden = !voice; });
    return voice;
  }
  if ('speechSynthesis' in window) {
    wireSpeech();
    speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', wireSpeech);
    doc.addEventListener('click', function (e) {
      var b = e.target.closest('[data-say]');
      if (!b) return;
      var voice = trVoice();
      if (!voice) return;
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(b.getAttribute('data-say'));
      u.voice = voice; u.lang = voice.lang; u.rate = 0.88;
      speechSynthesis.speak(u);
    });
  }

  render();
  window.NasipTable = { add: add, dec: dec, clear: clear, lines: lines, menu: MENU, money: money, get state() { return state; } };
  emit('init');
})();
