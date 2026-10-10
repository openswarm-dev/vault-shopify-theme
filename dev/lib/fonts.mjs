// Local stand-in for Shopify's font library (fonts.shopifycdn.com).
// font_picker handles ("unbounded_n7", "plus_jakarta_sans_i4") become FontDrops; `font_url` / `font_face` point at
// /__font/<handle>.woff2, which the server fills from Google Fonts (latin subset, fetched once, cached in memory),
// so the preview renders the real typefaces while the theme only ever talks to Shopify's font filters.

// Variants Shopify's library offers for the families the theme ships with (shopify.dev › settings › fonts).
// Unknown families are assumed to have n1–n9 and i1–i9. font_modify returns nil for a missing variant, like Shopify.
const range = (prefix, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
const LIBRARY = {
  unbounded: range('n', 2, 9),
  manrope: range('n', 2, 8),
  archivo: [...range('n', 1, 9), ...range('i', 1, 9)],
  chakra_petch: [...range('n', 3, 7), ...range('i', 3, 7)],
  space_grotesk: range('n', 3, 7),
  syne: range('n', 4, 8),
  oswald: range('n', 2, 7),
  bebas_neue: ['n4'],
  inter: [...range('n', 1, 9), ...range('i', 1, 9)],
  dm_sans: [...range('n', 1, 9), ...range('i', 1, 9)],
  plus_jakarta_sans: [...range('n', 2, 8), ...range('i', 2, 8)],
  roboto_mono: [...range('n', 1, 7), ...range('i', 1, 7)],
  ibm_plex_mono: [...range('n', 1, 7), ...range('i', 1, 7)],
  space_mono: ['n4', 'i4', 'n7', 'i7'],
  assistant: range('n', 2, 8),
};
const UPPER = new Set(['dm', 'ibm', 'pt', 'eb', 'im', 'ms', 'ii']);

export function parseHandle(handle) {
  const m = /^(.+?)_([ni])([1-9])$/.exec(String(handle || ''));
  const slug = m ? m[1] : String(handle || 'assistant');
  const style = m && m[2] === 'i' ? 'italic' : 'normal';
  const weight = m ? Number(m[3]) * 100 : 400;
  const family = slug.split('_').map((w) => (UPPER.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
  return { slug, family, style, weight };
}

export const handleFor = (slug, style, weight) => `${slug}_${style === 'italic' ? 'i' : 'n'}${Math.round(weight / 100)}`;

export function hasVariant(slug, style, weight) {
  if (!(weight >= 100 && weight <= 900 && weight % 100 === 0)) return false;
  const list = LIBRARY[slug];
  return list ? list.includes(handleFor(slug, style, weight).slice(slug.length + 1)) : true;
}

export const fontFileUrl = (handle) => `/__font/${handle}.woff2`;

const cache = new Map(); // handle → Promise<Buffer|null>
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function download(handle) {
  const { slug, family, style, weight } = parseHandle(handle);
  if (!hasVariant(slug, style, weight)) return null;
  const spec = style === 'italic' ? `ital,wght@1,${weight}` : `wght@${weight}`;
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:${spec}&display=swap`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!css.ok) return null;
  const text = await css.text();
  const latin = /\/\*\s*latin\s*\*\/\s*@font-face\s*{[^}]*?url\((https:[^)]+\.woff2)\)/.exec(text) || /url\((https:[^)]+\.woff2)\)/.exec(text);
  if (!latin) return null;
  const file = await fetch(latin[1], { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
  return file.ok ? Buffer.from(await file.arrayBuffer()) : null;
}

/** Resolves to the woff2 bytes for a library handle, or null (offline, unknown family or missing variant). */
export function fontFile(handle) {
  if (!/^[a-z0-9_]+$/.test(handle)) return Promise.resolve(null);
  if (!cache.has(handle)) {
    const p = download(handle).catch(() => null);
    cache.set(handle, p);
    p.then((buf) => { if (!buf) setTimeout(() => cache.delete(handle), 60_000); });
  }
  return cache.get(handle);
}
