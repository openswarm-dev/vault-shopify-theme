// Procedural SVG artwork for the mock store. Everything is deterministic per name/seed.
// Kinds: card (front), back, slab (front/back), sealed (box/etb/pack/tin/collector), supply
// (sleeves/toploader/binder/onetouch), banner, blog/scene, avatar. Unknown names fall back to a scene.

const registry = new Map();
const cache = new Map();

export const PALETTES = {
  crimson: { a: '#e11d2e', b: '#3d050c', glow: '#ff6b6b', hi: '#ffb4b4' },
  graphite: { a: '#4a4e5a', b: '#0b0c0f', glow: '#ff4b5c', hi: '#d4d6dd' },
  ember: { a: '#ff6a1a', b: '#3a0d02', glow: '#ffc04d', hi: '#ffe1a8' },
  tide: { a: '#1f6feb', b: '#041226', glow: '#5ee1ff', hi: '#c4f3ff' },
  void: { a: '#7c3aed', b: '#12051f', glow: '#d08cff', hi: '#ead4ff' },
  verdant: { a: '#16a34a', b: '#03200f', glow: '#86efac', hi: '#d1fadf' },
  gold: { a: '#d4a017', b: '#2a1d03', glow: '#fde68a', hi: '#fff5cc' },
  steel: { a: '#8b93a3', b: '#161920', glow: '#e2e8f0', hi: '#f4f6fa' },
};
const PAL_KEYS = Object.keys(PALETTES);
const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const FONT_BLACK = "'Arial Black', 'Segoe UI Black', 'Segoe UI', Arial, sans-serif";
const MONO = "Consolas, 'SFMono-Regular', Menlo, monospace";

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rng(seed) {
  let a = typeof seed === 'number' ? seed : hash(String(seed));
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
const f = (n) => Math.round(n * 10) / 10;
const pal = (k, r) => PALETTES[k] || PALETTES[pick(r, PAL_KEYS)];

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */
export function registerArt(name, spec) {
  registry.set(name, spec);
  cache.delete(name);
}
export function artSpec(name) {
  return registry.get(name) || guessSpec(name);
}
export function artSize(name) {
  const s = artSpec(name);
  return { width: s.width || SIZES[s.kind]?.[0] || 1600, height: s.height || SIZES[s.kind]?.[1] || 900 };
}
const SIZES = {
  card: [1260, 1760], back: [1260, 1760], slab: [1140, 1920], sealed: [1600, 1600], supply: [1600, 1600],
  banner: [1920, 1080], blog: [1600, 900], scene: [1600, 900], avatar: [400, 400], logo: [600, 160],
};
function guessSpec(name) {
  const n = String(name).toLowerCase();
  if (n.startsWith('avatar')) return { kind: 'avatar', seed: n, initials: n.replace(/^avatar-?/, '').slice(0, 2).toUpperCase() || 'VC' };
  if (n.startsWith('banner') || n.startsWith('collection')) return { kind: 'banner', seed: n, title: n.replace(/^(banner|collection)-?/, '').replace(/[-_]+/g, ' ') || 'Vault' };
  if (n.startsWith('blog')) return { kind: 'blog', seed: n };
  if (n.startsWith('card')) return { kind: 'card', seed: n, title: n.replace(/^card-?/, '').replace(/[-_]+/g, ' ') || 'Ember Drake' };
  if (n.startsWith('slab')) return { kind: 'slab', seed: n, card: { seed: n } };
  if (n.startsWith('logo')) return { kind: 'logo', seed: n };
  return { kind: 'scene', seed: n };
}

export function renderArt(name) {
  if (cache.has(name)) return cache.get(name);
  const spec = artSpec(name);
  let svg;
  try {
    svg = draw(spec, name);
  } catch (err) {
    svg = wrap(1600, 900, `<rect width="1600" height="900" fill="#1a1b20"/><text x="800" y="450" fill="#ff4b5c" font-size="40" text-anchor="middle" font-family="${FONT}">art error: ${esc(err.message)}</text>`);
  }
  cache.set(name, svg);
  return svg;
}

function draw(spec, name) {
  const [w, h] = [spec.width || SIZES[spec.kind]?.[0] || 1600, spec.height || SIZES[spec.kind]?.[1] || 900];
  switch (spec.kind) {
    case 'card': return wrap(w, h, `<svg viewBox="0 0 630 880" width="${w}" height="${h}">${cardFront(spec, 'c')}</svg>`, true);
    case 'back': return wrap(w, h, `<svg viewBox="0 0 630 880" width="${w}" height="${h}">${cardBack(spec, 'b')}</svg>`, true);
    case 'slab': return wrap(w, h, `<svg viewBox="0 0 760 1280" width="${w}" height="${h}">${slab(spec)}</svg>`, true);
    case 'sealed': return wrap(w, h, `<svg viewBox="0 0 1200 1200" width="${w}" height="${h}"><g transform="translate(600 620) scale(1.16) translate(-600 -620)">${sealed(spec)}</g></svg>`, true);
    case 'supply': return wrap(w, h, `<svg viewBox="0 0 1200 1200" width="${w}" height="${h}"><g transform="translate(600 600) scale(1.1) translate(-600 -600)">${supply(spec)}</g></svg>`, true);
    case 'banner': return wrap(w, h, banner(spec, w, h));
    case 'avatar': return wrap(w, h, avatar(spec, w, h));
    case 'logo': return wrap(w, h, logo(spec, w, h), true);
    case 'blog':
    case 'scene':
    default: return wrap(w, h, scene(spec, w, h, name));
  }
}

function wrap(w, h, body, transparent = false) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"${transparent ? '' : ' style="background:#111214"'}>${body}</svg>`;
}

