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
  let out = BASE === '/' ? html : html.replace(/(\s)(href|src|srcset|data-src|data-src-m|data-sc-src|data-sc-src-mobile|data-film|data-film-m)="\/(?!\/)/g, `$1$2="${BASE}`);
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

// The languages of the site. en is the root; the others live under /<code>/.
const LANGS = [
  { code: 'en', label: 'English', locale: 'en-US' },
  { code: 'tr', label: 'Türkçe', locale: 'tr-TR' },
  { code: 'it', label: 'Italiano', locale: 'it-IT' },
  { code: 'es', label: 'Español', locale: 'es-ES' },
  { code: 'de', label: 'Deutsch', locale: 'de-DE' },
  { code: 'ru', label: 'Русский', locale: 'ru-RU' },
  { code: 'ar', label: 'العربية', locale: 'ar', dir: 'rtl' },
];
const LOCALE = Object.fromEntries(LANGS.map((l) => [l.code, l.locale]));
const prefixOf = (code) => (code === 'en' ? '/' : `/${code}/`);
const money = (lang, n) => new Intl.NumberFormat(lang === 'ar' ? 'ar-u-nu-latn' : (LOCALE[lang] || 'en-US'), {
  style: 'currency', currency: 'TRY', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0,
}).format(n);
const minPrice = (sectionIds) => Math.min(...ITEMS.filter((i) => sectionIds.includes(i.section) && i.price).map((i) => i.price));

// ---------------------------------------------------------------- fragments
// The hero lamps (rendered in Blender, tools/lamps.py). x / hang are % of the screen (hang = where the
// globe hangs), s = size; m* = phone placement (null hides the lamp on phones); order = light-up order.
const LAMPS = [
  // depth   palette     x   hang  s     mx  mhang  ms    order  glow
  ['far',  'pearl',     14,  10,  0.42,  16,  7,  0.40,  3, '#f2e7d2'],
  ['far',  'amber',     35,   8,  0.38,  40,  5,  0.36,  5, '#ffaa3c'],
  ['far',  'iznik',     62,  11,  0.44,  64,  8,  0.40,  2, '#38d2cf'],
  ['far',  'ruby',      85,   9,  0.40,  88,  6,  0.38,  6, '#ff3b36'],
  ['mid',  'carnival',   7,  21,  0.80,  10, 15,  0.74,  1, '#ffd23a'],
  ['mid',  'ruby',      24,  16,  0.70, null, 0,  0,     7, '#ff3b36'],
  ['mid',  'amber',     77,  19,  0.76,  86, 14,  0.72,  4, '#ffa040'],
  ['mid',  'iznik',     93,  23,  0.82, null, 0,  0,     8, '#38d2cf'],
  ['near', 'pearl',      2,  41,  1.50,   3, 27,  1.35,  9, '#f3eadb'],
  ['near', 'carnival',  98,  38,  1.42,  97, 25,  1.30, 10, '#ffd23a'],
];
function lampsHtml(depths) {
  return LAMPS.filter((l) => depths.includes(l[0])).map(([d, pal, x, hang, s, mx, mh, ms, order, glow]) => `
      <div class="lamp lamp--${d}" data-depth="${d}" data-x="${x}" data-hang="${hang}" data-s="${s}"${mx === null ? ' data-mhide' : ` data-mx="${mx}" data-mhang="${mh}" data-ms="${ms}"`} data-order="${order}" data-glow="${glow}" aria-hidden="true">
        <img class="lamp__off" src="/assets/lamps/lamp-${pal}-off.webp" alt="" width="520" height="1218">
        <img class="lamp__on" src="/assets/lamps/lamp-${pal}-on.webp" alt="" width="520" height="1218">
      </div>`).join('');
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
      <a href="${t.home_href}">${esc(t.back_home)}</a>
      <a href="${t.home_href}#find">${esc(t.nav_find)}</a>
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
      const en = L !== 'tr' && it.en !== it.tr ? `<span class="mitem__en">${esc(it.en)}</span>` : '';
      const desc = L === 'en' && it.desc_en ? `<span class="mitem__desc">${esc(it.desc_en)}</span>` : '';
      const add = na ? '' : `<button class="mitem__add" type="button" data-add="${it.id}" aria-label="${esc(t.add)}: ${esc(it.tr)}">+</button>`;
      return `<li class="mitem${na ? ' is-na' : ''}" data-search="${esc((it.tr + ' ' + it.en + ' ' + slug(it.tr)).toLowerCase())}">
          <span class="mitem__names"><span class="mitem__tr" lang="tr">${esc(it.tr)}</span>${en}${desc}</span>
          <span class="mitem__lead" aria-hidden="true"></span>
          <span class="mitem__price">${esc(price)}</span>${add}
        </li>`;
    }).join('');
    const sub = L !== 'tr' ? ` <span class="msec__en">${esc(t['sec_' + s.id] || s.en)}</span>` : '';
    return `
    <section class="msec" id="${s.id}" aria-labelledby="h-${s.id}">
      <h2 class="msec__h" id="h-${s.id}"><span lang="tr">${esc(s.tr)}</span>${sub}</h2>
      <ul class="msec__list" role="list">${items}</ul>
    </section>`;
  }).join('');
}

const menuIndexHtml = (t) => MENU.sections.map((s) => `<li><a href="#${s.id}">${esc(t.lang === 'tr' ? s.tr : (t['sec_' + s.id] || s.en))}</a></li>`).join('');

// A language menu that links to the same page in every language.
function langMenu(t, page) {
  const tail = page === 'home' ? '' : `${page}/`;
  const cur = LANGS.find((l) => l.code === t.lang);
  const items = LANGS.map((l) => `<li><a href="${prefixOf(l.code)}${tail}" hreflang="${l.code}" lang="${l.code}"${l.code === t.lang ? ' aria-current="page"' : ''}>${esc(l.label)}</a></li>`).join('');
  return `<details class="langs"><summary aria-label="${esc(t.lang_label)}">${esc(cur.label)}</summary><ul role="list">${items}</ul></details>`;
}
const alternates = (page) => LANGS.map((l) => `<link rel="alternate" hreflang="${l.code}" href="${prefixOf(l.code)}${page === 'home' ? '' : page + '/'}">`).join('\n');

const GALLERY = ['11', '01', '02', '05', '12', '03', '04', '13', '06', '07', '08', '14', '09', '10'];
const GAL_H = { '13': 480 };
function galleryHtml(t) {
  const photos = GALLERY.map((n, i) => `<figure class="gal__item"><button type="button" class="gal__open" data-full="/assets/gallery/g${n}.webp" aria-label="${esc(t.gallery_open)} ${i + 1}"><img src="/assets/gallery/g${n}-s.webp" alt="${esc(t.gallery_alt)} ${i + 1}" width="640" height="${GAL_H[n] || 853}" loading="lazy"></button></figure>`);
  const vid = (src, poster) => `<figure class="gal__item gal__item--video"><video muted loop playsinline preload="none" poster="${poster}" data-gal-video><source src="${src}" type="video/mp4"></video></figure>`;
  photos.splice(2, 0, vid('/assets/video/room-walk-m.mp4', '/assets/photos/room-walk-0-m.webp'));
  photos.splice(7, 0, vid('/assets/video/sign-walk.mp4', '/assets/photos/sign-walk-0.webp'));
  return photos.join('\n      ');
}

const menuJson = () => JSON.stringify(ITEMS.map((i) => ({ id: i.id, s: i.section, tr: i.tr, en: i.en, p: i.price ?? null, na: i.available === false || undefined })))
  .replace(/</g, '\\u003c');

const ldJson = (t) => JSON.stringify({
  '@context': 'https://schema.org', '@type': 'Restaurant',
  name: 'Nasip Et Kebap & Pide Salonu', servesCuisine: ['Turkish', 'Kebab', 'Pide'], priceRange: '₺₺',
  telephone: '+90 542 576 41 41', url: t.home_href, hasMenu: t.menu_href,
  address: { '@type': 'PostalAddress', streetAddress: 'Kumkapı Mh, Çakmaktaşı Sk. No:6', addressLocality: 'Fatih', addressRegion: 'İstanbul', postalCode: '34126', addressCountry: 'TR' },
  geo: { '@type': 'GeoCoordinates', latitude: 41.0039418, longitude: 28.9651816 },
  openingHours: 'Mo-Su 00:00-24:00',
  sameAs: ['https://www.instagram.com/nasipetkebap/'],
}).replace(/</g, '\\u003c');

// ------------------------------------------------------------------ render
function render(tpl, t, extra) {
  const vars = { ...t, ...extra };
  return tpl
    .replace(/<!--if:(!?)(\w+)-->([\s\S]*?)<!--\/if-->/g, (_, neg, l, body) => ((l === t.lang) !== !!neg ? body : ''))
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
    if (e.name.startsWith('_raw')) continue;   // originals and renders stay local
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
const home = read('src/index.html');
const menu = read('src/menu.html');
const gallery = read('src/gallery.html');
const EN = I18N.en;
for (const L of LANGS) {
  const lang = L.code;
  const t = { ...EN, ...I18N[lang], lang, dir: L.dir || 'ltr',
    home_href: prefixOf(lang), menu_href: `${prefixOf(lang)}menu/`, gallery_href: `${prefixOf(lang)}gallery/` };
  const prefix = lang === 'en' ? '' : `${lang}/`;
  const font_extra = lang === 'ar' ? '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Sans+Arabic:wght@400..700&display=swap">' : '';
  const common = { menu_json: menuJson(), waiter_html: waiterHtml(t), font_extra };
  write(`${prefix}index.html`, render(home, t, {
    ...common, lamps_far: lampsHtml(['far']), lamps_near: lampsHtml(['mid', 'near']), ld_json: ldJson(t),
    lang_menu: langMenu(t, 'home'), alternates: alternates('home'),
  }));
  write(`${prefix}menu/index.html`, render(menu, t, {
    ...common, adisyon_html: adisyonHtml(t, 'menu'), menu_html: menuHtml(t), menu_index_html: menuIndexHtml(t),
    phrases_html: phrasesHtml(t), lang_menu: langMenu(t, 'menu'), alternates: alternates('menu'),
  }));
  write(`${prefix}gallery/index.html`, render(gallery, t, {
    ...common, gallery_html: galleryHtml(t), lang_menu: langMenu(t, 'gallery'), alternates: alternates('gallery'),
  }));
}
for (const d of ['css', 'js', 'assets']) copyDir(path.join(ROOT, d), path.join(DIST, d));
for (const f of ['scrollcraft.js', 'scrollcraft.css']) fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f));
if (fs.existsSync(path.join(ROOT, 'src/_headers'))) fs.copyFileSync(path.join(ROOT, 'src/_headers'), path.join(DIST, '_headers'));
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
console.log(`built ${ITEMS.length} menu items → ${path.relative(ROOT, DIST)}/ (en, tr) base ${BASE}${NOINDEX ? ' noindex' : ''}`);
