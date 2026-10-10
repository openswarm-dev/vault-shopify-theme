// In-memory carts (one per visitor, keyed by the vault_cart cookie) + Liquid drop + AJAX JSON shapes.
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { variantsById } from '../mock/store.mjs';

/** The server runs each request inside cartContext.run(<visitor id>, …). */
export const cartContext = new AsyncLocalStorage();
const carts = new Map(); // visitor id → { lines: [{ key, variant_id, quantity, properties }], note, attributes, touched }
const CART_TTL = 1000 * 60 * 60 * 24;
const MAX_CARTS = 5000;
function state() {
  const id = cartContext.getStore() || 'default';
  let c = carts.get(id);
  if (!c) {
    if (carts.size >= MAX_CARTS) {
      const now = Date.now();
      for (const [k, v] of carts) if (now - v.touched > CART_TTL) carts.delete(k);
      if (carts.size >= MAX_CARTS) carts.delete(carts.keys().next().value);
    }
    c = { lines: [], note: '', attributes: {}, touched: Date.now() };
    carts.set(id, c);
  }
  c.touched = Date.now();
  return c;
}

export class CartError extends Error {
  constructor(status, description, message = 'Cart Error') {
    super(description);
    this.status = status;
    this.description = description;
    this.title = message;
  }
  toJSON() { return { status: this.status, message: this.title, description: this.description }; }
}

const cleanProps = (props) => {
  const out = {};
  for (const [k, v] of Object.entries(props || {})) if (v != null && v !== '') out[k] = String(v);
  return out;
};
const keyFor = (variantId, props) => `${variantId}:${crypto.createHash('md5').update(JSON.stringify(Object.entries(props).sort())).digest('hex')}`;

function variantOr404(id) {
  const variant = variantsById.get(Number(id));
  if (!variant) throw new CartError(404, 'Cannot find variant', 'Cart Error');
  return variant;
}
const limitFor = (variant) => (variant.inventory_management === 'shopify' && variant.inventory_policy === 'deny' ? Math.max(0, variant.inventory_quantity) : Infinity);
const quantityError = (variant) => new CartError(422, `You can only add ${limitFor(variant)} of this item to your cart.`);
const qtyInCart = (variantId, exceptKey = null) => state().lines.filter((l) => l.variant_id === variantId && l.key !== exceptKey).reduce((s, l) => s + l.quantity, 0);

/** Add items; returns the affected line keys. Throws CartError (422/404). */
export function addItems(items) {
  const plan = [];
  for (const raw of items) {
    const variant = variantOr404(raw.id ?? raw.variant_id);
    const quantity = Math.max(1, parseInt(raw.quantity ?? 1, 10) || 1);
    const title = variant.product.has_only_default_variant ? variant.product.title : `${variant.product.title} - ${variant.title}`;
    if (!variant.available) throw new CartError(422, `The product '${title}' is already sold out.`);
    const total = qtyInCart(variant.id) + plan.filter((p) => p.variant.id === variant.id).reduce((s, p) => s + p.quantity, 0) + quantity;
    if (total > limitFor(variant)) throw quantityError(variant);
    plan.push({ variant, quantity, properties: cleanProps(raw.properties) });
  }
  const keys = [];
  for (const { variant, quantity, properties } of plan) {
    const key = keyFor(variant.id, properties);
    const existing = state().lines.find((l) => l.key === key);
    if (existing) existing.quantity += quantity;
    else state().lines.push({ key, variant_id: variant.id, quantity, properties });
    keys.push(key);
  }
  return keys;
}

function findLine({ id, line }) {
  if (line != null && line !== '') {
    const l = state().lines[parseInt(line, 10) - 1];
    if (!l) throw new CartError(400, 'no valid id or line parameter', 'Bad Request');
    return l;
  }
  const sid = String(id ?? '');
  const l = sid.includes(':') ? state().lines.find((x) => x.key === sid) : state().lines.find((x) => String(x.variant_id) === sid);
  if (!l) throw new CartError(400, 'no valid id or line parameter', 'Bad Request');
  return l;
}

export function changeLine({ id, line, quantity, properties }) {
  const l = findLine({ id, line });
  const q = Math.max(0, parseInt(quantity ?? l.quantity, 10) || 0);
  if (properties) l.properties = cleanProps(properties);
  if (q === 0) {
    state().lines = state().lines.filter((x) => x !== l);
    return;
  }
  const variant = variantOr404(l.variant_id);
  if (qtyInCart(variant.id, l.key) + q > limitFor(variant)) throw quantityError(variant);
  l.quantity = q;
}

export function updateCart({ updates, note: newNote, attributes: attrs }) {
  if (updates) {
    if (Array.isArray(updates)) {
      updates.forEach((q, i) => { if (state().lines[i]) changeLine({ line: i + 1, quantity: q }); });
    } else {
      for (const [k, q] of Object.entries(updates)) {
        const existing = k.includes(':') ? state().lines.find((l) => l.key === k) : state().lines.find((l) => String(l.variant_id) === String(k));
        if (existing) changeLine({ id: existing.key, quantity: q });
        else if (parseInt(q, 10) > 0) addItems([{ id: k, quantity: q }]);
      }
    }
  }
  if (newNote != null) state().note = String(newNote);
  if (attrs && typeof attrs === 'object') {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === '') delete state().attributes[k];
      else state().attributes[k] = v;
    }
  }
}

