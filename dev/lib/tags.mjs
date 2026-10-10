// Shopify-specific tags for liquidjs: section, sections, schema, style, stylesheet, javascript,
// form, paginate, layout, content_for (unsupported stub). Also patches forloop.parentloop.
import { Tag, Value, TypeGuards, toValue, Drop } from 'liquidjs';
import { RS } from './filters.mjs';
import { esc } from '../mock/art.mjs';

/** Split "a, b: 'x, y', c" at top-level commas (quotes/brackets aware). */
export function splitTopLevel(str) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (const ch of String(str)) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function parseBlock(self, token, remainTokens, parser, endName) {
  const templates = [];
  const stream = parser.parseStream(remainTokens)
    .on(`tag:${endName}`, () => stream.stop())
    .on('template', (tpl) => templates.push(tpl))
    .on('end', () => { throw new Error(`tag ${token.getText()} not closed`); });
  stream.start();
  return templates;
}
function skipRaw(token, remainTokens, endName) {
  while (remainTokens.length) {
    const t = remainTokens.shift();
    if (TypeGuards.isTagToken(t) && t.name === endName) return;
  }
  throw new Error(`tag ${token.getText()} not closed`);
}

/* ------------------------------------------------------------------ */
/* form                                                                */
/* ------------------------------------------------------------------ */
const FORM_TYPES = {
  product: (o) => ({ action: '/cart/add', id: `product_form_${o?.id ?? ''}`, class: 'shopify-product-form', enctype: 'multipart/form-data' }),
  cart: () => ({ action: '/cart', id: 'cart_form', class: 'shopify-cart-form', enctype: 'multipart/form-data' }),
  customer: () => ({ action: '/contact#contact_form', id: 'contact_form', class: 'contact-form' }),
  contact: () => ({ action: '/contact#contact_form', id: 'contact_form', class: 'contact-form' }),
  create_customer: () => ({ action: '/account', id: 'create_customer' }),
  customer_login: () => ({ action: '/account/login', id: 'customer_login' }),
  recover_customer_password: () => ({ action: '/account/recover', id: 'recover_customer_password' }),
  guest_login: () => ({ action: '/account/login', id: 'customer_login_guest' }),
  customer_address: (o) => (o && o.id
    ? { action: `/account/addresses/${o.id}`, id: `address_form_${o.id}`, hidden: { _method: 'put' } }
    : { action: '/account/addresses', id: 'address_form_new' }),
  activate_customer_password: () => ({ action: '/account/activate', id: 'activate_customer_password' }),
  reset_customer_password: () => ({ action: '/account/reset', id: 'reset_customer_password' }),
  localization: () => ({ action: '/localization', id: 'localization_form', class: 'shopify-localization-form', enctype: 'multipart/form-data', hidden: { _method: 'put' } }),
  new_comment: (o) => ({ action: `${o?.url || '/blogs/news/article'}/comments`, id: 'comment_form', class: 'comment-form' }),
  storefront_password: () => ({ action: '/password', id: 'login_form', class: 'storefront-password-form' }),
  currency: () => ({ action: '/cart/update', id: 'currency_form', class: 'shopify-currency-form', enctype: 'multipart/form-data' }),
};
const ERROR_LABELS = { email: 'Email', password: 'Password', body: 'Message', author: 'Name', first_name: 'First name', last_name: 'Last name', form: 'Form' };

