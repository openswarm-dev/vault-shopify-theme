#!/usr/bin/env node
// Vault local preview server — a Shopify Online Store 2.0 storefront emulator for ./theme.
// Usage: node dev/server.mjs   (PORT env, default 4173)   → http://localhost:4173
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { THEME, DIRS, FIXTURES, fixturesEnabled, invalidate, exists, readText, sectionFile } from './lib/theme.mjs';
import { engine, clearEngineCaches, reportError } from './lib/engine.mjs';
import { record, snapshot, clear as clearErrors } from './lib/errors.mjs';
import { renderPage, renderSectionById, renderStaticSection, renderSectionGroup, renderSectionPreset, buildGlobals, injectDevClient } from './lib/render.mjs';
import { resolveRoute, listRoutes } from './lib/routes.mjs';
import { addItems, changeLine, updateCart, clearCart, cartJson, lineJsonByKey, CartError, cartDrop, cartContext } from './lib/cart.mjs';
import { predictiveSearch, recommend } from './lib/storefront.mjs';
import { productJson, paymentSvg, formatMoney, RS } from './lib/filters.mjs';
const selfFor = (host) => ({ context: { globals: { [RS]: { host } } } });
import { renderArt, esc } from './mock/art.mjs';
import { customer as mockCustomer, productsByHandle, products } from './mock/store.mjs';

const PORT = Number(process.env.PORT) || 4173;
// Hosted demo mode (e.g. Render): no live reload / file watching, not indexed by search engines.
const PRODUCTION = process.env.NODE_ENV === 'production' || process.env.VAULT_PRODUCTION === '1';
const MIME = {
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
function send(res, status, body, type = 'text/html; charset=utf-8', headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(res.req.method === 'HEAD' ? undefined : body);
}
const sendJson = (res, status, data, headers = {}) => send(res, status, JSON.stringify(data, null, 2), 'application/json; charset=utf-8', headers);
const redirect = (res, location, headers = {}) => { res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', ...headers }); res.end(); };

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const buf = Buffer.concat(chunks);
  const ct = String(req.headers['content-type'] || '');
  if (!buf.length) return {};
  if (ct.includes('application/json')) {
    try { return JSON.parse(buf.toString('utf8')); } catch { return {}; }
  }
  if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
    try {
      const fd = await new Request('http://local/', { method: 'POST', headers: { 'content-type': ct }, body: buf }).formData();
      return nest([...fd.entries()].filter(([, v]) => typeof v === 'string'));
    } catch {
      return nest([...new URLSearchParams(buf.toString('utf8')).entries()]);
    }
  }
  return nest([...new URLSearchParams(buf.toString('utf8')).entries()]);
}

/** Rails-style nested params: items[0][id], properties[Grade], updates[123], updates[] … */
function nest(entries) {
  const out = {};
  for (const [rawKey, value] of entries) {
    const m = rawKey.match(/^([^[\]]+)((?:\[[^\]]*\])*)$/);
    if (!m) { out[rawKey] = value; continue; }
    const keys = [m[1], ...[...m[2].matchAll(/\[([^\]]*)\]/g)].map((x) => x[1])];
    let cur = out;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const last = i === keys.length - 1;
      if (last) {
        if (k === '' && Array.isArray(cur)) cur.push(value);
        else cur[k] = value;
        break;
      }
      const key = k === '' && Array.isArray(cur) ? cur.length : k;
      const next = keys[i + 1];
      if (cur[key] == null || typeof cur[key] !== 'object') cur[key] = next === '' || (/^\d+$/.test(next) && Number(next) < 1000) ? [] : {};
      cur = cur[key];
    }
  }
  return out;
}

function createRS(req, url, overrides = {}) {
  const host = req.headers.host || `localhost:${PORT}`;
  const cookies = parseCookies(req.headers.cookie);
  const customerFromCookie = cookies.vault_customer === '1' && url.searchParams.get('customer') !== '0';
  const customer = url.searchParams.get('customer') === '1' || customerFromCookie ? mockCustomer : null;
  const rs = {
    method: req.method,
    url,
    path: decodeURI(url.pathname),
    query: url.searchParams,
    host,
    origin: `http://${host}`,
    port: PORT,
    urlLabel: url.pathname + url.search,
    customer,
    customerFromCookie,
    postedForm: null,
    noLivereload: PRODUCTION || req.headers['x-vault-no-livereload'] === '1' || cookies.vault_nolr === '1' || url.searchParams.has('__nolr'),
    errors: [],
    layout: undefined,
    objects: {},
    api: { renderStaticSection, renderSectionGroup },
    ...overrides,
  };
  if (url.searchParams.get('contact_posted') === 'true') rs.postedForm = { type: 'contact', success: true };
  if (url.searchParams.get('customer_posted') === 'true') rs.postedForm = { type: 'customer', success: true };
  return rs;
}