/* ------------------------------------------------------------------ */
/* Emblems                                                             */
/* ------------------------------------------------------------------ */
function starPath(cx, cy, rOuter, rInner, points, rot = -Math.PI / 2) {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? rInner : rOuter;
    const a = rot + (i * Math.PI) / points;
    d += `${i ? 'L' : 'M'}${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;
  }
  return `${d}Z`;
}
function emblem(r, cx, cy, size, p, id) {
  const type = Math.floor(r() * 5);
  const g = `url(#${id}em)`;
  const defs = `<radialGradient id="${id}em" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".35" stop-color="${p.hi}"/><stop offset="1" stop-color="${p.a}"/></radialGradient>`;
  let s = '';
  if (type === 0) {
    const pts = 5 + Math.floor(r() * 4);
    s += `<path d="${starPath(cx, cy, size, size * 0.42, pts)}" fill="${g}" stroke="#fff" stroke-opacity=".6" stroke-width="3"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${f(size * 0.22)}" fill="${p.b}" stroke="${p.hi}" stroke-width="4"/>`;
  } else if (type === 1) {
    for (let i = 0; i < 4; i++) s += `<circle cx="${cx}" cy="${cy}" r="${f(size * (1 - i * 0.22))}" fill="none" stroke="${i % 2 ? p.hi : '#fff'}" stroke-opacity="${0.25 + i * 0.18}" stroke-width="${3 + i}"/>`;
    s += `<path d="M${cx - size * 0.7} ${cy} Q${cx} ${cy - size * 0.75} ${cx + size * 0.7} ${cy} Q${cx} ${cy + size * 0.75} ${cx - size * 0.7} ${cy}Z" fill="${g}"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${f(size * 0.2)}" fill="${p.b}"/><circle cx="${f(cx + size * 0.06)}" cy="${f(cy - size * 0.06)}" r="${f(size * 0.06)}" fill="#fff"/>`;
  } else if (type === 2) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI + (i / (n - 1)) * Math.PI;
      const x2 = cx + Math.cos(a) * size * 1.1;
      const y2 = cy + Math.sin(a) * size * 0.9;
      s += `<path d="M${cx} ${cy + size * 0.2} L${f(x2 - 18)} ${f(y2)} L${f(x2 + 18)} ${f(y2)}Z" fill="${g}" opacity="${0.55 + (i % 2) * 0.35}"/>`;
    }
    s += `<path d="${starPath(cx, cy + size * 0.18, size * 0.36, size * 0.16, 4)}" fill="#fff"/>`;
  } else if (type === 3) {
    const w = size * 1.3;
    s += `<path d="M${cx - w / 2} ${cy - size * 0.75} H${cx + w / 2} V${cy} Q${cx + w / 2} ${cy + size * 0.75} ${cx} ${cy + size} Q${cx - w / 2} ${cy + size * 0.75} ${cx - w / 2} ${cy}Z" fill="${g}" stroke="#fff" stroke-opacity=".55" stroke-width="4"/>`;
    s += `<path d="M${cx} ${cy - size * 0.5} L${cx + size * 0.32} ${cy + size * 0.1} L${cx} ${cy + size * 0.6} L${cx - size * 0.32} ${cy + size * 0.1}Z" fill="${p.b}" opacity=".85"/>`;
  } else {
    s += `<circle cx="${cx}" cy="${cy}" r="${size * 0.8}" fill="${g}"/>`;
    for (let i = 0; i < 3; i++) {
      const rx = size * (1.05 + i * 0.18);
      s += `<ellipse cx="${cx}" cy="${cy}" rx="${f(rx)}" ry="${f(rx * 0.28)}" fill="none" stroke="#fff" stroke-opacity="${0.6 - i * 0.15}" stroke-width="3" transform="rotate(${-20 + i * 25} ${cx} ${cy})"/>`;
    }
  }
  return { defs, body: s };
}

/* ------------------------------------------------------------------ */
/* Trading card front (630 x 880 local units)                          */
/* ------------------------------------------------------------------ */
const MOVES = ['Cinder Lash', 'Molten Roar', 'Tidal Crush', 'Riptide Coil', 'Null Rend', 'Soul Siphon', 'Static Howl', 'Ironbark Slam', 'Starfall', 'Lantern Glow', 'Rune Burst', 'Gale Cutter', 'Ashen Wake', 'Prism Beam', 'Feral Pounce', 'Moonlit Veil'];
const TYPES = ['Fire', 'Water', 'Shadow', 'Storm', 'Earth', 'Light', 'Arcane', 'Wind'];

