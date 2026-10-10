// Shopify-like drop classes for the local preview.
import { Drop } from 'liquidjs';
import { artSize } from '../mock/art.mjs';

/* ------------------------------------------------------------------ */
/* Color                                                               */
/* ------------------------------------------------------------------ */
export function parseColor(input) {
  if (input == null) return null;
  if (input instanceof ColorDrop) return { r: input.red, g: input.green, b: input.blue, a: input.alpha };
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^#?([0-9a-f]{3,8})$/);
  if (m) {
    let hex = m[1];
    if (hex.length === 3 || hex.length === 4) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? Math.round((parseInt(hex.slice(6, 8), 16) / 255) * 100) / 100 : 1,
    };
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    let a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const { r, g, b } = hslToRgb(+m[1], +m[2], +m[3]);
    const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r, g, b, a };
  }
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const named = { white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080' };
  if (named[s]) return parseColor(named[s]);
  return null;
}
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}
export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

export class ColorDrop extends Drop {
  constructor(c) {
    super();
    const p = typeof c === 'object' && c && 'r' in c ? c : parseColor(c) || { r: 0, g: 0, b: 0, a: 1 };
    this.red = Math.round(p.r);
    this.green = Math.round(p.g);
    this.blue = Math.round(p.b);
    this.alpha = p.a ?? 1;
    const hsl = rgbToHsl(this.red, this.green, this.blue);
    this.hue = hsl.h;
    this.saturation = hsl.s;
    this.lightness = hsl.l;
  }
  get rgb() { return `${this.red} ${this.green} ${this.blue}`; }
  get rgba() { return `${this.red} ${this.green} ${this.blue} / ${Number(this.alpha).toFixed(1)}`; }
  get hex() { return `#${hex2(this.red)}${hex2(this.green)}${hex2(this.blue)}`; }
  toCss() {
    return this.alpha < 1 ? `rgba(${this.red},${this.green},${this.blue},${this.alpha})` : this.hex;
  }
  valueOf() { return this.toCss(); }
  toString() { return this.toCss(); }
  toJSON() { return this.toCss(); }
}
export const toColor = (v) => (v instanceof ColorDrop ? v : v == null || v === '' ? null : new ColorDrop(v));

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */
let imageId = 3200000000;
export class ImageDrop extends Drop {
  constructor({ name, src, width, height, alt = '', id, position = 1, mediaType = 'image' }) {
    super();
    const size = name ? artSize(name) : { width: 1600, height: 900 };
    this.id = id || ++imageId;
    this.name = name || null;
    this.src = src || `/mock/img/${name}.svg`;
    this.width = width || size.width;
    this.height = height || size.height;
    this.aspect_ratio = Math.round((this.width / this.height) * 10000) / 10000;
    this.alt = alt;
    this.position = position;
    this.media_type = mediaType;
    this.presentation = { focal_point: '50.0% 50.0%' };
    this.attached_to_variant = false;
    this.variants = [];
    this.product_id = null;
  }
  get preview_image() { return this; }
  get url() { return this.src; }
  get filename() { return this.src.split('/').pop(); }
  valueOf() { return this.src; }
  toString() { return this.src; }
}

/* ------------------------------------------------------------------ */
/* Metafields                                                          */
/* ------------------------------------------------------------------ */
export class MetafieldDrop extends Drop {
  constructor(value, type = 'single_line_text_field') {
    super();
    this.value = value;
    this.type = type;
    this.list = Array.isArray(value);
  }
  valueOf() { return this.value; }
  toString() { return Array.isArray(this.value) ? this.value.join(', ') : String(this.value ?? ''); }
  toJSON() { return this.value; }
}
export class MetafieldsDrop extends Drop {
  constructor(namespaces = {}) {
    super();
    for (const [ns, fields] of Object.entries(namespaces)) {
      const obj = {};
      for (const [k, v] of Object.entries(fields)) {
        obj[k] = v instanceof MetafieldDrop ? v : typeof v === 'object' && v && 'value' in v ? new MetafieldDrop(v.value, v.type) : new MetafieldDrop(v);
      }
      this[ns] = obj;
    }
  }
  liquidMethodMissing() { return {}; }
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */
export class TemplateDrop extends Drop {
  constructor(name, suffix = null, directory = null) {
    super();
    this.name = name;
    this.suffix = suffix;
    this.directory = directory;
  }
  toString() { return `${this.directory ? `${this.directory}/` : ''}${this.name}${this.suffix ? `.${this.suffix}` : ''}`; }
  valueOf() { return this.toString(); }
}

/** Product option value (new Shopify API) that still prints/compares as its name. */
export class OptionValueDrop extends Drop {
  constructor(props) {
    super();
    Object.assign(this, props);
  }
  valueOf() { return this.name; }
  toString() { return this.name; }
  toJSON() { return this.name; }
}

/** Font drop for font_picker settings. */
export class FontDrop extends Drop {
  constructor(handle = 'assistant_n4') {
    super();
    const [fam, variant = 'n4'] = String(handle).split('_');
    this.family = fam.replace(/(^|-)(\w)/g, (_, s, c) => `${s ? ' ' : ''}${c.toUpperCase()}`);
    this.fallback_families = 'sans-serif';
    this.style = variant[0] === 'i' ? 'italic' : 'normal';
    this.weight = Number(variant.slice(1) || 4) * 100;
    this.baseline_ratio = 0.2;
    this.system = false;
    this.variants = [this];
  }
  toString() { return this.family; }
  valueOf() { return this.family; }
}

/** Array with extra lookup-by-key properties (collections, color_schemes, …). */
export function indexedArray(items, keyFn) {
  const arr = [...items];
  for (const item of items) {
    const k = keyFn(item);
    if (k != null && !(k in Array.prototype) && !['size', 'first', 'last', 'length'].includes(k)) {
      Object.defineProperty(arr, k, { value: item, enumerable: false, configurable: true, writable: true });
    }
  }
  return arr;
}