function buildFormObject(type, obj, formId, rs) {
  const posted = rs?.postedForm && rs.postedForm.type === type ? rs.postedForm : null;
  const values = posted?.values || {};
  let errors = null;
  if (posted && posted.errors && Object.keys(posted.errors).length) {
    errors = Object.keys(posted.errors);
    errors.messages = posted.errors;
    errors.translated_fields = Object.fromEntries(Object.keys(posted.errors).map((k) => [k, ERROR_LABELS[k] || k]));
  }
  const address = type === 'customer_address' && obj ? obj : {};
  const form = {
    id: formId,
    'posted_successfully?': !!(posted && posted.success),
    errors,
    email: values.email ?? values['customer[email]'] ?? values['contact[email]'] ?? (type === 'customer_address' ? null : rs?.customer?.email ?? null),
    first_name: values['customer[first_name]'] ?? address.first_name ?? null,
    last_name: values['customer[last_name]'] ?? address.last_name ?? null,
    name: values['contact[name]'] ?? null,
    body: values['contact[body]'] ?? values['comment[body]'] ?? null,
    author: values['comment[author]'] ?? null,
    phone: values['contact[phone]'] ?? address.phone ?? null,
    accepts_marketing: false,
    password_needed: true,
    company: address.company ?? null,
    address1: address.address1 ?? null,
    address2: address.address2 ?? null,
    city: address.city ?? null,
    country: address.country ?? null,
    province: address.province ?? null,
    zip: address.zip ?? null,
    set_as_default_checkbox: `<input type="checkbox" id="address_default_address_${address.id || 'new'}" name="address[default]" value="1">`,
  };
  return form;
}

class FormTag extends Tag {
  constructor(token, remainTokens, liquid, parser) {
    super(token, remainTokens, liquid);
    const parts = splitTopLevel(token.args);
    this.positional = [];
    this.attrs = [];
    for (const p of parts) {
      const m = p.match(/^([A-Za-z_][\w-]*)\s*:\s*([\s\S]+)$/);
      if (m) this.attrs.push([m[1], new Value(m[2], liquid)]);
      else this.positional.push(new Value(p, liquid));
    }
    if (!this.positional.length) throw new Error(`Syntax error in tag 'form' - Valid syntax: form 'type'[, object]`);
    this.templates = parseBlock(this, token, remainTokens, parser, 'endform');
  }
  *render(ctx, emitter) {
    const rs = ctx.globals?.[RS];
    const type = String(toValue(yield this.positional[0].value(ctx, false)) ?? '');
    const obj = this.positional[1] ? toValue(yield this.positional[1].value(ctx, false)) : null;
    const def = FORM_TYPES[type];
    if (!def) throw new Error(`Unknown form type '${type}'`);
    const base = def(obj);
    const attrs = { method: 'post', action: base.action, id: base.id, 'accept-charset': 'UTF-8', class: base.class, enctype: base.enctype };
    const hidden = { form_type: type, utf8: '✓', ...(base.hidden || {}) };
    if (type === 'localization') hidden.return_to = rs?.path || '/';
    for (const [k, val] of this.attrs) {
      const value = toValue(yield val.value(ctx, false));
      if (k === 'return_to') hidden.return_to = value;
      else attrs[k] = value;
    }
    const form = buildFormObject(type, obj, attrs.id, rs);
    ctx.push({ form });
    const inner = yield this.liquid.renderer.renderTemplates(this.templates, ctx);
    ctx.pop();
    let html = '<form';
    for (const [k, val] of Object.entries(attrs)) {
      if (val == null || val === false || val === '') continue;
      html += val === true ? ` ${k}` : ` ${k}="${esc(val)}"`;
    }
    html += '>';
    for (const [k, val] of Object.entries(hidden)) html += `<input type="hidden" name="${esc(k)}" value="${esc(val)}" />`;
    if (type === 'product' && !('id' in (obj || {}))) html += '';
    emitter.write(`${html}${inner}</form>`);
  }
}