export function cardFront(o, id = 'c') {
  const r = rng(o.seed || o.title || 'card');
  const p = pal(o.palette, r);
  const title = String(o.title || 'Ember Drake').toUpperCase();
  const hp = o.hp || 60 + Math.floor(r() * 18) * 10;
  const num = o.number || `${String(1 + Math.floor(r() * 200)).padStart(3, '0')}/${180 + Math.floor(r() * 30)}`;
  const set = String(o.set || 'Vault Series').toUpperCase();
  const foil = o.foil !== false;
  const type = o.type || pick(r, TYPES);
  const em = emblem(r, 315, 300, 120 + r() * 20, p, id);
  const titleSize = Math.min(30, Math.floor(430 / Math.max(8, title.length) * 1.55));
  let rays = '';
  const rayCount = 9 + Math.floor(r() * 6);
  for (let i = 0; i < rayCount; i++) {
    const a = (i / rayCount) * Math.PI * 2 + r() * 0.2;
    rays += `<path d="M315 300 L${f(315 + Math.cos(a - 0.06) * 520)} ${f(300 + Math.sin(a - 0.06) * 520)} L${f(315 + Math.cos(a + 0.06) * 520)} ${f(300 + Math.sin(a + 0.06) * 520)}Z" fill="#fff" opacity="${f(0.04 + r() * 0.07)}"/>`;
  }
  let particles = '';
  for (let i = 0; i < 26; i++) particles += `<circle cx="${f(60 + r() * 510)}" cy="${f(120 + r() * 360)}" r="${f(1 + r() * 4)}" fill="${r() > 0.5 ? '#fff' : p.hi}" opacity="${f(0.25 + r() * 0.6)}"/>`;
  const moves = [pick(r, MOVES), pick(r, MOVES)];
  const dmg = [20 + Math.floor(r() * 6) * 10, 80 + Math.floor(r() * 12) * 10];
  const rarity = String(o.rarity || '').toLowerCase();
  const rarityMark = /secret|alt|manga|enchanted|special|gold/.test(rarity)
    ? `<path d="${starPath(560, 822, 15, 6.5, 5)}" fill="#fde68a"/><path d="${starPath(532, 822, 10, 4.5, 5)}" fill="#fde68a"/>`
    : /holo|rare|mythic|ultra|legendary/.test(rarity)
      ? `<path d="${starPath(560, 822, 14, 6, 5)}" fill="#f4f4f5"/>`
      : `<circle cx="560" cy="822" r="8" fill="#a1a1aa"/>`;
  const line = (y, w) => `<rect x="96" y="${y}" width="${w}" height="7" rx="3.5" fill="#fff" opacity=".14"/>`;
  return `
  <defs>
    <linearGradient id="${id}fr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset=".5" stop-color="${p.b}"/><stop offset="1" stop-color="${p.a}"/></linearGradient>
    <linearGradient id="${id}pn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d1e24"/><stop offset="1" stop-color="#0b0c0f"/></linearGradient>
    <radialGradient id="${id}art" cx=".5" cy=".45" r=".8"><stop offset="0" stop-color="${p.glow}"/><stop offset=".38" stop-color="${p.a}"/><stop offset="1" stop-color="${p.b}"/></radialGradient>
    <linearGradient id="${id}foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3d6e" stop-opacity="0"/><stop offset=".28" stop-color="#ffd23d" stop-opacity=".38"/><stop offset=".44" stop-color="#3dffb4" stop-opacity=".3"/><stop offset=".6" stop-color="#3db4ff" stop-opacity=".38"/><stop offset=".78" stop-color="#b43dff" stop-opacity=".3"/><stop offset="1" stop-color="#ff3d6e" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}sheen" x1="0" y1="0" x2="1" y2="1"><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".48" stop-color="#fff" stop-opacity=".16"/><stop offset=".56" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="${id}clip"><rect x="52" y="112" width="526" height="380" rx="10"/></clipPath>
    ${em.defs}
  </defs>
  <rect width="630" height="880" rx="30" fill="url(#${id}fr)"/>
  <rect x="18" y="18" width="594" height="844" rx="20" fill="url(#${id}pn)"/>
  <rect x="36" y="36" width="558" height="62" rx="12" fill="#fff" fill-opacity=".05" stroke="#fff" stroke-opacity=".12"/>
  <text x="56" y="78" font-family="${FONT_BLACK}" font-weight="900" font-size="${titleSize}" fill="#fff" letter-spacing="1">${esc(title)}</text>
  <text x="574" y="78" text-anchor="end" font-family="${FONT}" font-weight="700" font-size="16" fill="#d4d4d8">HP <tspan font-size="32" font-weight="900" fill="${p.glow}">${hp}</tspan></text>
  <g clip-path="url(#${id}clip)">
    <rect x="52" y="112" width="526" height="380" fill="url(#${id}art)"/>
    ${rays}
    <circle cx="315" cy="300" r="190" fill="${p.glow}" opacity=".18"/>
    ${em.body}
    ${particles}
    ${foil ? `<rect x="52" y="112" width="526" height="380" fill="url(#${id}foil)" style="mix-blend-mode:screen"/>` : ''}
  </g>
  <rect x="52" y="112" width="526" height="380" rx="10" fill="none" stroke="${p.hi}" stroke-opacity=".55" stroke-width="3"/>
  <rect x="52" y="506" width="526" height="34" rx="8" fill="#fff" fill-opacity=".05"/>
  <text x="315" y="529" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="600" fill="#c9cad1" letter-spacing="3">${esc(`${(o.rarity || 'RARE').toUpperCase()} · ${type.toUpperCase()}`)}</text>
  <g font-family="${FONT}">
    <circle cx="72" cy="586" r="14" fill="${p.a}" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>
    <text x="100" y="593" font-size="22" font-weight="800" fill="#fff">${esc(moves[0])}</text>
    <text x="574" y="594" text-anchor="end" font-size="28" font-weight="900" fill="#fff">${dmg[0]}</text>
    ${line(612, 380)}${line(628, 300)}
    <circle cx="72" cy="682" r="14" fill="${p.a}" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>
    <circle cx="104" cy="682" r="14" fill="${p.a}" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>
    <text x="132" y="689" font-size="22" font-weight="800" fill="#fff">${esc(moves[1])}</text>
    <text x="574" y="690" text-anchor="end" font-size="28" font-weight="900" fill="${p.glow}">${dmg[1]}</text>
    ${line(708, 420)}${line(724, 360)}${line(740, 250)}
  </g>
  <line x1="52" y1="782" x2="578" y2="782" stroke="#fff" stroke-opacity=".1"/>
  <text x="52" y="830" font-family="${MONO}" font-size="19" fill="#a1a1aa">${esc(num)}</text>
  <text x="315" y="829" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="700" fill="#71717a" letter-spacing="2.5">${esc(set)}</text>
  ${rarityMark}
  <rect width="630" height="880" rx="30" fill="url(#${id}sheen)"/>`;
}

