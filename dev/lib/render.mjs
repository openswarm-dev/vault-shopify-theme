// Page / section rendering pipeline: JSON templates, section groups, static sections, layouts,
// Section Rendering API, live-reload injection.
import fs from 'node:fs';
import path from 'node:path';
import { Drop } from 'liquidjs';
import { engine, parseThemeFile, reportError, RS } from './engine.mjs';
import { DIRS, readJSON, extractSchema, sectionFile, findTemplate, resolveSettings, buildSettings, exists, rel } from './theme.mjs';
import { record, errorBox } from './errors.mjs';
import { TemplateDrop, indexedArray } from './drops.mjs';
import { esc } from '../mock/art.mjs';
import {
  collections, productsByHandle, pagesByHandle, blogs, articlesByKey, localization, buildLinklists, buildShop, mockImageFor,
} from '../mock/store.mjs';
import { cartDrop } from './cart.mjs';

const THEME_ID = 'vault';

class ImagesDrop extends Drop {
  liquidMethodMissing(key) { return mockImageFor(String(key)); }
}

export const ROUTES = {
  root_url: '/',
  account_url: '/account',
  account_login_url: '/account/login',
  account_logout_url: '/account/logout',
  account_register_url: '/account/register',
  account_addresses_url: '/account/addresses',
  account_recover_url: '/account/recover',
  collections_url: '/collections',
  all_products_collection_url: '/collections/all',
  search_url: '/search',
  predictive_search_url: '/search/suggest',
  cart_url: '/cart',
  cart_add_url: '/cart/add',
  cart_change_url: '/cart/change',
  cart_clear_url: '/cart/clear',
  cart_update_url: '/cart/update',
  product_recommendations_url: '/recommendations/products',
  storefront_login_url: '/password',
};

const CONTENT_FOR_HEADER = '<script>window.Shopify = { designMode: false, routes: { root: \'/\' }, locale: \'en\', currency: { active: \'USD\' } };</script>';