/** Render a list of section ids in the context of another URL (cart responses, ?sections=). */
async function renderSectionsFor(req, ids, sectionsUrl) {
  const list = (Array.isArray(ids) ? ids : String(ids || '').split(',')).map((s) => String(s).trim()).filter(Boolean).slice(0, 5);
  if (!list.length) return null;
  const u = new URL(sectionsUrl || '/cart', `http://${req.headers.host || `localhost:${PORT}`}`);
  const rs = createRS({ method: 'GET', headers: req.headers }, u, { noLivereload: true });
  resolveRoute(rs);
  buildGlobals(rs);
  const out = {};
  for (const id of list) out[id] = await renderSectionById(id, rs);
  return out;
}

/* ------------------------------------------------------------------ */
/* Storefront page / section rendering                                 */
/* ------------------------------------------------------------------ */
async function serveStorefront(req, res, url, overrides = {}) {
  const rs = createRS(req, url, overrides);
  const route = resolveRoute(rs);
  if (route.redirect) {
    const headers = route.clearCustomer ? { 'Set-Cookie': 'vault_customer=; Path=/; Max-Age=0' } : {};
    return redirect(res, route.redirect, headers);
  }
  const sectionId = url.searchParams.get('section_id');
  const sections = url.searchParams.get('sections');
  if (sectionId) {
    buildGlobals(rs);
    const html = await renderSectionById(sectionId, rs);
    if (html == null) return send(res, 404, `Section "${esc(sectionId)}" not found`, 'text/plain; charset=utf-8');
    return send(res, 200, html, 'text/html; charset=utf-8', { 'X-Vault-Liquid-Errors': String(rs.errors.length) });
  }
  if (sections) {
    buildGlobals(rs);
    const out = {};
    for (const id of sections.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5)) out[id] = await renderSectionById(id, rs);
    return sendJson(res, 200, out);
  }
  const html = await renderPage(rs);
  return send(res, rs.status || 200, html, 'text/html; charset=utf-8', { 'X-Vault-Liquid-Errors': String(rs.errors.length), 'X-Vault-Template': rs.templateFile || '' });
}

