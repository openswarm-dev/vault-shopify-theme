#!/usr/bin/env node
// Vault screenshot + layout QA runner (playwright-core driving local Edge/Chrome, headless).
//
//   node dev/screenshot.mjs [--base http://localhost:4173] [--routes /,/cart] [--viewports phone,desktop]
//                           [--out dev/screenshots] [--reduced-motion] [--no-full] [--start-server]
//                           [--concurrency 3] [--strict]
//
// For every route × viewport: load (networkidle), scroll slowly to the bottom (triggers inView reveals),
// scroll back up, take a full-page PNG and audit the page: console/page errors, failed requests, Liquid
// error boxes, missing translations, horizontal overflow (+ offending elements), stuck [data-reveal]
// elements, invisible text in the first viewport, small tap targets, images without alt, h1 count.
// Writes <out>/report.json and prints a summary table.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ */
/* args                                                                */
/* ------------------------------------------------------------------ */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (!a.startsWith('--')) continue;
    a = a.slice(2);
    let val;
    if (a.includes('=')) [a, val] = [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)];
    else if (argv[i + 1] != null && !argv[i + 1].startsWith('--')) val = argv[++i];
    else val = true;
    if (a.startsWith('no-')) { out[a.slice(3)] = false; continue; }
    out[a] = val;
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const bool = (v, d) => (v === undefined ? d : v === true || !['false', '0', 'no'].includes(String(v).toLowerCase()));
const BASE = String(args.base || process.env.VAULT_BASE || 'http://localhost:4173').replace(/\/$/, '');
const OUT = path.resolve(ROOT, String(args.out || 'dev/screenshots'));
const FULL = bool(args.full, true);
const REDUCED = bool(args['reduced-motion'], false);
const START = bool(args['start-server'], false);
const STRICT = bool(args.strict, false);
const CONCURRENCY = Math.max(1, Math.min(8, Number(args.concurrency) || 2));
const NAV_TIMEOUT = Number(args.timeout) || 45000;

export const VIEWPORTS = {
  small: { width: 320, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  tablet: { width: 820, height: 1180, isMobile: false, hasTouch: true, deviceScaleFactor: 1 },
  tabletLandscape: { width: 1180, height: 820, isMobile: false, hasTouch: true, deviceScaleFactor: 1 },
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
};
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const TABLET_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const viewportNames = String(args.viewports || 'phone,tablet,tabletLandscape,desktop').split(',').map((s) => s.trim()).filter(Boolean);
for (const v of viewportNames) {
  if (!VIEWPORTS[v]) {
    console.error(`Unknown viewport "${v}". Available: ${Object.keys(VIEWPORTS).join(', ')}`);
    process.exit(2);
  }
}

/** Git Bash (MSYS) rewrites "/cart" into "C:/Program Files/Git/cart" — undo that. */
function normaliseRoute(r) {
  let s = String(r).trim();
  const msys = s.match(/^[A-Za-z]:[\\/].*?[\\/]Git([\\/].*)?$/i);
  if (msys) s = (msys[1] || '/').replace(/\\/g, '/');
  if (/^https?:\/\//.test(s)) {
    const u = new URL(s);
    s = u.pathname + u.search;
  }
  if (!s.startsWith('/')) s = `/${s}`;
  return s;
}
const slug = (route) => (route === '/' ? 'index' : route.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'index');

/* ------------------------------------------------------------------ */
/* server                                                              */
/* ------------------------------------------------------------------ */
async function ping() {
  try {
    const res = await fetch(`${BASE}/__status`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}
async function ensureServer() {
  if (await ping()) return null;
  if (!START) {
    console.error(`✗ No preview server at ${BASE}. Start it with "npm run dev" or pass --start-server.`);
    process.exit(2);
  }
  const port = new URL(BASE).port || '4173';
  fs.mkdirSync(OUT, { recursive: true });
  const log = fs.openSync(path.join(OUT, 'server.log'), 'w');
  const child = spawn(process.execPath, [path.join(ROOT, 'dev', 'server.mjs')], { cwd: ROOT, env: { ...process.env, PORT: port }, stdio: ['ignore', log, log], windowsHide: true });
  for (let i = 0; i < 60; i++) {
    if (await ping()) {
      console.log(`▶ started preview server on :${port} (pid ${child.pid})`);
      return child;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  console.error('✗ Preview server did not start — see', path.join(OUT, 'server.log'));
  process.exit(2);
}

function findBrowser() {
  const candidates = [
    args.browser, process.env.CHROME_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  ].filter(Boolean);
  return candidates.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
}

/* ------------------------------------------------------------------ */
/* in-page audit (runs in the browser)                                 */
/* ------------------------------------------------------------------ */
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Mirrors IntersectionObserver: visible area inside the viewport (minus inView's 40px bottom margin),
    // clipped by any scrolling/overflow-hidden ancestor (carousels, drawers).
    const inView = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      let top = Math.max(r.top, 0);
      let left = Math.max(r.left, 0);
      let bottom = Math.min(r.bottom, vh - 40);
      let right = Math.min(r.right, vw);
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === 'none') return false;
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
          const pr = p.getBoundingClientRect();
          top = Math.max(top, pr.top); left = Math.max(left, pr.left);
          bottom = Math.min(bottom, pr.bottom); right = Math.min(right, pr.right);
        }
        if (right - left <= 1 || bottom - top <= 1) return false;
      }
      return right - left > 1 && bottom - top > 1;
    };
    const mark = () => {
      document.querySelectorAll('[data-reveal]:not([data-shot-seen])').forEach((el) => {
        if (inView(el)) el.setAttribute('data-shot-seen', '');
      });
    };
    const step = Math.max(240, Math.floor(vh * 0.6));
    let y = 0;
    for (let i = 0; i < 400; i++) {
      mark();
      const max = document.documentElement.scrollHeight - vh;
      if (y >= max) break;
      y = Math.min(max, y + step);
      window.scrollTo({ top: y, left: 0, behavior: 'instant' });
      await sleep(150);
    }
    await sleep(200);
    mark();
  });
}