export function clearCart() {
  state().lines = [];
  state().note = '';
  state().attributes = {};
}

/* ------------------------------------------------------------------ */
/* Liquid drop                                                         */
/* ------------------------------------------------------------------ */
function lineDrop(l) {
  const variant = variantsById.get(l.variant_id);
  const product = variant.product;
  const linePrice = variant.price * l.quantity;
  const original = (variant.compare_at_price || variant.price);
  return {
    id: variant.id,
    key: l.key,
    quantity: l.quantity,
    title: product.has_only_default_variant ? product.title : `${product.title} - ${variant.title}`,
    variant,
    variant_id: variant.id,
    product,
    product_id: product.id,
    url: variant.url,
    // Shopify's no-JS remove link: GET /cart/change → redirect to /cart.
    url_to_remove: `/cart/change?id=${encodeURIComponent(l.key)}&quantity=0`,
    image: variant.featured_image || product.featured_image,
    price: variant.price,
    original_price: variant.price,
    final_price: variant.price,
    discounted_price: variant.price,
    line_price: linePrice,
    original_line_price: linePrice,
    final_line_price: linePrice,
    compare_at_price: variant.compare_at_price,
    compare_at_line_price: original * l.quantity,
    options_with_values: product.has_only_default_variant ? [] : product.options.map((name, i) => ({ name, value: variant.options[i] })),
    properties: { ...l.properties },
    product_has_only_default_variant: product.has_only_default_variant,
    variant_title: product.has_only_default_variant ? null : variant.title,
    sku: variant.sku,
    vendor: product.vendor,
    grams: variant.weight,
    line_level_discount_allocations: [],
    discount_allocations: [],
    line_level_total_discount: 0,
    total_discount: 0,
    unit_price_measurement: null,
    unit_price: null,
    selling_plan_allocation: null,
    requires_shipping: true,
    taxable: true,
    gift_card: false,
    message: '',
    fulfillment_service: 'manual',
    quantity_rule: variant.quantity_rule,
    object_type: 'line_item',
  };
}

export function cartDrop() {
  const items = state().lines.map(lineDrop);
  const total = items.reduce((s, i) => s + i.final_line_price, 0);
  return {
    token: 'vault-mock-cart',
    items,
    item_count: items.reduce((s, i) => s + i.quantity, 0),
    total_price: total,
    items_subtotal_price: total,
    original_total_price: total,
    checkout_charge_amount: total,
    total_discount: 0,
    total_weight: items.reduce((s, i) => s + (i.grams || 0) * i.quantity, 0),
    cart_level_discount_applications: [],
    discount_applications: [],
    note: state().note,
    attributes: { ...state().attributes },
    currency: { iso_code: 'USD', name: 'United States Dollar', symbol: '$' },
    requires_shipping: items.length > 0,
    'empty?': items.length === 0,
    duties_included: false,
    taxes_included: false,
  };
}

/* ------------------------------------------------------------------ */
/* AJAX JSON                                                           */
/* ------------------------------------------------------------------ */
const abs = (src, host) => (src ? (/^(https?:)?\/\//.test(src) ? src : `//${host}${src}`) : null);
export function lineJson(item, host) {
  const img = item.image;
  return {
    id: item.variant_id,
    properties: item.properties,
    quantity: item.quantity,
    variant_id: item.variant_id,
    key: item.key,
    title: item.title,
    price: item.price,
    original_price: item.original_price,
    presentment_price: item.price / 100,
    discounted_price: item.discounted_price,
    line_price: item.line_price,
    original_line_price: item.original_line_price,
    total_discount: 0,
    discounts: [],
    sku: item.sku,
    grams: item.grams,
    vendor: item.vendor,
    taxable: true,
    product_id: item.product_id,
    product_has_only_default_variant: item.product_has_only_default_variant,
    gift_card: false,
    final_price: item.final_price,
    final_line_price: item.final_line_price,
    url: item.url,
    featured_image: img ? { aspect_ratio: img.aspect_ratio, alt: img.alt, height: img.height, url: abs(img.src, host), width: img.width } : null,
    image: img ? abs(img.src, host) : null,
    handle: item.product.handle,
    requires_shipping: true,
    product_type: item.product.type,
    product_title: item.product.title,
    product_description: item.product.description,
    variant_title: item.variant_title,
    variant_options: item.variant.options,
    options_with_values: item.options_with_values,
    line_level_discount_allocations: [],
    line_level_total_discount: 0,
    quantity_rule: item.quantity_rule,
    has_components: false,
  };
}
export function cartJson(host) {
  const c = cartDrop();
  return {
    token: c.token,
    note: c.note,
    attributes: c.attributes,
    original_total_price: c.original_total_price,
    total_price: c.total_price,
    total_discount: 0,
    total_weight: c.total_weight,
    item_count: c.item_count,
    items: c.items.map((i) => lineJson(i, host)),
    requires_shipping: c.requires_shipping,
    currency: 'USD',
    items_subtotal_price: c.items_subtotal_price,
    cart_level_discount_applications: [],
  };
}
export function lineJsonByKey(key, host) {
  const item = cartDrop().items.find((i) => i.key === key);
  return item ? lineJson(item, host) : null;
}