/* ------------------------------------------------------------------ */
/* paginate                                                            */
/* ------------------------------------------------------------------ */
function splitPath(expr) {
  const segs = [];
  const re = /([A-Za-z_][\w?-]*)|\[\s*'([^']*)'\s*\]|\[\s*"([^"]*)"\s*\]/g;
  let m;
  while ((m = re.exec(expr))) segs.push(m[1] ?? m[2] ?? m[3]);
  return segs;
}
function cloneWith(obj, key, value) {
  if (Array.isArray(obj)) {
    const c = obj.slice();
    for (const k of Object.getOwnPropertyNames(obj)) if (!/^\d+$/.test(k) && k !== 'length') Object.defineProperty(c, k, Object.getOwnPropertyDescriptor(obj, k));
    c[key] = value;
    return c;
  }
  const c = Object.assign(Object.create(Object.getPrototypeOf(obj)), obj);
  for (const k of Object.getOwnPropertyNames(obj)) {
    const d = Object.getOwnPropertyDescriptor(obj, k);
    if (!d.enumerable) Object.defineProperty(c, k, d);
  }
  c[key] = value;
  return c;
}
export function buildPaginate({ total, perPage, page, urlFor, windowSize = 2 }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = page;
  const parts = [];
  const push = (n) => parts.push(n === current ? { title: String(n), url: urlFor(n), is_link: false } : { title: String(n), url: urlFor(n), is_link: true });
  if (pages <= 2 * windowSize + 3) for (let i = 1; i <= pages; i++) push(i);
  else {
    const from = Math.max(2, current - windowSize);
    const to = Math.min(pages - 1, current + windowSize);
    push(1);
    if (from > 2) parts.push({ title: '&hellip;', url: null, is_link: false });
    for (let i = from; i <= to; i++) push(i);
    if (to < pages - 1) parts.push({ title: '&hellip;', url: null, is_link: false });
    push(pages);
  }
  return {
    current_page: current,
    current_offset: (current - 1) * perPage,
    items: total,
    page_size: perPage,
    pages,
    page_param: 'page',
    previous: current > 1 ? { title: '&laquo; Previous', url: urlFor(current - 1), is_link: true } : null,
    next: current < pages ? { title: 'Next &raquo;', url: urlFor(current + 1), is_link: true } : null,
    parts: pages > 1 ? parts : [],
  };
}

class PaginateTag extends Tag {
  constructor(token, remainTokens, liquid, parser) {
    super(token, remainTokens, liquid);
    const m = token.args.match(/^\s*([\s\S]+?)\s+by\s+([^\s,]+)\s*(?:,?\s*window_size\s*:\s*(\S+))?\s*$/);
    if (!m) throw new Error("Syntax error in tag 'paginate' - Valid syntax: paginate [collection] by number");
    this.expr = m[1].trim();
    this.segs = splitPath(this.expr);
    this.by = new Value(m[2], liquid);
    this.windowSize = m[3] ? new Value(m[3], liquid) : null;
    this.templates = parseBlock(this, token, remainTokens, parser, 'endpaginate');
  }
  *render(ctx, emitter) {
    const rs = ctx.globals?.[RS];
    let perPage = Math.round(Number(toValue(yield this.by.value(ctx, false)))) || 50;
    perPage = Math.max(1, Math.min(250, perPage));
    const windowSize = this.windowSize ? Number(toValue(yield this.windowSize.value(ctx, false))) || 2 : 2;
    const chain = [];
    let cur = toValue(yield ctx._get([this.segs[0]]));
    chain.push(cur);
    for (const s of this.segs.slice(1)) {
      cur = cur == null ? undefined : toValue(ctx.readProperty(cur, s));
      chain.push(cur);
    }
    const all = Array.isArray(cur) ? cur : cur && typeof cur[Symbol.iterator] === 'function' && typeof cur !== 'string' ? Array.from(cur) : [];
    const page = Math.max(1, parseInt(rs?.query?.get('page') || '1', 10) || 1);
    const items = all.slice((page - 1) * perPage, page * perPage);
    let replacement = items;
    for (let i = this.segs.length - 1; i >= 1; i--) {
      const parent = chain[i - 1];
      replacement = parent && typeof parent === 'object' ? cloneWith(parent, this.segs[i], replacement) : replacement;
    }
    const paginate = buildPaginate({ total: all.length, perPage, page, windowSize, urlFor: (n) => rs?.pageUrl?.(n) ?? `?page=${n}` });
    ctx.push({ [this.segs[0]]: replacement, paginate });
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
    ctx.pop();
  }
}