function audit({ touch }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sel = (el) => {
    const parts = [];
    let e = el;
    while (e && e.nodeType === 1 && parts.length < 4) {
      let s = e.tagName.toLowerCase();
      const id = e.getAttribute('id');
      if (id) { parts.unshift(`${s}#${id}`); break; }
      const cls = [...e.classList].filter((c) => !/^(is-|js-)/.test(c)).slice(0, 2);
      if (cls.length) s += `.${cls.join('.')}`;
      parts.unshift(s);
      e = e.parentElement;
    }
    return parts.join(' > ');
  };
  const shown = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const effectiveOpacity = (el) => {
    let o = 1;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return o;
  };
  const text = (el) => (el.innerText || el.getAttribute('aria-label') || el.value || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50);

  // Liquid error boxes + translations
  const liquidErrors = [...document.querySelectorAll('.dev-liquid-error')].map((e) => e.textContent.trim().slice(0, 300));
  const html = document.documentElement.outerHTML;
  const missing = [...html.matchAll(/translation missing: en\.([\w.-]+)/g)].map((m) => m[1]);

  // Horizontal overflow
  const docW = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
  const overflowPx = Math.max(0, docW - vw);
  const offenders = [];
  const offenderSet = new Set();
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.right <= vw + 1 || (r.width === 0 && r.height === 0)) continue;
    let clipped = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.position === 'fixed' || /paint|strict|content/.test(cs.contain)) { clipped = true; break; }
      if (offenderSet.has(p)) { clipped = true; break; }
    }
    if (clipped) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') continue;
    offenderSet.add(el);
    offenders.push({ selector: sel(el), right: Math.round(r.right), width: Math.round(r.width), over: Math.round(r.right - vw) });
  }
  offenders.sort((a, b) => b.right - a.right);

  // Stuck reveals
  const motionOk = document.documentElement.classList.contains('motion-ok');
  const stuckEls = [...document.querySelectorAll('[data-shot-seen]')].filter((el) => !el.classList.contains('is-revealed') && shown(el));
  const stuck = motionOk ? stuckEls.map((el) => ({ selector: sel(el), opacity: Number(getComputedStyle(el).opacity).toFixed(2), reveal: el.getAttribute('data-reveal') })) : [];

  // Invisible text in the first viewport
  const invisible = [];
  const seenParents = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.nodeValue.trim();
    if (t.length < 2) continue;
    const el = n.parentElement;
    if (!el || seenParents.has(el)) continue;
    if (el.closest('script,style,noscript,template,.visually-hidden,.skip-link,[hidden],dialog:not([open])')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.closest('[aria-hidden="true"], [inert]')) continue; // intentionally hidden from everyone
    if (effectiveOpacity(el) < 0.05) {
      seenParents.add(el);
      invisible.push({ selector: sel(el), text: t.slice(0, 40), ariaHidden: !!el.closest('[aria-hidden="true"]') });
    }
  }

  // Tap targets
  const small = [];
  if (touch) {
    const seen = new Set();
    for (const el of document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"]')) {
      if (seen.has(el) || !shown(el) || el.closest('[inert], dialog:not([open])')) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.right <= 0 || r.left >= vw) continue; // off-screen (carousel slides, off-canvas)
      if (r.width >= 40 && r.height >= 40) continue;
      if (effectiveOpacity(el) < 0.05) continue;
      const cs = getComputedStyle(el);
      if (el.tagName === 'A' && cs.display === 'inline') {
        const parentText = (el.parentElement?.textContent || '').trim().length;
        if (parentText > (el.textContent || '').trim().length + 8) continue; // inline link in running text
      }
      if ((el.type === 'checkbox' || el.type === 'radio') && [...(el.labels || [])].some((l) => { const lr = l.getBoundingClientRect(); return lr.width >= 40 && lr.height >= 40; })) continue;
      small.push({ selector: sel(el), w: Math.round(r.width), h: Math.round(r.height), text: text(el) });
    }
  }

  const noAlt = [...document.querySelectorAll('img:not([alt])')].map((i) => i.currentSrc || i.src || sel(i));
  return {
    title: document.title,
    liquidErrors,
    translationMissing: { count: missing.length, keys: [...new Set(missing)].slice(0, 25) },
    overflow: { px: overflowPx, offenders: overflowPx > 1 ? offenders.slice(0, 8) : [], hiddenOffenders: overflowPx > 1 ? [] : offenders.slice(0, 4), hiddenCount: overflowPx > 1 ? 0 : offenders.length },
    stuckReveals: { count: stuck.length, motionOk, samples: stuck.slice(0, 10) },
    invisibleText: { count: invisible.length, samples: invisible.slice(0, 10) },
    smallTaps: { count: small.length, samples: small.slice(0, 10) },
    imagesWithoutAlt: { count: noAlt.length, samples: noAlt.slice(0, 5) },
    h1Count: document.querySelectorAll('h1').length,
    docHeight: document.documentElement.scrollHeight,
  };
}