/* ------------------------------------------------------------------ */
/* Card back                                                           */
/* ------------------------------------------------------------------ */
export function cardBack(o, id = 'b') {
  const r = rng(`${o.seed || 'back'}-back`);
  const p = PALETTES[o.backPalette || 'crimson'];
  let rings = '';
  for (let i = 0; i < 5; i++) rings += `<circle cx="315" cy="440" r="${170 - i * 30}" fill="none" stroke="#fff" stroke-opacity="${0.08 + i * 0.05}" stroke-width="${2 + i}"/>`;
  return `
  <defs>
    <linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset=".55" stop-color="#2a050a"/><stop offset="1" stop-color="#0d0e11"/></linearGradient>
    <pattern id="${id}pt" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="28" height="28" fill="none"/><rect width="10" height="28" fill="#fff" opacity=".045"/></pattern>
    <radialGradient id="${id}core" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#ff8a8a"/><stop offset=".5" stop-color="${p.a}"/><stop offset="1" stop-color="#4a0710"/></radialGradient>
  </defs>
  <rect width="630" height="880" rx="30" fill="#14151a"/>
  <rect x="18" y="18" width="594" height="844" rx="22" fill="url(#${id}bg)"/>
  <rect x="18" y="18" width="594" height="844" rx="22" fill="url(#${id}pt)"/>
  <rect x="44" y="44" width="542" height="792" rx="16" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="3"/>
  ${rings}
  <circle cx="315" cy="440" r="104" fill="url(#${id}core)" stroke="#fff" stroke-opacity=".7" stroke-width="5"/>
  <path d="M262 395 L315 500 L368 395" fill="none" stroke="#fff" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/>
  <text x="315" y="640" text-anchor="middle" font-family="${FONT_BLACK}" font-size="40" font-weight="900" fill="#fff" letter-spacing="10">VAULT</text>
  <text x="315" y="676" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="700" fill="#fff" fill-opacity=".6" letter-spacing="6">TRADING CARD GAME</text>
  <circle cx="${f(120 + r() * 40)}" cy="140" r="5" fill="#fff" opacity=".4"/>`;
}

/* ------------------------------------------------------------------ */
/* Graded slab (760 x 1280 local units)                                */
/* ------------------------------------------------------------------ */
const GRADE_WORDS = {
  PSA: { 10: 'GEM MT', 9: 'MINT', 8: 'NM-MT', 7: 'NM', 6: 'EX-MT' },
  BGS: { 10: 'PRISTINE', 9.5: 'GEM MINT', 9: 'MINT', 8.5: 'NM-MT+' },
  CGC: { 10: 'PRISTINE', 9.5: 'GEM MINT', 9: 'MINT', 8.5: 'NM/MINT+' },
  SGC: { 10: 'GEM MINT', 9.5: 'MINT+', 9: 'MINT' },
  TAG: { 10: 'GEM MINT', 9: 'MINT', 8.5: 'NM-MT+' },
};
export function gradeWord(grader, score) {
  const t = GRADE_WORDS[String(grader).toUpperCase()] || GRADE_WORDS.PSA;
  return t[Number(score)] || 'MINT';
}

function barcode(r, x, y, w, h) {
  let s = '';
  let cx = x;
  while (cx < x + w) {
    const bw = 1.5 + Math.floor(r() * 3) * 1.5;
    if (r() > 0.35) s += `<rect x="${f(cx)}" y="${y}" width="${bw}" height="${h}" fill="#111"/>`;
    cx += bw + 1.5;
  }
  return s;
}

export function slab(o) {
  const r = rng(`${o.seed || 'slab'}-slab`);
  const grader = String(o.grader || 'PSA').toUpperCase();
  const score = String(o.score ?? '10');
  const word = o.word || gradeWord(grader, score);
  const cert = String(o.cert || 10000000 + Math.floor(r() * 89999999));
  const side = o.side || 'front';
  const card = o.card || {};
  const year = card.year || o.year || 2023;
  const black = grader === 'BGS' && score === '10';
  const labelBg = black ? '#121214' : '#f7f7f8';
  const ink = black ? '#f4f4f5' : '#141416';
  const red = '#d0142a';
  const accent = black ? '#d4af37' : red;
  const l1 = `${year} ${String(card.set || 'Vault Series').toUpperCase()}`.slice(0, 30);
  const l2 = `#${String(card.number || '001').split('/')[0]} ${String(card.title || 'Ember Drake').toUpperCase()}`.slice(0, 30);
  const l3 = String(card.variantLabel || card.rarity || 'HOLO').toUpperCase().slice(0, 30);
  const inner = side === 'back' ? cardBack({ seed: card.seed || card.title }, 'sb') : cardFront({ ...card, seed: card.seed || card.title }, 'sc');
  const label = side === 'back'
    ? `<rect x="40" y="40" width="680" height="250" rx="12" fill="${labelBg}"/>
       <rect x="48" y="48" width="664" height="234" rx="8" fill="none" stroke="${accent}" stroke-width="6"/>
       <text x="380" y="140" text-anchor="middle" font-family="${FONT_BLACK}" font-size="64" font-weight="900" fill="${accent}" letter-spacing="8">${esc(grader)}</text>
       <text x="380" y="180" text-anchor="middle" font-family="${FONT}" font-size="18" font-weight="700" fill="${ink}" letter-spacing="5">CERTIFIED AUTHENTIC · ${esc(cert)}</text>
       <defs><linearGradient id="holo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6b9e"/><stop offset=".25" stop-color="#ffe066"/><stop offset=".5" stop-color="#66ffd1"/><stop offset=".75" stop-color="#66b3ff"/><stop offset="1" stop-color="#c266ff"/></linearGradient></defs>
       <rect x="610" y="196" width="80" height="62" rx="8" fill="url(#holo)" opacity=".9"/>
       ${barcode(r, 90, 206, 480, 46)}`
    : `<rect x="40" y="40" width="680" height="250" rx="12" fill="${labelBg}"/>
       <rect x="48" y="48" width="664" height="234" rx="8" fill="none" stroke="${accent}" stroke-width="6"/>
       <rect x="68" y="68" width="122" height="54" rx="8" fill="${accent}"/>
       <text x="129" y="106" text-anchor="middle" font-family="${FONT_BLACK}" font-size="30" font-weight="900" fill="${black ? '#121214' : '#fff'}" letter-spacing="3">${esc(grader)}</text>
       <g font-family="${FONT}" font-weight="800" fill="${ink}">
         <text x="210" y="92" font-size="21">${esc(l1)}</text>
         <text x="210" y="124" font-size="21">${esc(l2)}</text>
         <text x="210" y="156" font-size="19" fill="${ink}" fill-opacity=".72">${esc(l3)}</text>
       </g>
       <text x="694" y="196" text-anchor="end" font-family="${FONT}" font-size="22" font-weight="900" fill="${ink}" letter-spacing="2">${esc(word)}</text>
       <text x="694" y="268" text-anchor="end" font-family="${FONT_BLACK}" font-size="${score.length > 2 ? 70 : 84}" font-weight="900" fill="${accent}">${esc(score)}</text>
       ${barcode(r, 68, 200, 320, 44)}
       <text x="68" y="268" font-family="${MONO}" font-size="20" font-weight="700" fill="${ink}" letter-spacing="2">${esc(cert)}</text>`;
  return `
  <defs>
    <linearGradient id="case" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset=".5" stop-color="#d9dde6" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity=".24"/></linearGradient>
    <linearGradient id="glare" x1="0" y1="0" x2="1" y2="1"><stop offset=".28" stop-color="#fff" stop-opacity="0"/><stop offset=".42" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/><stop offset=".76" stop-color="#fff" stop-opacity=".1"/><stop offset=".82" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <rect x="2" y="2" width="756" height="1276" rx="38" fill="#24262d"/>
  <rect x="2" y="2" width="756" height="1276" rx="38" fill="url(#case)" stroke="#fff" stroke-opacity=".45" stroke-width="4"/>
  <rect x="18" y="18" width="724" height="1244" rx="28" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>
  ${label}
  <rect x="56" y="318" width="648" height="926" rx="18" fill="#0b0c0f" fill-opacity=".55" stroke="#fff" stroke-opacity=".22" stroke-width="2"/>
  <g transform="translate(80 341) scale(0.952)">${inner}</g>
  <rect x="2" y="2" width="756" height="1276" rx="38" fill="url(#glare)"/>`;
}