/* ------------------------------------------------------------------ */
/* Globals                                                             */
/* ------------------------------------------------------------------ */
export function buildGlobals(rs) {
  const linklists = buildLinklists(rs.path);
  rs.linklists = linklists;
  const settings = buildSettings({ linklists });
  for (const e of settings.__errors) record('liquid', { message: e, file: 'config', url: rs.urlLabel });
  const shop = buildShop(rs.origin);
  const o = rs.objects || {};
  const g = {
    shop,
    settings,
    request: {
      page_type: rs.pageType,
      path: rs.path,
      host: rs.host,
      origin: rs.origin,
      locale: { iso_code: 'en', primary: true, root_url: '/', name: 'English', endonym_name: 'English' },
      design_mode: false,
      visual_preview_mode: false,
    },
    routes: ROUTES,
    template: new TemplateDrop(rs.template?.name || rs.pageType, rs.template?.suffix || null, rs.template?.directory || null),
    canonical_url: rs.canonicalUrl || `${rs.origin}${rs.path}`,
    page_title: rs.pageTitle || shop.name,
    page_description: rs.pageDescription || shop.description,
    page_image: rs.pageImage || null,
    content_for_header: CONTENT_FOR_HEADER,
    content_for_layout: '',
    content_for_index: '',
    cart: cartDrop(),
    customer: rs.customer || null,
    localization,
    collections: indexedArray(collections, (c) => c.handle),
    all_products: productsByHandle,
    linklists,
    pages: pagesByHandle,
    blogs,
    articles: articlesByKey,
    images: new ImagesDrop(),
    powered_by_link: '<a target="_blank" rel="nofollow" href="https://www.shopify.com?utm_campaign=poweredby&amp;utm_medium=shopify&amp;utm_source=onlinestore">Powered by Shopify</a>',
    current_page: rs.currentPage || 1,
    current_tags: rs.currentTags || null,
    handle: rs.handle || null,
    recommendations: { performed: false, products: [], products_count: 0, intent: 'related' },
    additional_checkout_buttons: false,
    content_for_additional_checkout_buttons: '',
    ...o,
  };
  Object.defineProperty(g, RS, { value: rs, enumerable: false });
  rs.globals = g;
  return g;
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */
function normaliseBlocks(blocks, blockOrder) {
  if (!blocks) return [];
  if (Array.isArray(blocks)) return blocks.map((b, i) => [`${b.type}-${i + 1}`.replace(/[^\w-]/g, '_'), b]);
  const order = Array.isArray(blockOrder) && blockOrder.length ? blockOrder : Object.keys(blocks);
  return order.map((k) => [k, blocks[k]]).filter(([, b]) => b);
}

function buildSectionDrop({ id, type, values, rs, location, index }) {
  const abs = sectionFile(type);
  const { schema } = extractSchema(abs);
  const ctx = { linklists: rs.linklists };
  const settings = resolveSettings(schema?.settings || [], values?.settings || {}, ctx);
  const defs = Object.fromEntries((schema?.blocks || []).map((b) => [b.type, b]));
  const entries = normaliseBlocks(values?.blocks, values?.block_order).filter(([, b]) => !b.disabled && b.type !== '@app');
  const blocks = entries.map(([key, b]) => {
    const def = defs[b.type] || defs['@theme'];
    if (!def && schema) record('liquid', { key: `block:${type}:${b.type}`, message: `Block type '${b.type}' is not defined in the schema of sections/${type}.liquid`, file: `sections/${type}.liquid`, url: rs.urlLabel });
    return {
      id: key,
      type: b.type,
      settings: resolveSettings(def?.settings || [], b.settings || {}, ctx),
      shopify_attributes: `data-shopify-editor-block="${esc(JSON.stringify({ id: key, type: b.type }))}"`,
    };
  });
  return {
    id,
    settings,
    blocks,
    block_order: entries.map(([k]) => k),
    index,
    index0: index - 1,
    location,
  };
}

/** Render one section instance with its Shopify wrapper. */
export async function renderSection({ id, type, values = {}, rs, location = 'template', index = 1, groupClass = '' }) {
  const abs = sectionFile(type);
  const open = (tag, cls) => `<${tag} id="shopify-section-${esc(id)}" class="shopify-section${groupClass ? ` ${groupClass}` : ''}${cls ? ` ${esc(cls)}` : ''}">`;
  if (!type || !exists(abs)) {
    const message = `Section type '${type}' does not refer to an existing section file (sections/${type}.liquid)`;
    record('assets', { key: `section:${type}`, message, file: values.__source || null, url: rs.urlLabel });
    rs.errors.push({ message });
    return `${open('div')}${errorBox({ message, file: values.__source || null })}</div>`;
  }
  const { schema, error: schemaError } = extractSchema(abs);
  let html = '';
  if (schemaError) {
    record('liquid', { message: schemaError.message, file: rel(abs), line: schemaError.line, url: rs.urlLabel });
    rs.errors.push(schemaError);
    html += errorBox({ ...schemaError, file: rel(abs) });
  }
  try {
    const section = buildSectionDrop({ id, type, values, rs, location, index });
    const templates = parseThemeFile(abs);
    html += await engine.render(templates, { section }, { globals: rs.globals });
  } catch (err) {
    html += reportError(err, rs, err?.token ? {} : { file: rel(abs) });
  }
  const tag = /^(div|section|aside|header|footer|article|nav|main)$/.test(schema?.tag || '') ? schema.tag : 'div';
  return `${open(tag, schema?.class)}${html}</${tag}>`;
}

/** {% section 'name' %} — static section with settings_data / schema defaults. */
export async function renderStaticSection(name, rs) {
  const saved = rs.globals?.settings?.__sections?.[name];
  let values = saved;
  if (!values) {
    const { schema } = extractSchema(sectionFile(name));
    values = schema?.default ? { settings: schema.default.settings || {}, blocks: schema.default.blocks || null } : {};
  }
  return renderSection({ id: name, type: name, values, rs, location: 'static' });
}

function groupFile(name) {
  return path.join(DIRS.sections, `${name}.json`);
}
/** {% sections 'header-group' %} */
export async function renderSectionGroup(name, rs) {
  const abs = groupFile(name);
  const { data, error, missing } = readJSON(abs);
  if (missing || error) {
    const message = missing ? `Section group sections/${name}.json does not exist` : `Invalid JSON in sections/${name}.json: ${error}`;
    record(missing ? 'assets' : 'liquid', { key: `group:${name}:${message}`, message, file: `sections/${name}.json`, url: rs.urlLabel });
    rs.errors.push({ message });
    return errorBox({ message, file: `sections/${name}.json` });
  }
  const order = data.order || Object.keys(data.sections || {});
  const out = [];
  let index = 1;
  for (const key of order) {
    const sec = data.sections?.[key];
    if (!sec || sec.disabled) continue;
    out.push(await renderSection({
      id: `sections--${THEME_ID}__${key}`, type: sec.type, values: { ...sec, __source: `sections/${name}.json` }, rs, location: name, index: index++, groupClass: `shopify-section-group-${name}`,
    }));
  }
  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */
export function resolveTemplate(rs) {
  const t = rs.template;
  const view = rs.query.get('view');
  if (view) {
    const alt = findTemplate(t.name, view, t.directory);
    if (alt) { t.suffix = view; return alt; }
  }
  if (t.suffix) {
    const found = findTemplate(t.name, t.suffix, t.directory);
    if (found) return found;
    t.suffix = null;
  }
  return findTemplate(t.name, null, t.directory);
}

/** Dev-only convenience for fixtures: "__preset": 0 fills settings/blocks from the section's preset. */
function withPreset(sec) {
  if (sec.__preset == null) return sec;
  const { schema } = extractSchema(sectionFile(sec.type));
  const preset = schema?.presets?.[Number(sec.__preset)] || {};
  return { ...sec, settings: { ...(preset.settings || {}), ...(sec.settings || {}) }, blocks: sec.blocks || preset.blocks || null, block_order: sec.block_order || preset.block_order };
}

function parseWrapper(spec) {
  const m = String(spec || '').match(/^(\w+)((?:[#.][\w-]+)*)((?:\[[^\]]+\])*)$/);
  if (!m) return null;
  const id = (m[2].match(/#([\w-]+)/) || [])[1];
  const classes = [...m[2].matchAll(/\.([\w-]+)/g)].map((x) => x[1]);
  const attrs = [...m[3].matchAll(/\[([\w-]+)=?([^\]]*)\]/g)].map((x) => ` ${x[1]}="${esc(x[2])}"`).join('');
  return [`<${m[1]}${id ? ` id="${id}"` : ''}${classes.length ? ` class="${classes.join(' ')}"` : ''}${attrs}>`, `</${m[1]}>`];
}

async function renderJsonTemplate(abs, data, rs) {
  const order = data.order || Object.keys(data.sections || {});
  const out = [];
  let index = 1;
  for (const key of order) {
    const sec = data.sections?.[key];
    if (!sec) {
      out.push(errorBox({ message: `Section '${key}' is listed in "order" but missing from "sections"`, file: rel(abs) }));
      continue;
    }
    if (sec.disabled) continue;
    out.push(await renderSection({ id: `template--${THEME_ID}__${key}`, type: sec.type, values: { ...withPreset(sec), __source: rel(abs) }, rs, location: 'template', index: index++ }));
  }
  let html = out.join('\n');
  const wrap = data.wrapper ? parseWrapper(data.wrapper) : null;
  if (wrap) html = `${wrap[0]}${html}${wrap[1]}`;
  return html;
}

/** Renders content_for_layout for the current route (JSON or Liquid template). */
async function renderContent(rs) {
  if (rs.builtinContent != null) return rs.builtinContent;
  const tf = resolveTemplate(rs);
  const label = `templates/${rs.template.directory ? `${rs.template.directory}/` : ''}${rs.template.name}`;
  if (!tf) {
    const message = `Template ${label}.json does not exist yet`;
    record('assets', { key: `template:${label}`, message, file: `${label}.json`, url: rs.urlLabel });
    rs.errors.push({ message });
    return `<div class="page-width" style="padding:24px 0">${errorBox({ message, file: `${label}.json` })}</div>`;
  }
  rs.templateFile = rel(tf.abs);
  if (tf.kind === 'json') {
    const { data, error } = readJSON(tf.abs);
    if (error) {
      record('liquid', { message: `Invalid JSON template: ${error}`, file: rel(tf.abs), url: rs.urlLabel });
      return errorBox({ message: `Invalid JSON template: ${error}`, file: rel(tf.abs) });
    }
    if (data.layout === false) rs.layout = null;
    else if (typeof data.layout === 'string') rs.layout = data.layout;
    return renderJsonTemplate(tf.abs, data, rs);
  }
  try {
    return await engine.render(parseThemeFile(tf.abs), {}, { globals: rs.globals });
  } catch (err) {
    return reportError(err, rs, err?.token ? {} : { file: rel(tf.abs) });
  }
}

export async function renderPage(rs) {
  buildGlobals(rs);
  const content = await renderContent(rs);
  let layout = rs.layout;
  if (layout === undefined) layout = rs.pageType === 'password' && exists(path.join(DIRS.layout, 'password.liquid')) ? 'password' : 'theme';
  let html;
  if (layout === null) html = content;
  else {
    const abs = path.join(DIRS.layout, `${layout}.liquid`);
    if (!exists(abs)) {
      const message = `Layout layout/${layout}.liquid does not exist`;
      record('assets', { key: `layout:${layout}`, message, url: rs.urlLabel });
      html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(rs.pageTitle || 'Vault')}</title></head><body>${errorBox({ message })}${content}</body></html>`;
    } else {
      rs.globals.content_for_layout = content;
      try {
        html = await engine.render(parseThemeFile(abs), {}, { globals: rs.globals });
      } catch (err) {
        html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${reportError(err, rs, err?.token ? {} : { file: rel(abs) })}${content}</body></html>`;
      }
    }
  }
  return injectDevClient(html, rs);
}

/* ------------------------------------------------------------------ */
/* Section Rendering API                                               */
/* ------------------------------------------------------------------ */
export async function renderSectionById(id, rs) {
  if (!rs.globals) buildGlobals(rs);
  let m = String(id).match(/^template--[^_]+__(.+)$/);
  if (m) {
    const tf = resolveTemplate(rs);
    if (!tf || tf.kind !== 'json') return null;
    const { data } = readJSON(tf.abs);
    const sec = data?.sections?.[m[1]];
    if (!sec) return null;
    const index = (data.order || Object.keys(data.sections)).indexOf(m[1]) + 1;
    return renderSection({ id, type: sec.type, values: { ...withPreset(sec), __source: rel(tf.abs) }, rs, location: 'template', index });
  }
  m = String(id).match(/^sections--[^_]+__(.+)$/);
  if (m) {
    for (const f of fs.readdirSync(DIRS.sections).filter((x) => x.endsWith('.json'))) {
      const group = f.replace(/\.json$/, '');
      const { data } = readJSON(path.join(DIRS.sections, f));
      const sec = data?.sections?.[m[1]];
      if (sec) return renderSection({ id, type: sec.type, values: { ...sec, __source: `sections/${f}` }, rs, location: group, groupClass: `shopify-section-group-${group}` });
    }
    return null;
  }
  if (/^[\w-]+$/.test(String(id)) && exists(sectionFile(id))) return renderStaticSection(String(id), rs);
  return null;
}

/** Render a section file with its first preset (used by /__section/<name>). */
export async function renderSectionPreset(type, presetIndex, rs) {
  const { schema } = extractSchema(sectionFile(type));
  const preset = schema?.presets?.[presetIndex] || null;
  const values = preset ? { settings: preset.settings || {}, blocks: preset.blocks || null, block_order: preset.block_order } : schema?.default || {};
  return renderSection({ id: `template--${THEME_ID}__${type}`, type, values, rs, location: 'template' });
}

/* ------------------------------------------------------------------ */
/* Dev client                                                          */
/* ------------------------------------------------------------------ */
const LIVERELOAD = `<script data-dev-livereload>(function(){if(window.top!==window||!window.EventSource)return;var es=new EventSource('/__livereload');es.addEventListener('css',function(){document.querySelectorAll('link[rel="stylesheet"][href^="/assets/"]').forEach(function(l){var u=new URL(l.href);u.searchParams.set('lr',Date.now());l.href=u.toString();});});es.addEventListener('reload',function(){location.reload();});})();</script>`;
export function injectDevClient(html, rs) {
  if (rs.noLivereload) return html;
  const i = html.lastIndexOf('</body>');
  return i === -1 ? html + LIVERELOAD : html.slice(0, i) + LIVERELOAD + html.slice(i);
}
