// Builds the static site: EN at /, TR at /tr/, menu pages from data/menu.json.
// Usage: node build.mjs                                   → dist/ for the real domain (Cloudflare Pages)
//        node build.mjs --out docs --base /nasip-et/ --noindex → docs/ for the GitHub Pages preview
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const DIST = path.join(ROOT, arg('--out', 'dist'));
const BASE = arg('--base', '/');                 // site root; '/nasip-et/' on GitHub Pages
const NOINDEX = argv.includes('--noindex');      // a preview must not compete with the real domain in search
// Every root-relative href/src in the templates is rewritten onto BASE.
const rebase = (html) => {
  let out = BASE === '/' ? html : html.replace(/(\s)(href|src|data-src|data-src-m)="\/(?!\/)/g, `$1$2="${BASE}`);
  if (NOINDEX) out = out.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex, nofollow">');
  return out;
};
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const I18N = JSON.parse(read('src/i18n.json'));
const MENU = JSON.parse(read('data/menu.json'));

const TRMAP = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'İ': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'Ç': 'c', 'Ğ': 'g', 'Ö': 'o', 'Ş': 's', 'Ü': 'u' };
const slug = (s) => s.replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => TRMAP[c]).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Stable ids: section-id + dish slug.
const ITEMS = [];
for (const s of MENU.sections) for (const it of s.items) {
  it.id = `${s.id}-${slug(it.tr)}`;
  ITEMS.push({ ...it, section: s.id });
}
const byId = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
const need = (id) => { if (!byId[id]) throw new Error(`menu id not found: ${id}`); return byId[id]; };

const money = (lang, n) => new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
  style: 'currency', currency: 'TRY', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0,
}).format(n);
const minPrice = (sectionIds) => Math.min(...ITEMS.filter((i) => sectionIds.includes(i.section) && i.price).map((i) => i.price));

// ---------------------------------------------------------------- fragments
function railHtml(t) {
  const L = t.lang;
  const rows = [
    { name: 'Lahmacun', d: t.rail_lahmacun_d, price: money(L, need('lahmacun-lahmacun').price), add: 'lahmacun-lahmacun', cls: 'lahmacun', ph: 3 },
    { name: 'Pide', d: t.rail_pide_d, price: `${t.from} ${money(L, minPrice(['pide']))}`.trim(), add: 'pide-kasarli-pide', cls: 'pide', ph: 5 },
    { name: 'Kebap', d: t.rail_kebap_d, price: `${t.from} ${money(L, minPrice(['kebab']))}`.trim(), add: 'kebab-adana-urfa-kebap', cls: 'platter', ph: 7 },
    { name: 'Mezeler', d: t.rail_meze_d, price: `${t.from} ${money(L, minPrice(['meze']))}`.trim(), add: 'meze-humus', cls: 'meze-set', ph: 14 },
    { name: 'Künefe & çay', d: t.rail_sweet_d, price: `${money(L, need('dessert-kunefe').price)} · çay ${money(L, need('hot-drinks-cay').price)}`, add: 'dessert-kunefe', cls: 'kunefe', ph: 17 },
  ];
  return rows.map((r) => `
        <article class="dish">
          <div class="dish__plate food food--${r.cls}" data-ph="${r.ph}"><span>${esc(t.ph)} ${r.ph}</span></div>
          <div class="dish__tag paper">
            <h3 class="dish__name" lang="tr">${esc(r.name)}</h3>
            <p class="dish__d">${esc(r.d)}</p>
            <p class="dish__price">${esc(r.price)}</p>
            <button class="btn btn--ink btn--sm" type="button" data-add="${r.add}">${esc(t.add)}</button>
          </div>
        </article>`).join('');
}

const QUICK = ['lahmacun-lahmacun', 'pide-kasarli-pide', 'pide-kiymali-pide', 'pide-karisik-pide', 'kebab-adana-urfa-kebap',
  'kebab-beyti-kebap', 'kebab-iskender-kebap', 'kebab-alinazik', 'testi-et-testi', 'meze-humus', 'meze-haydari',
  'salad-coban-salata', 'soup-breakfast-mercimek-corbasi', 'dessert-kunefe', 'dessert-baklava', 'hot-drinks-cay', 'cold-drinks-ayran'];

function quickHtml(t) {
  return QUICK.map((id) => {
    const it = need(id);
    const sub = t.lang === 'en' && it.en !== it.tr ? `<span class="pick__en">${esc(it.en)}</span>` : '';
    return `<li><button class="pick" type="button" data-add="${id}"><span class="pick__tr" lang="tr">${esc(it.tr)}</span>${sub}<span class="pick__price">${esc(money(t.lang, it.price))}</span></button></li>`;
  }).join('');
}

function phrasesHtml(t) {
  return MENU.phrasebook.map((p) => `<li class="phrase"><span class="phrase__tr" lang="tr">${esc(p.tr)}</span><span class="phrase__en">${esc(p.en)}</span><button class="phrase__say" type="button" data-say="${esc(p.tr)}" hidden>${esc(t.listen)}</button></li>`).join('');
}

function adisyonHtml(t, page) {
  const home = page === 'home' ? '' : t.home_href;
  return `
<div class="adisyon" data-adisyon>
  <button class="adisyon__pad" type="button" aria-expanded="false" aria-controls="adisyon-panel" data-adisyon-toggle>
    <span class="adisyon__title">${esc(t.adisyon)}</span>
    <span class="adisyon__sum"><span data-count>0</span> ${esc(t.adisyon_items)} · <span data-total>${money(t.lang, 0)}</span></span>
  </button>
  <div class="adisyon__panel paper" id="adisyon-panel" hidden>
    <nav class="adisyon__nav" aria-label="${esc(t.adisyon)}">
      <a href="${t.menu_href}">${esc(t.nav_menu)}</a>
      <a href="${home}#table">${esc(t.nav_table)}</a>
      <a href="${home}#find">${esc(t.nav_find)}</a>
    </nav>
    <p class="adisyon__empty" data-empty>${esc(t.table_empty)}</p>
    <ul class="adisyon__lines" role="list" data-lines></ul>
    <p class="adisyon__total"><span>${esc(t.total)}</span> <span data-total>${money(t.lang, 0)}</span></p>
    <button class="btn btn--red" type="button" data-waiter>${esc(t.show_waiter)}</button>
  </div>
</div>`;
}

function waiterHtml(t) {
  return `
<dialog class="waiter" data-waiter-dialog aria-labelledby="waiter-hello">
  <div class="waiter__card paper">
    <p class="waiter__help">${esc(t.waiter_help)}</p>
    <p class="waiter__hello" id="waiter-hello" lang="tr">Merhaba! Sipariş verebilir miyim?</p>
    <ul class="waiter__lines" role="list" lang="tr" data-waiter-lines></ul>
    <p class="waiter__total" lang="tr"><span>Toplam</span> <span data-waiter-total></span></p>
    <p class="waiter__thanks" lang="tr">Teşekkürler!</p>
    <button class="btn btn--ink" type="button" data-waiter-close>${esc(t.waiter_close)}</button>
  </div>
</dialog>`;
}

function menuHtml(t) {
  const L = t.lang;
  return MENU.sections.map((s) => {
    const items = s.items.map((it) => {
      const na = it.available === false;
      const price = na ? t.menu_unavailable : it.price ? money(L, it.price) : t.menu_ask;
      const en = L === 'en' && it.en !== it.tr ? `<span class="mitem__en">${esc(it.en)}</span>` : '';
      const desc = L === 'en' && it.desc_en ? `<span class="mitem__desc">${esc(it.desc_en)}</span>` : '';
      const add = na ? '' : `<button class="mitem__add" type="button" data-add="${it.id}" aria-label="${esc(t.add)}: ${esc(it.tr)}">+</button>`;
      return `<li class="mitem${na ? ' is-na' : ''}" data-search="${esc((it.tr + ' ' + it.en + ' ' + slug(it.tr)).toLowerCase())}">
          <span class="mitem__names"><span class="mitem__tr" lang="tr">${esc(it.tr)}</span>${en}${desc}</span>
          <span class="mitem__lead" aria-hidden="true"></span>
          <span class="mitem__price">${esc(price)}</span>${add}
        </li>`;
    }).join('');
    const sub = L === 'en' ? ` <span class="msec__en">${esc(s.en)}</span>` : '';
    return `
    <section class="msec" id="${s.id}" aria-labelledby="h-${s.id}">
      <h2 class="msec__h" id="h-${s.id}"><span lang="tr">${esc(s.tr)}</span>${sub}</h2>
      <ul class="msec__list" role="list">${items}</ul>
    </section>`;
  }).join('');
}

const menuIndexHtml = (t) => MENU.sections.map((s) => `<li><a href="#${s.id}">${esc(t.lang === 'en' ? s.en : s.tr)}</a></li>`).join('');

const menuJson = () => JSON.stringify(ITEMS.map((i) => ({ id: i.id, s: i.section, tr: i.tr, en: i.en, p: i.price ?? null, na: i.available === false || undefined })))
  .replace(/</g, '\\u003c');

const ldJson = (t) => JSON.stringify({
  '@context': 'https://schema.org', '@type': 'Restaurant',
  name: 'Nasip Et Kebap & Pide Salonu', servesCuisine: ['Turkish', 'Kebab', 'Pide'], priceRange: '₺₺',
  telephone: '+90 542 576 41 41', url: t.home_href, hasMenu: t.menu_href,
  address: { '@type': 'PostalAddress', streetAddress: 'Kumkapı Mh, Çakmaktaşı Sk. No:6', addressLocality: 'Fatih', addressRegion: 'İstanbul', postalCode: '34126', addressCountry: 'TR' },
  geo: { '@type': 'GeoCoordinates', latitude: 41.0039418, longitude: 28.9651816 },
  sameAs: ['https://www.instagram.com/nasipetkebap/'],
}).replace(/</g, '\\u003c');

// ------------------------------------------------------------------ render
function render(tpl, t, extra) {
  const vars = { ...t, ...extra };
  return tpl
    .replace(/<!--if:(\w+)-->([\s\S]*?)<!--\/if-->/g, (_, l, body) => (l === t.lang ? body : ''))
    .replace(/\{\{\{(\w+)\}\}\}/g, (_, k) => { if (!(k in vars)) throw new Error(`missing raw ${k}`); return vars[k]; })
    .replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in vars)) throw new Error(`missing key ${k}`); return esc(vars[k]); });
}

function write(rel, html) {
  const out = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, rebase(html));
}

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else if (!e.name.startsWith('_raw')) fs.copyFileSync(s, d);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
const home = read('src/index.html');
const menu = read('src/menu.html');
for (const lang of ['en', 'tr']) {
  const t = I18N[lang];
  const prefix = lang === 'en' ? '' : 'tr/';
  const common = { menu_json: menuJson(), waiter_html: waiterHtml(t) };
  write(`${prefix}index.html`, render(home, t, {
    ...common, adisyon_html: adisyonHtml(t, 'home'), rail_html: railHtml(t), quick_html: quickHtml(t),
    phrases_html: phrasesHtml(t), testi_id: 'testi-et-testi', ld_json: ldJson(t),
  }));
  write(`${prefix}menu/index.html`, render(menu, t, {
    ...common, adisyon_html: adisyonHtml(t, 'menu'), menu_html: menuHtml(t), menu_index_html: menuIndexHtml(t),
  }));
}
for (const d of ['css', 'js', 'assets']) copyDir(path.join(ROOT, d), path.join(DIST, d));
for (const f of ['scrollcraft.js', 'scrollcraft.css']) fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f));
if (fs.existsSync(path.join(ROOT, 'src/_headers'))) fs.copyFileSync(path.join(ROOT, 'src/_headers'), path.join(DIST, '_headers'));
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
console.log(`built ${ITEMS.length} menu items → ${path.relative(ROOT, DIST)}/ (en, tr) base ${BASE}${NOINDEX ? ' noindex' : ''}`);
