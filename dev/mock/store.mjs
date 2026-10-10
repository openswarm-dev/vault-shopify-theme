// Mock "Vault Collectibles" store: products, collections, pages, blog, customer, menus.
// All card names, players and sets are fictional. Dates are relative to server start.
import { registerArt, hash } from './art.mjs';
import { ImageDrop, MetafieldsDrop, MetafieldDrop, OptionValueDrop, indexedArray } from '../lib/drops.mjs';

const NOW = Date.now();
const DAY = 86400000;
export const isoDaysAgo = (d, h = 0) => new Date(NOW - d * DAY - h * 3600000).toISOString();

export function handleize(input) {
  return String(input ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
export const stripHtml = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------ */
/* Product specs                                                       */
/* ------------------------------------------------------------------ */
const G = (o) => ({ kind: 'graded', ...o });
const R = (o) => ({ kind: 'single', ...o });
const S = (o) => ({ kind: 'sealed', ...o });
const U = (o) => ({ kind: 'supply', ...o });

const SPECS = [
  G({ handle: 'base-set-holo-dragon-psa-10', title: 'Ember Drake — 1st Edition Holo · PSA 10', card: 'Ember Drake', game: 'Pokémon', set: 'Ember Origins', number: '004/102', rarity: 'Holo Rare', variantLabel: '1st Edition Holo', grade: 'PSA 10', cert: '84512397', year: 1999, pop: 121, price: 1245000, qty: 1, days: 40, palette: 'crimson', hp: 120, meta: true, extraTags: ['featured', 'grail'] }),
  G({ handle: 'tidecaller-leviathan-alt-art-bgs-9-5', title: 'Tidecaller Leviathan Alt Art · BGS 9.5', card: 'Tidecaller Leviathan', game: 'Pokémon', set: 'Abyssal Tides', number: '215/203', rarity: 'Alt Art Secret Rare', grade: 'BGS 9.5', cert: '0012849571', year: 2021, pop: 342, price: 189900, compare: 219900, qty: 2, days: 25, palette: 'tide', hp: 220, extraTags: ['featured'] }),
  G({ handle: 'void-reaper-secret-rare-cgc-9', title: 'Void Reaper Secret Rare · CGC 9', card: 'Void Reaper', game: 'Yu-Gi-Oh!', set: 'Shadow Requiem', number: 'SHRQ-EN001', rarity: 'Secret Rare', grade: 'CGC 9', cert: '4129385012', year: 2004, pop: 58, price: 64500, qty: 1, days: 60, palette: 'void', hp: 2500, meta: true }),
  G({ handle: 'inferno-kirin-gold-star-psa-9', title: 'Inferno Kirin Gold Star · PSA 9', card: 'Inferno Kirin', game: 'Pokémon', set: 'Crimson Skies', number: '100/101', rarity: 'Gold Star', grade: 'PSA 9', cert: '73920184', year: 2005, pop: 87, price: 329900, qty: 0, days: 90, palette: 'ember', hp: 100 }),
  G({ handle: 'crimson-titan-mythic-foil-psa-10', title: 'Crimson Titan — Mythic Foil · PSA 10', card: 'Crimson Titan', game: 'Magic: The Gathering', set: 'Ashen Dominion', number: '187/264', rarity: 'Mythic Rare Foil', grade: 'PSA 10', cert: '91283746', year: 2023, pop: 44, price: 89900, qty: 1, days: 2, palette: 'crimson', hp: 7, meta: true }),
  G({ handle: 'astral-oracle-manga-rare-psa-10', title: 'Astral Oracle Manga Rare · PSA 10', card: 'Astral Oracle', game: 'One Piece', set: 'Starfall Voyage', number: 'OP05-119', rarity: 'Manga Rare', grade: 'PSA 10', cert: '90011223', year: 2023, pop: 211, price: 274900, qty: 1, days: 1, palette: 'void', hp: 9000, language: 'Japanese' }),
  G({ handle: 'glimmerwing-sprite-enchanted-cgc-9-5', title: 'Glimmerwing Sprite — Enchanted · CGC 9.5', card: 'Glimmerwing Sprite', game: 'Lorcana', set: 'Wishing Lanterns', number: '207/204', rarity: 'Enchanted', grade: 'CGC 9.5', cert: '4300918274', year: 2024, pop: 96, price: 54900, qty: 3, days: 18, palette: 'gold', hp: 5, meta: true }),
  G({ handle: 'marcus-vale-apex-chrome-silver-rookie-psa-10', title: 'Marcus Vale 2019 Apex Chrome Silver Rookie · PSA 10', card: 'Marcus Vale', game: 'Sports Cards', set: 'Apex Chrome Basketball', number: '#248', rarity: 'Silver Refractor', variantLabel: 'Silver Rookie', grade: 'PSA 10', cert: '55120934', year: 2019, pop: 402, price: 149900, compare: 169900, qty: 2, days: 30, palette: 'steel', hp: 23, extraTags: ['rookie'] }),
  G({ handle: 'dante-okafor-rookie-auto-bgs-9-5', title: 'Dante Okafor 2021 Rookie Auto /99 · BGS 9.5', card: 'Dante Okafor', game: 'Sports Cards', set: 'Gridiron Prime Football', number: '#RA-DO', rarity: 'Rookie Auto', grade: 'BGS 9.5', cert: '0013377421', year: 2021, pop: 12, price: 89900, qty: 1, days: 12, palette: 'crimson', hp: 11, meta: true, extraTags: ['rookie', 'auto'] }),
  G({ handle: 'lena-ashford-rookie-patch-sgc-10', title: 'Lena Ashford 2018 Rookie Patch · SGC 10', card: 'Lena Ashford', game: 'Sports Cards', set: 'Pitchside Elite Soccer', number: '#RP-14', rarity: 'Rookie Patch', grade: 'SGC 10', cert: '1029384756', year: 2018, pop: 7, price: 42500, qty: 0, days: 50, palette: 'verdant', hp: 9, extraTags: ['rookie'] }),
  G({ handle: 'storm-herald-1st-edition-psa-8', title: 'Storm Herald 1st Edition · PSA 8', card: 'Storm Herald', game: 'Pokémon', set: 'Ember Origins', number: '016/102', rarity: 'Holo Rare', variantLabel: '1st Edition', grade: 'PSA 8', cert: '61728394', year: 1999, pop: 1532, price: 45900, qty: 2, days: 70, palette: 'tide', hp: 90 }),
  G({ handle: 'duskfang-wolf-holo-tag-10', title: 'Duskfang Wolf Holo · TAG 10', card: 'Duskfang Wolf', game: 'Pokémon', set: 'Moonlit Hollow', number: '058/165', rarity: 'Holo Rare', grade: 'TAG 10', cert: 'X9A21B77', year: 2022, pop: 31, price: 21900, qty: 1, days: 3, palette: 'graphite', hp: 130, meta: true }),

  R({ handle: 'ember-drake-reverse-holo', title: 'Ember Drake — Reverse Holo', card: 'Ember Drake', game: 'Pokémon', set: 'Ember Origins', number: '004/102', rarity: 'Reverse Holo', year: 2016, price: 8999, lang: true, inv: [2, 1, 3, 0, 1, 2], days: 35, palette: 'crimson', hp: 120, meta: true }),
  R({ handle: 'tidecaller-leviathan-full-art', title: 'Tidecaller Leviathan Full Art', card: 'Tidecaller Leviathan', game: 'Pokémon', set: 'Abyssal Tides', number: '198/203', rarity: 'Full Art Ultra Rare', year: 2021, price: 4499, inv: [4, 2, 0], days: 20, palette: 'tide', hp: 220 }),
  R({ handle: 'crimson-titan-mythic-rare', title: 'Crimson Titan — Mythic Rare', card: 'Crimson Titan', game: 'Magic: The Gathering', set: 'Ashen Dominion', number: '187/264', rarity: 'Mythic Rare', year: 2023, price: 3499, lang: true, inv: [3, 1, 2, 0, 1, 0], days: 15, palette: 'crimson', hp: 7, meta: true }),
  R({ handle: 'void-reaper-ultra-rare', title: 'Void Reaper Ultra Rare', card: 'Void Reaper', game: 'Yu-Gi-Oh!', set: 'Shadow Requiem', number: 'SHRQ-EN001', rarity: 'Ultra Rare', year: 2004, price: 1899, inv: [5, 3, 1], days: 45, palette: 'void', hp: 2500 }),
  R({ handle: 'astral-oracle-super-rare', title: 'Astral Oracle Super Rare', card: 'Astral Oracle', game: 'One Piece', set: 'Starfall Voyage', number: 'OP05-060', rarity: 'Super Rare', year: 2023, price: 1299, inv: [6, 2, 2], days: 22, palette: 'void', hp: 9000, meta: true }),
  R({ handle: 'glimmerwing-sprite-legendary-foil', title: 'Glimmerwing Sprite — Legendary Foil', card: 'Glimmerwing Sprite', game: 'Lorcana', set: 'Wishing Lanterns', number: '142/204', rarity: 'Legendary Foil', year: 2024, price: 2499, lang: true, inv: [2, 0, 1, 1, 0, 0], days: 9, palette: 'gold', hp: 5 }),
  R({ handle: 'thornback-golem-holo', title: 'Thornback Golem Holo', card: 'Thornback Golem', game: 'Pokémon', set: 'Moonlit Hollow', number: '071/165', rarity: 'Holo Rare', year: 2022, price: 699, inv: [1, 1, 0], days: 28, palette: 'verdant', hp: 150, meta: true }),
  R({ handle: 'skyforge-phoenix-rare', title: 'Skyforge Phoenix Rare', card: 'Skyforge Phoenix', game: 'Magic: The Gathering', set: 'Ashen Dominion', number: '141/264', rarity: 'Rare', year: 2023, price: 899, inv: [0, 0, 0], days: 55, palette: 'ember', hp: 4 }),
  R({ handle: 'ironclad-sentinel-secret-rare', title: 'Ironclad Sentinel Secret Rare', card: 'Ironclad Sentinel', game: 'Yu-Gi-Oh!', set: 'Shadow Requiem', number: 'SHRQ-EN045', rarity: 'Secret Rare', year: 2004, price: 2999, compare: 3999, inv: [2, 4, 1], days: 33, palette: 'steel', hp: 2800, meta: true }),
  R({ handle: 'moonlit-kitsune-illustration-rare', title: 'Moonlit Kitsune Illustration Rare', card: 'Moonlit Kitsune', game: 'Pokémon', set: 'Moonlit Hollow', number: '182/165', rarity: 'Special Illustration Rare', year: 2022, price: 15999, lang: true, inv: [1, 2, 0, 1, 1, 0], days: 4, palette: 'void', hp: 170 }),
  R({ handle: 'marcus-vale-apex-chrome-base-rookie', title: 'Marcus Vale 2019 Apex Chrome Base Rookie', card: 'Marcus Vale', game: 'Sports Cards', set: 'Apex Chrome Basketball', number: '#248', rarity: 'Base Rookie', year: 2019, price: 2999, inv: [3, 2, 1], days: 26, palette: 'steel', hp: 23, meta: true, extraTags: ['rookie'] }),

  S({ handle: 'ember-origins-booster-box', title: 'Ember Origins Booster Box (36 Packs)', game: 'Pokémon', set: 'Ember Origins', form: 'box', sub: '36 Booster Packs', price: 16999, qty: 8, days: 50, palette: 'crimson', year: 2024, extraTags: ['featured'] }),
  S({ handle: 'abyssal-tides-elite-trainer-box', title: 'Abyssal Tides Elite Trainer Box', game: 'Pokémon', set: 'Abyssal Tides', form: 'etb', sub: 'Elite Trainer Box', price: 5499, compare: 6499, qty: 12, days: 20, palette: 'tide', year: 2024 }),
  S({ handle: 'ashen-dominion-collector-booster-box', title: 'Ashen Dominion Collector Booster Box', game: 'Magic: The Gathering', set: 'Ashen Dominion', form: 'collector', sub: '12 Collector Boosters', price: 27999, qty: 2, days: 10, palette: 'gold', year: 2023 }),
  S({ handle: 'shadow-requiem-booster-pack', title: 'Shadow Requiem Booster Pack', game: 'Yu-Gi-Oh!', set: 'Shadow Requiem', form: 'pack', sub: '9 Cards', price: 499, qty: 120, days: 65, palette: 'void', year: 2024 }),
  S({ handle: 'starfall-voyage-booster-box', title: 'Starfall Voyage Booster Box', game: 'One Piece', set: 'Starfall Voyage', form: 'box', sub: '24 Booster Packs', price: 12999, qty: 0, days: 80, palette: 'ember', year: 2023 }),
  S({ handle: 'wishing-lanterns-gift-tin', title: 'Wishing Lanterns Gift Tin', game: 'Lorcana', set: 'Wishing Lanterns', form: 'tin', sub: '4 Packs + Promo', price: 2999, qty: 15, days: 2, palette: 'gold', year: 2024 }),

  U({ handle: 'vault-matte-sleeves-100', title: 'Vault Matte Sleeves (100 ct)', form: 'sleeves', colors: [['Crimson', 1299, 40, 'crimson'], ['Graphite', 1299, 25, 'graphite'], ['Clear', 1099, 0, 'steel']], days: 100 }),
  U({ handle: 'ultra-clear-top-loaders-25', title: 'Ultra-Clear Top Loaders (25 ct)', form: 'toploader', sub: '35pt · 25 ct', price: 599, qty: 200, days: 120, palette: 'steel' }),
  U({ handle: 'graphite-9-pocket-zip-binder', title: 'Graphite 9-Pocket Zip Binder', form: 'binder', price: 3999, compare: 4999, qty: 9, days: 14, palette: 'graphite' }),
  U({ handle: 'magnetic-one-touch-35pt', title: 'Magnetic One-Touch Holder 35pt', form: 'onetouch', price: 399, qty: 2, days: 75, palette: 'steel' }),
];

const TYPE = { graded: 'Graded Card', single: 'Single', sealed: 'Sealed', supply: 'Supplies' };
const VENDOR = { graded: 'Vault Graded', single: 'Vault Singles', sealed: 'Vault Sealed', supply: 'Vault Supply Co.' };
const CONDITIONS = ['Near Mint', 'Lightly Played', 'Moderately Played'];
const COND_MULT = [1, 0.82, 0.65];
const round99 = (cents) => Math.max(99, Math.round(cents / 100) * 100 - 1);

/* ------------------------------------------------------------------ */
/* Descriptions                                                        */
/* ------------------------------------------------------------------ */
function describe(s) {
  if (s.kind === 'graded') {
    const [grader, score] = s.grade.split(' ');
    return `<p>A sharp, eye-appealing copy of <strong>${s.card}</strong> from <em>${s.set}</em>, encapsulated by ${grader} at <strong>${score}</strong>. Centering is excellent front and back, with crisp corners and a clean holo surface under raking light.</p>
<ul><li>Grader: ${grader} · Grade: ${score}</li><li>Set: ${s.set} · No. ${s.number}</li><li>Certification: #${s.cert}</li><li>Population at grade: ${s.pop}</li></ul>
<p>Every slab is photographed in-hand, ships double-boxed with corner protectors, and is fully insured from our vault to your door.</p>`;
  }
  if (s.kind === 'single') {
    return `<p><strong>${s.card}</strong> (${s.rarity}) from <em>${s.set}</em>, card number ${s.number}. Pulled fresh from the vault, sleeved immediately and stored in a top loader.</p>
<h3>Condition guide</h3>
<ul><li><strong>Near Mint</strong> — minimal to no wear, clean edges, pack fresh.</li><li><strong>Lightly Played</strong> — minor edge or corner wear visible on close inspection.</li><li><strong>Moderately Played</strong> — moderate whitening or surface wear; no creases.</li></ul>
<p>Ships in a penny sleeve + top loader inside a bubble mailer.</p>`;
  }
  if (s.kind === 'sealed') {
    return `<p>Factory-sealed <strong>${s.title}</strong>. Sourced directly from distribution — never searched, never weighed, never resealed.</p>
<ul><li>Game: ${s.game}</li><li>Set: ${s.set}</li><li>Contents: ${s.sub}</li></ul>
<p>Shipped in a padded box with extra edge protection so the shrink wrap arrives intact.</p>`;
  }
  return `<p>Collector-grade protection from <strong>Vault Supply Co.</strong> Acid-free, archival-safe and sized for standard trading cards.</p>
<ul><li>Fits 63 × 88 mm cards</li><li>PVC-free, acid-free materials</li><li>Designed for long-term storage and display</li></ul>`;
}

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */
const productsByHandle = {};
const variantsById = new Map();
let variantSeq = 46100000000;

function media(handle, list, title) {
  return list.map((spec, i) => {
    const name = `p-${handle}-${i + 1}`;
    registerArt(name, spec);
    return new ImageDrop({ name, alt: spec.alt || `${title}${i ? ` — image ${i + 1}` : ''}`, position: i + 1, id: 3200000000 + hash(name) % 99999999 });
  });
}

function buildProduct(s, idx) {
  const id = 8100000001 + idx;
  const handle = s.handle;
  const cardSpec = { title: s.card || s.title, set: s.set, number: s.number, rarity: s.rarity, palette: s.palette, hp: s.hp, seed: s.card || s.handle, year: s.year, variantLabel: s.variantLabel };
  let mediaSpecs;
  let grader = null, score = null;
  if (s.kind === 'graded') {
    [grader, score] = s.grade.split(' ');
    mediaSpecs = [
      { kind: 'slab', grader, score, cert: s.cert, card: cardSpec, seed: handle, alt: `${s.title} — slab front` },
      { kind: 'slab', grader, score, cert: s.cert, card: cardSpec, side: 'back', seed: handle, alt: `${s.title} — slab back` },
      { kind: 'card', ...cardSpec, alt: `${s.card} — card detail` },
    ];
  } else if (s.kind === 'single') {
    mediaSpecs = [
      { kind: 'card', ...cardSpec, alt: `${s.title} — front` },
      { kind: 'back', seed: handle, alt: `${s.title} — back` },
    ];
    if (idx % 2) mediaSpecs.push({ kind: 'card', ...cardSpec, seed: `${cardSpec.seed}-alt`, alt: `${s.title} — alternate angle` });
  } else if (s.kind === 'sealed') {
    mediaSpecs = [
      { kind: 'sealed', form: s.form, title: s.set, sub: s.sub, palette: s.palette, seed: handle, alt: s.title },
      { kind: 'sealed', form: s.form === 'pack' ? 'box' : 'pack', title: s.set, sub: s.form === 'pack' ? 'Display · 24 packs' : 'Booster pack', palette: s.palette, seed: `${handle}-2`, alt: `${s.title} — contents` },
    ];
  } else if (s.colors) {
    mediaSpecs = s.colors.map(([name, , , palette]) => ({ kind: 'supply', form: s.form, title: `Matte Sleeves`, sub: `${name.toUpperCase()} · 100 CT`, palette, colors: undefined, seed: `${handle}-${name}`, alt: `${s.title} — ${name}` }));
  } else {
    mediaSpecs = [
      { kind: 'supply', form: s.form, title: s.title, sub: s.sub, palette: s.palette, seed: handle, alt: s.title },
      { kind: 'supply', form: s.form, title: s.title, sub: s.sub, palette: 'crimson', seed: `${handle}-2`, alt: `${s.title} — detail` },
    ];
  }
  const images = media(handle, mediaSpecs, s.title);
  images.forEach((img) => { img.product_id = id; });

  // Options & variants
  let options = [];
  let combos = [];
  if (s.kind === 'single') {
    options = s.lang ? ['Condition', 'Language'] : ['Condition'];
    let n = 0;
    CONDITIONS.forEach((cond, ci) => {
      (s.lang ? ['English', 'Japanese'] : [null]).forEach((lang) => {
        const base = s.price * COND_MULT[ci] * (lang === 'Japanese' ? 1.12 : 1);
        const price = ci === 0 && lang !== 'Japanese' ? s.price : round99(base);
        const compare = s.compare ? round99((price * s.compare) / s.price) : null;
        combos.push({ opts: lang ? [cond, lang] : [cond], price, compare, qty: s.inv[n] ?? 0, media: images[0] });
        n += 1;
      });
    });
  } else if (s.colors) {
    options = ['Color'];
    combos = s.colors.map(([name, price, qty], i) => ({ opts: [name], price, compare: null, qty, media: images[i] }));
  } else {
    options = ['Title'];
    combos = [{ opts: ['Default Title'], price: s.price, compare: s.compare || null, qty: s.qty, media: images[0] }];
  }
  const hasOnlyDefault = options.length === 1 && options[0] === 'Title';
  const grams = s.kind === 'graded' ? 120 : s.kind === 'single' ? 10 : s.kind === 'sealed' ? (s.form === 'pack' ? 30 : 900) : 150;

  const product = {
    id, handle, title: s.title,
    url: `/products/${handle}`,
    vendor: VENDOR[s.kind],
    type: TYPE[s.kind],
    object_type: 'product',
  };
  const variants = combos.map((c, i) => {
    const vid = ++variantSeq;
    const title = c.opts.join(' / ');
    const v = {
      id: vid,
      title,
      name: hasOnlyDefault ? s.title : `${s.title} - ${title}`,
      public_title: hasOnlyDefault ? null : title,
      option1: c.opts[0] ?? null,
      option2: c.opts[1] ?? null,
      option3: c.opts[2] ?? null,
      options: c.opts,
      available: c.qty > 0,
      price: c.price,
      compare_at_price: c.compare && c.compare > c.price ? c.compare : null,
      sku: `VLT-${String(idx + 1).padStart(3, '0')}-${i + 1}`,
      barcode: null,
      inventory_quantity: c.qty,
      inventory_management: 'shopify',
      inventory_policy: 'deny',
      featured_media: c.media,
      featured_image: c.media,
      image: c.media,
      requires_shipping: true,
      requires_selling_plan: false,
      taxable: true,
      weight: grams,
      weight_unit: 'lb',
      weight_in_unit: Math.round((grams / 453.592) * 100) / 100,
      unit_price_measurement: null,
      unit_price: null,
      quantity_rule: { min: 1, max: null, increment: 1 },
      quantity_price_breaks: [],
      selling_plan_allocations: [],
      store_availabilities: [],
      incoming: false,
      next_incoming_date: null,
      matched: true,
      selected: false,
      metafields: new MetafieldsDrop(),
      url: `/products/${handle}?variant=${vid}`,
      object_type: 'variant',
    };
    Object.defineProperty(v, 'product', { value: product, enumerable: false, writable: true });
    variantsById.set(vid, v);
    return v;
  });

  const prices = variants.map((v) => v.price);
  const compares = variants.map((v) => v.compare_at_price).filter(Boolean);
  const available = variants.some((v) => v.available);
  const firstAvailable = variants.find((v) => v.available) || null;

  // Collector data (metafields or tags)
  const meta = {
    game: s.game || null,
    set_name: s.set || null,
    card_number: s.number || null,
    rarity: s.rarity || null,
    grade: s.grade || null,
    grading_company: grader,
    cert_number: s.cert || null,
    condition: s.kind === 'graded' ? (Number(score) >= 9 ? 'Mint' : 'Near Mint') : null,
    language: s.kind === 'graded' || s.kind === 'single' ? s.language || 'English' : null,
    year: s.year || null,
    population: s.pop || null,
  };
  const tags = [];
  const kindTag = { graded: 'graded', single: 'raw', sealed: 'sealed', supply: 'supplies' }[s.kind];
  tags.push(kindTag);
  if (grader) tags.push(grader);
  if (s.year && s.year <= 2005) tags.push('vintage');
  if (s.extraTags) tags.push(...s.extraTags);
  const customMetafields = {};
  if (s.meta) {
    for (const [k, v] of Object.entries(meta)) {
      if (v == null) continue;
      customMetafields[k] = new MetafieldDrop(v, typeof v === 'number' ? 'number_integer' : 'single_line_text_field');
    }
  } else {
    const tagKeys = { rarity: 'rarity', grade: 'grade', set: 'set_name', number: 'card_number', game: 'game', cert: 'cert_number', year: 'year', language: 'language', pop: 'population', grader: 'grading_company' };
    for (const [tk, mk] of Object.entries(tagKeys)) if (meta[mk] != null && s.kind !== 'supply') tags.push(`${tk}:${meta[mk]}`);
  }

  Object.assign(product, {
    tags,
    price: Math.min(...prices),
    price_min: Math.min(...prices),
    price_max: Math.max(...prices),
    price_varies: Math.min(...prices) !== Math.max(...prices),
    compare_at_price: compares.length ? Math.min(...compares) : null,
    compare_at_price_min: compares.length ? Math.min(...compares) : 0,
    compare_at_price_max: compares.length ? Math.max(...compares) : 0,
    compare_at_price_varies: compares.length > 1 && Math.min(...compares) !== Math.max(...compares),
    available,
    images,
    media: images,
    featured_image: images[0],
    featured_media: images[0],
    options,
    variants,
    first_available_variant: firstAvailable,
    selected_variant: null,
    selected_or_first_available_variant: firstAvailable || variants[0],
    has_only_default_variant: hasOnlyDefault,
    description: describe(s),
    created_at: isoDaysAgo(s.days, idx % 9),
    published_at: isoDaysAgo(s.days, idx % 9),
    updated_at: isoDaysAgo(Math.max(0, s.days - 1)),
    metafields: new MetafieldsDrop(s.meta ? { custom: customMetafields } : {}),
    collections: [],
    'quantity_price_breaks_configured?': false,
    requires_selling_plan: false,
    selling_plan_groups: [],
    selected_selling_plan: null,
    selected_selling_plan_allocation: null,
    selected_or_first_available_selling_plan_allocation: null,
    gift_card: false,
    'gift_card?': false,
    template_suffix: null,
  });
  product.content = product.description;
  product.options_with_values = optionsWithValues(product, product.selected_or_first_available_variant);
  product.options_by_name = Object.fromEntries(product.options_with_values.map((o) => [o.name, o]));
  Object.defineProperties(product, {
    __kind: { value: s.kind },
    __meta: { value: meta },
    __sales: { value: (hash(handle) % 1000) + (available ? 300 : 0) },
    __search: { value: [s.title, product.type, product.vendor, ...tags, ...Object.values(meta).filter(Boolean), stripHtml(product.description)].join(' ').toLowerCase() },
  });
  images.forEach((img) => { img.variants = variants.filter((v) => v.featured_media === img); img.attached_to_variant = img.variants.length > 0 && !!s.colors; });
  productsByHandle[handle] = product;
  return product;
}

/** Options with values for a given selected variant (new Shopify option API, values print as names). */
export function optionsWithValues(product, selected) {
  return product.options.map((name, i) => {
    const values = [...new Set(product.variants.map((v) => v.options[i]))];
    const selectedValue = selected ? selected.options[i] : null;
    return {
      name,
      position: i + 1,
      selected_value: selectedValue,
      values: values.map((value, vi) => {
        const wanted = selected ? selected.options.map((o, oi) => (oi === i ? value : o)) : null;
        const variant = (wanted && product.variants.find((v) => v.options.every((o, oi) => o === wanted[oi])))
          || product.variants.find((v) => v.options[i] === value);
        return new OptionValueDrop({
          id: hash(`${product.handle}-${name}-${value}`) % 100000000,
          name: value,
          position: vi + 1,
          available: !!variant && variant.available,
          selected: value === selectedValue,
          swatch: null,
          variant: variant || null,
          product_url: null,
        });
      }),
    };
  });
}

/** Clone of a product with a request-specific selected variant (for product pages). */
export function productWithSelection(product, variantId) {
  const selected = variantId ? product.variants.find((v) => String(v.id) === String(variantId)) || null : null;
  const current = selected || product.first_available_variant || product.variants[0];
  const variants = product.variants.map((v) => (v === current ? Object.defineProperty({ ...v, selected: true }, 'product', { value: product, enumerable: false }) : v));
  const clone = Object.assign(Object.create(Object.getPrototypeOf(product)), product);
  for (const k of ['__kind', '__meta', '__sales', '__search']) Object.defineProperty(clone, k, { value: product[k] });
  clone.variants = variants;
  clone.selected_variant = selected ? variants.find((v) => v.id === selected.id) : null;
  clone.selected_or_first_available_variant = variants.find((v) => v.id === current.id);
  clone.options_with_values = optionsWithValues(clone, clone.selected_or_first_available_variant);
  clone.options_by_name = Object.fromEntries(clone.options_with_values.map((o) => [o.name, o]));
  return clone;
}

export const products = SPECS.map(buildProduct);
export { productsByHandle, variantsById };

/* ------------------------------------------------------------------ */
/* Collections                                                         */
/* ------------------------------------------------------------------ */
const daysOld = (p) => (NOW - Date.parse(p.created_at)) / DAY;
const COLLECTION_DEFS = [
  { handle: 'all', title: 'All Products', match: () => true, sort: 'created-descending', palette: 'graphite', blurb: 'Every slab, single, sealed box and supply in the vault.' },
  { handle: 'new-arrivals', title: 'New Arrivals', match: (p) => daysOld(p) <= 21, sort: 'created-descending', palette: 'crimson', blurb: 'Pulled fresh from the vault — the latest graded grails, singles and sealed drops.' },
  { handle: 'graded-slabs', title: 'Graded Slabs', match: (p) => p.type === 'Graded Card', sort: 'price-descending', palette: 'crimson', blurb: 'PSA, BGS, CGC, SGC and TAG slabs — every cert verified and photographed in-hand.' },
  { handle: 'raw-singles', title: 'Raw Singles', match: (p) => p.type === 'Single', palette: 'tide', blurb: 'Hand-graded raw singles, sorted by condition and language.' },
  { handle: 'sealed', title: 'Sealed Product', match: (p) => p.type === 'Sealed', palette: 'ember', blurb: 'Booster boxes, elite trainer boxes, tins and packs — factory sealed, never searched.' },
  { handle: 'supplies', title: 'Supplies', match: (p) => p.type === 'Supplies', palette: 'steel', blurb: 'Sleeves, top loaders, binders and magnetic holders to keep your collection mint.' },
  { handle: 'pokemon', title: 'Pokémon', match: (p) => p.__meta.game === 'Pokémon', palette: 'ember', blurb: 'Vintage holos, modern alt arts and sealed product from the world of pocket monsters.' },
  { handle: 'magic-the-gathering', title: 'Magic: The Gathering', match: (p) => p.__meta.game === 'Magic: The Gathering', palette: 'gold', blurb: 'Mythics, foils and collector boosters.' },
  { handle: 'yu-gi-oh', title: 'Yu-Gi-Oh!', match: (p) => p.__meta.game === 'Yu-Gi-Oh!', palette: 'void', blurb: 'Secret rares, ultra rares and sealed packs.' },
  { handle: 'one-piece', title: 'One Piece', match: (p) => p.__meta.game === 'One Piece', palette: 'crimson', blurb: 'Manga rares, alt arts and booster boxes.' },
  { handle: 'lorcana', title: 'Lorcana', match: (p) => p.__meta.game === 'Lorcana', palette: 'gold', blurb: 'Enchanted and legendary foils plus gift tins.' },
  { handle: 'sports-cards', title: 'Sports Cards', match: (p) => p.__meta.game === 'Sports Cards', palette: 'steel', blurb: 'Rookies, autos and patches from the court, the gridiron and the pitch.' },
  { handle: 'vintage', title: 'Vintage', match: (p) => (p.__meta.year || 9999) <= 2005, sort: 'price-descending', palette: 'graphite', blurb: 'Pre-2006 classics — the cards that started it all.' },
];
export const SORT_OPTIONS = [
  { name: 'Featured', value: 'manual' },
  { name: 'Best selling', value: 'best-selling' },
  { name: 'Alphabetically, A-Z', value: 'title-ascending' },
  { name: 'Alphabetically, Z-A', value: 'title-descending' },
  { name: 'Price, low to high', value: 'price-ascending' },
  { name: 'Price, high to low', value: 'price-descending' },
  { name: 'Date, old to new', value: 'created-ascending' },
  { name: 'Date, new to old', value: 'created-descending' },
];

export const collections = COLLECTION_DEFS.map((d, i) => {
  const items = products.filter(d.match);
  const name = `collection-${d.handle}`;
  registerArt(name, { kind: 'banner', title: d.title, palette: d.palette, seed: d.handle });
  const image = new ImageDrop({ name, alt: d.title });
  const c = {
    id: 4100000001 + i,
    handle: d.handle,
    title: d.title,
    url: `/collections/${d.handle}`,
    description: `<p>${d.blurb}</p>`,
    image,
    featured_image: image,
    products: items,
    products_count: items.length,
    all_products_count: items.length,
    sort_options: SORT_OPTIONS,
    default_sort_by: d.sort || 'manual',
    sort_by: d.sort || 'manual',
    all_tags: [...new Set(items.flatMap((p) => p.tags))].sort(),
    all_types: [...new Set(items.map((p) => p.type))].sort(),
    all_vendors: [...new Set(items.map((p) => p.vendor))].sort(),
    filters: [],
    current_type: null,
    current_vendor: null,
    published_at: isoDaysAgo(200 - i),
    template_suffix: null,
    metafields: new MetafieldsDrop(),
    object_type: 'collection',
  };
  for (const p of items) p.collections.push(c);
  return c;
});
export const collectionsByHandle = Object.fromEntries(collections.map((c) => [c.handle, c]));

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */
const PAGE_DEFS = [
  ['about', 'About Vault', `<h2>Built by collectors, for collectors</h2><p>Vault started as a binder swap between friends and grew into a home for graded grails, sealed product and hand-checked raw singles. Every card that leaves our vault is inspected under raking light, photographed in-hand and packed like it is our own.</p><blockquote>Authenticity first. Every slab cert is verified before it is listed.</blockquote><h3>What we stand for</h3><ul><li>Honest condition grading on every raw single</li><li>Sealed product sourced from distribution only</li><li>Insured, tracked shipping on every order</li></ul>`],
  ['contact', 'Contact', `<p>Questions about an order, a cert or selling your collection? Send us a message and the vault team will reply within one business day.</p><p><strong>Email:</strong> hello@vault-collectibles.example<br><strong>Hours:</strong> Mon–Fri, 9am–5pm ET</p>`],
  ['shipping', 'Shipping & protection', `<h2>How we ship</h2><p>Raw singles ship in a penny sleeve and top loader inside a rigid mailer. Graded slabs ship double-boxed with corner protectors. Sealed product ships in padded boxes.</p><ul><li>Free tracked shipping on orders over $75</li><li>Orders over $250 require a signature</li><li>All orders are fully insured</li></ul>`],
  ['faq', 'FAQ', `<h3>Are your slabs authentic?</h3><p>Yes. Every certification number is verified with the grading company before listing.</p><h3>How do you grade raw singles?</h3><p>We use Near Mint, Lightly Played and Moderately Played, checked under magnification.</p><h3>Do you buy collections?</h3><p>Absolutely — see our Sell to Us page for a quote.</p><h3>Can I return an item?</h3><p>Unopened sealed product and raw singles can be returned within 30 days.</p>`],
  ['sell-to-us', 'Sell to Us', `<h2>Turn your collection into cash or credit</h2><p>We buy graded slabs, vintage holos, modern chase cards and sealed product. Get a fair, transparent offer within 48 hours.</p><ol><li>Tell us what you have</li><li>Receive a quote</li><li>Ship it free with our prepaid label</li><li>Get paid within two days of arrival</li></ol>`],
  ['grading-guide', 'Grading guide', `<h2>Understanding grades</h2><p>Grading companies score cards on centering, corners, edges and surface.</p><ul><li><strong>10 — Gem Mint:</strong> virtually perfect</li><li><strong>9 — Mint:</strong> one minor flaw</li><li><strong>8 — Near Mint-Mint:</strong> slight wear</li></ul><blockquote>BGS 9.5 Gem Mint and BGS 10 Pristine (black label) are among the hardest grades to achieve.</blockquote>`],
];
export const pages = PAGE_DEFS.map(([handle, title, content], i) => ({
  id: 9200000001 + i,
  handle,
  title,
  url: `/pages/${handle}`,
  content,
  author: 'Vault Team',
  published_at: isoDaysAgo(300 - i * 10),
  template_suffix: null,
  metafields: new MetafieldsDrop(),
  object_type: 'page',
}));
export const pagesByHandle = Object.fromEntries(pages.map((p) => [p.handle, p]));

/* ------------------------------------------------------------------ */
/* Blog                                                                */
/* ------------------------------------------------------------------ */
const AUTHORS = ['Rhea Calder', 'Theo Marsh', 'Ines Okoro'];
const ARTICLE_DEFS = [
  ['graded-vintage-holds-steady', 'Market watch: graded vintage holds steady into Q4', ['Market watch'], 3],
  ['ember-origins-box-break-recap', 'Box break recap: 36 packs of Ember Origins', ['Pulls'], 8],
  ['psa-vs-bgs-vs-cgc', 'PSA vs BGS vs CGC: which slab is right for your grail?', ['Grading', 'Guides'], 15],
  ['spot-a-gem-mint-candidate', 'How to spot a gem-mint candidate before you submit', ['Grading', 'Guides'], 24],
  ['pull-rates-explained', 'Pull rates, explained: what the odds really mean', ['Guides', 'Pulls'], 37],
  ['sleeper-rookies-to-watch', 'Five sleeper rookies worth watching this season', ['Market watch'], 52],
];
function articleContent(title, i) {
  registerArt(`blog-inline-${i}`, { kind: 'scene', seed: `inline-${i}`, palette: i % 2 ? 'crimson' : 'graphite' });
  return `<p>${title} — here is what the vault team has been seeing on the desk this month, and what it means for collectors building a long-term portfolio.</p>
<h2>The short version</h2>
<p>Demand for clean, well-centred copies continues to outpace supply. Population reports barely moved, while the number of serious buyers at the top end keeps climbing.</p>
<blockquote><p>Buy the card, not the label — but the right label still matters.</p></blockquote>
<img src="/mock/img/blog-inline-${i}.svg" alt="Cards laid out on the grading desk" width="1600" height="900" loading="lazy">
<h2>What we are watching</h2>
<ul><li>Gem-rate trends on recent modern sets</li><li>Sealed product supply after reprint announcements</li><li>Auction results for low-population vintage holos</li></ul>
<p>As always, reach out if you want a second opinion before you buy, sell or submit.</p>`;
}
export const blog = {
  id: 7100000001,
  handle: 'news',
  title: 'Journal',
  url: '/blogs/news',
  'comments_enabled?': false,
  'moderated?': true,
  metafields: new MetafieldsDrop(),
  template_suffix: null,
  object_type: 'blog',
};
export const articles = ARTICLE_DEFS.map(([handle, title, tags, days], i) => {
  const name = `blog-${handle}`;
  registerArt(name, { kind: 'blog', seed: handle, palette: ['crimson', 'graphite', 'tide', 'ember', 'void', 'steel'][i] });
  const content = articleContent(title, i);
  const author = AUTHORS[i % AUTHORS.length];
  return {
    id: 7200000001 + i,
    handle,
    title,
    author,
    user: { name: author, first_name: author.split(' ')[0], last_name: author.split(' ')[1], bio: 'Collector and grading nerd at Vault.', image: null, account_owner: false },
    published_at: isoDaysAgo(days, 3),
    created_at: isoDaysAgo(days + 1),
    updated_at: isoDaysAgo(days),
    image: new ImageDrop({ name, alt: title }),
    excerpt: `<p>${stripHtml(content).slice(0, 150).replace(/\s+\S*$/, '')}…</p>`,
    content,
    tags,
    url: `/blogs/news/${handle}`,
    'comments_enabled?': false,
    comments: [],
    comments_count: 0,
    comment_post_url: `/blogs/news/${handle}/comments`,
    moderated: true,
    metafields: new MetafieldsDrop(),
    template_suffix: null,
    object_type: 'article',
  };
});
articles.forEach((a) => {
  a.excerpt_or_content = a.excerpt || a.content;
  Object.defineProperty(a, 'blog', { value: blog, enumerable: false });
});
Object.assign(blog, {
  articles,
  articles_count: articles.length,
  all_tags: [...new Set(articles.flatMap((a) => a.tags))].sort(),
  tags: [...new Set(articles.flatMap((a) => a.tags))].sort(),
});
export const blogs = { news: blog };
export const articlesByKey = Object.fromEntries(articles.map((a) => [`news/${a.handle}`, a]));

/* ------------------------------------------------------------------ */
/* Shop, policies, localization                                         */
/* ------------------------------------------------------------------ */
const POLICY_DEFS = [
  ['refund-policy', 'Refund policy', '<p>Unopened sealed product and raw singles may be returned within 30 days. Graded slabs are final sale unless the certification does not match the listing.</p>'],
  ['privacy-policy', 'Privacy policy', '<p>We only collect what we need to fulfil your order and never sell your data.</p>'],
  ['terms-of-service', 'Terms of service', '<p>By using this store you agree to these mock terms of service.</p>'],
  ['shipping-policy', 'Shipping policy', '<p>Orders ship within two business days, fully insured and tracked.</p>'],
];
export const policies = POLICY_DEFS.map(([handle, title, body], i) => ({ id: 6100000001 + i, handle, title, body, url: `/policies/${handle}` }));

export function buildShop(origin) {
  return {
    id: 61000000001,
    name: 'Vault Collectibles',
    email: 'hello@vault-collectibles.example',
    phone: '+1 (555) 013-0199',
    description: 'Graded slabs, sealed product and hand-checked raw singles for serious collectors.',
    url: origin,
    secure_url: origin,
    domain: origin.replace(/^https?:\/\//, ''),
    permanent_domain: 'vault-collectibles.myshopify.com',
    money_format: '${{amount}}',
    money_with_currency_format: '${{amount}} USD',
    currency: 'USD',
    enabled_currencies: [{ iso_code: 'USD', name: 'United States Dollar', symbol: '$' }],
    enabled_payment_types: ['visa', 'master', 'american_express', 'paypal', 'apple_pay', 'google_pay', 'shopify_pay'],
    policies,
    refund_policy: policies[0],
    privacy_policy: policies[1],
    terms_of_service: policies[2],
    shipping_policy: policies[3],
    subscription_policy: null,
    customer_accounts_enabled: true,
    customer_accounts_optional: true,
    password_message: 'Our new vault opens soon. Enter the password to preview the drop.',
    brand: { logo: null, square_logo: null, cover_image: null, slogan: 'Pulled fresh from the vault', short_description: 'Graded slabs, sealed product and raw singles.', colors: {} },
    address: { address1: '120 Collector Way', city: 'Brooklyn', province: 'New York', province_code: 'NY', zip: '11201', country: 'United States', country_code: 'US', summary: '120 Collector Way, Brooklyn NY 11201, United States' },
    products_count: products.length,
    collections_count: collections.length,
    types: [...new Set(products.map((p) => p.type))].sort(),
    vendors: [...new Set(products.map((p) => p.vendor))].sort(),
    locale: 'en',
    weight_unit: 'lb',
    accepts_gift_cards: true,
    metafields: new MetafieldsDrop(),
  };
}

const COUNTRIES = [
  { iso_code: 'US', name: 'United States', currency: { iso_code: 'USD', name: 'United States Dollar', symbol: '$' }, unit_system: 'imperial' },
  { iso_code: 'CA', name: 'Canada', currency: { iso_code: 'CAD', name: 'Canadian Dollar', symbol: '$' }, unit_system: 'metric' },
  { iso_code: 'GB', name: 'United Kingdom', currency: { iso_code: 'GBP', name: 'British Pound', symbol: '£' }, unit_system: 'metric' },
  { iso_code: 'AU', name: 'Australia', currency: { iso_code: 'AUD', name: 'Australian Dollar', symbol: '$' }, unit_system: 'metric' },
];
const LANGUAGES = [
  { iso_code: 'en', name: 'English', endonym_name: 'English', primary: true, root_url: '/' },
  { iso_code: 'fr', name: 'French', endonym_name: 'Français', primary: false, root_url: '/fr' },
];
COUNTRIES.forEach((c) => { c.available_languages = LANGUAGES; c.market = { id: 1, handle: c.iso_code.toLowerCase() }; c.continent = c.iso_code === 'AU' ? 'Oceania' : c.iso_code === 'GB' ? 'Europe' : 'North America'; });
export const localization = { available_countries: COUNTRIES, country: COUNTRIES[0], available_languages: LANGUAGES, language: LANGUAGES[0], market: { id: 1, handle: 'us' } };

/* ------------------------------------------------------------------ */
/* Menus (built per request so active/current reflect the URL)          */
/* ------------------------------------------------------------------ */
const sub = (game) => [
  ['Graded', `/collections/${game}/graded`],
  ['Raw singles', `/collections/${game}/raw`],
  ['Sealed', `/collections/${game}/sealed`],
];
const MENU_DEFS = {
  'main-menu': ['Main menu', [
    ['Shop', '/collections/all', [
      ['Pokémon', '/collections/pokemon', sub('pokemon')],
      ['Magic: The Gathering', '/collections/magic-the-gathering', sub('magic-the-gathering')],
      ['Yu-Gi-Oh!', '/collections/yu-gi-oh', sub('yu-gi-oh')],
      ['One Piece', '/collections/one-piece', sub('one-piece').slice(0, 2)],
      ['Lorcana', '/collections/lorcana', sub('lorcana')],
      ['Sports Cards', '/collections/sports-cards', [['Graded rookies', '/collections/sports-cards/graded'], ['Raw singles', '/collections/sports-cards/raw']]],
    ]],
    ['Graded', '/collections/graded-slabs', [
      ['PSA', '/collections/graded-slabs/psa'],
      ['BGS', '/collections/graded-slabs/bgs'],
      ['CGC', '/collections/graded-slabs/cgc'],
    ]],
    ['Sealed', '/collections/sealed'],
    ['New Arrivals', '/collections/new-arrivals'],
    ['Sell to Us', '/pages/sell-to-us'],
    ['Journal', '/blogs/news'],
  ]],
  footer: ['Footer', [
    ['Search', '/search'],
    ['Shipping & protection', '/pages/shipping'],
    ['Returns', '/policies/refund-policy'],
    ['Grading guide', '/pages/grading-guide'],
    ['Contact', '/pages/contact'],
    ['FAQ', '/pages/faq'],
  ]],
  'footer-shop': ['Shop', [
    ['Graded slabs', '/collections/graded-slabs'],
    ['Raw singles', '/collections/raw-singles'],
    ['Sealed product', '/collections/sealed'],
    ['Supplies', '/collections/supplies'],
    ['New arrivals', '/collections/new-arrivals'],
  ]],
};

function linkType(url) {
  if (url === '/') return ['frontpage_link', null];
  let m = url.match(/^\/collections\/([^/?]+)/);
  if (m) return m[1] === 'all' ? ['catalog_link', null] : ['collection_link', collectionsByHandle[m[1]] || null];
  m = url.match(/^\/pages\/([^/?]+)/);
  if (m) return ['page_link', pagesByHandle[m[1]] || null];
  m = url.match(/^\/products\/([^/?]+)/);
  if (m) return ['product_link', productsByHandle[m[1]] || null];
  if (url.startsWith('/blogs/')) return ['blog_link', blog];
  if (url.startsWith('/search')) return ['search_link', null];
  if (url.startsWith('/policies/')) return ['policy_link', null];
  return ['http_link', null];
}
function buildLinks(defs, currentPath) {
  return defs.map(([title, url, children]) => {
    const links = children ? buildLinks(children, currentPath) : [];
    const pathOnly = url.split('?')[0];
    const current = pathOnly === currentPath;
    const active = current || (pathOnly !== '/' && currentPath.startsWith(`${pathOnly}/`) && !links.length);
    const childActive = links.some((l) => l.active || l.child_active);
    const childCurrent = links.some((l) => l.current || l.child_current);
    const [type, object] = linkType(url);
    const levels = links.length ? 1 + Math.max(...links.map((l) => l.levels)) : 0;
    return { title, url, handle: handleize(title), active, current, child_active: childActive, child_current: childCurrent, levels, links, type, object };
  });
}
export function buildLinklists(currentPath) {
  const out = {};
  for (const [handle, [title, defs]] of Object.entries(MENU_DEFS)) {
    const links = buildLinks(defs, currentPath);
    out[handle] = { handle, title, links, levels: links.length ? 1 + Math.max(...links.map((l) => l.levels)) : 0 };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Customer, orders, gift card                                          */
/* ------------------------------------------------------------------ */
const ADDRESS_A = { id: 9900000001, first_name: 'Jordan', last_name: 'Reyes', name: 'Jordan Reyes', company: null, address1: '88 Holo Lane', address2: 'Apt 4B', city: 'Brooklyn', province: 'New York', province_code: 'NY', country: 'United States', country_code: 'US', zip: '11211', phone: '+1 555 010 2233', url: '/account/addresses/9900000001' };
const ADDRESS_B = { id: 9900000002, first_name: 'Jordan', last_name: 'Reyes', name: 'Jordan Reyes', company: 'Slab City LLC', address1: '500 Grader Ave', address2: null, city: 'Austin', province: 'Texas', province_code: 'TX', country: 'United States', country_code: 'US', zip: '73301', phone: null, url: '/account/addresses/9900000002' };
for (const a of [ADDRESS_A, ADDRESS_B]) a.summary = `${a.address1}${a.address2 ? `, ${a.address2}` : ''}, ${a.city} ${a.province_code} ${a.zip}, ${a.country}`;

function orderLine(handle, qty, variantIndex = 0, fulfilled = true) {
  const product = productsByHandle[handle];
  const variant = product.variants[variantIndex] || product.variants[0];
  return {
    id: variant.id,
    title: product.has_only_default_variant ? product.title : `${product.title} - ${variant.title}`,
    product,
    variant,
    product_id: product.id,
    variant_id: variant.id,
    quantity: qty,
    price: variant.price,
    original_price: variant.price,
    final_price: variant.price,
    line_price: variant.price * qty,
    original_line_price: variant.price * qty,
    final_line_price: variant.price * qty,
    discount_allocations: [],
    line_level_discount_allocations: [],
    sku: variant.sku,
    vendor: product.vendor,
    variant_title: product.has_only_default_variant ? null : variant.title,
    image: variant.featured_media || product.featured_image,
    url: variant.url,
    properties: {},
    unit_price_measurement: null,
    selling_plan_allocation: null,
    requires_shipping: true,
    fulfillment: fulfilled ? { tracking_number: `9400 1000 0000 ${String(variant.id).slice(-4)} 77`, tracking_url: 'https://tools.usps.com/go/TrackConfirmAction', tracking_company: 'USPS', created_at: isoDaysAgo(4), item_count: qty } : null,
    successfully_fulfilled_quantity: fulfilled ? qty : 0,
    fulfillment_service: 'manual',
    gift_card: false,
  };
}
function order(num, days, lines, financial, fulfillment, extras = {}) {
  const subtotal = lines.reduce((s, l) => s + l.final_line_price, 0);
  const shipping = subtotal >= 7500 ? 0 : 599;
  const tax = Math.round(subtotal * 0.08875);
  const order = {
    id: 5100000000 + num,
    name: `#${num}`,
    order_number: num,
    created_at: isoDaysAgo(days, 5),
    processed_at: isoDaysAgo(days, 5),
    email: 'jordan.reyes@example.com',
    phone: null,
    financial_status: financial,
    financial_status_label: financial.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
    fulfillment_status: fulfillment,
    fulfillment_status_label: fulfillment.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
    line_items: lines,
    item_count: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal_price: subtotal,
    line_items_subtotal_price: subtotal,
    shipping_price: shipping,
    tax_price: tax,
    total_discounts: 0,
    total_price: subtotal + shipping + tax,
    total_net_amount: subtotal + shipping + tax,
    total_refunded_amount: extras.refunded || 0,
    shipping_address: ADDRESS_A,
    billing_address: ADDRESS_A,
    shipping_methods: [{ title: shipping ? 'Tracked & insured' : 'Free tracked shipping', price: shipping, original_price: shipping, handle: 'tracked' }],
    tax_lines: [{ title: 'NY State Tax', price: tax, rate: 0.08875, rate_percentage: 8.875 }],
    discount_applications: [],
    transactions: [{ id: 1, amount: subtotal + shipping + tax, kind: 'sale', status: 'success', gateway: 'shopify_payments', payment_details: { credit_card_company: 'Visa', credit_card_last_four_digits: '4242' } }],
    cancelled: false,
    cancelled_at: null,
    cancel_reason: null,
    cancel_reason_label: null,
    note: null,
    attributes: {},
    customer_url: `/account/orders/${5100000000 + num}`,
    order_status_url: `/account/orders/${5100000000 + num}`,
    tags: [],
    confirmation_number: `VLT${num}X`,
    ...extras,
  };
  return order;
}
const ORDERS = [
  order(1043, 6, [orderLine('crimson-titan-mythic-foil-psa-10', 1), orderLine('vault-matte-sleeves-100', 2)], 'paid', 'fulfilled'),
  order(1029, 21, [orderLine('ember-drake-reverse-holo', 1, 0, false), orderLine('abyssal-tides-elite-trainer-box', 2, 0, false), orderLine('ultra-clear-top-loaders-25', 3, 0, false)], 'paid', 'unfulfilled'),
  order(1012, 64, [orderLine('storm-herald-1st-edition-psa-8', 1), orderLine('shadow-requiem-booster-pack', 6)], 'partially_refunded', 'fulfilled', { total_refunded_amount: 998 }),
];

export const customer = {
  id: 8800000001,
  first_name: 'Jordan',
  last_name: 'Reyes',
  name: 'Jordan Reyes',
  email: 'jordan.reyes@example.com',
  phone: '+1 555 010 2233',
  accepts_marketing: true,
  has_account: true,
  tags: ['VIP', 'Graded buyer'],
  orders: ORDERS,
  orders_count: ORDERS.length,
  last_order: ORDERS[0],
  total_spent: ORDERS.reduce((s, o) => s + o.total_price, 0),
  addresses: [ADDRESS_A, ADDRESS_B],
  addresses_count: 2,
  default_address: ADDRESS_A,
  tax_exempt: false,
  metafields: new MetafieldsDrop(),
  store_credit_account: null,
};

export const giftCard = {
  id: 7700000001,
  balance: 5000,
  initial_value: 10000,
  currency: 'USD',
  code: 'VAULT8F3K2Q9L7XRT',
  last_four_characters: '7XRT',
  enabled: true,
  expired: false,
  expires_on: null,
  pass_url: '#apple-wallet',
  qr_identifier: 'vault-gift-card-7700000001',
  url: '/gift_cards/VAULT8F3K2Q9L7XRT',
  template_suffix: null,
  customer,
  message: 'Happy pulling! Hope this lands you a grail.',
  send_on: null,
  properties: {},
  recipient: { name: 'Sam Lee', nickname: 'Sam', email: 'sam.lee@example.com' },
  product: { title: 'Vault Gift Card', handle: 'vault-gift-card' },
};

/* Mock images available through the `images` global and image_picker strings. */
export function mockImageFor(value) {
  if (value instanceof ImageDrop) return value;
  if (value == null || value === '') return null;
  const file = String(value).replace(/^shopify:\/\/shop_images\//, '').split('/').pop().replace(/\.[a-z0-9]+$/i, '');
  return new ImageDrop({ name: `scene-${handleize(file) || 'image'}`, alt: file.replace(/[-_]+/g, ' ') });
}