/* ------------------------------------------------------------------ */
/* Cart API                                                            */
/* ------------------------------------------------------------------ */
function cartErrorResponse(res, err, isJs) {
  if (!(err instanceof CartError)) throw err;
  if (isJs) return sendJson(res, err.status, err.toJSON());
  return send(res, err.status, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Cart error</title><body style="font:16px/1.5 system-ui;background:#111214;color:#f4f4f5;padding:40px"><h1>Cart error</h1><p>${esc(err.description)}</p><p><a style="color:#ff4b5c" href="/cart">Back to cart</a></p></body>`);
}
function addInput(body) {
  let items = body.items;
  if (items && !Array.isArray(items) && typeof items === 'object') items = Object.values(items);
  if (Array.isArray(items)) return { items: items.map((i) => ({ id: i.id, quantity: i.quantity, properties: i.properties })), multi: true };
  return { items: [{ id: body.id, quantity: body.quantity, properties: body.properties }], multi: false };
}

async function handleCart(req, res, url) {
  const p = url.pathname;
  const isJs = /\.(js|json)$/.test(p);
  const base = p.replace(/\.(js|json)$/, '');
  const host = req.headers.host || `localhost:${PORT}`;
  const method = req.method;

  if (base === '/cart' && method === 'GET' && isJs) return sendJson(res, 200, cartJson(host));
  const body = method === 'POST' ? await readBody(req) : Object.fromEntries(url.searchParams);
  const sectionsParam = body.sections || url.searchParams.get('sections');
  const sectionsUrl = body.sections_url || url.searchParams.get('sections_url') || '/cart';
  const withSections = async (payload) => {
    if (!sectionsParam) return payload;
    return { ...payload, sections: await renderSectionsFor(req, sectionsParam, sectionsUrl) };
  };
  try {
    if (base === '/cart/add') {
      if (method === 'GET' && !url.searchParams.get('id')) return redirect(res, '/cart');
      const { items, multi } = addInput(body);
      const keys = addItems(items);
      if (!isJs) return redirect(res, '/cart');
      const lines = keys.map((k) => lineJsonByKey(k, host));
      return sendJson(res, 200, await withSections(multi ? { items: lines } : lines[0]));
    }
    if (base === '/cart/change') {
      changeLine({ id: body.id, line: body.line, quantity: body.quantity, properties: body.properties });
      if (!isJs) return redirect(res, '/cart');
      return sendJson(res, 200, await withSections(cartJson(host)));
    }
    if (base === '/cart/update') {
      updateCart({ updates: body.updates, note: body.note, attributes: body.attributes });
      if (!isJs) return redirect(res, body.checkout != null ? '/checkout' : '/cart');
      return sendJson(res, 200, await withSections(cartJson(host)));
    }
    if (base === '/cart/clear') {
      clearCart();
      if (!isJs) return redirect(res, '/cart');
      return sendJson(res, 200, await withSections(cartJson(host)));
    }
    if (base === '/cart' && method === 'POST') {
      if (body.updates || body.note != null || body.attributes) updateCart({ updates: body.updates, note: body.note, attributes: body.attributes });
      if (body.checkout != null) return redirect(res, '/checkout');
      return redirect(res, '/cart');
    }
  } catch (err) {
    return cartErrorResponse(res, err, isJs);
  }
  return null;
}

function checkoutPage() {
  const c = cartDrop();
  const rows = c.items.map((i) => `<li><span>${esc(i.title)} × ${i.quantity}</span><strong>${formatMoney(i.final_line_price)}</strong></li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Checkout — preview</title>
<style>body{margin:0;background:#111214;color:#f4f4f5;font:16px/1.5 system-ui,sans-serif}main{max-width:560px;margin:0 auto;padding:48px 16px}h1{font-size:28px;margin:0 0 8px}p{color:#a1a1aa}ul{list-style:none;padding:0;margin:24px 0;border-top:1px solid #2a2c33}li{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid #2a2c33}a{color:#ff4b5c}</style></head>
<body><main><h1>Checkout is handled by Shopify</h1><p>The local preview stops here. On a real store this hands off to Shopify Checkout.</p><ul>${rows || '<li>Your cart is empty</li>'}</ul><p><strong style="color:#f4f4f5">Subtotal: ${formatMoney(c.total_price)}</strong></p><p><a href="/cart">← Back to cart</a></p></main></body></html>`;
}

/* ------------------------------------------------------------------ */
/* Customer / contact form posts                                       */
/* ------------------------------------------------------------------ */
async function handleFormPost(req, res, url) {
  const body = await readBody(req);
  const p = url.pathname;
  const ref = (() => {
    try {
      const r = new URL(req.headers.referer || '');
      return r.host === req.headers.host ? r.pathname : null;
    } catch { return null; }
  })();
  const cookie = 'vault_customer=1; Path=/; SameSite=Lax';
  if (p === '/account/login') {
    const email = body.customer?.email || body.email;
    const password = body.customer?.password || body.password;
    if (body.form_type === 'guest_login') return redirect(res, '/checkout');
    if (email && password) return redirect(res, body.return_url || body.checkout_url || '/account', { 'Set-Cookie': cookie });
    const u = new URL('/account/login', `http://${req.headers.host}`);
    return serveStorefront({ method: 'GET', headers: { ...req.headers, cookie: '' } }, res, u, { postedForm: { type: 'customer_login', success: false, errors: { form: 'Incorrect email or password.' }, values: { email } } });
  }
  if (p === '/account' && (body.form_type === 'create_customer' || body.customer)) {
    if (body.customer?.email) return redirect(res, '/account', { 'Set-Cookie': cookie });
    const u = new URL('/account/register', `http://${req.headers.host}`);
    return serveStorefront({ method: 'GET', headers: req.headers }, res, u, { postedForm: { type: 'create_customer', success: false, errors: { email: "can't be blank." }, values: {} } });
  }
  if (p === '/account/recover') {
    const u = new URL('/account/login', `http://${req.headers.host}`);
    const ok = !!body.email;
    return serveStorefront({ method: 'GET', headers: { ...req.headers, cookie: '' } }, res, u, { postedForm: { type: 'recover_customer_password', success: ok, errors: ok ? null : { email: "can't be blank." }, values: { email: body.email } } });
  }
  if (p.startsWith('/account/addresses')) return redirect(res, '/account/addresses');
  if (p.startsWith('/account/activate') || p.startsWith('/account/reset')) return redirect(res, '/account', { 'Set-Cookie': cookie });
  if (p === '/contact') {
    const type = body.form_type === 'customer' ? 'customer' : 'contact';
    const email = body.contact?.email || body.customer?.email || body.email;
    const target = ref || body.return_to || '/';
    if (email) return redirect(res, `${target}?${type}_posted=true#${type === 'customer' ? 'newsletter' : 'contact_form'}`);
    const u = new URL(target, `http://${req.headers.host}`);
    return serveStorefront({ method: 'GET', headers: req.headers }, res, u, { postedForm: { type, success: false, errors: { email: "can't be blank." }, values: Object.fromEntries(Object.entries(body.contact || {}).map(([k, v]) => [`contact[${k}]`, v])) } });
  }
  if (p === '/password') return redirect(res, '/');
  if (p === '/localization') return redirect(res, body.return_to || ref || '/');
  if (/^\/blogs\/[^/]+\/[^/]+\/comments$/.test(p)) return redirect(res, `${p.replace(/\/comments$/, '')}?comment_posted=true#comments`);
  return null;
}

/* ------------------------------------------------------------------ */
/* Static files & stubs                                                */
/* ------------------------------------------------------------------ */
async function serveAsset(req, res, url) {
  const file = decodeURIComponent(url.pathname.slice('/assets/'.length));
  const abs = path.resolve(DIRS.assets, file);
  if (!abs.toLowerCase().startsWith(path.resolve(DIRS.assets).toLowerCase())) return send(res, 403, 'Forbidden', 'text/plain');
  const ext = path.extname(abs).toLowerCase();
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    return res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(abs));
  }
  if (fs.existsSync(`${abs}.liquid`)) {
    const rs = createRS(req, new URL('/', `http://${req.headers.host}`), { noLivereload: true });
    resolveRoute(rs);
    const globals = buildGlobals(rs);
    let out;
    try { out = await engine.parseAndRender(readText(`${abs}.liquid`), {}, { globals }); } catch (err) { out = `/* ${String(err.message).replace(/\*\//g, '* /')} */`; }
    return send(res, 200, out, MIME[ext] || 'text/plain; charset=utf-8', { 'Cache-Control': 'no-cache' });
  }
  record('assets', { key: `asset404:${file}`, message: `404 for /assets/${file}`, file: `assets/${file}`, url: req.headers.referer || url.pathname });
  return send(res, 404, `Asset not found: ${file}`, 'text/plain; charset=utf-8');
}