/* ------------------------------------------------------------------ */
/* Sealed product (1200 x 1200, transparent)                           */
/* ------------------------------------------------------------------ */
export function sealed(o) {
  const r = rng(`${o.seed || o.title}-sealed`);
  const p = pal(o.palette, r);
  const form = o.form || 'box';
  const title = String(o.title || 'Booster Box').toUpperCase();
  const sub = String(o.sub || '').toUpperCase();
  const em = emblem(r, 600, 560, 120, p, 's');
  const shadow = `<ellipse cx="600" cy="1060" rx="430" ry="46" fill="#000" opacity=".45"/>`;
  const defs = `<defs>
    <linearGradient id="sf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset=".6" stop-color="${p.b}"/><stop offset="1" stop-color="#050506"/></linearGradient>
    <linearGradient id="st" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${p.hi}"/><stop offset="1" stop-color="${p.a}"/></linearGradient>
    <linearGradient id="ss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.b}"/><stop offset="1" stop-color="#030304"/></linearGradient>
    <linearGradient id="sfoil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6b9e" stop-opacity=".0"/><stop offset=".35" stop-color="#ffe066" stop-opacity=".35"/><stop offset=".55" stop-color="#66ffd1" stop-opacity=".25"/><stop offset=".75" stop-color="#66b3ff" stop-opacity=".35"/><stop offset="1" stop-color="#c266ff" stop-opacity="0"/></linearGradient>
    ${em.defs}
  </defs>`;
  const titleSize = Math.min(64, Math.floor(1000 / Math.max(10, title.length)));
  if (form === 'pack') {
    let zig = '';
    for (let i = 0; i <= 20; i++) zig += `L${330 + i * 27} ${i % 2 ? 150 : 170}`;
    let zigB = '';
    for (let i = 20; i >= 0; i--) zigB += `L${330 + i * 27} ${i % 2 ? 1030 : 1010}`;
    return `${defs}${shadow.replace('cy="1060"', 'cy="1080"')}
      <path d="M330 170 ${zig} L870 1010 ${zigB} Z" fill="url(#sf)" stroke="#fff" stroke-opacity=".25" stroke-width="3"/>
      <rect x="330" y="200" width="540" height="790" fill="url(#sfoil)" style="mix-blend-mode:screen"/>
      <rect x="360" y="230" width="480" height="70" rx="10" fill="#000" opacity=".35"/>
      <text x="600" y="278" text-anchor="middle" font-family="${FONT_BLACK}" font-size="${Math.min(40, titleSize)}" fill="#fff" letter-spacing="2">${esc(title)}</text>
      <g transform="translate(0 20)">${em.body}</g>
      <rect x="380" y="840" width="440" height="80" rx="40" fill="${p.a}" stroke="#fff" stroke-opacity=".6" stroke-width="3"/>
      <text x="600" y="892" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="30" fill="#fff" letter-spacing="4">${esc(sub || '10 CARDS')}</text>`;
  }
  if (form === 'tin') {
    return `${defs}${shadow}
      <rect x="220" y="300" width="760" height="740" rx="90" fill="url(#ss)"/>
      <rect x="200" y="260" width="800" height="160" rx="70" fill="url(#st)" stroke="#fff" stroke-opacity=".4" stroke-width="4"/>
      <rect x="250" y="440" width="700" height="560" rx="60" fill="url(#sf)" stroke="#fff" stroke-opacity=".18" stroke-width="3"/>
      <rect x="250" y="440" width="700" height="560" rx="60" fill="url(#sfoil)" style="mix-blend-mode:screen"/>
      <g transform="translate(0 150) scale(1)">${em.body}</g>
      <text x="600" y="370" text-anchor="middle" font-family="${FONT_BLACK}" font-size="${Math.min(48, titleSize)}" fill="${p.b}" letter-spacing="2">${esc(title)}</text>
      <text x="600" y="950" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="30" fill="#fff" letter-spacing="6">${esc(sub || 'COLLECTOR TIN')}</text>`;
  }
  // box-like forms (box, etb, collector)
  const tall = form === 'etb';
  const dark = form === 'collector';
  const x0 = 230, x1 = 870, y0 = tall ? 260 : 380, y1 = 960, dx = 110, dy = 80;
  const front = dark ? '#0d0e10' : 'url(#sf)';
  let stripes = '';
  for (let i = 0; i < 5; i++) stripes += `<path d="M${x0 + i * 140 - 120} ${y1} L${x0 + i * 140 + 60} ${y0}" stroke="${dark ? '#d4af37' : '#fff'}" stroke-opacity="${dark ? 0.35 : 0.08}" stroke-width="${dark ? 3 : 40}"/>`;
  return `${defs}${shadow}
    <path d="M${x0} ${y0} L${x1} ${y0} L${x1 + dx} ${y0 - dy} L${x0 + dx} ${y0 - dy}Z" fill="${dark ? '#26272c' : 'url(#st)'}"/>
    <path d="M${x1} ${y0} L${x1 + dx} ${y0 - dy} L${x1 + dx} ${y1 - dy} L${x1} ${y1}Z" fill="url(#ss)"/>
    <g>
      <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${front}"/>
      <clipPath id="fc"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/></clipPath>
      <g clip-path="url(#fc)">${stripes}<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="url(#sfoil)" opacity="${dark ? 0.5 : 0.9}" style="mix-blend-mode:screen"/></g>
      ${tall ? `<rect x="${x0}" y="${y0 + 150}" width="${x1 - x0}" height="14" fill="#000" opacity=".35"/>` : ''}
      <g transform="translate(${tall ? -50 : -50} ${tall ? 30 : 20})">${em.body}</g>
      <rect x="${x0 + 30}" y="${y0 + 30}" width="${x1 - x0 - 60}" height="90" rx="12" fill="#000" opacity=".38"/>
      <text x="${(x0 + x1) / 2}" y="${y0 + 90}" text-anchor="middle" font-family="${FONT_BLACK}" font-size="${titleSize}" fill="${dark ? '#d4af37' : '#fff'}" letter-spacing="2">${esc(title)}</text>
      <rect x="${x0}" y="${y1 - 130}" width="${x1 - x0}" height="80" fill="${dark ? '#d4af37' : p.a}"/>
      <text x="${(x0 + x1) / 2}" y="${y1 - 78}" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="32" fill="${dark ? '#0d0e10' : '#fff'}" letter-spacing="6">${esc(sub || (tall ? 'ELITE TRAINER BOX' : '36 BOOSTER PACKS'))}</text>
      <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="3"/>
    </g>`;
}

