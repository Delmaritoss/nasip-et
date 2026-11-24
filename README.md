# Nasip Et Kebap & Pide Salonu

Website for Nasip Et Kebap & Pide Salonu, Kumkapı, Fatih, İstanbul. English at `/`, Turkish at `/tr/`, full menu at `/menu/`.

Preview (not indexed by search engines): https://delmaritoss.github.io/nasip-et/

## Editing

- Menu and prices: `data/menu.json`
- Texts in both languages: `src/i18n.json`
- Pages: `src/index.html`, `src/menu.html`

## Building

```sh
node build.mjs                                            # dist/ for the real domain
node build.mjs --out docs --base /nasip-et/ --noindex     # docs/ for the GitHub Pages preview
```

Images marked "photo N" are placeholders until the real photographs are in.