const QRCODE_STUB = `/* Vault preview stub for Shopify's vendor/qrcode.js — draws a deterministic placeholder QR. */
(function () {
  function QRCode(el, opts) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (typeof opts === 'string') opts = { text: opts };
    opts = opts || {};
    var size = opts.width || 128, n = 25, cell = size / n, h = 2166136261, text = String(opts.text || 'vault');
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    var dark = opts.colorDark || '#000', light = opts.colorLight || '#fff', rects = '';
    function finder(x, y) {
      var f = [[0, 0], [n - 7, 0], [0, n - 7]];
      for (var k = 0; k < 3; k++) { var lx = x - f[k][0], ly = y - f[k][1];
        if (lx >= 0 && lx < 7 && ly >= 0 && ly < 7) return (lx === 0 || lx === 6 || ly === 0 || ly === 6 || (lx > 1 && lx < 5 && ly > 1 && ly < 5)) ? 1 : 0; }
      return -1;
    }
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      h = (Math.imul(h, 1103515245) + 12345) >>> 0;
      var f = finder(x, y), on = f === -1 ? (h >>> 16) & 1 : f;
      if (on) rects += '<rect x="' + (x * cell) + '" y="' + (y * cell) + '" width="' + cell + '" height="' + cell + '"/>';
    }
    if (el) el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="' + light + '"/><g fill="' + dark + '">' + rects + '</g></svg>';
  }
  QRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
  window.QRCode = QRCode;
})();`;
const SHOPIFY_COMMON_STUB = `/* Vault preview stub for shopify_common.js */
window.Shopify = window.Shopify || {};
Shopify.bind = function (fn, scope) { return function () { return fn.apply(scope, arguments); }; };
Shopify.setSelectorByValue = function (selector, value) { for (var i = 0; i < selector.options.length; i++) { if (value == selector.options[i].value || value == selector.options[i].innerHTML) { selector.selectedIndex = i; return i; } } };
Shopify.addListener = function (el, ev, fn) { el.addEventListener ? el.addEventListener(ev, fn, false) : el.attachEvent('on' + ev, fn); };
Shopify.postLink = function (path, options) {
  options = options || {}; var form = document.createElement('form'); form.setAttribute('method', options.method || 'post'); form.setAttribute('action', path);
  var params = options.parameters || {}; for (var key in params) { var f = document.createElement('input'); f.type = 'hidden'; f.name = key; f.value = params[key]; form.appendChild(f); }
  document.body.appendChild(form); form.submit(); document.body.removeChild(form);
};
Shopify.CountryProvinceSelector = function (countryId, provinceId, options) {
  this.countryEl = document.getElementById(countryId); this.provinceEl = document.getElementById(provinceId);
  this.provinceContainer = document.getElementById((options && options.hideElement) || provinceId);
  if (this.countryEl && this.countryEl.getAttribute('data-default')) Shopify.setSelectorByValue(this.countryEl, this.countryEl.getAttribute('data-default'));
};`;