/* ------------------------------------------------------------------ */
/* Supplies (1200 x 1200, transparent)                                 */
/* ------------------------------------------------------------------ */
export function supply(o) {
  const r = rng(`${o.seed || o.title}-supply`);
  const p = pal(o.palette || 'crimson', r);
  const form = o.form || 'sleeves';
  const shadow = `<ellipse cx="600" cy="1060" rx="400" ry="40" fill="#000" opacity=".4"/>`;
  const defs = `<defs>
    <linearGradient id="pf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset="1" stop-color="${p.b}"/></linearGradient>
    <linearGradient id="clear" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".5" stop-color="#cfd6e4" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity=".3"/></linearGradient>
  </defs>`;
  const title = String(o.title || '').toUpperCase();
  if (form === 'toploader') {
    let s = '';
    for (let i = 0; i < 5; i++) {
      const rot = -14 + i * 7;
      s += `<g transform="rotate(${rot} 600 640)"><rect x="380" y="260" width="440" height="620" rx="18" fill="url(#clear)" stroke="#fff" stroke-opacity=".6" stroke-width="4"/><rect x="380" y="260" width="440" height="40" rx="12" fill="#fff" opacity=".15"/></g>`;
    }
    return `${defs}${shadow}<g transform="translate(0 20)">${s}</g>
      <rect x="400" y="960" width="400" height="70" rx="35" fill="${p.a}"/>
      <text x="600" y="1006" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="28" fill="#fff" letter-spacing="4">${esc(o.sub || '35PT · 25 CT')}</text>`;
  }
  if (form === 'binder') {
    return `${defs}${shadow}
      <rect x="290" y="170" width="640" height="860" rx="40" fill="#0f1013"/>
      <rect x="270" y="150" width="640" height="860" rx="40" fill="url(#pf)" stroke="#fff" stroke-opacity=".15" stroke-width="3"/>
      <rect x="270" y="150" width="80" height="860" rx="30" fill="#000" opacity=".35"/>
      <path d="M910 200 L910 960" stroke="#d4d6dd" stroke-width="10" stroke-dasharray="6 10"/>
      <rect x="420" y="330" width="400" height="80" rx="12" fill="#000" opacity=".3"/>
      <text x="620" y="384" text-anchor="middle" font-family="${FONT_BLACK}" font-size="40" fill="#fff" letter-spacing="6">VAULT</text>
      <g transform="translate(620 640)"><circle r="120" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="6"/><path d="M-50 -30 L0 60 L50 -30" fill="none" stroke="#fff" stroke-width="18" stroke-linejoin="round" stroke-linecap="round"/></g>
      <text x="620" y="900" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="30" fill="#fff" fill-opacity=".8" letter-spacing="6">${esc(o.sub || '9-POCKET · 360 CARDS')}</text>`;
  }
  if (form === 'onetouch') {
    return `${defs}${shadow}
      <rect x="330" y="160" width="540" height="860" rx="34" fill="#1b1c22" stroke="#fff" stroke-opacity=".5" stroke-width="5"/>
      <rect x="330" y="160" width="540" height="860" rx="34" fill="url(#clear)"/>
      <rect x="375" y="205" width="450" height="770" rx="20" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3"/>
      <g transform="translate(395 228) scale(0.65)">${cardFront({ seed: o.seed, title: 'Sample Card', palette: 'graphite', foil: true }, 'ot')}</g>
      <rect x="330" y="160" width="540" height="860" rx="34" fill="url(#clear)" opacity=".7"/>`;
  }
  // sleeves pack
  const colors = o.colors || [p.a, p.b];
  let fan = '';
  for (let i = 0; i < 6; i++) fan += `<rect x="${430 + i * 14}" y="${250 - i * 6}" width="360" height="520" rx="16" fill="${colors[i % colors.length]}" stroke="#fff" stroke-opacity=".25" stroke-width="2" transform="rotate(${-8 + i * 3} 600 520)"/>`;
  return `${defs}${shadow}
    ${fan}
    <rect x="300" y="420" width="600" height="610" rx="26" fill="#0d0e10" stroke="#fff" stroke-opacity=".2" stroke-width="3"/>
    <rect x="340" y="460" width="520" height="300" rx="16" fill="url(#pf)"/>
    <rect x="340" y="460" width="520" height="300" rx="16" fill="url(#clear)"/>
    <text x="600" y="840" text-anchor="middle" font-family="${FONT_BLACK}" font-size="${Math.min(54, Math.floor(900 / Math.max(10, title.length)))}" fill="#fff" letter-spacing="3">${esc(title || 'MATTE SLEEVES')}</text>
    <text x="600" y="900" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="28" fill="${p.glow}" letter-spacing="8">${esc(o.sub || '100 CT · 66 × 91 MM')}</text>
    <rect x="300" y="950" width="600" height="80" rx="0" fill="${p.a}" opacity=".9"/>
    <text x="600" y="1002" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="26" fill="#fff" letter-spacing="10">VAULT SUPPLY CO.</text>`;
}

