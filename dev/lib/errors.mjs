// Ring buffer of dev diagnostics, exposed at GET /__errors.
// Kinds: liquid (render/syntax errors), translations (missing keys), filters (unknown filters),
// assets (missing theme assets / sections / templates), server (uncaught handler errors).
const MAX_PER_KIND = 400;
const buckets = new Map();
const index = new Map();
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export function record(kind, data) {
  const key = `${kind}|${data.key ?? `${data.message}|${data.file ?? ''}|${data.line ?? ''}`}`;
  const now = new Date().toISOString();
  let entry = index.get(key);
  if (entry) {
    entry.count += 1;
    entry.last = now;
    if (data.url && !entry.urls.includes(data.url)) {
      entry.urls.push(data.url);
      if (entry.urls.length > 6) entry.urls.shift();
    }
    return entry;
  }
  const { key: _k, url, ...rest } = data;
  entry = { kind, ...rest, url: url ?? null, urls: url ? [url] : [], count: 1, first: now, last: now };
  Object.defineProperty(entry, '_key', { value: key });
  index.set(key, entry);
  if (!buckets.has(kind)) buckets.set(kind, []);
  const list = buckets.get(kind);
  list.push(entry);
  if (list.length > MAX_PER_KIND) index.delete(list.shift()._key);
  log(kind, entry);
  return entry;
}

function log(kind, e) {
  const where = e.file ? ` ${DIM}(${e.file}${e.line ? `:${e.line}` : ''})${RESET}` : '';
  const at = e.url ? ` ${DIM}@ ${e.url}${RESET}` : '';
  if (kind === 'liquid' || kind === 'server') console.error(`${RED}✗ ${kind}${RESET} ${e.message}${where}${at}`);
  else if (kind === 'filters') console.warn(`${YELLOW}⚠ unknown filter${RESET} "${e.name}"${where}${at}`);
  else if (kind === 'translations') console.warn(`${YELLOW}⚠ translation missing${RESET} ${e.key_name}${where}${at}`);
  else console.warn(`${YELLOW}⚠ ${kind}${RESET} ${e.message}${where}${at}`);
}

export function snapshot() {
  const out = {};
  for (const kind of ['liquid', 'translations', 'filters', 'assets', 'server']) out[kind] = [...(buckets.get(kind) || [])].reverse();
  out.counts = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length]));
  return out;
}

export function clear() {
  buckets.clear();
  index.clear();
}

/** Extracts { message, file, line, col } from a liquidjs (or plain) error. */
export function describeError(err, themeRoot) {
  let e = err;
  const token = e?.token;
  let file = token?.file || null;
  let line = null;
  let col = null;
  try {
    if (token && typeof token.getPosition === 'function') [line, col] = token.getPosition();
  } catch { /* ignore */ }
  let message = String(e?.originalError?.message || e?.message || e);
  message = message.replace(/, file:[^,]*, line:\d+, col:\d+$/, '').replace(/, line:\d+, col:\d+$/, '');
  const lookup = message.match(/Failed to lookup "([^"]+)" in/);
  if (lookup) message = `Could not find asset snippets/${lookup[1]}.liquid`;
  if (file && themeRoot) {
    const norm = file.replace(/\\/g, '/');
    const root = themeRoot.replace(/\\/g, '/');
    if (norm.toLowerCase().startsWith(root.toLowerCase())) file = norm.slice(root.length + 1);
    else file = norm;
  }
  const syntax = /ParseError|TokenizationError/.test(e?.name || '') || /not closed|unexpected|invalid|illegal/i.test(message);
  return { message, file, line, col, syntax };
}

export function errorBox(info) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const label = info.syntax ? 'Liquid syntax error' : 'Liquid error';
  const where = info.file ? ` in ${info.file}${info.line ? ` line ${info.line}` : ''}` : '';
  return `<div class="dev-liquid-error" data-dev-error role="alert" style="display:block;box-sizing:border-box;max-width:calc(100% - 16px);margin:8px;padding:10px 14px;border:2px solid #ff3b4f;border-radius:6px;background:#3b0a0f;color:#ffe4e6;font:500 13px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;text-align:left;text-transform:none;letter-spacing:0;position:relative;z-index:5;opacity:1;transform:none;filter:none;clip-path:none">${esc(`${label}${where}: ${info.message}`)}</div>`;
}