function serveShopifyAsset(req, res, url) {
  const file = url.pathname.slice('/shopify-assets/'.length);
  if (file === 'vendor/qrcode.js' || file === 'qrcode.js') return send(res, 200, QRCODE_STUB, MIME['.js']);
  if (file === 'shopify_common.js') return send(res, 200, SHOPIFY_COMMON_STUB, MIME['.js']);
  const pay = file.match(/^payment\/([\w-]+)\.svg$/);
  if (pay) return send(res, 200, paymentSvg(pay[1]), MIME['.svg']);
  if (/add-to-apple-wallet\.svg$/.test(file)) return send(res, 200, '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40" role="img" aria-label="Add to Apple Wallet"><rect width="120" height="40" rx="8" fill="#000"/><text x="60" y="25" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#fff">Add to Apple Wallet</text></svg>', MIME['.svg']);
  if (file.endsWith('.svg')) return send(res, 200, `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40"><rect width="120" height="40" rx="6" fill="#2a2c33"/><text x="60" y="24" text-anchor="middle" font-family="Arial" font-size="10" fill="#a1a1aa">${esc(file.split('/').pop())}</text></svg>`, MIME['.svg']);
  if (file.endsWith('.js')) return send(res, 200, `/* Vault preview: no stub for ${file} */`, MIME['.js']);
  if (file.endsWith('.css')) return send(res, 200, `/* Vault preview: no stub for ${file} */`, MIME['.css']);
  return send(res, 404, 'Not found', 'text/plain');
}

/* ------------------------------------------------------------------ */
/* Live reload                                                         */
/* ------------------------------------------------------------------ */
const sseClients = new Set();
function broadcast(event) {
  for (const res of sseClients) res.write(`event: ${event}\ndata: ${Date.now()}\n\n`);
}
let pending = new Set();
let timer = null;
const watchDirs = [THEME, ...(fixturesEnabled() && fs.existsSync(FIXTURES) ? [FIXTURES] : [])];
try {
  if (PRODUCTION) throw new Error('production mode');
  for (const dir of watchDirs) fs.watch(dir, { recursive: true }, (event, filename) => {
    if (!filename) return;
    pending.add(String(filename).replace(/\\/g, '/'));
    clearTimeout(timer);
    timer = setTimeout(() => {
      // Ignore directory events and editors' temp/swap files when deciding what changed.
      const files = [...pending].filter((f) => /\.[a-z0-9]+$/i.test(f) && !/\.tmp\.|~$|\.sw[a-z]$|\.crswap$/i.test(f));
      pending = new Set();
      invalidate();
      clearEngineCaches();
      if (!files.length) return;
      const cssOnly = files.every((f) => f.endsWith('.css'));
      broadcast(cssOnly ? 'css' : 'reload');
      console.log(`\x1b[2m↻ ${files.slice(0, 4).join(', ')}${files.length > 4 ? ` +${files.length - 4}` : ''} → ${cssOnly ? 'css' : 'reload'} (${sseClients.size} client${sseClients.size === 1 ? '' : 's'})\x1b[0m`);
    }, 90);
  });
} catch (err) {
  console.warn(`⚠ fs.watch unavailable (${err.message}) — live reload disabled; caches still clear on restart.`);
}
setInterval(() => { for (const res of sseClients) res.write(': ping\n\n'); }, 25000).unref();

/* ------------------------------------------------------------------ */
/* Dev pages                                                           */
/* ------------------------------------------------------------------ */
const DEV_CSS = `*{box-sizing:border-box}body{margin:0;background:#0b0c0f;color:#e4e4e7;font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}a{color:#ff6b78}header{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:10px 16px;background:#16171c;border-bottom:1px solid #2a2c33}header strong{color:#fff;letter-spacing:.08em}input,select,button{font:inherit;color:#f4f4f5;background:#0b0c0f;border:1px solid #33353d;border-radius:8px;padding:7px 10px;min-height:36px}input[type=text]{flex:1 1 260px;min-width:0}button{background:#e11d2e;border-color:#e11d2e;cursor:pointer;font-weight:600}label{display:inline-flex;gap:6px;align-items:center;color:#a1a1aa}`;

