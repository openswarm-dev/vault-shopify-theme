// liquidjs engine configured for Shopify semantics + resilient rendering (inline error boxes).
import fs from 'node:fs';
import path from 'node:path';
import { Liquid, LiquidError, RenderError, toValue } from 'liquidjs';
import { DIRS, THEME, preprocess, rel } from './theme.mjs';
import { registerFilters, scanUnknownFilters, RS } from './filters.mjs';
import { registerTags } from './tags.mjs';
import { record, describeError, errorBox } from './errors.mjs';

/* Parse cache (cleared by the file watcher). */
class ParseCache {
  constructor() { this.map = new Map(); }
  read(key) { return this.map.get(key); }
  write(key, value) { this.map.set(key, value); }
  remove(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}
export const parseCache = new ParseCache();

let knownFilters = {};
const scanned = new Set();
function scanFile(abs, src) {
  if (scanned.has(abs)) return;
  scanned.add(abs);
  for (const hit of scanUnknownFilters(preprocess(src), rel(abs), knownFilters)) {
    record('filters', { key: `filter:${hit.name}|${abs}`, name: hit.name, message: `Unknown filter "${hit.name}"`, file: hit.file, line: hit.line, url: null });
  }
}

/* FS used by liquidjs to load snippets for {% render %}. */
const inside = (root, file) => path.resolve(file).toLowerCase().startsWith(path.resolve(root).toLowerCase());
const themeFs = {
  sep: path.sep,
  dirname: (f) => path.dirname(f),
  existsSync: (f) => fs.existsSync(f),
  exists: async (f) => fs.existsSync(f),
  readFileSync: (f) => {
    const src = fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
    scanFile(f, src);
    return preprocess(src);
  },
  readFile: async (f) => {
    const src = (await fs.promises.readFile(f, 'utf8')).replace(/^﻿/, '');
    scanFile(f, src);
    return preprocess(src);
  },
  resolve: (dir, file, ext) => path.resolve(dir, path.extname(file) === ext ? file : `${file}${ext}`),
  contains: async (root, file) => inside(root, file),
  containsSync: (root, file) => inside(root, file),
};

export const engine = new Liquid({
  root: [DIRS.snippets],
  partials: [DIRS.snippets],
  layouts: [DIRS.layout],
  extname: '.liquid',
  fs: themeFs,
  cache: parseCache,
  strictFilters: false,
  strictVariables: false,
  lenientIf: true,
  jsTruthy: false,
  ownPropertyOnly: false,
  dynamicPartials: true,
  relativeReference: false,
  // Ruby Liquid strips *all* whitespace (incl. newlines) next to {%- / -%}; that is liquidjs' greedy mode.
  greedy: process.env.LIQUID_GREEDY !== 'false',
  timezoneOffset: process.env.SHOP_TIMEZONE || 'America/New_York',
  dateFormat: '%Y-%m-%d %H:%M:%S %z',
  outputEscape: undefined,
  renderLimit: 20000,
});

registerFilters(engine);
registerTags(engine);
knownFilters = new Proxy({}, { has: (t, k) => Reflect.has(engine.filters, k) && !String(k).startsWith('__') });

/* ------------------------------------------------------------------ */
/* Resilient rendering: errors become inline red boxes (like Shopify's  */
/* "Liquid error (line N): …") instead of aborting the whole page.      */
/* ------------------------------------------------------------------ */
function stringify(value) {
  const x = toValue(value);
  if (typeof x === 'string') return x;
  if (x == null) return '';
  if (Array.isArray(x)) return x.map(stringify).join('');
  return String(x);
}
class DevEmitter {
  constructor() { this.buffer = ''; }
  write(html) { this.buffer += stringify(html); }
}
const isFatal = (e) => /limit exceeded|memory alloc/i.test(String(e?.message || ''));

export function reportError(err, rs, extra = {}) {
  const info = { ...describeError(err, THEME), ...extra };
  if (info.file && /^([A-Za-z]:|\/)/.test(info.file)) info.file = rel(info.file);
  record('liquid', { message: info.message, file: info.file, line: info.line, col: info.col, syntax: info.syntax, url: rs?.urlLabel });
  if (rs) rs.errors.push(info);
  return errorBox(info);
}

engine.renderer.renderTemplates = function* renderTemplates(templates, ctx, emitter) {
  if (!emitter) emitter = new DevEmitter();
  for (const tpl of templates) {
    ctx.renderLimit.check(performance.now());
    try {
      const html = yield tpl.render(ctx, emitter);
      if (html) emitter.write(html);
      if (ctx.breakCalled || ctx.continueCalled) break;
    } catch (e) {
      if (isFatal(e)) throw e;
      const err = LiquidError.is(e) ? e : new RenderError(e, tpl);
      emitter.write(reportError(err, ctx.globals?.[RS]));
    }
  }
  return emitter.buffer;
};

/* ------------------------------------------------------------------ */
/* Parsing of theme files (sections, templates, layouts)               */
/* ------------------------------------------------------------------ */
export function parseThemeFile(abs) {
  const key = `file:${abs}`;
  const hit = parseCache.read(key);
  if (hit) return hit;
  const raw = fs.readFileSync(abs, 'utf8').replace(/^﻿/, '');
  scanFile(abs, raw);
  const templates = engine.parse(preprocess(raw), abs);
  parseCache.write(key, templates);
  return templates;
}

export function clearEngineCaches() {
  parseCache.clear();
  scanned.clear();
}

export async function renderTemplates(templates, scope, globals) {
  return engine.render(templates, scope, { globals });
}

export { RS };
