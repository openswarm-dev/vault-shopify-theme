// Theme file access (cached, invalidated by the file watcher), schema parsing, settings + locale resolution.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ColorDrop, FontDrop, indexedArray, toColor } from './drops.mjs';
import { collectionsByHandle, productsByHandle, pagesByHandle, blogs, articlesByKey, mockImageFor } from '../mock/store.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const THEME = path.join(ROOT, 'theme');
export const DIRS = {
  assets: path.join(THEME, 'assets'),
  config: path.join(THEME, 'config'),
  layout: path.join(THEME, 'layout'),
  locales: path.join(THEME, 'locales'),
  sections: path.join(THEME, 'sections'),
  snippets: path.join(THEME, 'snippets'),
  templates: path.join(THEME, 'templates'),
};
export const rel = (abs) => {
  const r = path.relative(THEME, abs).replace(/\\/g, '/');
  return r.startsWith('../') ? path.relative(ROOT, abs).replace(/\\/g, '/') : r;
};

const textCache = new Map();
const jsonCache = new Map();
let generation = 0;
export function invalidate() {
  textCache.clear();
  jsonCache.clear();
  generation += 1;
}
export const cacheGeneration = () => generation;

export function readText(abs) {
  if (textCache.has(abs)) return textCache.get(abs);
  let src = null;
  try { src = fs.readFileSync(abs, 'utf8'); } catch { src = null; }
  if (src && src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  textCache.set(abs, src);
  return src;
}
export const exists = (abs) => readText(abs) != null;

/** JSON with Shopify's leading /* *\/ comment support. Returns { data, error }. */
export function readJSON(abs) {
  if (jsonCache.has(abs)) return jsonCache.get(abs);
  const src = readText(abs);
  let out;
  if (src == null) out = { data: null, error: null, missing: true };
  else {
    try {
      out = { data: JSON.parse(stripJsonComments(src)), error: null };
    } catch (err) {
      out = { data: null, error: err.message };
    }
  }
  jsonCache.set(abs, out);
  return out;
}
function stripJsonComments(src) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (c === '\\') { out += src[++i] ?? ''; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i);
      i = end === -1 ? src.length : end - 1;
      continue;
    }
    out += c;
  }
  return out;
}

/** Blank out raw blocks (schema / javascript / stylesheet) while keeping line numbers intact. */
export function preprocess(src) {
  if (!src) return src;
  return src.replace(/(\{%-?\s*(schema|javascript|stylesheet)\s*-?%\})([\s\S]*?)(\{%-?\s*end\2\s*-?%\})/g,
    (m, open, name, body, close) => open + body.replace(/[^\n]/g, '') + close);
}

const schemaCache = new Map();
/** Parses the {% schema %} JSON of a section file. */
export function extractSchema(abs) {
  const key = `${abs}@${generation}`;
  if (schemaCache.has(key)) return schemaCache.get(key);
  const src = readText(abs);
  let out = { schema: null, error: null };
  if (src) {
    const m = src.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
    if (m) {
      try { out.schema = JSON.parse(m[1]); } catch (err) {
        const line = src.slice(0, m.index).split('\n').length;
        out.error = { message: `Invalid JSON in tag 'schema': ${err.message}`, line };
      }
    }
  }
  schemaCache.set(key, out);
  return out;
}

/* Opt-in test fixtures (VAULT_FIXTURES=1): dev/fixtures/{sections,templates} fill gaps the theme doesn't cover yet. */
export const FIXTURES = path.join(ROOT, 'dev', 'fixtures');
export const fixturesEnabled = () => process.env.VAULT_FIXTURES === '1';

export function sectionFile(type) {
  const abs = path.join(DIRS.sections, `${type}.liquid`);
  if (fixturesEnabled() && !exists(abs)) {
    const fx = path.join(FIXTURES, 'sections', `${type}.liquid`);
    if (exists(fx)) return fx;
  }
  return abs;
}

/** templates/<directory>/<name>[.<suffix>].(json|liquid) */
export function findTemplate(name, suffix, directory) {
  const roots = [DIRS.templates];
  if (fixturesEnabled()) roots.push(path.join(FIXTURES, 'templates'));
  const base = suffix ? `${name}.${suffix}` : name;
  for (const root of roots) {
    const dir = directory ? path.join(root, directory) : root;
    for (const ext of ['json', 'liquid']) {
      const abs = path.join(dir, `${base}.${ext}`);
      if (exists(abs)) return { abs, kind: ext };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Locales                                                             */
/* ------------------------------------------------------------------ */
let localeCache = { mtime: 0, data: {} };
export function loadLocale() {
  const abs = path.join(DIRS.locales, 'en.default.json');
  try {
    const st = fs.statSync(abs);
    if (st.mtimeMs !== localeCache.mtime) {
      const raw = fs.readFileSync(abs, 'utf8').replace(/^﻿/, '');
      localeCache = { mtime: st.mtimeMs, data: JSON.parse(stripJsonComments(raw)), error: null };
    }
  } catch (err) {
    localeCache = { mtime: 0, data: localeCache.data || {}, error: err.message };
  }
  return localeCache.data;
}
export function lookupKey(key) {
  let node = loadLocale();
  for (const part of String(key).split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}
export function translate(key, vars = {}) {
  let node = lookupKey(key);
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    if ('count' in vars) {
      const n = Number(vars.count);
      node = (n === 0 && node.zero != null) ? node.zero : (n === 1 && node.one != null) ? node.one : node.other ?? node.one ?? node.many;
    } else node = node.other ?? node.one ?? undefined;
  }
  if (typeof node !== 'string') return { found: false, value: `translation missing: en.${key}` };
  const value = node.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, name) => {
    const v = vars[name];
    return v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v.valueOf());
  });
  return { found: true, value };
}