function previewPage(initialPath) {
  const devices = [['phone', 'Phone', 390, 844], ['tablet', 'Tablet', 820, 1180], ['tabletLandscape', 'Tablet landscape', 1180, 820], ['desktop', 'Desktop', 1440, 900]];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Vault preview gallery</title>
<style>${DEV_CSS}
main{display:flex;flex-wrap:wrap;gap:20px;padding:20px 16px;align-items:flex-start}
figure{margin:0;display:flex;flex-direction:column;gap:6px}
figcaption{display:flex;justify-content:space-between;gap:12px;color:#a1a1aa;font-size:12px}
figcaption a{color:#a1a1aa}
.frame{position:relative;overflow:hidden;border:1px solid #2a2c33;border-radius:14px;background:#111214;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.frame iframe{position:absolute;top:0;left:0;border:0;transform-origin:0 0;background:#111214}
</style></head><body>
<header><strong>VAULT · PREVIEW</strong>
<form id="f" style="display:contents"><input type="text" id="path" value="${esc(initialPath)}" aria-label="Path"><button>Go</button></form>
<label>Scale <input type="range" id="scale" min="0.2" max="1" step="0.05" value="0.45"></label>
<label><input type="checkbox" id="sync" checked> Sync navigation</label>
<a href="/__routes">Routes</a><a href="/__errors" target="_blank">Errors</a><a href="/__sections">Sections</a></header>
<main id="m">${devices.map(([id, label, w, h]) => `<figure data-w="${w}" data-h="${h}"><figcaption><span>${label} · ${w}×${h}</span><a href="#" data-open target="_blank">open ↗</a></figcaption><div class="frame"><iframe id="fr-${id}" title="${label} preview" width="${w}" height="${h}"></iframe></div></figure>`).join('')}</main>
<script>
(function(){
  var pathEl=document.getElementById('path'),scaleEl=document.getElementById('scale'),syncEl=document.getElementById('sync');
  var figs=[].slice.call(document.querySelectorAll('figure'));
  function setScale(){var s=+scaleEl.value;figs.forEach(function(f){var w=+f.dataset.w,h=+f.dataset.h,fr=f.querySelector('.frame'),i=f.querySelector('iframe');fr.style.width=(w*s)+'px';fr.style.height=(h*s)+'px';i.style.transform='scale('+s+')';});try{localStorage.setItem('vault-preview-scale',s)}catch(e){}}
  function go(p,skip){if(!p)p='/';pathEl.value=p;history.replaceState(null,'','/__preview?path='+encodeURIComponent(p));figs.forEach(function(f){var i=f.querySelector('iframe');f.querySelector('[data-open]').href=p;if(i!==skip)i.src=p;});}
  try{var s=localStorage.getItem('vault-preview-scale');if(s)scaleEl.value=s}catch(e){}
  scaleEl.addEventListener('input',setScale);setScale();
  document.getElementById('f').addEventListener('submit',function(e){e.preventDefault();go(pathEl.value);});
  figs.forEach(function(f){var i=f.querySelector('iframe');i.addEventListener('load',function(){try{var l=i.contentWindow.location;var p=l.pathname+l.search;if(syncEl.checked&&p!==pathEl.value&&l.pathname!=='blank')go(p,i);}catch(e){}});});
  go(pathEl.value);
  if(window.EventSource){var es=new EventSource('/__livereload');es.addEventListener('reload',function(){figs.forEach(function(f){var i=f.querySelector('iframe');try{i.contentWindow.location.reload()}catch(e){i.src=i.src}});});es.addEventListener('css',function(){figs.forEach(function(f){try{var d=f.querySelector('iframe').contentDocument;d.querySelectorAll('link[rel="stylesheet"][href^="/assets/"]').forEach(function(l){var u=new URL(l.href);u.searchParams.set('lr',Date.now());l.href=u.toString();});}catch(e){}});});}
})();
</script></body></html>`;
}

function routesPage(routes) {
  const groups = {};
  for (const r of routes) (groups[r.group] = groups[r.group] || []).push(r);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Vault routes</title><style>${DEV_CSS}main{max-width:960px;margin:0 auto;padding:16px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:#a1a1aa;margin:28px 0 8px}ul{list-style:none;margin:0;padding:0;border-top:1px solid #23252b}li{display:flex;flex-wrap:wrap;gap:4px 16px;justify-content:space-between;padding:10px 0;border-bottom:1px solid #23252b}code{color:#a1a1aa;overflow-wrap:anywhere}</style></head><body><header><strong>VAULT · ROUTES</strong><a href="/__preview">Preview gallery</a><a href="/__sections">Sections</a><a href="/__errors">Errors (JSON)</a><a href="/__routes?format=json">JSON</a></header><main>${Object.entries(groups).map(([g, list]) => `<h2>${esc(g)}</h2><ul>${list.map((r) => `<li><span><a href="${esc(r.path)}">${esc(r.label)}</a> <code>${esc(r.path)}</code></span><a href="/__preview?path=${encodeURIComponent(r.path)}">preview ↗</a></li>`).join('')}</ul>`).join('')}</main></body></html>`;
}

function sectionsPage() {
  let files = [];
  try { files = fs.readdirSync(DIRS.sections); } catch { /* none */ }
  const liquid = files.filter((f) => f.endsWith('.liquid')).map((f) => f.replace(/\.liquid$/, '')).sort();
  const groups = files.filter((f) => f.endsWith('.json'));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Vault sections</title><style>${DEV_CSS}main{max-width:960px;margin:0 auto;padding:16px}ul{list-style:none;margin:0;padding:0}li{display:flex;flex-wrap:wrap;gap:4px 16px;justify-content:space-between;padding:10px 0;border-bottom:1px solid #23252b}</style></head><body><header><strong>VAULT · SECTIONS</strong><a href="/__routes">Routes</a><a href="/__preview">Preview</a></header><main><p>Each section rendered alone (inside the theme layout) with its first preset — or its schema defaults for main-/static sections.</p><ul>${liquid.map((n) => `<li><a href="/__section/${esc(n)}">${esc(n)}</a><span><a href="/__preview?path=${encodeURIComponent(`/__section/${n}`)}">preview ↗</a> · <a href="/?section_id=${esc(n)}">raw HTML</a></span></li>`).join('') || '<li>No sections yet.</li>'}</ul><p>Groups: ${groups.map(esc).join(', ') || 'none'}</p></main></body></html>`;
}

async function serveSectionPreview(req, res, url) {
  const name = decodeURIComponent(url.pathname.slice('/__section/'.length));
  if (!/^[\w-]+$/.test(name) || !exists(sectionFile(name))) return send(res, 404, `No section sections/${esc(name)}.liquid`, 'text/plain; charset=utf-8');
  const productHandle = url.searchParams.get('product') || 'base-set-holo-dragon-psa-10';
  const collectionHandle = url.searchParams.get('collection') || 'graded-slabs';
  const u = new URL(name.startsWith('main-product') || name.includes('product') ? `/products/${productHandle}` : name.includes('collection') && !name.includes('list') ? `/collections/${collectionHandle}` : '/', `http://${req.headers.host}`);
  for (const [k, v] of url.searchParams) u.searchParams.set(k, v);
  const rs = createRS(req, u, { urlLabel: url.pathname + url.search });
  resolveRoute(rs);
  buildGlobals(rs);
  const html = await renderSectionPreset(name, Number(url.searchParams.get('preset') || 0), rs);
  rs.builtinContent = html;
  rs.layout = undefined;
  const page = await renderPage(rs);
  return send(res, 200, page, 'text/html; charset=utf-8', { 'X-Vault-Liquid-Errors': String(rs.errors.length) });
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */
async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  const p = url.pathname;
  const method = req.method;

  // dev endpoints
  if (p === '/__livereload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 1000\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }
  if (p === '/__errors') {
    if (method === 'DELETE' || url.searchParams.has('clear')) { clearErrors(); return sendJson(res, 200, { cleared: true }); }
    return sendJson(res, 200, snapshot());
  }
  if (p === '/__routes') {
    const routes = listRoutes();
    const wantsHtml = String(req.headers.accept || '').includes('text/html') && url.searchParams.get('format') !== 'json';
    return wantsHtml ? send(res, 200, routesPage(routes)) : sendJson(res, 200, routes);
  }
  if (p === '/__preview') return send(res, 200, previewPage(url.searchParams.get('path') || '/'));
  if (p === '/__sections') return send(res, 200, sectionsPage());
  if (p.startsWith('/__section/')) return serveSectionPreview(req, res, url);
  if (p === '/__status') return sendJson(res, 200, { ok: true, port: PORT, theme: THEME, products: products.length });

  // static & stubs
  if (p.startsWith('/assets/')) return serveAsset(req, res, url);
  if (p.startsWith('/mock/img/')) {
    const name = decodeURIComponent(p.slice('/mock/img/'.length)).replace(/\.svg$/, '');
    return send(res, 200, renderArt(name), MIME['.svg'], { 'Cache-Control': 'public, max-age=600' });
  }
  if (p.startsWith('/mock/files/')) return send(res, 404, 'Not found', 'text/plain');
  if (p.startsWith('/shopify-assets/')) return serveShopifyAsset(req, res, url);
  if (p.startsWith('/cdn/')) return send(res, 404, 'Not found', 'text/plain');
  if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (p === '/checkout' || p.startsWith('/checkouts')) return send(res, 200, checkoutPage());

  // cart
  if (/^\/cart(\.js|\.json)?$/.test(p) && (method === 'POST' || /\.(js|json)$/.test(p)) || /^\/cart\/(add|change|update|clear)(\.js|\.json)?$/.test(p)) {
    const handled = await handleCart(req, res, url);
    if (handled !== null || res.headersSent) return;
  }

  // predictive search
  if (p === '/search/suggest' || p === '/search/suggest.json') {
    const predictive = predictiveSearch(url.searchParams);
    if (p.endsWith('.json') || !url.searchParams.get('section_id')) {
      const host = req.headers.host;
      const results = Object.fromEntries(Object.entries(predictive.resources).map(([k, list]) => [k, list.map((x) => (x.object_type === 'product' ? { ...productJson(x, selfFor(host)), body: x.description } : x.object_type ? { id: x.id, title: x.title, handle: x.handle, url: x.url } : x))]));
      return sendJson(res, 200, { resources: { results } });
    }
    const u = new URL('/search', url);
    u.searchParams.set('q', predictive.terms);
    const rs = createRS(req, u, { noLivereload: true });
    resolveRoute(rs);
    rs.objects = { ...rs.objects, predictive_search: predictive };
    buildGlobals(rs);
    const html = await renderSectionById(url.searchParams.get('section_id'), rs);
    if (html == null) return send(res, 404, 'Section not found', 'text/plain');
    return send(res, 200, html, 'text/html; charset=utf-8', { 'X-Vault-Liquid-Errors': String(rs.errors.length) });
  }

  // recommendations
  if (p === '/recommendations/products' || p === '/recommendations/products.json') {
    const recommendations = recommend(url.searchParams.get('product_id'), { limit: url.searchParams.get('limit'), intent: url.searchParams.get('intent') || 'related' });
    if (p.endsWith('.json') || !url.searchParams.get('section_id')) {
      return sendJson(res, 200, { products: recommendations.products.map((x) => productJson(x, selfFor(req.headers.host), { ajax: true })), intent: recommendations.intent });
    }
    const source = products.find((x) => String(x.id) === url.searchParams.get('product_id'));
    const u = new URL(source ? source.url : '/', url);
    const rs = createRS(req, u, { noLivereload: true });
    resolveRoute(rs);
    rs.objects = { ...rs.objects, recommendations };
    buildGlobals(rs);
    const html = await renderSectionById(url.searchParams.get('section_id'), rs);
    if (html == null) return send(res, 404, 'Section not found', 'text/plain');
    return send(res, 200, html, 'text/html; charset=utf-8', { 'X-Vault-Liquid-Errors': String(rs.errors.length) });
  }

  // product AJAX JSON
  const pj = p.match(/^\/products\/([^/]+)\.(js|json)$/);
  if (pj) {
    const product = productsByHandle[decodeURIComponent(pj[1])];
    if (!product) return sendJson(res, 404, { status: 404, message: 'Not found' });
    const json = productJson(product, selfFor(req.headers.host), { ajax: true });
    return sendJson(res, 200, pj[2] === 'json' ? { product: json } : json);
  }

  // form posts
  if (method === 'POST') {
    const handled = await handleFormPost(req, res, url);
    if (handled !== null || res.headersSent) return;
    return send(res, 404, 'Not found', 'text/plain');
  }

  if (method !== 'GET' && method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
  return serveStorefront(req, res, url);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  try {
    // One cart per visitor: a random id in the vault_cart cookie selects the in-memory cart.
    const visitor = /(?:^|;s*)vault_cart=([a-f0-9]{16,64})/.exec(req.headers.cookie || '')?.[1] || crypto.randomBytes(16).toString('hex');
    if (!(req.headers.cookie || '').includes(`vault_cart=${visitor}`)) {
      res.appendHeader('Set-Cookie', `vault_cart=${visitor}; Path=/; Max-Age=86400; SameSite=Lax; HttpOnly`);
      // Make the id visible to this request's own cookie parsing too.
      req.headers.cookie = [req.headers.cookie, `vault_cart=${visitor}`].filter(Boolean).join('; ');
    }
    if (PRODUCTION) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    await cartContext.run(visitor, () => handle(req, res));
  } catch (err) {
    record('server', { message: err?.stack?.split('\n').slice(0, 3).join(' | ') || String(err), url: req.url });
    const body = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Preview server error</title><body style="font:14px/1.5 ui-monospace,Consolas,monospace;background:#111214;color:#ffe4e6;padding:24px"><h1 style="color:#ff4b5c">Preview server error</h1><pre style="white-space:pre-wrap">${esc(err?.stack || err)}</pre></body>`;
    if (!res.headersSent) send(res, 500, body);
    else res.end();
  } finally {
    if (process.env.VAULT_LOG_REQUESTS) console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`✗ Port ${PORT} is already in use. Stop the other server or run with PORT=<n>.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`\n  \x1b[1m\x1b[31mVAULT\x1b[0m local preview  →  http://localhost:${PORT}`);
  console.log(`  gallery  http://localhost:${PORT}/__preview   routes  /__routes   errors  /__errors   sections  /__sections\n`);
});

process.on('unhandledRejection', (err) => record('server', { message: `unhandledRejection: ${err?.message || err}` }));

// Keep-alive "ping pong" for free hosting tiers that sleep when idle (Render free spins down after
// 15 minutes without inbound traffic). The service pings its own public URL every 10 minutes.
// Render sets RENDER_EXTERNAL_URL automatically; KEEPALIVE_URL overrides it; VAULT_KEEPALIVE=0 disables.
const keepAliveBase = process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL;
if (PRODUCTION && keepAliveBase && process.env.VAULT_KEEPALIVE !== '0') {
  const ping = async () => {
    try {
      const res = await fetch(new URL('/__status', keepAliveBase), { headers: { 'User-Agent': 'vault-keepalive' } });
      if (!res.ok) console.warn(`keep-alive: ${res.status}`);
    } catch (err) {
      console.warn(`keep-alive failed: ${err.message}`);
    }
  };
  setInterval(ping, 10 * 60 * 1000).unref();
  setTimeout(ping, 60 * 1000).unref();
  console.log(`  keep-alive → ${keepAliveBase}/__status every 10 min`);
}

export { server, nest, injectDevClient, reportError };