/* ------------------------------------------------------------------ */
/* Collection banners (16:9), blog scenes, avatars                     */
/* ------------------------------------------------------------------ */
function miniCard(x, y, w, rot, p, id, r) {
  const h = w * (88 / 63);
  return `<g transform="rotate(${f(rot)} ${f(x + w / 2)} ${f(y + h / 2)})">
    <rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(w * 0.06)}" fill="url(#${id})" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>
    <rect x="${f(x + w * 0.08)}" y="${f(y + h * 0.13)}" width="${f(w * 0.84)}" height="${f(h * 0.42)}" rx="${f(w * 0.03)}" fill="${p.glow}" opacity=".35"/>
    <circle cx="${f(x + w / 2)}" cy="${f(y + h * 0.34)}" r="${f(w * 0.17)}" fill="#fff" opacity="${f(0.5 + r() * 0.4)}"/>
    <rect x="${f(x + w * 0.08)}" y="${f(y + h * 0.04)}" width="${f(w * 0.6)}" height="${f(h * 0.05)}" rx="3" fill="#fff" opacity=".5"/>
    <rect x="${f(x + w * 0.08)}" y="${f(y + h * 0.62)}" width="${f(w * 0.84)}" height="${f(h * 0.04)}" rx="3" fill="#fff" opacity=".18"/>
    <rect x="${f(x + w * 0.08)}" y="${f(y + h * 0.7)}" width="${f(w * 0.64)}" height="${f(h * 0.04)}" rx="3" fill="#fff" opacity=".14"/>
  </g>`;
}

export function banner(o, w, h) {
  const r = rng(o.seed || o.title || 'banner');
  const p = pal(o.palette, r);
  const title = String(o.title || 'Vault').toUpperCase();
  const size = Math.min(300, Math.floor((w * 0.86) / Math.max(4, title.length * 0.74)));
  let grid = '';
  for (let i = 0; i <= 24; i++) grid += `<line x1="${f((i / 24) * w)}" y1="${h * 0.62}" x2="${f(w / 2 + ((i / 24) * w - w / 2) * 3)}" y2="${h}" stroke="${p.glow}" stroke-opacity=".14"/>`;
  for (let i = 0; i < 8; i++) {
    const y = h * 0.62 + Math.pow(i / 8, 1.8) * h * 0.38;
    grid += `<line x1="0" y1="${f(y)}" x2="${w}" y2="${f(y)}" stroke="${p.glow}" stroke-opacity="${f(0.06 + i * 0.015)}"/>`;
  }
  let cards = '';
  const n = 5;
  for (let i = 0; i < n; i++) {
    const cw = w * (0.1 + r() * 0.05);
    const cx = w * (0.08 + (i / (n - 1)) * 0.74) + (r() - 0.5) * w * 0.05;
    const cy = h * (0.28 + r() * 0.3);
    cards += miniCard(cx, cy, cw, (r() - 0.5) * 40, p, `bc${i % 2}`, r);
  }
  return `<defs>
      <radialGradient id="bg" cx=".5" cy=".35" r=".9"><stop offset="0" stop-color="${p.a}" stop-opacity=".55"/><stop offset=".45" stop-color="#16171c"/><stop offset="1" stop-color="#08090b"/></radialGradient>
      <linearGradient id="bc0" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset="1" stop-color="${p.b}"/></linearGradient>
      <linearGradient id="bc1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3d46"/><stop offset="1" stop-color="#0b0c0f"/></linearGradient>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".5" stop-color="#08090b" stop-opacity="0"/><stop offset="1" stop-color="#08090b" stop-opacity=".85"/></linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    ${grid}
    <circle cx="${f(w * (0.3 + r() * 0.4))}" cy="${f(h * 0.3)}" r="${f(h * 0.32)}" fill="${p.glow}" opacity=".16"/>
    <g opacity=".92">${cards}</g>
    <text x="${w / 2}" y="${f(h * 0.6 + size * 0.35)}" text-anchor="middle" font-family="${FONT_BLACK}" font-size="${size}" font-weight="900" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="${Math.max(2, size / 70)}" letter-spacing="${f(size * 0.04)}">${esc(title)}</text>
    <rect width="${w}" height="${h}" fill="url(#fade)"/>`;
}