/* ------------------------------------------------------------------ */
/* section / sections / layout                                         */
/* ------------------------------------------------------------------ */
class SectionTag extends Tag {
  constructor(token, remainTokens, liquid) {
    super(token, remainTokens, liquid);
    this.nameValue = new Value(token.args.trim(), liquid);
  }
  *render(ctx, emitter) {
    const rs = ctx.globals?.[RS];
    const name = String(toValue(yield this.nameValue.value(ctx, false)) ?? '');
    const html = yield rs.api.renderStaticSection(name, rs);
    emitter.write(html);
  }
}
class SectionsTag extends Tag {
  constructor(token, remainTokens, liquid) {
    super(token, remainTokens, liquid);
    this.nameValue = new Value(token.args.trim(), liquid);
  }
  *render(ctx, emitter) {
    const rs = ctx.globals?.[RS];
    const name = String(toValue(yield this.nameValue.value(ctx, false)) ?? '');
    const html = yield rs.api.renderSectionGroup(name, rs);
    emitter.write(html);
  }
}
class LayoutTag extends Tag {
  constructor(token, remainTokens, liquid) {
    super(token, remainTokens, liquid);
    this.arg = token.args.trim();
  }
  *render(ctx) {
    const rs = ctx.globals?.[RS];
    if (!rs) return;
    const a = this.arg;
    if (a === 'none' || a === 'false' || a === 'nil') rs.layout = null;
    else {
      const m = a.match(/^['"](.+)['"]$/);
      rs.layout = m ? m[1] : String(toValue(yield new Value(a, this.liquid).value(ctx, false)) ?? 'theme');
    }
  }
}

/* ------------------------------------------------------------------ */
/* raw-ish blocks                                                      */
/* ------------------------------------------------------------------ */
function rawNoOutput(name) {
  return class extends Tag {
    constructor(token, remainTokens, liquid) {
      super(token, remainTokens, liquid);
      skipRaw(token, remainTokens, `end${name}`);
    }
    *render() { /* no output */ }
  };
}
class StyleTag extends Tag {
  constructor(token, remainTokens, liquid, parser) {
    super(token, remainTokens, liquid);
    this.templates = parseBlock(this, token, remainTokens, parser, 'endstyle');
  }
  *render(ctx, emitter) {
    const css = yield this.liquid.renderer.renderTemplates(this.templates, ctx);
    emitter.write(`<style data-shopify>${css}</style>`);
  }
}
class ContentForTag extends Tag {
  *render() {
    throw new Error("content_for is not supported by the Vault preview (theme blocks are out of scope — see ARCHITECTURE §12)");
  }
}

export function registerTags(engine) {
  engine.registerTag('form', FormTag);
  engine.registerTag('paginate', PaginateTag);
  engine.registerTag('section', SectionTag);
  engine.registerTag('sections', SectionsTag);
  engine.registerTag('layout', LayoutTag);
  engine.registerTag('schema', rawNoOutput('schema'));
  engine.registerTag('javascript', rawNoOutput('javascript'));
  engine.registerTag('stylesheet', rawNoOutput('stylesheet'));
  engine.registerTag('style', StyleTag);
  engine.registerTag('content_for', ContentForTag);
  patchParentloop(engine);
}

/** liquidjs lacks forloop.parentloop — find the enclosing loop's drop in the scope chain. */
function patchParentloop(engine) {
  let ForloopDrop = null;
  engine.registerFilter('__grab_forloop', (x) => { ForloopDrop = x?.constructor; return ''; });
  try { engine.parseAndRenderSync('{% for i in (1..1) %}{{ forloop | __grab_forloop }}{% endfor %}'); } catch { /* ignore */ }
  delete engine.filters.__grab_forloop;
  if (!ForloopDrop || !(ForloopDrop.prototype instanceof Drop)) return;
  ForloopDrop.prototype.liquidMethodMissing = function (key, ctx) {
    if (key !== 'parentloop' || !ctx?.scopes) return undefined;
    const scopes = ctx.scopes;
    let i = scopes.length - 1;
    while (i >= 0 && scopes[i].forloop !== this) i -= 1;
    for (let j = i - 1; j >= 0; j--) if (scopes[j].forloop && scopes[j].forloop !== this) return scopes[j].forloop;
    return undefined;
  };
}
