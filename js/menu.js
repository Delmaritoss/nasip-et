/* /menu/: search across Turkish and English names; works without JS as a plain list. */
(function () {
  'use strict';
  var input = document.querySelector('[data-menu-search]');
  var none = document.querySelector('[data-menu-none]');
  if (!input) return;
  var fold = function (s) {
    return s.toLowerCase().replace(/[çğıiöşü]/g, function (c) { return { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'i': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u' }[c]; }).replace(/i̇/g, 'i');
  };
  var items = Array.prototype.slice.call(document.querySelectorAll('.mitem')).map(function (li) {
    return { li: li, key: fold(li.getAttribute('data-search') || ''), sec: li.closest('.msec') };
  });
  var secs = Array.prototype.slice.call(document.querySelectorAll('.msec'));
  input.addEventListener('input', function () {
    var q = fold(input.value.trim());
    var shown = 0;
    items.forEach(function (it) { var hit = !q || it.key.indexOf(q) !== -1; it.li.hidden = !hit; if (hit) shown++; });
    secs.forEach(function (s) { s.hidden = !s.querySelector('.mitem:not([hidden])'); });
    none.hidden = shown > 0;
  });
})();
