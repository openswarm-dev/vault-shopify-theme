// Shopify filters for liquidjs. Each filter runs with `this` = { context, token, liquid }.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { toValue } from 'liquidjs';
import { ColorDrop, ImageDrop, MetafieldDrop, FontDrop, OptionValueDrop, TemplateDrop, parseColor, rgbToHsl, hslToRgb } from './drops.mjs';
import { placeholderSvg, artSize, esc } from '../mock/art.mjs';
import { handleize, mockImageFor, stripHtml, buildShop } from '../mock/store.mjs';
import { translate, DIRS, rel, exists, readText } from './theme.mjs';
import { record } from './errors.mjs';

export const RS = Symbol.for('vault.requestState');

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
// Unwrap generic drops to their value, but keep rich drops (images, colors, metafields, fonts) intact.
const v = (x) => (x instanceof ImageDrop || x instanceof ColorDrop || x instanceof MetafieldDrop || x instanceof FontDrop ? x : toValue(x));
function split(args) {
  const pos = [];
  const named = {};
  for (const a of args) {
    if (Array.isArray(a) && a.length === 2 && typeof a[0] === 'string') named[a[0]] = v(a[1]);
    else pos.push(v(a));
  }
  return { pos, named };
}
const rsOf = (self) => self?.context?.globals?.[RS] || null;
function where(self) {
  const t = self?.token;
  let line = null;
  try { line = t?.getPosition?.()[0] ?? null; } catch { /* ignore */ }
  return { file: t?.file ? rel(t.file) : null, line };
}
const attr = (name, value) => (value == null || value === false ? '' : value === true ? ` ${name}` : ` ${name}="${esc(value)}"`);
const num = (x) => {
  const n = Number(v(x));
  return Number.isFinite(n) ? n : 0;
};

/* ------------------------------------------------------------------ */
/* money                                                               */
/* ------------------------------------------------------------------ */
function delimit(cents, precision, thousands = ',', decimal = '.') {
  const fixed = (cents / 100).toFixed(precision);
  const [i, d] = fixed.split('.');
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
  return d ? `${int}${decimal}${d}` : int;
}
export function formatMoney(cents, format = '${{amount}}') {
  if (cents == null || cents === '') return '';
  const n = Number(v(cents));
  if (!Number.isFinite(n)) return '';
  return String(format).replace(/\{\{\s*(\w+)\s*\}\}/, (m, key) => {
    switch (key) {
      case 'amount_no_decimals': return delimit(n, 0);
      case 'amount_with_comma_separator': return delimit(n, 2, '.', ',');
      case 'amount_no_decimals_with_comma_separator': return delimit(n, 0, '.', ',');
      case 'amount_with_apostrophe_separator': return delimit(n, 2, "'", '.');
      case 'amount_with_space_separator': return delimit(n, 2, ' ', ',');
      case 'amount_no_decimals_with_space_separator': return delimit(n, 0, ' ', ',');
      default: return delimit(n, 2);
    }
  });
}
const MONEY_FORMAT = '${{amount}}';