/* ------------------------------------------------------------------ */
/* one page                                                            */
/* ------------------------------------------------------------------ */
const IGNORED_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
async function shoot(context, vpName, route) {
  const vp = VIEWPORTS[vpName];
  const page = await context.newPage();
  const result = {
    route, viewport: vpName, url: `${BASE}${route}`, status: null, ms: 0, screenshot: null, navigationError: null,
    consoleErrors: [], consoleWarnings: [], pageErrors: [], failedRequests: [], serverLiquidErrors: null,
  };
  const started = Date.now();
  page.on('console', (msg) => {
    const type = msg.type();
    const textMsg = msg.text();
    if (/^Failed to load resource/.test(textMsg)) return; // reported via failedRequests
    const loc = msg.location();
    const entry = `${textMsg.slice(0, 300)}${loc?.url ? ` (${loc.url.replace(BASE, '')}:${loc.lineNumber})` : ''}`;
    if (type === 'error') result.consoleErrors.push(entry);
    else if (type === 'warning') result.consoleWarnings.push(entry);
  });
  page.on('pageerror', (err) => result.pageErrors.push(String(err?.stack || err).split('\n').slice(0, 3).join(' | ').slice(0, 400)));
  const isMainNav = (req) => req.isNavigationRequest() && req.frame() === page.mainFrame();
  const errored = new Set();
  page.on('response', (res) => {
    const u = res.url();
    if (res.status() >= 400 && !IGNORED_HOSTS.test(u) && !isMainNav(res.request())) {
      errored.add(u);
      result.failedRequests.push({ status: res.status(), url: u.replace(BASE, '') });
    }
  });
  page.on('requestfailed', (req) => {
    const u = req.url();
    if (IGNORED_HOSTS.test(u) || isMainNav(req) || errored.has(u)) return;
    const f = req.failure()?.errorText || 'failed';
    if (/ERR_ABORTED/.test(f) && /\.(mp4|webm)|youtube|vimeo/.test(u)) return;
    result.failedRequests.push({ status: f, url: u.replace(BASE, '') });
  });
  try {
    const response = await page.goto(result.url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    result.status = response?.status() ?? null;
    const h = response ? await response.allHeaders() : {};
    if (h['x-vault-liquid-errors'] != null) result.serverLiquidErrors = Number(h['x-vault-liquid-errors']);
  } catch (err) {
    result.navigationError = String(err.message || err).split('\n')[0];
  }
  try {
    await scrollThrough(page);
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await page.waitForTimeout(1200);
    // Give slow (CPU-contended) reveals a little extra time before calling them stuck.
    await page.waitForFunction(() => !document.documentElement.classList.contains('motion-ok')
      || ![...document.querySelectorAll('[data-shot-seen]')].some((el) => !el.classList.contains('is-revealed') && el.getClientRects().length), null, { timeout: 4000, polling: 250 }).catch(() => {});
    Object.assign(result, await page.evaluate(audit, { touch: !!vp.hasTouch }));
    if (result.stuckReveals?.count) {
      // Re-check candidates: bring each into view and give it 1.5 s. Ones that reveal now were just late
      // (CPU contention / fast scrolling); only the rest are reported as stuck.
      const recheck = await page.evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const els = [...document.querySelectorAll('[data-shot-seen]')].filter((el) => !el.classList.contains('is-revealed') && el.getClientRects().length);
        for (const el of els) { el.scrollIntoView({ block: 'center', behavior: 'instant' }); await sleep(120); }
        await sleep(1500);
        const still = new Set(els.filter((el) => !el.classList.contains('is-revealed')));
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        return els.map((el) => still.has(el));
      });
      const samples = result.stuckReveals.samples;
      const late = recheck.filter((x) => !x).length;
      result.stuckReveals = { ...result.stuckReveals, count: recheck.filter(Boolean).length, late, samples: samples.filter((_, i) => recheck[i]) };
      await page.waitForTimeout(800);
    }
  } catch (err) {
    result.auditError = String(err.message || err).split('\n')[0];
  }
  const file = path.join(OUT, vpName, `${slug(route)}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    await page.screenshot({ path: file, fullPage: FULL, timeout: 60000 });
    result.screenshot = path.relative(ROOT, file).replace(/\\/g, '/');
  } catch (err) {
    try {
      const maxH = Math.floor(16000 / (vp.deviceScaleFactor || 1));
      await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: 0, width: vp.width, height: Math.min(maxH, result.docHeight || maxH) }, timeout: 60000 });
      result.screenshot = path.relative(ROOT, file).replace(/\\/g, '/');
      result.screenshotNote = `truncated to ${maxH}px (${String(err.message).split('\n')[0]})`;
    } catch (err2) {
      result.screenshotError = String(err2.message || err2).split('\n')[0];
    }
  }
  result.ms = Date.now() - started;
  await page.close().catch(() => {});
  return result;
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */
const pad = (s, n) => { s = String(s); return s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n); };
const issues = (r) => r.consoleErrors.length + r.pageErrors.length + r.failedRequests.length + (r.liquidErrors?.length || 0) + (r.navigationError ? 1 : 0);

async function main() {
  const server = await ensureServer();
  let routes;
  if (args.routes && args.routes !== true) routes = String(args.routes).split(',').map(normaliseRoute).filter(Boolean);
  else {
    const res = await fetch(`${BASE}/__routes?format=json`);
    routes = (await res.json()).map((r) => r.path);
  }
  routes = [...new Set(routes)];
  const executablePath = findBrowser();
  if (!executablePath) {
    console.error('✗ No Edge/Chrome found. Pass --browser <path> or set CHROME_PATH.');
    process.exit(2);
  }
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`▶ ${routes.length} route(s) × ${viewportNames.join(', ')} → ${path.relative(ROOT, OUT) || '.'}  (${path.basename(executablePath)}, concurrency ${CONCURRENCY}${REDUCED ? ', reduced motion' : ''})`);

  const browser = await chromium.launch({ executablePath, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb', '--disable-features=Translate'] });
  const contexts = {};
  for (const name of viewportNames) {
    const vp = VIEWPORTS[name];
    contexts[name] = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      screen: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor,
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      userAgent: vp.isMobile ? MOBILE_UA : vp.hasTouch ? TABLET_UA : undefined,
      reducedMotion: REDUCED ? 'reduce' : 'no-preference',
      colorScheme: 'dark',
    });
    // Same-origin cookie (not a header: custom headers would break CORS preflights for Google Fonts).
    await contexts[name].addCookies([{ name: 'vault_nolr', value: '1', url: BASE }]);
  }
  const jobs = [];
  for (const route of routes) for (const vp of viewportNames) jobs.push([vp, route]);
  const results = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      const [vp, route] = jobs[i];
      try {
        results[i] = await shoot(contexts[vp], vp, route);
      } catch (err) {
        results[i] = { route, viewport: vp, runnerError: String(err.message || err), consoleErrors: [], pageErrors: [], failedRequests: [] };
      }
      done += 1;
      if (process.stdout.isTTY) process.stdout.write(`\r  ${done}/${jobs.length}  ${pad(`${vp} ${route}`, 60)}`);
      else if (done % 10 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length} pages done`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  if (process.stdout.isTTY) process.stdout.write(`\r${' '.repeat(80)}\r`);
  await browser.close();

  let serverErrors = null;
  try { serverErrors = await (await fetch(`${BASE}/__errors`)).json(); } catch { /* ignore */ }
  const report = {
    generatedAt: new Date().toISOString(), base: BASE, viewports: viewportNames.map((n) => ({ name: n, ...VIEWPORTS[n] })),
    reducedMotion: REDUCED, routes, results, serverErrors,
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  // summary
  console.log(`\n${pad('route', 46)} ${pad('viewport', 16)} ${pad('http', 5)} ${pad('errs', 5)} ${pad('ovfl', 6)} ${pad('stuck', 6)} ${pad('taps', 5)} ${pad('i18n', 5)} ${pad('h1', 3)}`);
  console.log('-'.repeat(100));
  for (const r of results) {
    console.log(`${pad(r.route, 46)} ${pad(r.viewport, 16)} ${pad(r.status ?? '-', 5)} ${pad(issues(r), 5)} ${pad(r.overflow ? `${r.overflow.px}px` : '-', 6)} ${pad(r.stuckReveals?.count ?? '-', 6)} ${pad(r.smallTaps ? r.smallTaps.count : '-', 5)} ${pad(r.translationMissing?.count ?? '-', 5)} ${pad(r.h1Count ?? '-', 3)}`);
  }
  const totals = {
    pages: results.length,
    withErrors: results.filter((r) => issues(r) > 0).length,
    overflowing: results.filter((r) => r.overflow?.px > 1).length,
    stuckReveals: results.reduce((s, r) => s + (r.stuckReveals?.count || 0), 0),
    smallTaps: results.reduce((s, r) => s + (r.smallTaps?.count || 0), 0),
    missingTranslations: new Set(results.flatMap((r) => r.translationMissing?.keys || [])).size,
    liquidErrors: results.reduce((s, r) => s + (r.liquidErrors?.length || 0), 0),
    noH1: results.filter((r) => r.h1Count === 0).length,
  };
  console.log('-'.repeat(100));
  console.log(`pages ${totals.pages} · with errors ${totals.withErrors} · overflowing ${totals.overflowing} · stuck reveals ${totals.stuckReveals} · small taps ${totals.smallTaps} · liquid errors ${totals.liquidErrors} · missing i18n keys ${totals.missingTranslations} · pages without h1 ${totals.noH1}`);
  const worst = results.filter((r) => r.overflow?.offenders?.length).slice(0, 5);
  for (const r of worst) console.log(`  overflow ${r.viewport} ${r.route}: ${r.overflow.offenders.slice(0, 3).map((o) => `${o.selector} (+${o.over}px)`).join(' | ')}`);
  const errs = results.filter((r) => r.pageErrors.length || r.consoleErrors.length).slice(0, 5);
  for (const r of errs) console.log(`  js ${r.viewport} ${r.route}: ${[...r.pageErrors, ...r.consoleErrors][0]}`);
  console.log(`\nreport → ${path.relative(ROOT, path.join(OUT, 'report.json'))}`);
  if (server) server.kill();
  if (STRICT && (totals.withErrors || totals.overflowing || totals.liquidErrors)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