export function scene(o, w, h, name = '') {
  const r = rng(o.seed || name || 'scene');
  const p = pal(o.palette, r);
  const variant = Math.floor(r() * 4);
  let body = '';
  if (variant === 0) {
    for (let i = 0; i < 4; i++) body += `<ellipse cx="${w / 2}" cy="${h * 0.48}" rx="${f(h * (0.42 + i * 0.12))}" ry="${f(h * (0.1 + i * 0.03))}" fill="none" stroke="${p.hi}" stroke-opacity="${f(0.35 - i * 0.07)}" stroke-width="2" transform="rotate(-12 ${w / 2} ${h * 0.48})"/>`;
    body += `<circle cx="${w / 2}" cy="${h * 0.48}" r="${f(h * 0.2)}" fill="url(#orb)"/>`;
    body += miniCard(w * 0.16, h * 0.3, w * 0.12, -16, p, 'sc0', r) + miniCard(w * 0.72, h * 0.22, w * 0.12, 14, p, 'sc1', r);
  } else if (variant === 1) {
    for (let i = 0; i <= 30; i++) body += `<line x1="${f((i / 30) * w)}" y1="${h * 0.55}" x2="${f(w / 2 + ((i / 30) * w - w / 2) * 3.2)}" y2="${h}" stroke="${p.glow}" stroke-opacity=".16"/>`;
    for (let i = 0; i < 9; i++) body += `<line x1="0" y1="${f(h * 0.55 + Math.pow(i / 9, 1.8) * h * 0.45)}" x2="${w}" y2="${f(h * 0.55 + Math.pow(i / 9, 1.8) * h * 0.45)}" stroke="${p.glow}" stroke-opacity=".1"/>`;
    for (let i = 0; i < 3; i++) body += miniCard(w * (0.22 + i * 0.2), h * (0.16 + (i % 2) * 0.06), w * 0.15, (i - 1) * 9, p, `sc${i % 2}`, r);
  } else if (variant === 2) {
    for (let i = 0; i < 14; i++) {
      const y = r() * h;
      body += `<rect x="${f(-w * 0.2 + r() * w * 0.4)}" y="${f(y)}" width="${f(w * (0.5 + r() * 0.8))}" height="${f(2 + r() * 10)}" rx="4" fill="${i % 3 ? p.glow : '#fff'}" opacity="${f(0.08 + r() * 0.25)}" transform="rotate(-18 ${w / 2} ${h / 2})"/>`;
    }
    body += miniCard(w * 0.38, h * 0.18, w * 0.18, -8, p, 'sc0', r);
  } else {
    for (let i = 0; i < 7; i++) body += miniCard(w * 0.3 + i * w * 0.035, h * 0.2 + i * h * 0.025, w * 0.14, -24 + i * 8, p, `sc${i % 2}`, r);
  }
  let dust = '';
  for (let i = 0; i < 40; i++) dust += `<circle cx="${f(r() * w)}" cy="${f(r() * h)}" r="${f(1 + r() * 3)}" fill="#fff" opacity="${f(0.1 + r() * 0.4)}"/>`;
  return `<defs>
      <radialGradient id="sbg" cx="${f(0.3 + r() * 0.4)}" cy=".3" r="1"><stop offset="0" stop-color="${p.a}" stop-opacity=".5"/><stop offset=".5" stop-color="#15161b"/><stop offset="1" stop-color="#08090b"/></radialGradient>
      <radialGradient id="orb" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="${p.glow}"/><stop offset="1" stop-color="${p.b}"/></radialGradient>
      <linearGradient id="sc0" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset="1" stop-color="${p.b}"/></linearGradient>
      <linearGradient id="sc1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3d46"/><stop offset="1" stop-color="#0b0c0f"/></linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#sbg)"/>${body}${dust}`;
}

export function avatar(o, w, h) {
  const r = rng(o.seed || 'avatar');
  const p = pal(o.palette, r);
  return `<defs><linearGradient id="av" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset="1" stop-color="${p.b}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#av)"/>
    <circle cx="${w / 2}" cy="${h * 0.42}" r="${w * 0.18}" fill="#fff" opacity=".22"/>
    <path d="M${w * 0.18} ${h} Q${w / 2} ${h * 0.5} ${w * 0.82} ${h}Z" fill="#fff" opacity=".22"/>
    <text x="${w / 2}" y="${h * 0.56}" text-anchor="middle" font-family="${FONT_BLACK}" font-size="${w * 0.26}" fill="#fff">${esc(o.initials || 'VC')}</text>`;
}

export function logo(o, w, h) {
  return `<g font-family="${FONT_BLACK}"><circle cx="${h / 2}" cy="${h / 2}" r="${h * 0.38}" fill="#e11d2e"/><path d="M${h * 0.32} ${h * 0.36} L${h / 2} ${h * 0.68} L${h * 0.68} ${h * 0.36}" fill="none" stroke="#fff" stroke-width="${h * 0.09}" stroke-linejoin="round" stroke-linecap="round"/><text x="${h * 1.05}" y="${h * 0.66}" font-size="${h * 0.48}" fill="#f4f4f5" letter-spacing="${h * 0.04}">VAULT</text></g>`;
}

/* Generic placeholder SVG used by placeholder_svg_tag */
export function placeholderSvg(name, cls) {
  const r = rng(String(name || 'image'));
  const p = PALETTES[pick(r, ['crimson', 'graphite', 'steel'])];
  const n = String(name || '');
  const isCard = /product|card/.test(n);
  const w = isCard ? 630 : 1600;
  const h = isCard ? 880 : 900;
  const inner = isCard
    ? cardFront({ seed: n, title: 'Placeholder', palette: 'graphite' }, `ph${hash(n) % 999}`)
    : scene({ seed: n }, w, h, n).replace(/id="(\w+)"/g, `id="$1${hash(n) % 999}"`).replace(/url\(#(\w+)\)/g, `url(#$1${hash(n) % 999})`);
  return `<svg class="${esc(cls || 'placeholder-svg')}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" data-placeholder="${esc(n)}" style="--ph:${p.a}">${inner}</svg>`;
}
