# VAULT — Theme Architecture & Build Contract

Vault is a Shopify **Online Store 2.0** Liquid theme for a trading-card collectors store.
Visual direction: **modern, dark graphite greys + crimson red**, cinematic and premium, with
**Motion** (the library formerly called Framer Motion — vanilla JS build, `window.Motion`)
driving springs, staggers, scroll-linked effects and holographic card interactions.
It must be **fully optimised for phones (≥ 320px) and tablets (portrait & landscape)**.

Everything in this file is a contract. Builders working in parallel rely on it — do not
rename or re-implement anything listed as "core". If you need something core doesn't
provide, build it inside your own files and namespace it.

---

## 1. Repository layout

```
theme/                    ← the Shopify theme (zip this folder's contents)
  assets/                 base.css, theme.js, motion.js (vendored) + per-section/component css/js
  config/                 settings_schema.json, settings_data.json        (core — do not edit)
  layout/                 theme.liquid (core), password.liquid
  locales/                en.default.json  (GENERATED — never edit; see §10)
  sections/               *.liquid sections, header-group.json, footer-group.json
  snippets/               reusable snippets
  templates/              *.json templates, customers/*.json, gift_card.liquid
src/locales/*.json        locale fragments merged into theme/locales/en.default.json
src/index-fragments/*.json home-page section fragments merged into templates/index.json
dev/                      local preview server (liquidjs) + mock store + screenshot tooling
scripts/                  check.mjs (Theme Check), merge-locales.mjs, package.mjs
```