/* ------------------------------------------------------------------ */
/* images                                                              */
/* ------------------------------------------------------------------ */
const urlToImage = new Map();
function rememberUrl(url, img) {
  if (urlToImage.size > 20000) urlToImage.clear();
  urlToImage.set(url, img);
}
/** Resolve anything image-ish to an ImageDrop (or { src } for external URLs). */
export function imageOf(input) {
  const x = v(input);
  if (x == null || x === '') return null;
  if (x instanceof ImageDrop) return x;
  if (typeof x === 'string') {
    if (/^(https?:)?\/\//.test(x) || x.startsWith('/')) {
      const m = x.match(/\/mock\/img\/([^/?#]+)\.svg/);
      if (m) return urlToImage.get(x) || new ImageDrop({ name: decodeURIComponent(m[1]) });
      return { src: x, width: null, height: null, alt: '' };
    }
    return mockImageFor(x);
  }
  if (typeof x === 'object') {
    if (x.preview_image && x.preview_image !== x) return imageOf(x.preview_image);
    if (x.featured_media) return imageOf(x.featured_media);
    if (x.featured_image) return imageOf(x.featured_image);
    if (x.image) return imageOf(x.image);
    if (x.src) return { src: String(x.src), width: x.width || null, height: x.height || null, alt: x.alt || '' };
  }
  return null;
}
function absolutize(src, self) {
  if (/^(https?:)?\/\//.test(src)) return src;
  const rs = rsOf(self);
  return `//${rs?.host || 'localhost:4173'}${src.startsWith('/') ? '' : '/'}${src}`;
}
function withParams(url, params) {
  const [base, hashPart] = url.split('#');
  const [p, q = ''] = base.split('?');
  const sp = new URLSearchParams(q);
  for (const [k, val] of Object.entries(params)) {
    if (val == null || val === '' || val === false) continue;
    sp.set(k, String(val));
  }
  const qs = sp.toString();
  return `${p}${qs ? `?${qs}` : ''}${hashPart ? `#${hashPart}` : ''}`;
}
function imageUrl(input, named, self) {
  const img = imageOf(input);
  if (!img) return '';
  const url = withParams(absolutize(img.src, self), {
    width: named.width ? Math.round(num(named.width)) : null,
    height: named.height ? Math.round(num(named.height)) : null,
    crop: named.crop || null,
    format: named.format || null,
    pad_color: named.pad_color || null,
  });
  if (img instanceof ImageDrop) rememberUrl(url, img);
  return url;
}
function legacySize(size) {
  const s = String(size || 'master');
  const named = { pico: 16, icon: 32, thumb: 50, small: 100, compact: 160, medium: 240, large: 480, grande: 600, '1024x1024': 1024, '2048x2048': 2048, master: null, original: null };
  if (s in named) return { width: named[s], height: named[s] };
  const m = s.match(/^(\d+)?x(\d+)?$/);
  if (m) return { width: m[1] ? +m[1] : null, height: m[2] ? +m[2] : null };
  return { width: null, height: null };
}
function imageTag(input, named, self) {
  let url = v(input);
  let img;
  if (url instanceof ImageDrop || (url && typeof url === 'object')) {
    img = imageOf(url);
    url = imageUrl(url, {}, self);
  } else {
    url = String(url ?? '');
    if (!url) return '';
    img = urlToImage.get(url) || imageOf(url);
  }
  const q = new URLSearchParams(url.split('?')[1] || '');
  const reqW = q.get('width') ? +q.get('width') : null;
  const reqH = q.get('height') ? +q.get('height') : null;
  const iw = img?.width || reqW || 1600;
  const ih = img?.height || reqH || Math.round(iw * 0.5625);
  const aspect = iw / ih;
  let width = reqW;
  let height = reqH;
  if (width && height) { /* cropped */ } else if (width) height = Math.round(width / aspect);
  else if (height) width = Math.round(height * aspect);
  else { width = iw; height = ih; }
  if (named.width != null && named.width !== '') width = Math.round(num(named.width));
  if (named.height != null && named.height !== '') height = Math.round(num(named.height));
  let srcset = '';
  const noSrcset = 'srcset' in named && (named.srcset == null || named.srcset === false);
  if (!noSrcset) {
    const maxW = Math.min(iw, reqW || iw);
    const widths = named.widths
      ? String(named.widths).split(',').map((s) => parseInt(s, 10)).filter((n) => n > 0)
      : [352, 832, 1200, 1920, 2560].filter((w) => w <= maxW);
    const list = widths.length ? widths : [maxW];
    srcset = list.map((w) => {
      const p = { width: w };
      if (reqH && reqW) p.height = Math.round((w * reqH) / reqW);
      return `${withParams(url, p)} ${w}w`;
    }).join(', ');
    if (typeof named.srcset === 'string') srcset = named.srcset;
  }
  const alt = 'alt' in named ? named.alt : img?.alt || '';
  const skip = new Set(['width', 'height', 'widths', 'srcset', 'alt', 'preload', 'sizes', 'loading', 'class', 'fetchpriority', 'decoding']);
  let extra = '';
  for (const [k, val] of Object.entries(named)) if (!skip.has(k)) extra += attr(k.replace(/_/g, '-'), val);
  return `<img src="${esc(url)}" alt="${esc(alt ?? '')}"${srcset ? ` srcset="${esc(srcset)}"` : ''} width="${width}" height="${height}"${attr('loading', named.loading)}${attr('fetchpriority', named.fetchpriority)}${attr('decoding', named.decoding)}${attr('class', named.class)}${attr('sizes', named.sizes)}${extra}>`;
}

/* ------------------------------------------------------------------ */
/* JSON serialisation (Shopify-ish drops)                              */
/* ------------------------------------------------------------------ */
function imageJson(img, self) {
  if (!img) return null;
  return {
    alt: img.alt || null,
    id: img.id ?? null,
    position: img.position ?? 1,
    product_id: img.product_id ?? null,
    src: absolutize(img.src, self),
    width: img.width,
    height: img.height,
    aspect_ratio: img.aspect_ratio ?? (img.width && img.height ? img.width / img.height : null),
    variant_ids: (img.variants || []).map((x) => x.id),
  };
}
function mediaJson(m, self) {
  if (!m) return null;
  const pi = { aspect_ratio: m.aspect_ratio, height: m.height, width: m.width, src: absolutize(m.src, self) };
  return { alt: m.alt || null, id: m.id, position: m.position, preview_image: pi, aspect_ratio: m.aspect_ratio, height: m.height, width: m.width, media_type: m.media_type || 'image', src: pi.src };
}
export function variantJson(x, self) {
  return {
    id: x.id, title: x.title, option1: x.option1, option2: x.option2, option3: x.option3, sku: x.sku,
    requires_shipping: x.requires_shipping, taxable: x.taxable,
    featured_image: x.featured_image ? imageJson(x.featured_image, self) : null,
    available: x.available, name: x.name, public_title: x.public_title, options: x.options,
    price: x.price, weight: x.weight, compare_at_price: x.compare_at_price,
    inventory_quantity: x.inventory_quantity, inventory_management: x.inventory_management, inventory_policy: x.inventory_policy,
    barcode: x.barcode, featured_media: x.featured_media ? { id: x.featured_media.id, preview_image: { src: absolutize(x.featured_media.src, self), width: x.featured_media.width, height: x.featured_media.height, aspect_ratio: x.featured_media.aspect_ratio } } : null,
    requires_selling_plan: false, selling_plan_allocations: [], quantity_rule: x.quantity_rule,
  };
}
export function productJson(p, self, { ajax = false } = {}) {
  const json = {
    id: p.id, title: p.title, handle: p.handle, description: p.description,
    published_at: p.published_at, created_at: p.created_at, vendor: p.vendor, type: p.type, tags: p.tags,
    price: p.price, price_min: p.price_min, price_max: p.price_max, available: p.available, price_varies: p.price_varies,
    compare_at_price: p.compare_at_price, compare_at_price_min: p.compare_at_price_min, compare_at_price_max: p.compare_at_price_max, compare_at_price_varies: p.compare_at_price_varies,
    variants: p.variants.map((x) => variantJson(x, self)),
    images: p.images.map((i) => absolutize(i.src, self)),
    featured_image: p.featured_image ? absolutize(p.featured_image.src, self) : null,
    options: ajax ? p.options_with_values.map((o) => ({ name: o.name, position: o.position, values: o.values.map((x) => x.name) })) : p.options,
    media: p.media.map((m) => mediaJson(m, self)),
    requires_selling_plan: false, selling_plan_groups: [],
    content: p.content, url: p.url,
  };
  if (ajax) json.product_type = p.type;
  return json;
}
export function toJson(value, self, depth = 0, seen = new WeakSet()) {
  const x = v(value);
  if (x == null) return null;
  if (typeof x !== 'object') return typeof x === 'function' ? undefined : x;
  if (x instanceof ColorDrop) return x.toCss();
  if (x instanceof ImageDrop) return imageJson(x, self);
  if (x instanceof MetafieldDrop) return x.value;
  if (x instanceof OptionValueDrop) return x.name;
  if (x instanceof TemplateDrop) return x.toString();
  if (x instanceof FontDrop) return { family: x.family, style: x.style, weight: x.weight };
  if (x instanceof Date) return x.toISOString();
  if (seen.has(x)) return null;
  if (x.object_type === 'product' && Array.isArray(x.variants)) return productJson(x, self);
  if (x.object_type === 'variant') return variantJson(x, self);
  if (x.object_type === 'collection') return { id: x.id, handle: x.handle, title: x.title, description: x.description, published_at: x.published_at, image: imageJson(x.image, self), products_count: x.products_count, url: x.url };
  if (depth > 6) return null;
  seen.add(x);
  let out;
  if (Array.isArray(x)) out = x.map((i) => toJson(i, self, depth + 1, seen) ?? null);
  else {
    out = {};
    for (const k of Object.keys(x)) {
      if (k.startsWith('__')) continue;
      const val = toJson(x[k], self, depth + 1, seen);
      if (val !== undefined) out[k] = val;
    }
  }
  seen.delete(x);
  return out;
}

/* ------------------------------------------------------------------ */
/* payment icons                                                       */
/* ------------------------------------------------------------------ */
const PAYMENT = {
  visa: ['Visa', '#1a1f71', '#fff', 'VISA'],
  master: ['Mastercard', '#111', '#fff', 'MC'],
  american_express: ['American Express', '#2e77bc', '#fff', 'AMEX'],
  paypal: ['PayPal', '#fff', '#003087', 'PayPal'],
  apple_pay: ['Apple Pay', '#000', '#fff', ' Pay'],
  google_pay: ['Google Pay', '#fff', '#3c4043', 'G Pay'],
  shopify_pay: ['Shop Pay', '#5a31f4', '#fff', 'shop'],
  diners_club: ['Diners Club', '#fff', '#0079be', 'Diners'],
  discover: ['Discover', '#fff', '#e65c24', 'DISCOVER'],
  jcb: ['JCB', '#fff', '#0b4ea2', 'JCB'],
  maestro: ['Maestro', '#fff', '#0099df', 'maestro'],
  venmo: ['Venmo', '#3d95ce', '#fff', 'venmo'],
  bitcoin: ['Bitcoin', '#f7931a', '#fff', '₿'],
};
export function paymentSvg(type, cls = 'icon icon--full-color') {
  const [label, bg, fg, text] = PAYMENT[type] || [String(type).replace(/_/g, ' '), '#fff', '#111', String(type).replace(/_/g, ' ').toUpperCase().slice(0, 8)];
  const id = `pi-${type}`;
  return `<svg class="${esc(cls)}" viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg" width="38" height="24" role="img" aria-labelledby="${id}"><title id="${id}">${esc(label)}</title><rect x=".5" y=".5" width="37" height="23" rx="3" fill="${bg}" stroke="#000" stroke-opacity=".12"/><text x="19" y="15.5" text-anchor="middle" font-family="Arial, sans-serif" font-size="${text.length > 6 ? 6 : 8}" font-weight="700" fill="${fg}">${esc(text)}</text></svg>`;
}

/* ------------------------------------------------------------------ */
/* colors                                                              */
/* ------------------------------------------------------------------ */
const col = (x) => parseColor(v(x)) || { r: 0, g: 0, b: 0, a: 1 };
const outColor = (c, preferAlpha) => {
  const d = new ColorDrop(c);
  return preferAlpha || d.alpha < 1 ? `rgba(${d.red}, ${d.green}, ${d.blue}, ${d.alpha})` : d.hex;
};
const brightness = (c) => Math.round(((c.r * 299 + c.g * 587 + c.b * 114) / 1000) * 10) / 10;
const lum = (c) => {
  const ch = [c.r, c.g, c.b].map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
function adjustHsl(x, dh, ds, dl) {
  const c = col(x);
  const hsl = rgbToHsl(c.r, c.g, c.b);
  const rgb = hslToRgb(hsl.h + dh, Math.max(0, Math.min(100, hsl.s + ds)), Math.max(0, Math.min(100, hsl.l + dl)));
  return outColor({ ...rgb, a: c.a });
}

/* ------------------------------------------------------------------ */
/* date                                                                */
/* ------------------------------------------------------------------ */
const DATE_FORMATS = {
  abbreviated_date: '%b %d, %Y', basic: '%m/%d/%Y', date: '%B %d, %Y', date_at_time: '%B %d, %Y at %-I:%M %p',
  default: '%a, %b %d, %Y, %-I:%M %p %z', on_date: 'on %B %d, %Y', month_day_year: '%B %d, %Y', short: '%d %b %H:%M', long: '%B %d, %Y %H:%M',
  iso8601: '%Y-%m-%dT%H:%M:%S%z',
};

/* ------------------------------------------------------------------ */
/* registration                                                        */
/* ------------------------------------------------------------------ */
export function registerFilters(engine) {
  const baseDate = engine.filters.date;
  const F = {};

  // money
  F.money = function (x) { return formatMoney(x, MONEY_FORMAT); };
  F.money_with_currency = function (x) { const s = formatMoney(x, MONEY_FORMAT); return s ? `${s} USD` : ''; };
  F.money_without_currency = function (x) { return formatMoney(x, '{{amount}}'); };
  F.money_without_trailing_zeros = function (x) {
    const n = Number(v(x));
    if (!Number.isFinite(n)) return '';
    return formatMoney(n, n % 100 === 0 ? '${{amount_no_decimals}}' : MONEY_FORMAT);
  };

  // translations
  F.t = function (key, ...args) {
    const { named } = split(args);
    const k = String(v(key) ?? '');
    const r = translate(k, named);
    if (!r.found) {
      const rs = rsOf(this);
      const w = where(this);
      record('translations', { key: `t:${k}`, key_name: k, message: `translation missing: en.${k}`, ...w, url: rs?.urlLabel });
    }
    return r.value;
  };
  F.translate = F.t;

  // urls & assets
  F.asset_url = function (file) {
    const f = String(v(file) ?? '');
    const abs = path.join(DIRS.assets, f);
    if (f && !exists(abs) && !exists(`${abs}.liquid`)) {
      const rs = rsOf(this);
      record('assets', { key: `asset:${f}`, message: `Missing asset assets/${f}`, ...where(this), url: rs?.urlLabel });
    }
    return `/assets/${f}`;
  };
  F.asset_img_url = function (file, size) { const s = legacySize(v(size)); return withParams(`/assets/${v(file)}`, { width: s.width, height: s.height }); };
  F.shopify_asset_url = function (file) { return `/shopify-assets/${v(file)}`; };
  F.global_asset_url = F.shopify_asset_url;
  F.file_url = function (file) { return `/mock/files/${v(file)}`; };
  F.file_img_url = function (file, size) { const s = legacySize(v(size)); return withParams(mockImageFor(v(file)).src, { width: s.width, height: s.height }); };
  F.stylesheet_tag = function (url, ...args) { const { named } = split(args); return `<link href="${esc(v(url))}" rel="stylesheet" type="text/css" media="${esc(named.media || 'all')}">`; };
  F.script_tag = function (url) { return `<script src="${esc(v(url))}" type="text/javascript"></script>`; };
  F.preload_tag = function (url, ...args) { const { named } = split(args); return `<link href="${esc(v(url))}" rel="preload" as="${esc(named.as || 'style')}">`; };
  F.inline_asset_content = function (file) { const src = readText(path.join(DIRS.assets, String(v(file)))); return src ?? ''; };

  // images
  F.image_url = function (input, ...args) { return imageUrl(input, split(args).named, this); };
  F.img_url = function (input, size, ...args) {
    const s = legacySize(v(size));
    const { named } = split(args);
    return imageUrl(input, { width: s.width, height: s.height, crop: named.crop, format: named.format }, this);
  };
  F.product_img_url = F.img_url;
  F.collection_img_url = F.img_url;
  F.article_img_url = F.img_url;
  F.image_tag = function (input, ...args) { return imageTag(input, split(args).named, this); };
  F.img_tag = function (url, alt, cls) { return `<img src="${esc(v(url))}" alt="${esc(v(alt) ?? '')}"${attr('class', v(cls))}>`; };
  F.placeholder_svg_tag = function (name, cls) { return placeholderSvg(v(name), v(cls)); };
  F.media_tag = function (media, ...args) {
    const m = v(media);
    const { named } = split(args);
    if (!m) return '';
    if (m.media_type === 'external_video') return F.external_video_tag.call(this, m, ...args);
    if (m.media_type === 'video') return F.video_tag.call(this, m, ...args);
    const url = imageUrl(m, { width: named.image_size ? parseInt(named.image_size, 10) : 1500 }, this);
    return imageTag(url, { ...named, alt: named.alt ?? m.alt }, this);
  };
  F.external_video_url = function (video, ...args) {
    const x = v(video);
    const { named } = split(args);
    const id = x?.external_id || x?.id;
    const host = x?.host || x?.type;
    const base = host === 'vimeo' ? `https://player.vimeo.com/video/${id}` : `https://www.youtube.com/embed/${id}`;
    return withParams(base, named);
  };
  F.external_video_tag = function (video, ...args) {
    const x = v(video);
    const { named } = split(args);
    const src = typeof x === 'string' ? x : F.external_video_url.call(this, x);
    return `<iframe src="${esc(src)}" class="${esc(named.class || 'js-youtube')}" allow="autoplay; encrypted-media" allowfullscreen title="${esc(named.title || x?.alt || 'Video')}" loading="lazy"></iframe>`;
  };
  F.video_tag = function (video, ...args) {
    const x = v(video);
    const { named } = split(args);
    const poster = x?.preview_image ? imageUrl(x.preview_image, { width: 1200 }, this) : '';
    const sources = (x?.sources || []).map((s) => `<source src="${esc(s.url)}" type="${esc(s.mime_type || 'video/mp4')}">`).join('');
    return `<video playsinline="playsinline"${attr('autoplay', named.autoplay)}${attr('loop', named.loop)}${attr('muted', named.muted)}${attr('controls', named.controls)} preload="metadata"${attr('class', named.class)}${poster ? ` poster="${esc(poster)}"` : ''}>${sources}</video>`;
  };
  F.model_viewer_tag = function () { return ''; };

  // json
  F.json = function (x) { return JSON.stringify(toJson(x, this) ?? null).replace(/<\/(script)/gi, '<\\/$1'); };

  // strings / handles
  F.handle = function (x) { return handleize(v(x)); };
  F.handleize = F.handle;
  F.camelize = function (x) { return String(v(x) ?? '').replace(/(?:^|[-_\s]+)(\w)/g, (m, c) => c.toUpperCase()); };
  F.pluralize = function (n, singular, plural) { return Number(v(n)) === 1 ? v(singular) : v(plural); };
  F.url_param_escape = function (x) { return encodeURIComponent(String(v(x) ?? '')).replace(/%20/g, '+'); };
  F.url_escape = function (x) { return encodeURI(String(v(x) ?? '')).replace(/#/g, '%23').replace(/&/g, '%26'); };
  F.highlight = function (text, terms) {
    const t = String(v(text) ?? '');
    const words = String(v(terms) ?? '').split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!words.length) return t;
    return t.replace(new RegExp(`(${words.join('|')})(?![^<]*>)`, 'gi'), '<strong class="highlight">$1</strong>');
  };
  F.md5 = function (x) { return crypto.createHash('md5').update(String(v(x) ?? '')).digest('hex'); };
  F.sha1 = function (x) { return crypto.createHash('sha1').update(String(v(x) ?? '')).digest('hex'); };
  F.sha256 = function (x) { return crypto.createHash('sha256').update(String(v(x) ?? '')).digest('hex'); };
  F.hmac_sha1 = function (x, secret) { return crypto.createHmac('sha1', String(v(secret) ?? '')).update(String(v(x) ?? '')).digest('hex'); };
  F.hmac_sha256 = function (x, secret) { return crypto.createHmac('sha256', String(v(secret) ?? '')).update(String(v(x) ?? '')).digest('hex'); };
  F.base64_encode = function (x) { return Buffer.from(String(v(x) ?? ''), 'utf8').toString('base64'); };
  F.base64_decode = function (x) { return Buffer.from(String(v(x) ?? ''), 'base64').toString('utf8'); };
  F.base64_url_safe_encode = function (x) { return Buffer.from(String(v(x) ?? ''), 'utf8').toString('base64url'); };
  F.base64_url_safe_decode = function (x) { return Buffer.from(String(v(x) ?? ''), 'base64url').toString('utf8'); };

  // links
  F.link_to = function (text, url, title) { return `<a href="${esc(v(url))}"${attr('title', v(title))}>${v(text) ?? ''}</a>`; };
  F.url_for_type = function (type) { return `/collections/types?q=${encodeURIComponent(String(v(type) ?? ''))}`; };
  F.url_for_vendor = function (vendor) { return `/collections/vendors?q=${encodeURIComponent(String(v(vendor) ?? ''))}`; };
  F.link_to_type = function (type) { return `<a href="${F.url_for_type(type)}" title="${esc(v(type))}">${esc(v(type))}</a>`; };
  F.link_to_vendor = function (vendor) { return `<a href="${F.url_for_vendor(vendor)}" title="${esc(v(vendor))}">${esc(v(vendor))}</a>`; };
  F.within = function (url, collection) {
    const c = v(collection);
    const u = String(v(url) ?? '');
    return c?.handle ? `/collections/${c.handle}${u.startsWith('/') ? '' : '/'}${u}` : u;
  };
  F.sort_by = function (url, value) { return withParams(String(v(url) ?? ''), { sort_by: v(value) }); };
  const tagBase = (self) => {
    const g = self.context.globals;
    const c = g.collection;
    return c?.handle ? `/collections/${c.handle}` : g.blog?.handle ? `/blogs/${g.blog.handle}/tagged` : '/collections/all';
  };
  const currentTags = (self) => (self.context.globals.current_tags || []).map(String);
  F.link_to_tag = function (label, tag) { const t = String(v(tag) ?? ''); return `<a href="${tagBase(this)}/${handleize(t)}" title="Show products matching tag ${esc(t)}">${v(label) ?? ''}</a>`; };
  F.link_to_add_tag = function (label, tag) {
    const tags = [...new Set([...currentTags(this), String(v(tag))])].map(handleize);
    return `<a href="${tagBase(this)}/${tags.join('+')}" title="Show products matching tag ${esc(v(tag))}">${v(label) ?? ''}</a>`;
  };
  F.link_to_remove_tag = function (label, tag) {
    const t = handleize(v(tag));
    const tags = currentTags(this).map(handleize).filter((x) => x !== t);
    return `<a href="${tagBase(this)}${tags.length ? `/${tags.join('+')}` : ''}" title="Remove tag ${esc(v(tag))}">${v(label) ?? ''}</a>`;
  };
  F.highlight_active_tag = function (tag, cls = 'active') {
    const t = String(v(tag) ?? '');
    return currentTags(this).map(handleize).includes(handleize(t)) ? `<span class="${esc(v(cls))}">${esc(t)}</span>` : t;
  };
  F.customer_login_link = function (text) { return `<a href="/account/login" id="customer_login_link">${v(text) ?? ''}</a>`; };
  F.customer_logout_link = function (text) { return `<a href="/account/logout" id="customer_logout_link">${v(text) ?? ''}</a>`; };
  F.customer_register_link = function (text) { return `<a href="/account/register" id="customer_register_link">${v(text) ?? ''}</a>`; };

  // pagination
  F.default_pagination = function (paginate, ...args) {
    const p = v(paginate);
    const { named } = split(args);
    if (!p || !p.pages || p.pages <= 1) return '';
    const anchor = named.anchor ? `#${named.anchor}` : '';
    let out = '';
    if (p.previous?.is_link) out += `<span class="prev"><a href="${esc(p.previous.url)}${anchor}" title="">${named.previous || '&laquo; Previous'}</a></span> `;
    for (const part of p.parts) {
      if (part.is_link) out += `<span class="page"><a href="${esc(part.url)}${anchor}" title="">${part.title}</a></span> `;
      else if (String(part.title) === String(p.current_page)) out += `<span class="page current">${part.title}</span> `;
      else out += `<span class="deco">${part.title}</span> `;
    }
    if (p.next?.is_link) out += `<span class="next"><a href="${esc(p.next.url)}${anchor}" title="">${named.next || 'Next &raquo;'}</a></span>`;
    return out.trim();
  };

  // dates
  F.date = function (input, fmt, ...rest) {
    let format = v(fmt);
    if (Array.isArray(fmt) && fmt[0] === 'format') format = v(fmt[1]);
    const { named } = split(rest);
    if (named.format) format = named.format;
    if (format && DATE_FORMATS[format] !== undefined) {
      const fromLocale = translate(`date_formats.${format}`);
      format = fromLocale.found ? fromLocale.value : DATE_FORMATS[format];
    }
    if (input == null || input === '') return '';
    return baseDate.call(this, v(input), format || '%Y-%m-%d %H:%M:%S %z');
  };
  F.time_tag = function (input, ...args) {
    const { pos, named } = split(args);
    const format = pos[0] || named.format || 'abbreviated_date';
    const d = new Date(v(input) === 'now' || v(input) === 'today' ? Date.now() : v(input));
    if (Number.isNaN(d.getTime())) return '';
    const text = F.date.call(this, v(input), format);
    return `<time datetime="${esc(named.datetime ? F.date.call(this, v(input), named.datetime) : d.toISOString().replace(/\.\d{3}Z$/, 'Z'))}">${text}</time>`;
  };

  // payments
  F.payment_type_svg_tag = function (type, ...args) { const { pos, named } = split(args); return paymentSvg(String(v(type)), named.class || pos[0] || 'icon icon--full-color'); };
  F.payment_type_img_url = function (type) { return `/shopify-assets/payment/${encodeURIComponent(String(v(type)))}.svg`; };
  F.payment_terms = function () { return ''; };
  F.payment_button = function () {
    return '<div data-shopify="payment-button" class="shopify-payment-button"><button type="button" class="shopify-payment-button__button shopify-payment-button__button--unbranded">Buy it now</button></div>';
  };

  // metafields
  F.metafield_tag = function (mf, ...args) {
    const m = v(mf);
    if (m == null) return '';
    const value = m instanceof MetafieldDrop || (typeof m === 'object' && 'value' in m) ? m.value : m;
    const type = m?.type || 'single_line_text_field';
    if (Array.isArray(value)) return `<ul class="metafield-${esc(type)}">${value.map((x) => `<li class="metafield-${esc(type)}__item">${esc(x)}</li>`).join('')}</ul>`;
    if (type === 'rich_text_field') return `<div class="metafield-rich_text_field">${value}</div>`;
    return `<span class="metafield-${esc(type)}">${esc(value)}</span>`;
  };
  F.metafield_text = function (mf) { const m = v(mf); const value = m && typeof m === 'object' && 'value' in m ? m.value : m; return Array.isArray(value) ? value.join(', ') : stripHtml(value); };

  // colors
  F.color_to_rgb = function (x) { const c = col(x); return c.a < 1 ? `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})` : `rgb(${c.r}, ${c.g}, ${c.b})`; };
  F.color_to_hsl = function (x) { const c = col(x); const h = rgbToHsl(c.r, c.g, c.b); return c.a < 1 ? `hsla(${h.h}, ${h.s}%, ${h.l}%, ${c.a})` : `hsl(${h.h}, ${h.s}%, ${h.l}%)`; };
  F.color_to_hex = function (x) { return new ColorDrop(col(x)).hex; };
  F.color_to_oklch = function (x) { return new ColorDrop(col(x)).hex; };
  F.color_extract = function (x, field) {
    const d = new ColorDrop(col(x));
    return { red: d.red, green: d.green, blue: d.blue, alpha: d.alpha, hue: d.hue, saturation: d.saturation, lightness: d.lightness }[String(v(field))] ?? '';
  };
  F.color_modify = function (x, field, value) {
    const c = col(x);
    const f = String(v(field));
    const n = num(value);
    if (f === 'alpha') return outColor({ ...c, a: Math.max(0, Math.min(1, n)) }, true);
    if (['red', 'green', 'blue'].includes(f)) return outColor({ ...c, [f[0]]: Math.max(0, Math.min(255, n)) });
    const h = rgbToHsl(c.r, c.g, c.b);
    if (f === 'hue') h.h = n;
    if (f === 'saturation') h.s = n;
    if (f === 'lightness') h.l = n;
    return outColor({ ...hslToRgb(h.h, h.s, h.l), a: c.a });
  };
  F.color_brightness = function (x) { return brightness(col(x)); };
  F.color_lighten = function (x, pct) { return adjustHsl(x, 0, 0, num(pct)); };
  F.color_darken = function (x, pct) { return adjustHsl(x, 0, 0, -num(pct)); };
  F.color_saturate = function (x, pct) { return adjustHsl(x, 0, num(pct), 0); };
  F.color_desaturate = function (x, pct) { return adjustHsl(x, 0, -num(pct), 0); };
  F.color_mix = function (a, b, weight) {
    const c1 = col(a);
    const c2 = col(b);
    const w = Math.max(0, Math.min(100, num(weight ?? 50))) / 100;
    const mix = (x, y) => Math.round(x * w + y * (1 - w));
    return outColor({ r: mix(c1.r, c2.r), g: mix(c1.g, c2.g), b: mix(c1.b, c2.b), a: Math.round((c1.a * w + c2.a * (1 - w)) * 100) / 100 });
  };
  F.color_contrast = function (a, b) {
    const l1 = lum(col(a));
    const l2 = lum(col(b));
    return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 10) / 10;
  };
  F.color_difference = function (a, b) { const c1 = col(a); const c2 = col(b); return Math.abs(c1.r - c2.r) + Math.abs(c1.g - c2.g) + Math.abs(c1.b - c2.b); };
  F.brightness_difference = function (a, b) { return Math.round(Math.abs(brightness(col(a)) - brightness(col(b)))); };

  // fonts
  F.font_face = function (font, ...args) {
    const f = v(font);
    const { named } = split(args);
    if (!f) return '';
    return `@font-face {\n  font-family: "${f.family}";\n  font-weight: ${f.weight};\n  font-style: ${f.style};\n  font-display: ${named.font_display || 'swap'};\n  src: local("${f.family}");\n}`;
  };
  F.font_url = function () { return ''; };
  F.font_modify = function (font, prop, value) {
    const f = v(font);
    if (!(f instanceof FontDrop)) return f;
    const clone = Object.assign(Object.create(FontDrop.prototype), f);
    const p = String(v(prop));
    const val = String(v(value));
    if (p === 'weight') clone.weight = val === 'bold' ? 700 : val === 'normal' ? 400 : val.startsWith('+') ? f.weight + Number(val.slice(1)) : val.startsWith('-') ? f.weight - Number(val.slice(1)) : Number(val) || f.weight;
    if (p === 'style') clone.style = val;
    return clone;
  };

  // forms & customers
  F.default_errors = function (errors) {
    const e = v(errors);
    if (!e) return '';
    const messages = e.messages ? Object.values(e.messages) : Array.isArray(e) ? e : [String(e)];
    return `<div class="errors"><ul>${messages.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>`;
  };
  F.format_address = function (address) {
    const a = v(address);
    if (!a) return '';
    const lines = [a.name || [a.first_name, a.last_name].filter(Boolean).join(' '), a.company, a.address1, a.address2, [a.city, a.province_code || a.province, a.zip].filter(Boolean).join(' '), a.country, a.phone].filter(Boolean);
    return `<p>${lines.map(esc).join('<br>')}</p>`;
  };
  F.avatar = function () { return ''; };
  F.login_button = function () { return ''; };

  // structured data & misc
  F.structured_data = function (obj) {
    const o = v(obj);
    if (!o) return '';
    const rs = rsOf(this);
    let data;
    if (o.object_type === 'product') {
      data = {
        '@context': 'http://schema.org/', '@type': 'Product', name: o.title, url: `${rs?.origin || ''}${o.url}`, image: o.featured_image ? [`http:${absolutize(o.featured_image.src, this)}`] : [],
        description: stripHtml(o.description), sku: o.variants[0]?.sku, brand: { '@type': 'Brand', name: o.vendor },
        offers: o.variants.map((x) => ({ '@type': 'Offer', price: (x.price / 100).toFixed(2), priceCurrency: 'USD', availability: x.available ? 'http://schema.org/InStock' : 'http://schema.org/OutOfStock', url: `${rs?.origin || ''}${x.url}`, sku: x.sku })),
      };
    } else if (o.object_type === 'article') {
      data = { '@context': 'http://schema.org/', '@type': 'Article', headline: o.title, author: { '@type': 'Person', name: o.author }, datePublished: o.published_at, image: o.image ? `http:${absolutize(o.image.src, this)}` : undefined, url: `${rs?.origin || ''}${o.url}` };
    } else {
      data = { '@context': 'http://schema.org/', '@type': 'Thing', name: o.title || o.name };
    }
    return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  };
  F.weight_with_unit = function (grams, unit) {
    const g = num(grams);
    const u = String(v(unit) || 'lb');
    const factor = { g: 1, kg: 0.001, lb: 1 / 453.592, oz: 1 / 28.3495 }[u] ?? 1 / 453.592;
    const value = Math.round(g * factor * 100) / 100;
    return `${value} ${u}`;
  };
  F.unit_price_with_measurement = function () { return ''; };
  F.item_count_for_variant = function (cart, variantId) {
    const c = v(cart);
    return (c?.items || []).filter((i) => String(i.variant_id) === String(v(variantId))).reduce((s, i) => s + i.quantity, 0);
  };
  F.line_items_for = function (cart, obj) {
    const c = v(cart);
    const o = v(obj);
    return (c?.items || []).filter((i) => (o?.object_type === 'product' ? i.product_id === o.id : i.variant_id === o?.id));
  };
  F.class_list = function () { return ''; };

  // Shopify parity: integer ÷ integer floors (10 | divided_by: 4 → 2) while a float operand
  // (literal "4.0" or a non-integer value) keeps float division. JS has one number type, so
  // the raw argument text decides whether a whole-number literal was written as a float.
  F.divided_by = function (a, b) {
    const x = Number(v(a));
    const y = Number(v(b));
    const rawArg = this?.token?.args?.[0];
    const rawText = rawArg && !Array.isArray(rawArg) && typeof rawArg.getText === 'function' ? rawArg.getText() : '';
    const floatLiteral = /^-?\d+\.\d+$/.test(rawText.trim());
    if (Number.isInteger(x) && Number.isInteger(y) && !floatLiteral && typeof v(a) !== 'string') return Math.floor(x / y);
    return x / y;
  };

  // Shopify parity: `default` returns the original object (drop) untouched when it isn't blank.
  F.default = function (value, fallback, ...rest) {
    const { named } = split(rest);
    const val = toValue(value);
    const empty = val === null || val === undefined || val === ''
      || (Array.isArray(val) && val.length === 0)
      || (val === false && !named.allow_false);
    return empty ? fallback : value;
  };

  for (const [name, fn] of Object.entries(F)) engine.registerFilter(name, fn);

  // Unknown filters: pass the value through but record a warning.
  const known = engine.filters;
  const unknownCache = new Map();
  engine.filters = new Proxy(known, {
    get(target, key) {
      if (typeof key !== 'string' || key in target || !/^[A-Za-z_][\w-]*$/.test(key)) return target[key];
      if (!unknownCache.has(key)) {
        unknownCache.set(key, function (value) {
          const rs = rsOf(this);
          record('filters', { key: `filter:${key}|${this?.token?.file || ''}`, name: key, message: `Unknown filter "${key}"`, ...where(this), url: rs?.urlLabel });
          return value;
        });
      }
      return unknownCache.get(key);
    },
  });
  return F;
}

/** Scan source for filter names not registered (catches unexecuted branches too). */
export function scanUnknownFilters(src, file, knownFilters) {
  if (!src) return [];
  const cleaned = src
    .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/\{%-?\s*raw\s*-?%\}[\s\S]*?\{%-?\s*endraw\s*-?%\}/g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/\{%-?\s*#[\s\S]*?-?%\}/g, (m) => m.replace(/[^\n]/g, ''));
  const found = [];
  const re = /\{\{-?([\s\S]*?)-?\}\}|\{%-?([\s\S]*?)-?%\}/g;
  let m;
  while ((m = re.exec(cleaned))) {
    let body = m[1] ?? m[2];
    body = body.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    body = body.replace(/'[^']*'|"[^"]*"/g, "''");
    const fr = /\|\s*([A-Za-z_][\w-]*)/g;
    let f;
    while ((f = fr.exec(body))) {
      if (!(f[1] in knownFilters)) {
        const line = cleaned.slice(0, m.index).split('\n').length + body.slice(0, f.index).split('\n').length - 1;
        found.push({ name: f[1], file, line });
      }
    }
  }
  return found;
}

export { buildShop };
