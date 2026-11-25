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
// The real address of the site. Canonical links, hreflang, the sitemap and the structured data use it,
// so a search engine always credits www.nasipetkebap.com (the hostname connected to the Worker), never a preview copy.
const SITE = arg('--site', 'https://www.nasipetkebap.com').replace(/\/$/, '');
// Every root-relative href/src in the templates is rewritten onto BASE.
const rebase = (html) => {
  let out = BASE === '/' ? html : html.replace(/(\s)(href|src|srcset|data-src|data-src-m|data-sc-src|data-sc-src-mobile|data-film|data-film-m|poster)="\/(?!\/)/g, `$1$2="${BASE}`);
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
// sold_out is what the CMS writes (a checkbox that defaults to off); available:false is the old spelling.
const soldOut = (it) => it.sold_out === true || it.available === false;
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
      const na = soldOut(it);
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
const pathOf = (code, page) => `${prefixOf(code)}${page === 'home' ? '' : page + '/'}`;
const OG_LOCALE = { en: 'en_US', tr: 'tr_TR', it: 'it_IT', es: 'es_ES', de: 'de_DE', ru: 'ru_RU', ar: 'ar_AR' };
// Everything a search engine or a chat app reads in <head>: canonical, every language version
// (absolute, with x-default), and the share card.
function alternates(page, t) {
  const title = page === 'home' ? t.title : page === 'menu' ? t.menu_title : t.gallery_title;
  const desc = page === 'home' ? t.desc : page === 'menu' ? t.menu_desc : t.gallery_desc;
  const url = SITE + pathOf(t.lang, page);
  return [
    `<link rel="canonical" href="${url}">`,
    ...LANGS.map((l) => `<link rel="alternate" hreflang="${l.code}" href="${SITE}${pathOf(l.code, page)}">`),
    `<link rel="alternate" hreflang="x-default" href="${SITE}${pathOf('en', page)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Nasip Et Kebap &amp; Pide Salonu">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${SITE}/assets/og.jpg">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:locale" content="${OG_LOCALE[t.lang]}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join('\n');
}

const FAQ_N = 6;
const faqHtml = (t) => Array.from({ length: FAQ_N }, (_, i) => `
        <div class="faq__item"><h3>${esc(t['faq_q' + (i + 1)])}</h3><p>${esc(t['faq_a' + (i + 1)])}</p></div>`).join('');

// The gallery comes from data/gallery.json, which the owner edits in /admin (Sveltia CMS).
// Photos he uploads land in assets/uploads/ (already webp, max 2000 px, from the CMS); the build
// makes a 640 px thumbnail for each one when sharp is installed, and reads the real size for width/height.
function imageSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
      const k = b.toString('ascii', 12, 16);
      if (k === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
      if (k === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
      if (k === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
    }
    if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
    if (b[0] === 0xff && b[1] === 0xd8) {
      for (let i = 2; i < b.length - 9;) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1], len = b.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
        i += 2 + len;
      }
    }
  } catch (e) { /* missing file: fall back below */ }
  return [640, 853];
}
const GALLERY = JSON.parse(read('data/gallery.json')).items || [];
const THUMBS = [];   // [source, dist target] pairs made after the copy, when sharp is available
let sharp = null;
try { sharp = (await import('sharp')).default; } catch (e) { /* no sharp: thumbnails fall back to the full photo */ }
const local = (url) => path.join(ROOT, String(url).replace(/^\//, ''));
function galleryHtml(t) {
  let n = 0;
  return GALLERY.filter((g) => (g.type === 'video' ? g.video : g.image)).map((g) => {
    if (g.type === 'video') {
      const poster = g.poster ? ` poster="${esc(g.poster)}"` : '';
      // No poster: let the browser fetch the first frame so the tile is not black.
      return `<figure class="gal__item gal__item--video"><video muted loop playsinline preload="${g.poster ? 'none' : 'metadata'}"${poster} data-gal-video><source src="${esc(g.video)}${g.poster ? '' : '#t=0.1'}" type="video/mp4"></video></figure>`;
    }
    n += 1;
    let thumb = g.thumb;
    if (!thumb && sharp && fs.existsSync(local(g.image))) {
      thumb = g.image.replace(/^\/assets\/uploads\//, '/assets/uploads/_s/').replace(/\.[a-z0-9]+$/i, '.webp');
      if (thumb === g.image) thumb = null; else THUMBS.push([local(g.image), thumb]);
    }
    const [w, h] = imageSize(local(thumb && fs.existsSync(local(thumb)) ? thumb : g.image));
    const alt = g.alt ? g.alt : `${t.gallery_alt} ${n}`;
    return `<figure class="gal__item"><button type="button" class="gal__open" data-full="${esc(g.image)}" aria-label="${esc(t.gallery_open)} ${n}"><img src="${esc(thumb || g.image)}" alt="${esc(alt)}" width="640" height="${Math.round(640 * h / w)}" loading="lazy" decoding="async"></button></figure>`;
  }).join('\n      ');
}

const menuJson = () => JSON.stringify(ITEMS.map((i) => ({ id: i.id, s: i.section, tr: i.tr, en: i.en, p: i.price || null, na: soldOut(i) || undefined })))
  .replace(/</g, '\\u003c');

// Structured data. One Restaurant entity (same @id on every page and language), plus the FAQ on the
// home page and the priced menu on /menu/. No self-written rating: Google ignores it for a business's own site.
const RESTAURANT_ID = `${SITE}/#restaurant`;
const restaurant = (t) => ({
  '@type': 'Restaurant', '@id': RESTAURANT_ID,
  name: 'Nasip Et Kebap & Pide Salonu', alternateName: ['Nasip Et Kebap', 'Nasipet Kebap Salonu', 'Nasip Et'],
  description: t.desc,
  url: SITE + prefixOf(t.lang), hasMenu: SITE + pathOf(t.lang, 'menu'),
  image: [`${SITE}/assets/og.jpg`, `${SITE}/assets/photos/room-walk-0.webp`, `${SITE}/assets/photos/sign-walk-0.webp`],
  logo: `${SITE}/assets/favicon.svg`,
  servesCuisine: ['Turkish', 'Kebab', 'Pide', 'Lahmacun', 'Grill'], priceRange: '₺₺',
  telephone: '+905425764141',
  address: { '@type': 'PostalAddress', streetAddress: 'Kumkapı Mh, Çakmaktaşı Sk. No:6', addressLocality: 'Fatih', addressRegion: 'İstanbul', postalCode: '34126', addressCountry: 'TR' },
  geo: { '@type': 'GeoCoordinates', latitude: 41.0039418, longitude: 28.9651816 },
  hasMap: 'https://www.google.com/maps/search/?api=1&query=41.0039418%2C28.9651816',
  openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '00:00', closes: '23:59' }],
  areaServed: ['Fatih', 'Kumkapı', 'Sultanahmet', 'Beyazıt', 'Eminönü', 'İstanbul'],
  sameAs: ['https://www.instagram.com/nasipetkebap/'],
});
const ld = (graph) => JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
const ldJson = (t) => ld([
  restaurant(t),
  { '@type': 'FAQPage', '@id': `${SITE}${prefixOf(t.lang)}#faq`, inLanguage: t.lang,
    mainEntity: Array.from({ length: FAQ_N }, (_, i) => ({ '@type': 'Question', name: t['faq_q' + (i + 1)],
      acceptedAnswer: { '@type': 'Answer', text: t['faq_a' + (i + 1)] } })) },
]);
const ldMenu = (t) => ld([
  { '@type': 'Menu', '@id': `${SITE}${pathOf(t.lang, 'menu')}#menu`, name: t.menu_title, inLanguage: t.lang,
    url: SITE + pathOf(t.lang, 'menu'), isPartOf: { '@id': RESTAURANT_ID },
    hasMenuSection: MENU.sections.map((s) => ({ '@type': 'MenuSection', name: t.lang === 'tr' ? s.tr : `${s.tr} · ${t['sec_' + s.id] || s.en}`,
      hasMenuItem: s.items.filter((i) => !soldOut(i)).map((i) => ({ '@type': 'MenuItem', name: i.tr,
        ...(i.en && i.en !== i.tr && t.lang !== 'tr' ? { alternateName: i.en } : {}),
        ...(i.desc_en && t.lang === 'en' ? { description: i.desc_en } : {}),
        ...(i.price ? { offers: { '@type': 'Offer', price: i.price, priceCurrency: 'TRY' } } : {}) })) })) },
  { ...restaurant(t) },
]);

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
    lang_menu: langMenu(t, 'home'), alternates: alternates('home', t), faq_html: faqHtml(t),
  }));
  write(`${prefix}menu/index.html`, render(menu, t, {
    ...common, adisyon_html: adisyonHtml(t, 'menu'), menu_html: menuHtml(t), menu_index_html: menuIndexHtml(t),
    phrases_html: phrasesHtml(t), lang_menu: langMenu(t, 'menu'), alternates: alternates('menu', t), ld_menu: ldMenu(t),
  }));
  write(`${prefix}gallery/index.html`, render(gallery, t, {
    ...common, gallery_html: galleryHtml(t), lang_menu: langMenu(t, 'gallery'), alternates: alternates('gallery', t),
  }));
}
// A page for broken links (Cloudflare serves it as the 404), in English with a way back in every language.
write('404.html', `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Not found · Nasip Et Kebap &amp; Pide Salonu</title>
<link rel="stylesheet" href="/scrollcraft.css"><link rel="stylesheet" href="/css/site.css"></head>
<body class="page-menu"><main class="menu" style="min-height:80vh;display:grid;place-content:center;text-align:center;gap:1rem">
<h1 class="h-display">This page is not on the menu.</h1>
<p>${LANGS.map((l) => `<a class="link" href="${prefixOf(l.code)}" lang="${l.code}">${esc(l.label)}</a>`).join(' · ')}</p>
</main></body></html>`);
// The sitemap lists every page in every language, each with its siblings, so all 21 get found.
if (!NOINDEX) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = ['home', 'menu', 'gallery'].flatMap((page) => LANGS.map((l) => `  <url>
    <loc>${SITE}${pathOf(l.code, page)}</loc>
    <lastmod>${today}</lastmod>
${LANGS.map((o) => `    <xhtml:link rel="alternate" hreflang="${o.code}" href="${SITE}${pathOf(o.code, page)}"/>`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${pathOf('en', page)}"/>
  </url>`));
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`);
  fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${SITE}/sitemap.xml\n`);
}
for (const d of ['css', 'js', 'assets', 'admin']) copyDir(path.join(ROOT, d), path.join(DIST, d));
// Thumbnails for the photos the owner uploaded through /admin (built here, never committed).
const made = new Set();
for (const [src, url] of THUMBS) {
  if (made.has(url)) continue; made.add(url);
  const out = path.join(DIST, url.replace(/^\//, ''));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(src).rotate().resize({ width: 640, withoutEnlargement: true }).webp({ quality: 74 }).toFile(out);
}
for (const f of ['scrollcraft.js', 'scrollcraft.css']) fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f));
if (fs.existsSync(path.join(ROOT, 'src/_headers'))) fs.copyFileSync(path.join(ROOT, 'src/_headers'), path.join(DIST, '_headers'));
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
console.log(`built ${ITEMS.length} menu items → ${path.relative(ROOT, DIST)}/ (${LANGS.length} languages) base ${BASE}${NOINDEX ? ' noindex' : ''}`);
