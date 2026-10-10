// URL → page context (template, page_type, template objects, title/description) for the mock storefront.
import path from 'node:path';
import {
  products, productsByHandle, collectionsByHandle, collections, pagesByHandle, blogs, articles, articlesByKey,
  customer as mockCustomer, giftCard, policies, productWithSelection, stripHtml, handleize, buildShop,
} from '../mock/store.mjs';
import { collectionForRequest, virtualCollection, runSearch, cleanQuery, urlWith } from './storefront.mjs';
import { findTemplate, DIRS } from './theme.mjs';

const SHOP_NAME = 'Vault Collectibles';
const desc = (html, n = 160) => stripHtml(html).slice(0, n);

/** Returns { redirect } | { status } and mutates rs with template + objects. */
export function resolveRoute(rs) {
  const p = rs.path.replace(/\/+$/, '') || '/';
  const seg = p.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  const set = (pageType, name, extra = {}) => {
    rs.pageType = pageType;
    rs.template = { name, suffix: extra.suffix || null, directory: extra.directory || null };
    rs.objects = extra.objects || {};
    rs.pageTitle = extra.title || SHOP_NAME;
    rs.pageDescription = extra.description || null;
    rs.pageImage = extra.image || null;
    rs.handle = extra.handle || null;
    rs.status = extra.status || 200;
    rs.canonicalUrl = `${rs.origin}${extra.canonical || p}`;
    return {};
  };
  const notFound = () => set('404', '404', { title: '404 Not Found', status: 404 });
  rs.currentPage = Math.max(1, parseInt(rs.query.get('page') || '1', 10) || 1);
  rs.pageUrl = (n) => {
    const q = cleanQuery(rs.query);
    q.set('page', String(n));
    return urlWith(rs.path, q);
  };

  if (p === '/') return set('index', 'index', { title: SHOP_NAME, description: buildShop(rs.origin).description });

  // products
  if (seg[0] === 'products' && seg[1] && seg.length === 2) {
    const product = productsByHandle[seg[1]];
    if (!product) return notFound();
    const prod = productWithSelection(product, rs.query.get('variant'));
    return set('product', 'product', { objects: { product: prod }, title: product.title, description: desc(product.description), image: product.featured_image, handle: product.handle, suffix: product.template_suffix, canonical: product.url });
  }

  // collections
  if (seg[0] === 'collections') {
    if (seg.length === 1) {
      return set('list-collections', 'list-collections', { title: 'Collections', objects: {} });
    }
    if (seg[2] === 'products' && seg[3]) {
      const product = productsByHandle[seg[3]];
      const collection = collectionsByHandle[seg[1]];
      if (!product) return notFound();
      return set('product', 'product', { objects: { product: productWithSelection(product, rs.query.get('variant')), collection: collection || null }, title: product.title, description: desc(product.description), image: product.featured_image, handle: product.handle, canonical: product.url });
    }
    if (seg[1] === 'vendors' || seg[1] === 'types') {
      const base = virtualCollection(seg[1], rs.query.get('q'));
      const collection = collectionForRequest(base, { path: rs.path, query: rs.query });
      return set('collection', 'collection', { objects: { collection }, title: base.title, handle: seg[1] });
    }
    const base = collectionsByHandle[seg[1]];
    if (!base) return notFound();
    const currentTags = seg[2] ? seg[2].split('+').map((t) => t.trim()).filter(Boolean) : null;
    rs.currentTags = currentTags;
    const collection = collectionForRequest(base, { path: rs.path, query: rs.query, currentTags });
    return set('collection', 'collection', { objects: { collection }, title: base.title, description: desc(base.description), image: base.image, handle: base.handle, suffix: base.template_suffix });
  }

  // search
  if (p === '/search') {
    const search = runSearch({ path: rs.path, query: rs.query });
    const title = search.performed ? `Search: ${search.results_count} results found for "${search.terms}"` : 'Search';
    return set('search', 'search', { objects: { search }, title });
  }

  if (p === '/cart') return set('cart', 'cart', { title: 'Your Shopping Cart' });

  // pages
  if (seg[0] === 'pages' && seg[1] && seg.length === 2) {
    const page = pagesByHandle[seg[1]];
    if (!page) return notFound();
    const suffix = page.template_suffix || (findTemplate('page', page.handle, null) ? page.handle : null);
    return set('page', 'page', { objects: { page }, title: page.title, description: desc(page.content), handle: page.handle, suffix });
  }

  // policies (built-in Shopify pages, no theme template)
  if (seg[0] === 'policies' && seg[1]) {
    const policy = policies.find((x) => x.handle === seg[1]);
    if (!policy) return notFound();
    set('policy', 'policy', { title: policy.title, objects: { policy } });
    rs.builtinContent = `<div class="shopify-policy__container page-width" style="padding:48px 16px;max-width:760px;margin:0 auto"><div class="shopify-policy__title"><h1>${policy.title}</h1></div><div class="shopify-policy__body rte">${policy.body}</div></div>`;
    return {};
  }

  // blogs
  if (seg[0] === 'blogs' && seg[1]) {
    const blog = blogs[seg[1]];
    if (!blog) return notFound();
    if (seg.length === 2 || (seg[2] === 'tagged' && seg[3])) {
      const tag = seg[2] === 'tagged' ? seg[3] : null;
      let view = blog;
      if (tag) {
        const list = blog.articles.filter((a) => a.tags.some((t) => handleize(t) === handleize(tag)));
        const realTag = blog.all_tags.find((t) => handleize(t) === handleize(tag)) || tag;
        rs.currentTags = [realTag];
        view = Object.assign(Object.create(Object.getPrototypeOf(blog)), blog, { articles: list, articles_count: list.length });
      }
      return set('blog', 'blog', { objects: { blog: view }, title: blog.title, handle: blog.handle, image: blog.articles[0]?.image });
    }
    if (seg.length === 3) {
      const article = articlesByKey[`${seg[1]}/${seg[2]}`];
      if (!article) return notFound();
      const i = blog.articles.indexOf(article);
      const view = Object.assign(Object.create(Object.getPrototypeOf(blog)), blog, {
        next_article: blog.articles[i + 1] || null,
        previous_article: blog.articles[i - 1] || null,
      });
      return set('article', 'article', { objects: { article, blog: view }, title: article.title, description: desc(article.excerpt || article.content), image: article.image, handle: article.handle });
    }
    return notFound();
  }

  // customer accounts
  if (seg[0] === 'account') {
    const sub = seg[1] || '';
    if (sub === 'logout') return { redirect: '/', clearCustomer: true };
    if (sub === 'login') {
      if (rs.customerFromCookie) return { redirect: '/account' };
      return set('customers/login', 'login', { directory: 'customers', title: 'Account' });
    }
    if (sub === 'register') return set('customers/register', 'register', { directory: 'customers', title: 'Create Account' });
    if (sub === 'activate') return set('customers/activate_account', 'activate_account', { directory: 'customers', title: 'Activate Account' });
    if (sub === 'reset') return set('customers/reset_password', 'reset_password', { directory: 'customers', title: 'Reset Account' });
    if (!rs.customer) return { redirect: '/account/login' };
    if (sub === '') return set('customers/account', 'account', { directory: 'customers', title: 'Account' });
    if (sub === 'addresses') return set('customers/addresses', 'addresses', { directory: 'customers', title: 'Addresses' });
    if (sub === 'orders' && seg[2]) {
      const order = rs.customer.orders.find((o) => String(o.id) === seg[2] || o.name === `#${seg[2]}` || String(o.order_number) === seg[2]);
      if (!order) return notFound();
      return set('customers/order', 'order', { directory: 'customers', title: `Order ${order.name}`, objects: { order } });
    }
    return notFound();
  }

  if (p === '/password') return set('password', 'password', { title: SHOP_NAME });

  if (p === '/gift_card' || (seg[0] === 'gift_cards' && seg[1])) {
    return set('gift_card', 'gift_card', { title: 'Your gift card', objects: { gift_card: giftCard, recipient: giftCard.recipient } });
  }

  return notFound();
}