Core files (owned by the lead — read them, don't edit them):
`layout/theme.liquid`, `assets/base.css`, `assets/theme.js`, `assets/motion.js`,
`config/*`, `snippets/theme-styles.liquid`, `snippets/meta-tags.liquid`, `snippets/icon.liquid`,
`snippets/placeholder-card.liquid`, `snippets/section-header.liquid`, `src/locales/core.json`.

---

## 2. Breakpoints & responsive rules (non-negotiable)

| Name    | Query                         | Typical devices                        |
|---------|-------------------------------|----------------------------------------|
| mobile  | `max-width: 749px`            | phones 320–430px                        |
| tablet  | `750px – 989px`               | iPad portrait 768/810/820/834          |
| desktop | `min-width: 990px`            | iPad landscape 1024–1194, laptops       |
| wide    | `min-width: 1400px`           | large screens                           |

Write CSS **mobile-first** (`@media (min-width: 750px)` then `(min-width: 990px)`).

Mobile/tablet checklist every section must pass:
- **No horizontal page scroll** at 320, 375, 390, 768, 820, 1024px. Use `min-width: 0` on grid/flex children, `overflow-wrap`, `max-width: 100%`.
- **Touch targets ≥ 44×44px** on coarse pointers. Spacing between adjacent targets.
- **Form inputs ≥ 16px font-size** (prevents iOS zoom) — `.field__input`, `.input` already do this.
- Hover-only effects must be inside `@media (hover: hover) and (pointer: fine)`; anything revealed on hover must also be reachable on touch (always visible on touch, or via tap).
- Use `100svh`/`100dvh` (with `100vh` fallback) for full-height heroes — never bare `100vh` on mobile.
- Respect safe areas: `var(--safe-bottom)` / `var(--safe-top)` for fixed bottom/top UI.
- Fixed bottom UI must sit above the mobile dock: `bottom: calc(var(--dock-height) + …)`. `--dock-height` is `0px` on ≥750px.
- Horizontal rows of cards on mobile → use `<vault-carousel>` (scroll-snap, swipe) or a 2-column grid. Never squeeze 4 columns onto a phone.
- Tablet is NOT just "big mobile": use 2–3 columns, larger type, and check both 768×1024 and 1024×768.
- Images: always `image_url` + `image_tag` with `widths` and an accurate `sizes`, `loading: 'lazy'` below the fold, `fetchpriority: 'high'` + eager for the first hero image only.
- Keep heavy effects (parallax, cursor, 3D) desktop-first; on mobile use lighter variants (core does this automatically for its enhancers).

---

## 3. Design tokens (CSS custom properties)

Scheme-dependent (set per color scheme class `.color-<scheme-id>`, `:root` = first scheme):
`--color-bg` `--color-bg-rgb` `--color-bg-gradient` `--color-surface` `--color-surface-rgb`
`--color-text` `--color-text-rgb` `--color-muted` `--color-muted-rgb` `--color-accent`
`--color-accent-rgb` `--color-on-accent` `--color-border` `--color-border-rgb`

Use `rgb(var(--color-accent-rgb) / .3)` for alpha. `color-mix()` is allowed.

Global: `--font-display` `--font-display-weight` `--font-display-stretch` `--font-display-case`
`--font-body` `--font-mono` · `--page-width` `--gutter` `--section-space` `--grid-gap`
· `--radius-xs|sm|md|lg|xl|card|btn` · `--ratio-card` (63/88) `--ratio-portrait` `--ratio-square` `--ratio-slab`
· type: `--text-2xs|xs|sm|base|md|lg|xl`, headings `--h0..--h5` (fluid, already scaled per font)
· `--ease-out` `--ease-in-out` `--ease-back` `--dur-fast|dur|dur-slow`
· `--shadow-sm|shadow|shadow-lg|shadow-glow` · `--holo-gradient` `--accent-gradient`
· `--z-sticky 20` `--z-header 40` `--z-dock 45` `--z-overlay 80` `--z-drawer 90` `--z-toast 100` `--z-fx 110`
· `--header-height` (live, set by JS from `[data-header]`) `--dock-height` `--safe-top` `--safe-bottom`

Never hard-code brand colors in section CSS — use the variables so color schemes work.
(Exceptions: holo rainbow colors, grading-label red/white, rarity tier colors already in base.css.)

## 4. Class library (base.css) — reuse, don't reinvent

Layout: `.page-width` (`--narrow`, `--tight`, `--full`), `.section` (uses `--pt`/`--pb` multipliers),
`.section-bg`, `.grid` (+ `--cols-mobile|tablet|desktop` vars), `.stack`, `.cluster`, `.scroll-x`.
Type: `.h0 .h1 .h2 .h3 .h4 .h5 .h6`, `.eyebrow` (red dot pill label), `.lead`, `.text-muted`,
`.text-accent`, `.text-gradient`, `.text-holo`, `.text-outline`, `.mono`, `.tabular`, `.rte`.
Headings render `<em>`/`<strong>` in accent red (non-italic) — great with `inline_richtext` settings.
Buttons: `.btn` + `.btn--primary|secondary|ghost|light` + `.btn--sm|lg|block|icon`, `.is-loading`; `.link` (+`--accent`,`--muted`).
Forms: `.field` > `input.field__input[placeholder=" "]` + `label.field__label` (floating label — label AFTER input, placeholder must be a single space),
`.field__button`, `.select` > `select.select__select` + chevron icon, `.input`, `.check` (checkbox/radio), `.form-message--error|success`.
Badges: `.badges` wrapper, `.badge` + `--accent|sale|new|sold-out|low-stock|sealed`,
`.badge--grade` (`<span class="badge badge--grade" data-grader="psa|bgs|cgc|sgc|tag" [data-gem]><span class="badge__grader">PSA</span><span class="badge__score">10</span></span>`),
`.badge--rarity[data-tier="common|uncommon|rare|holo|ultra|secret|promo"]`.
Media: `.media` (+ `--card|portrait|square|contain|natural`, or set `--ratio`, `--fit`), `.placeholder-svg`.
Surfaces/effects: `.surface`, `.glass`, `.bg-grid`, `.bg-glow`, `[data-spotlight]` (pointer-follow red glow; uses `::after`), `.ring-glow`, `.pill`, `.skeleton`, `.divider`.
Visibility: `.visually-hidden`, `.hide-mobile`, `.show-mobile-only`, `.hide-tablet`, `.show-desktop-only`, `.hide-desktop`.

## 5. Motion system

`assets/motion.js` (Motion 14) is loaded `defer` in `<head>`, then `assets/theme.js` (core).
`window.Motion` exposes `animate, scroll, inView, stagger, spring, hover, press, frame, mix, transform, …`.
Use `Vault.Motion` (same object) inside theme JS.

**Golden rules**
1. Content must be visible without JS. Initial hidden states only apply under `html.motion-ok`
   (set when JS runs, animations are enabled and the visitor doesn't prefer reduced motion).
2. Always gate animation code: `if (!Vault.motionOK()) { /* show final state */ return; }`.
3. Prefer the declarative data attributes below over hand-rolled scroll code.
4. Animate transforms/opacity/filter/clip-path only. Never animate layout properties in loops.
5. Springs for interaction (`Vault.spring`, `Vault.springSoft`, `Vault.springBouncy`), eased tweens
   for reveals (`Vault.ease.out`). Durations in **seconds**.
6. Clean up: stop `inView`/`scroll` subscriptions in `disconnectedCallback` for custom elements.

**Declarative enhancers (core, idempotent, auto-bound on load + any DOM insertion + section reload):**

| Attribute | Effect |
|---|---|
| `data-reveal` / `="fade-up\|fade\|fade-down\|left\|right\|scale\|blur\|clip\|zoom\|card"` | Reveal when scrolled into view. Siblings entering together auto-stagger (visual order). Optional `data-reveal-delay="0.2"`, `data-reveal-duration="1.1"`. Inline styles are cleared after, so your CSS hover transforms work. Do **not** put `data-reveal` on an element whose own `transform` you animate elsewhere. |
| `data-split` / `="chars"` | Masked word (or char) slide-up for headings. Optional `data-split-delay`. Sets aria-label automatically. |
| `data-count-to="25000"` | Count-up number (+ `data-count-decimals`, `data-count-prefix`, `data-count-suffix`, `data-count-duration`). Put the final formatted value as text content for no-JS. |
| `data-parallax="0.15"` | Scroll-linked Y parallax (fraction of viewport). Scroll target = closest `[data-parallax-root]` or parent. |
| `data-magnetic="0.3"` | Pointer-magnetic element (desktop only). |
| `details.accordion[data-accordion]` | Animated height accordion; wrap in `[data-accordion-group]` for single-open. Markup in theme.js header comment. |
| `data-spotlight` | Pointer-follow radial glow on cards/tiles (desktop). |

**Core custom elements** (markup documented at the top of each class in `assets/theme.js`):
- `<holo-card data-foil="subtle|rainbow|intense|none" data-tilt="true|false" data-max-tilt="12">` → `.holo` > media + `.holo__shine` + `.holo__glare`. 3D spring tilt + holographic foil + glare on pointer devices, light sweep on touch. Respects `settings.card_holo` / `settings.card_tilt`.
- `<vault-drawer id data-placement="right|left|bottom|center" data-mobile-placement="bottom|full">` → `<dialog class="drawer">`. Open with `[data-drawer-open="<id>"]`, close with `[data-drawer-close]`/Esc/overlay; bottom sheets drag-to-dismiss; `[data-drawer-item]` children stagger in; `[data-drawer-focus]` gets focus. Events `drawer:open`/`drawer:close`. Methods `open(trigger)`, `close()`, `toggle()`.
- `<vault-carousel style="--per-view-mobile:1.2;--per-view-tablet:2.5;--per-view-desktop:4" data-autoplay="0">` with `[data-carousel-track]`, `[data-carousel-prev|next]`, `[data-carousel-progress]`, `[data-carousel-dots]`. Add class `carousel--bleed` for edge-to-edge swipe on mobile. Event `carousel:change`. Method `goTo(i)`.
- `<vault-marquee data-speed="40" data-direction="left|right" data-scroll-velocity="true" data-flip="false" data-pause-hover data-fade>` > `.marquee__track` > `.marquee__group`.
- `<quantity-input class="qty">` > `button[data-qty="minus"]` + `input[type=number]` + `button[data-qty="plus"]`.

**Core JS API** — `Vault.$/$$`, `clamp`, `lerp`, `debounce`, `rafThrottle`, `emit(name, detail)`, `on(name, fn)`,
`parseHTML`, `fetchSection(id, url)` → Document, `fetchSections(ids, url)` → JSON, `applySections(sections)`,
`lockScroll/unlockScroll` (ref-counted), `formatMoney(cents)`, `toast(msg, {type:'success'|'error'})`,
`inViewport(el)`, `scrollVelocity`, `scrollDirection`, `isMobile()`, `isDesktop()`, `canHover()`, `intensity`,
`init(root)`, `cart.*` (§9), `flyToCart(el)`.

**Section JS pattern** — one file per section/component in `assets/`, loaded at the bottom of the section:
```liquid
<script src="{{ 'section-hero-pack.js' | asset_url }}" defer="defer"></script>
```
Inside, define a custom element (preferred — survives theme-editor reloads and AJAX swaps):
```js
if (!customElements.get('hero-pack')) {
  customElements.define('hero-pack', class extends HTMLElement {
    connectedCallback() { /* bind; read Vault.motionOK() */ }
    disconnectedCallback() { /* cleanup */ }
  });
}
```
Section CSS: `{{ 'section-hero-pack.css' | asset_url | stylesheet_tag }}` at the top of the section file.
Component CSS used by several sections (e.g. `component-card.css`) is loaded by the snippet that renders it
(Shopify de-duplicates nothing — browsers cache, that's fine).
No jQuery, no other libraries, no inline `onclick`. ES2020, no build step.

## 6. Section conventions

Wrapper (Shopify adds `#shopify-section-{{ section.id }}` around it automatically):
```liquid
{{ 'section-NAME.css' | asset_url | stylesheet_tag }}
<section
  id="Section-{{ section.id }}"
  class="section section-NAME color-{{ section.settings.color_scheme }} section-bg"
  style="--pt: {{ section.settings.padding_top | divided_by: 100.0 }}; --pb: {{ section.settings.padding_bottom | divided_by: 100.0 }};"
  data-section-id="{{ section.id }}"
>
  <div class="page-width"> … </div>
</section>
```
Standard settings appended at the end of every content section's `settings` array:
```json
{ "type": "header", "content": "Colors & spacing" },
{ "type": "color_scheme", "id": "color_scheme", "label": "Color scheme", "default": "scheme-1" },
{ "type": "range", "id": "padding_top", "min": 0, "max": 150, "step": 10, "unit": "%", "label": "Top padding", "default": 100 },
{ "type": "range", "id": "padding_bottom", "min": 0, "max": 150, "step": 10, "unit": "%", "label": "Bottom padding", "default": 100 }
```
Color schemes available: `scheme-1` Graphite (default), `scheme-2` Carbon (near-black), `scheme-3` Steel (lighter grey),
`scheme-4` Crimson (red background, black accent), `scheme-5` Bone (light).

Headings: use `{% render 'section-header', … %}` (see the snippet header) for the eyebrow/heading/subtext/link block.
Heading settings should be `inline_richtext` so merchants can wrap words in italics → rendered accent red.

Schema rules:
- Plain-English labels (no `t:` keys). `name` ≤ 25 chars. Every block has `{{ block.shopify_attributes }}` on its root element.
- Content sections get `"presets": [{ "name": "…" }]` (with sensible default blocks) so they can be added in the editor.
  `main-*` sections have **no** presets. Header/footer sections use `"enabled_on"/"disabled_on"` groups appropriately.
- `range` settings: `(max-min)/step ≤ 101`, `unit` ≤ 3 chars, default within range and on a step.
- Defaults must make the section look great with **no merchant content**: use `placeholder-card` / `placeholder_svg_tag`,
  realistic collector copy ("Graded slabs", "Sealed booster boxes", "Pulled fresh from the vault").
- Handle the theme editor: re-init on `shopify:section:load` (custom elements do this automatically),
  and for carousels/tabs respond to `shopify:block:select` by showing that block.
- Settings ids: `snake_case`. Image settings: `image_picker`. Links: `url`. Collections: `collection` / `collection_list`. Products: `product` / `product_list`.

## 7. Shared snippets (contracts)

| Snippet | Owner | Params | Notes |
|---|---|---|---|
| `icon` | core | `name`, `size`, `class`, `stroke` | UI icons — see list in file. |
| `placeholder-card` | core | `variant` 1–6, `uid`, `label`, `class`, `graded` | Stylized card art for empty image settings. |
| `section-header` | core | see file | Eyebrow + split heading + subtext + link. |
| `theme-styles`, `meta-tags` | core | — | Head only. |
| `card-product` | commerce | `product` (req), `index`, `ratio` (`card|portrait|square|natural`, default `settings.card_media_ratio`), `show_quick_add` (default setting), `lazy` (default true), `sizes`, `section_id`, `reveal` (default true), `class` | THE product card used everywhere (grids, carousels, search, recommendations, cart upsell). Root: `<div class="product-card" data-product-card data-product-url="{{ product.url }}" data-reveal …>`, media wrapper has `data-vt-media` and `data-fly-source`, wrapped in `<holo-card>`. Quick add = `<form data-cart-form action="{{ routes.cart_add_url }}" method="post">` (core handles AJAX). Multi-variant → link to PDP ("Choose options"). Loads `component-card.css`. |
| `card-badges` | commerce | `product`, `variant` (optional), `context` (`card|product`) | Sold out / sale / new / low stock / sealed / grade / rarity badges. |
| `price` | commerce | `product` or `variant`, `use_variant`, `show_compare` (default true), `class`, `size` (`sm|md|lg`) | Price with compare-at + "From" for ranges + unit price. Root element `[data-price]` so JS can replace it. |
| `card-collection` | commerce | `collection` (req), `image` (override), `title` (override), `index`, `size` (`sm|md|lg`), `sizes`, `reveal` | Collection tile (image + dark gradient + display title + count + arrow, spotlight hover). Used by collection-list and list-collections. Loads `component-card-collection.css`. |
| `collector-specs` | product | `product`, `variant` | Spec table on PDP (set, number, rarity, grade, cert w/ verify link, condition, language, year, population). |
| `pagination` | collection | `paginate` (req), `anchor` | Numbered pagination (prev/next + parts) — used by collection, search, blog. |
| `card-article` | pages | `article` (req), `index`, `show_excerpt`, `show_date`, `show_author`, `size` (`md|lg`), `sizes` | Blog article card — used by blog, search results, featured posts. Loads `component-card-article.css`. |
| `social-icons` | chrome | `class` | Brand icons from `settings.social_*_link`. |
| `cart-drawer` | chrome | — | Rendered in layout when `settings.cart_type == 'drawer'`. Root: `<vault-drawer id="CartDrawer" …>`. |

## 8. Collector data (metafields with tag fallback)

Namespace: `settings.collector_namespace` (default `custom`). Read like:
```liquid
{%- liquid
  assign ns = settings.collector_namespace | default: 'custom'
  assign mf = product.metafields[ns]
  assign rarity = mf.rarity.value | default: ''
  assign grade = mf.grade.value | default: ''
  # …same for game, set_name, card_number, grading_company, cert_number, condition, language, year, population
  if settings.collector_tag_fallback
    for tag in product.tags
      assign tag_key = tag | split: ':' | first | strip | downcase
      assign tag_val = tag | split: ':' | last | strip
      if tag contains ':'
        case tag_key
          when 'rarity'
            if rarity == blank
              assign rarity = tag_val
            endif
          when 'grade'
            if grade == blank
              assign grade = tag_val
            endif
          # set, number, condition, language, year, cert, game, grader, pop
        endcase
      endif
    endfor
  endif
-%}
```
Tag keys: `rarity`, `grade`, `grader`, `set`, `number`, `condition`, `language`, `year`, `cert`, `game`, `pop`.
Grade strings look like `PSA 10`, `BGS 9.5`, `CGC 9`, `SGC 10`, `TAG 10`. Split on the first space → grader + score.
If `grader` is separate and grade is only a number, combine. Gem mint (`10`, or BGS `9.5`+) → `data-gem`.
Rarity → tier mapping (lower-case contains): `secret|hyper|gold|special illustration|sir|alt art|manga` → `secret`;
`ultra|full art|ex|gx|v max|vmax|vstar|mythic|ghost|starlight|quarter century|collector` → `ultra`;
`holo|foil|reverse` → `holo`; `rare|super rare` → `rare`; `uncommon` → `uncommon`; `promo` → `promo`; else `common`.
Product type `Sealed` (or tag `sealed`) → sealed badge.
Cert verify URLs (when `settings.collector_cert_links`): PSA `https://www.psacard.com/cert/{cert}`,
BGS `https://www.beckett.com/grading/card-lookup?item_type=BGS&item_id={cert}`, CGC `https://www.cgccards.com/certlookup/{cert}/`,
SGC `https://gosgc.com/cert-code-lookup?certCode={cert}`, TAG `https://my.taggrading.com/card/{cert}`.

## 9. Cart contract

- `Vault.cart.add(FormData | {id, quantity, properties} | {items}, { source: imgOrContainer, open: true })`
  → posts to `/cart/add.js` with registered `sections`, applies them, emits `vault:cart:updated`, flies the image to the
  visible `[data-cart-icon]`, opens `#CartDrawer` (or toasts). With `settings.cart_type == 'page'` it redirects to `/cart`.
- `Vault.cart.change({ line | id, quantity })`, `Vault.cart.update({ note | updates })`, `Vault.cart.get()`, `Vault.cart.refresh()`.
- `Vault.cart.register('<section-id>')` — sections re-rendered on every cart mutation (max 5). `cart-icon-bubble` is pre-registered.
- Swap targets: any element `[data-cart-swap="<section-id>"]` (optionally `data-cart-swap-key="items"`) gets its innerHTML
  replaced from the same selector in the freshly rendered section. Put these attributes on matching elements in both the page and the section output.
- `<form data-cart-form action="{{ routes.cart_add_url }}" method="post">` with `input[name=id]`, optional `quantity` — core intercepts submit (AJAX), shows loading on the submit button, toasts errors.
- Sections `cart-drawer` and `cart-icon-bubble` exist as files so the Section Rendering API can render them.
- Header cart button: `<a href="{{ routes.cart_url }}" data-drawer-open="CartDrawer" data-cart-icon aria-controls="CartDrawer">`
  containing `<span data-cart-swap="cart-icon-bubble">…count…</span>` (drawer mode) — works as a link without JS.

## 10. Locales

Never edit `theme/locales/en.default.json`. Put your keys in `src/locales/<your-slice>.json` (same nested shape);
`npm run locales` deep-merges all fragments (core first). Reuse keys from `src/locales/core.json` where they fit
(`general.actions.*`, `accessibility.*`, `products.product.*`, `collector.*`, `cart.general.*`).
New keys go under a namespace you own, e.g. `sections.hero_pack.*`, `customer.*`, `blogs.*`, `search.*`, `collections.*`, `templates.404.*`.
Every storefront string goes through `| t` — no hard-coded English in Liquid except merchant-editable setting defaults.
Pluralised keys use `{ "one": "…", "other": "…" }` and are called with `count:`.

## 11. Templates

JSON templates reference section **types** (filenames). Each owner writes the templates for their pages.
Home page: owners of home sections write `src/index-fragments/<slice>.json`:
```json
{ "order_hint": 30, "sections": { "hero": { "type": "hero-pack", "settings": { … }, "blocks": { … }, "block_order": [ … ] } } }
```
The lead composes `templates/index.json` from these (use unique section keys, include realistic demo settings).

## 12. Shopify Liquid surface (keep to this list — the local preview implements it)

Tags: `if/elsif/else/unless/case/when/for (limit, offset, reversed, forloop.*)/break/continue/cycle/tablerow/assign/capture/increment/liquid/echo/comment/# inline comments/raw/render (with/for/as, named args)/section/sections/schema/style/stylesheet/javascript/form/paginate/layout`.
Objects: `shop, settings, request (page_type, locale, design_mode, path, host, origin), routes, template (name, suffix), canonical_url, page_title, page_description, page_image, content_for_header, content_for_layout, cart, customer, localization, product, collection, collections, all_products, linklists, pages, page, blog, blogs, article, articles, search, predictive_search, recommendations, current_page, current_tags, paginate, form, section, block, settings.color_schemes, images, powered_by_link, handle, gift_card, order, recipient`.
Filters (Shopify): `asset_url, stylesheet_tag, script_tag, image_url, image_tag, img_url (avoid), placeholder_svg_tag, money, money_with_currency, money_without_currency, money_without_trailing_zeros, t, json, handle/handleize, link_to, url_for_type, url_for_vendor, within, default_pagination, highlight, pluralize, time_tag, date, payment_type_svg_tag, payment_type_img_url, external_video_tag, external_video_url, video_tag, media_tag, metafield_tag, color_to_rgb, color_modify, color_brightness, color_mix, color_lighten, color_darken, color_extract, font_face, font_url, default_errors, customer_login_link, customer_logout_link, customer_register_link, format_address, highlight_active_tag, link_to_tag, link_to_add_tag, link_to_remove_tag, sort_by, url_param_escape, url_escape, shopify_asset_url, inline_asset_content, structured_data, weight_with_unit, escape, escape_once, strip_html, strip_newlines, newline_to_br, truncate, truncatewords, split, join, first, last, map, where, sort, sort_natural, uniq, reverse, size, concat, compact, slice, remove, remove_first, replace, replace_first, append, prepend, upcase, downcase, capitalize, camelize, plus, minus, times, divided_by, modulo, round, ceil, floor, abs, at_least, at_most, default, md5, sha256, hmac_sha256, base64_encode, base64_decode, url_decode, url_encode, date, strip, lstrip, rstrip`.
Do not use `include` (deprecated), `{% content_for 'blocks' %}`/theme blocks, or Shopify Plus-only features.

## 13. Quality bar

- `npm run check` (Shopify Theme Check) must report **0 errors** for your files. Fix warnings unless clearly irrelevant.
- Valid HTML, landmarks, labelled controls, `alt` text (`image.alt | escape` fallback to product title), visible focus, `aria-expanded`/`aria-controls` on toggles, `aria-live` for dynamic updates.
- Performance: no layout thrash in scroll handlers, `loading="lazy"` below the fold, explicit `width`/`height` on images (image_tag does this), `defer` scripts, no blocking work on load.
- Pick numbers that look intentional; align to the spacing scale; keep the red accent purposeful — highlights, CTAs, glows, active states — on a disciplined graphite base.