/* ------------------------------------------------------------------ */
/* Settings resolution                                                 */
/* ------------------------------------------------------------------ */
export function resolveUrl(v) {
  if (v == null || v === '') return null;
  const s = String(v);
  const m = s.match(/^shopify:\/\/(collections|products|pages|blogs|policies|search)(?:\/(.*))?$/);
  if (!m) return s;
  if (m[1] === 'search') return '/search';
  return `/${m[1]}${m[2] ? `/${m[2]}` : ''}`;
}
export function parseVideoUrl(v) {
  if (!v) return null;
  const s = String(v);
  let m = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (m) return { id: m[1], type: 'youtube', url: s };
  m = s.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return { id: m[1], type: 'vimeo', url: s };
  return { id: null, type: null, url: s };
}

/** Resolve a single setting value according to its schema type. */
export function resolveSetting(def, raw, ctx = {}) {
  const type = def?.type;
  const v = raw;
  switch (type) {
    case 'color': return v == null || v === '' ? null : toColor(v);
    case 'color_background': return v ?? '';
    case 'color_scheme': return v || def.default || 'scheme-1';
    case 'image_picker': return v ? mockImageFor(v) : null;
    case 'collection': return v ? (typeof v === 'object' ? v : collectionsByHandle[v] || null) : null;
    case 'collection_list': return Array.isArray(v) ? v.map((h) => collectionsByHandle[h]).filter(Boolean) : [];
    case 'product': return v ? (typeof v === 'object' ? v : productsByHandle[v] || null) : null;
    case 'product_list': return Array.isArray(v) ? v.map((h) => productsByHandle[h]).filter(Boolean) : [];
    case 'link_list': return v ? (ctx.linklists?.[v] || null) : null;
    case 'page': return v ? pagesByHandle[v] || null : null;
    case 'blog': return v ? blogs[v] || null : null;
    case 'article': return v ? articlesByKey[v] || articlesByKey[`news/${v}`] || null : null;
    case 'url': return resolveUrl(v);
    case 'video_url': return parseVideoUrl(v);
    case 'video': return v ? { id: 1, media_type: 'video', alt: '', sources: [], preview_image: mockImageFor(v) } : null;
    case 'font_picker': return new FontDrop(v || def.default || 'assistant_n4');
    case 'number': return v == null || v === '' ? null : Number(v);
    case 'range': return v == null || v === '' ? null : Number(v);
    case 'checkbox': return v === true || v === 'true';
    case 'metaobject': return null;
    case 'metaobject_list': return [];
    default: return v ?? null;
  }
}

/** Merge schema defaults with given values and resolve types. */
export function resolveSettings(defs = [], values = {}, ctx = {}) {
  const out = {};
  const seen = new Set();
  for (const def of defs || []) {
    if (!def || !def.id) continue;
    seen.add(def.id);
    const raw = values && Object.prototype.hasOwnProperty.call(values, def.id) ? values[def.id] : def.default;
    try { out[def.id] = resolveSetting(def, raw, ctx); } catch { out[def.id] = raw ?? null; }
  }
  for (const [k, v] of Object.entries(values || {})) if (!seen.has(k)) out[k] = v;
  return out;
}

/** The global `settings` object. */
export function buildSettings(ctx = {}) {
  const schema = readJSON(path.join(DIRS.config, 'settings_schema.json'));
  const data = readJSON(path.join(DIRS.config, 'settings_data.json'));
  const groups = Array.isArray(schema.data) ? schema.data : [];
  const current = typeof data.data?.current === 'string' ? data.data?.presets?.[data.data.current] || {} : data.data?.current || {};
  const defs = [];
  let schemeGroup = null;
  for (const g of groups) for (const s of g.settings || []) {
    if (s.type === 'color_scheme_group') schemeGroup = s;
    else if (s.id) defs.push(s);
  }
  const settings = resolveSettings(defs, current, ctx);
  // color schemes
  const schemesRaw = current.color_schemes || data.data?.presets?.Default?.color_schemes || {};
  const schemeDefs = schemeGroup?.definition || [];
  const schemes = Object.entries(schemesRaw).map(([id, s]) => ({ id, settings: resolveSettings(schemeDefs, s.settings || {}, ctx) }));
  if (schemeGroup) settings[schemeGroup.id] = indexedArray(schemes, (s) => s.id);
  else if (schemes.length) settings.color_schemes = indexedArray(schemes, (s) => s.id);
  Object.defineProperty(settings, '__errors', { value: [schema.error && `settings_schema.json: ${schema.error}`, data.error && `settings_data.json: ${data.error}`].filter(Boolean) });
  Object.defineProperty(settings, '__sections', { value: current.sections || {} });
  return settings;
}

export { ColorDrop };