/** Every routable URL in the mock store (used by GET /__routes and the screenshot runner). */
export function listRoutes() {
  const graded = productsByHandle['base-set-holo-dragon-psa-10'];
  const raw = products.find((x) => x.__kind === 'single' && x.options.length > 1);
  const sealed = products.find((x) => x.__kind === 'sealed' && x.available);
  const soldOut = products.find((x) => !x.available);
  const sale = products.find((x) => x.compare_at_price && x.available && x.__kind === 'graded');
  const supply = products.find((x) => x.__kind === 'supply' && x.options[0] === 'Color');
  const r = (p, label, group) => ({ path: p, label, group });
  return [
    r('/', 'Home', 'core'),
    r('/collections', 'All collections', 'collections'),
    ...collections.map((c) => r(c.url, `Collection: ${c.title}`, 'collections')),
    r('/collections/graded-slabs?sort_by=price-ascending&filter.v.availability=1', 'Collection with filters + sort', 'collections'),
    r('/collections/pokemon/graded', 'Collection tagged (pokemon/graded)', 'collections'),
    r('/collections/all?page=2', 'Collection page 2', 'collections'),
    r(graded.url, 'Product: graded slab (PSA 10, qty 1)', 'products'),
    r(raw.url, 'Product: raw single with variants', 'products'),
    r(`${raw.url}?variant=${raw.variants[2].id}`, 'Product: raw single, variant preselected', 'products'),
    r(sealed.url, 'Product: sealed box', 'products'),
    r(soldOut.url, 'Product: sold out', 'products'),
    r(sale.url, 'Product: on sale', 'products'),
    r(supply.url, 'Product: supplies with color variants', 'products'),
    r('/cart', 'Cart', 'core'),
    r('/search', 'Search (empty)', 'search'),
    r('/search?q=ember', 'Search: results', 'search'),
    r('/search?q=zzzzqx', 'Search: no results', 'search'),
    r('/pages/about', 'Page: About', 'pages'),
    r('/pages/contact', 'Page: Contact', 'pages'),
    r('/pages/faq', 'Page: FAQ', 'pages'),
    r('/pages/sell-to-us', 'Page: Sell to us', 'pages'),
    r('/blogs/news', 'Blog', 'blog'),
    r('/blogs/news/tagged/grading', 'Blog tagged', 'blog'),
    r(articles[0].url, 'Article', 'blog'),
    r('/this-page-does-not-exist', '404', 'core'),
    r('/password', 'Password', 'core'),
    r('/gift_card', 'Gift card', 'core'),
    r('/account/login', 'Account: login', 'account'),
    r('/account/register', 'Account: register', 'account'),
    r('/account?customer=1', 'Account: dashboard', 'account'),
    r(`/account/orders/${mockCustomer.orders[0].id}?customer=1`, 'Account: order', 'account'),
    r('/account/addresses?customer=1', 'Account: addresses', 'account'),
    r('/account/activate', 'Account: activate', 'account'),
    r('/account/reset', 'Account: reset password', 'account'),
    r('/policies/refund-policy', 'Policy (built-in)', 'core'),
  ];
}

export { path, DIRS };
