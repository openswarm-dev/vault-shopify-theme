// Storefront behaviour emulation: collection filtering/sorting, search, predictive search, recommendations.
import { products, collections, pages, articles, SORT_OPTIONS, handleize, stripHtml } from '../mock/store.mjs';

const IGNORED_PARAMS = new Set(['page', 'section_id', 'sections', '_', 'customer', 'view', '__nolr', 'contact_posted', 'customer_posted']);

export function cleanQuery(query) {
  const q = new URLSearchParams();
  for (const [k, v] of query) if (!IGNORED_PARAMS.has(k)) q.append(k, v);
  return q;
}
export function urlWith(path, query) {
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */
const LIST_FILTERS = [
  { label: 'Availability', param: 'filter.v.availability', get: (p) => (p.available ? '1' : '0'), labelFor: (v) => (v === '1' ? 'In stock' : 'Out of stock'), order: (a, b) => b.localeCompare(a) },
  { label: 'Product type', param: 'filter.p.product_type', get: (p) => p.type },
  { label: 'Game', param: 'filter.p.m.custom.game', get: (p) => p.__meta?.game },
  { label: 'Grade', param: 'filter.p.m.custom.grade', get: (p) => p.__meta?.grade, order: gradeOrder },
  { label: 'Rarity', param: 'filter.p.m.custom.rarity', get: (p) => p.__meta?.rarity },
];
function gradeOrder(a, b) {
  const [ga, sa] = a.split(' ');
  const [gb, sb] = b.split(' ');
  return ga.localeCompare(gb) || Number(sb) - Number(sa);
}
const PRICE = { label: 'Price', param: 'filter.v.price', gte: 'filter.v.price.gte', lte: 'filter.v.price.lte' };

function activeState(query) {
  const lists = {};
  for (const f of LIST_FILTERS) {
    const vals = query.getAll(f.param).filter((x) => x !== '');
    if (vals.length) lists[f.param] = new Set(vals);
  }
  const toCents = (x) => (x == null || x === '' || Number.isNaN(parseFloat(String(x).replace(/,/g, ''))) ? null : Math.round(parseFloat(String(x).replace(/,/g, '')) * 100));
  const gte = toCents(query.get(PRICE.gte));
  const lte = toCents(query.get(PRICE.lte));
  return { lists, gte, lte };
}
function matches(p, state, skip) {
  for (const f of LIST_FILTERS) {
    if (f.param === skip) continue;
    const set = state.lists[f.param];
    if (set && !set.has(String(f.get(p) ?? ''))) return false;
  }
  if (skip !== PRICE.param) {
    if (state.gte != null && p.price < state.gte) return false;
    if (state.lte != null && p.price > state.lte) return false;
  }
  return true;
}

/** Returns { products, filters } for a product list given the request query. */
export function applyFilters(items, path, query) {
  const base = cleanQuery(query);
  const state = activeState(query);
  const filtered = items.filter((p) => matches(p, state, null));
  const filters = [];
  for (const f of LIST_FILTERS) {
    const all = [...new Set(items.map((p) => f.get(p)).filter((x) => x != null && x !== ''))].map(String);
    if (!all.length) continue;
    all.sort(f.order || ((a, b) => a.localeCompare(b)));
    const pool = items.filter((p) => matches(p, state, f.param));
    const values = all.map((value) => {
      const active = !!state.lists[f.param]?.has(value);
      const add = new URLSearchParams(base);
      if (!active) add.append(f.param, value);
      const remove = new URLSearchParams();
      for (const [k, x] of base) if (!(k === f.param && x === value)) remove.append(k, x);
      return {
        label: f.labelFor ? f.labelFor(value) : value,
        value,
        count: pool.filter((p) => String(f.get(p)) === value).length,
        active,
        param_name: f.param,
        url_to_add: urlWith(path, add),
        url_to_remove: urlWith(path, remove),
        swatch: null,
        image: null,
      };
    });
    const removeAll = new URLSearchParams();
    for (const [k, x] of base) if (k !== f.param) removeAll.append(k, x);
    filters.push({
      label: f.label,
      type: 'list',
      param_name: f.param,
      presentation: 'text',
      operator: 'OR',
      values,
      active_values: values.filter((x) => x.active),
      inactive_values: values.filter((x) => !x.active),
      url_to_remove: urlWith(path, removeAll),
      false_value: null,
      true_value: null,
      min_value: null,
      max_value: null,
      range_max: null,
    });
  }
  // price range
  const maxPrice = items.reduce((m, p) => Math.max(m, p.price_max || p.price || 0), 0);
  const removePrice = new URLSearchParams();
  for (const [k, x] of base) if (k !== PRICE.gte && k !== PRICE.lte) removePrice.append(k, x);
  const priceActive = state.gte != null || state.lte != null;
  filters.splice(1, 0, {
    label: PRICE.label,
    type: 'price_range',
    param_name: PRICE.param,
    presentation: 'text',
    operator: 'AND',
    values: [],
    active_values: priceActive ? [{ label: 'Price', value: `${state.gte ?? ''}-${state.lte ?? ''}`, active: true, url_to_remove: urlWith(path, removePrice) }] : [],
    inactive_values: [],
    url_to_remove: urlWith(path, removePrice),
    min_value: { param_name: PRICE.gte, value: state.gte },
    max_value: { param_name: PRICE.lte, value: state.lte },
    range_max: maxPrice,
    false_value: null,
    true_value: null,
  });
  return { products: filtered, filters };
}

/* ------------------------------------------------------------------ */
/* Sorting                                                             */
/* ------------------------------------------------------------------ */
export function sortProducts(list, sortBy, scores) {
  const arr = [...list];
  const by = {
    'best-selling': (a, b) => b.__sales - a.__sales,
    'title-ascending': (a, b) => a.title.localeCompare(b.title),
    'title-descending': (a, b) => b.title.localeCompare(a.title),
    'price-ascending': (a, b) => a.price - b.price,
    'price-descending': (a, b) => b.price - a.price,
    'created-ascending': (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
    'created-descending': (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    relevance: scores ? (a, b) => (scores.get(b) || 0) - (scores.get(a) || 0) : null,
  }[sortBy];
  return by ? arr.sort(by) : arr;
}

/** Collection drop for the current request: tag filtering, storefront filters, sorting. */
export function collectionForRequest(base, { path, query, currentTags }) {
  let items = base.products;
  if (currentTags?.length) {
    const wanted = currentTags.map(handleize);
    items = items.filter((p) => wanted.every((t) => p.tags.some((pt) => handleize(pt) === t)));
  }
  const sortBy = SORT_OPTIONS.some((o) => o.value === query.get('sort_by')) ? query.get('sort_by') : base.default_sort_by;
  const { products: filtered, filters } = applyFilters(items, path, query);
  const sorted = sortProducts(filtered, sortBy);
  const c = Object.assign(Object.create(Object.getPrototypeOf(base)), base, {
    products: sorted,
    products_count: sorted.length,
    all_products_count: base.products.length,
    filters,
    sort_by: sortBy,
  });
  return c;
}

/** /collections/vendors?q= and /collections/types?q= */
export function virtualCollection(kind, value) {
  const key = kind === 'vendors' ? 'vendor' : 'type';
  const items = products.filter((p) => String(p[key]).toLowerCase() === String(value || '').toLowerCase());
  return {
    id: 4199999999,
    handle: kind,
    title: value || (kind === 'vendors' ? 'Vendors' : 'Types'),
    url: `/collections/${kind}?q=${encodeURIComponent(value || '')}`,
    description: '',
    image: null,
    featured_image: items[0]?.featured_image || null,
    products: items,
    products_count: items.length,
    all_products_count: items.length,
    sort_options: SORT_OPTIONS,
    default_sort_by: 'manual',
    sort_by: 'manual',
    all_tags: [...new Set(items.flatMap((p) => p.tags))].sort(),
    all_types: [...new Set(items.map((p) => p.type))],
    all_vendors: [...new Set(items.map((p) => p.vendor))],
    filters: [],
    current_type: kind === 'types' ? value : null,
    current_vendor: kind === 'vendors' ? value : null,
    template_suffix: null,
    object_type: 'collection',
  };
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */
const words = (q) => String(q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9#/.-]+/).filter(Boolean);
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function score(text, title, ws) {
  const t = norm(text);
  const ti = norm(title);
  let s = 0;
  for (const w of ws) {
    if (!t.includes(w)) return 0;
    s += ti.includes(w) ? 3 : 1;
  }
  return s;
}
export const SEARCH_SORT_OPTIONS = [{ name: 'Relevance', value: 'relevance' }, ...SORT_OPTIONS.filter((o) => o.value !== 'manual')];

export function runSearch({ path, query }) {
  const terms = (query.get('q') || '').trim();
  const typeParam = query.get('type') || 'product,article,page';
  const types = typeParam.split(',').map((s) => s.trim()).filter(Boolean);
  const sortBy = SEARCH_SORT_OPTIONS.some((o) => o.value === query.get('sort_by')) ? query.get('sort_by') : 'relevance';
  const base = {
    performed: false, terms, results: [], results_count: 0, types, filters: [], sort_by: sortBy,
    sort_options: SEARCH_SORT_OPTIONS, default_sort_by: 'relevance', url: urlWith('/search', cleanQuery(query)),
  };
  if (!terms) return base;
  const ws = words(terms);
  const scores = new Map();
  let prods = [];
  if (types.includes('product')) {
    for (const p of products) {
      const s = score(p.__search, p.title, ws);
      if (s) { scores.set(p, s); prods.push(p); }
    }
  }
  const { products: filtered, filters } = applyFilters(prods, path, query);
  prods = sortProducts(filtered, sortBy, scores);
  const arts = types.includes('article') ? articles.filter((a) => score(`${a.title} ${a.tags.join(' ')} ${stripHtml(a.content)}`, a.title, ws)) : [];
  const pgs = types.includes('page') ? pages.filter((p) => score(`${p.title} ${stripHtml(p.content)}`, p.title, ws)) : [];
  const results = [...prods, ...arts, ...pgs];
  return { ...base, performed: true, results, results_count: results.length, filters };
}

export function predictiveSearch(query) {
  const terms = (query.get('q') || '').trim();
  const typeParam = query.get('resources[type]') || 'query,product,collection,page,article';
  const types = typeParam.split(',').map((s) => s.trim());
  const limit = Math.max(1, Math.min(10, parseInt(query.get('resources[limit]') || '4', 10) || 4));
  const ws = words(terms);
  const empty = { products: [], collections: [], pages: [], articles: [], queries: [] };
  if (!terms) return { performed: false, terms, resources: empty, types };
  const prods = types.includes('product')
    ? products.map((p) => [p, score(p.__search, p.title, ws)]).filter(([, s]) => s).sort((a, b) => b[1] - a[1] || (b[0].available - a[0].available)).map(([p]) => p).slice(0, limit)
    : [];
  const cols = types.includes('collection') ? collections.filter((c) => score(`${c.title} ${stripHtml(c.description)}`, c.title, ws)).slice(0, limit) : [];
  const pgs = types.includes('page') ? pages.filter((p) => score(`${p.title} ${stripHtml(p.content)}`, p.title, ws)).slice(0, limit) : [];
  const arts = types.includes('article') ? articles.filter((a) => score(`${a.title} ${a.tags.join(' ')}`, a.title, ws)).slice(0, limit) : [];
  const queries = [];
  if (types.includes('query')) {
    const seen = new Set();
    const candidates = [
      ...products.map((p) => p.title.split(/ [—·] /)[0]),
      ...products.map((p) => p.__meta?.set_name).filter(Boolean),
      ...products.map((p) => p.__meta?.game).filter(Boolean),
      ...collections.map((c) => c.title),
    ];
    const t = norm(terms);
    for (const c of candidates) {
      const n = norm(c);
      if (!n.includes(t) || seen.has(n)) continue;
      seen.add(n);
      const idx = n.indexOf(t);
      const styled = `${escapeHtml(c.slice(0, idx))}<mark>${escapeHtml(c.slice(idx, idx + terms.length))}</mark>${escapeHtml(c.slice(idx + terms.length))}`;
      queries.push({ text: c.toLowerCase(), styled_text: styled, url: `/search?q=${encodeURIComponent(c)}&options%5Bprefix%5D=last` });
      if (queries.length >= Math.min(limit, 4)) break;
    }
  }
  return { performed: true, terms, resources: { products: prods, collections: cols, pages: pgs, articles: arts, queries }, types };
}
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------------------------------------------ */
/* Recommendations                                                     */
/* ------------------------------------------------------------------ */
export function recommend(productId, { limit = 10, intent = 'related' } = {}) {
  const p = products.find((x) => String(x.id) === String(productId));
  if (!p) return { performed: true, products: [], products_count: 0, intent };
  let list;
  if (intent === 'complementary') list = products.filter((x) => x.type === 'Supplies' && x.available);
  else {
    const others = products.filter((x) => x !== p);
    const rank = (x) => (x.__meta?.game && x.__meta.game === p.__meta?.game ? 4 : 0) + (x.type === p.type ? 2 : 0) + (x.available ? 1 : 0);
    list = others.sort((a, b) => rank(b) - rank(a) || b.__sales - a.__sales);
  }
  const out = list.slice(0, Math.max(1, Math.min(10, Number(limit) || 10)));
  return { performed: true, products: out, products_count: out.length, intent };
}
