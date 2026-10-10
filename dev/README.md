# Vault local preview (`dev/`)

A Shopify Online Store 2.0 storefront emulator for `./theme`, built on **liquidjs**, plus a Playwright
screenshot/QA runner. Use it to render every template at phone, tablet and desktop sizes and catch Liquid
errors, broken layouts and console errors **before** uploading to Shopify.

```
npm run dev                      # node dev/server.mjs → http://localhost:4173  (PORT=xxxx to change)
npm run shots                    # every route × phone, tablet, tabletLandscape, desktop → dev/screenshots
npm run shots -- --routes /,/cart --viewports phone,desktop
```

The server has no build step. Theme edits are picked up immediately (caches clear on every change under
`./theme`) and open pages live-reload: CSS-only changes swap stylesheets in place, everything else reloads.
Edits under `dev/` need a server restart.

## Dev pages

| URL | What it does |
|---|---|
| `/__preview?path=/products/x` | Side-by-side scaled iframes: phone 390×844, tablet 820×1180, tablet landscape 1180×820, desktop 1440×900. Path box, scale slider, "sync navigation" (clicking inside one frame moves them all). |
| `/__routes` | Every routable URL in the mock store (HTML in a browser, JSON with `?format=json` — the screenshot runner uses this). |
| `/__errors` | JSON ring buffer: `liquid` (render and syntax errors), `translations` (missing keys), `filters` (unknown filters), `assets` (missing assets, sections, templates or groups), `server`. Each entry has file, line, count and the URLs it happened on. `?clear=1` (or `DELETE`) empties it. |
| `/__sections` | Lists every section file. `/__section/<name>` renders one section inside the layout using its first preset (`?preset=1` picks another one, `?product=<handle>` and `?collection=<handle>` set the page context). |
| `/__status` | Health check. |
| `/__font/<handle>.woff2` | Stand-in for Shopify's font CDN. `font_url` / `font_face` on `font_picker` settings point here; the file is fetched once from Google Fonts (latin subset) and cached in memory. Offline it answers 404 and the page falls back to the stack's generic family. |
| `/__livereload` | Server-sent events stream (`reload` / `css`). The client script is injected before `</body>`. It does not run inside iframes or screenshot runs. |

Every HTML response carries `X-Vault-Liquid-Errors: <n>` and `X-Vault-Template: templates/x.json`, so you
can check a page with curl: `curl -sI localhost:4173/cart`.

### Errors never crash the server

A failing tag or output is replaced by a red box like
`Liquid error in sections/main-product.liquid line 42: …` and the rest of the page keeps rendering, as
Shopify does. Syntax errors replace the whole file (`Liquid syntax error in …`), and a missing snippet
shows `Could not find asset snippets/x.liquid`. A missing section type, template, group or layout gets
its own box. Everything is logged to the terminal and recorded in `/__errors`.

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `4173` | Must match `.claude/launch.json`. |
| `VAULT_FIXTURES` | off | `1` lets `dev/fixtures/{templates,sections}` fill gaps the theme does not cover yet (for example a temporary `index.json`). Theme files always win. `"__preset": 0` in a fixture section entry copies that section's preset settings and blocks. `/pages/about?view=dev-errors` renders deliberately broken fixtures, which shows that error reporting works. |
| `SHOP_TIMEZONE` | `America/New_York` | Timezone for `date`. |
| `LIQUID_GREEDY` | `true` | Whitespace control. Ruby Liquid strips all whitespace, newlines included, next to `{%-`/`-%}`. That is liquidjs' greedy mode. |
| `VAULT_LOG_REQUESTS` | off | Log every request with timing. |

## Screenshot runner (`dev/screenshot.mjs`)

It uses `playwright-core` with the locally installed Edge (falling back to Chrome) in headless mode. For each route × viewport it:

1. Loads the page (`networkidle`, 45 s timeout).
2. Scrolls to the bottom in steps so `inView` reveals fire.
3. Waits 800 ms, scrolls back to the top and waits 1.2 s. It also gives reveals that are still running up to 4 s more.
4. Saves a full-page PNG to `<out>/<viewport>/<route-slug>.png`.
5. Audits the page:
   - console errors and warnings, uncaught page errors, and failed requests (≥ 400; Google Fonts and `/__font/` are ignored)
   - Liquid error boxes and `translation missing` occurrences
   - **horizontal overflow**: `scrollWidth > innerWidth + 1`, with the 8 outermost offending elements (selector path and how far past the edge they go). If overflow is hidden by `overflow-x` on html/body, `hiddenOffenders` lists the content being clipped.
   - **stuck reveals**: `[data-reveal]` elements that were actually in view, clipped like an IntersectionObserver would clip them, but never got `.is-revealed`. Only checked when `html.motion-ok` is set.
   - text with effective opacity 0 inside the first viewport
   - tap targets smaller than 40×40 on touch viewports. Visible `a`, `button`, `input`, `select` and `summary` elements are checked. Inline links in running text and checkboxes with large labels are exempt.
   - images without `alt`, and the number of `<h1>` elements

| Flag | Default |
|---|---|
| `--base` | `http://localhost:4173` |
| `--routes /,/cart` | every route from `/__routes` |
| `--viewports` | `phone,tablet,tabletLandscape,desktop` (also `small` = 320×640) |
| `--out` | `dev/screenshots` (git-ignored) |
| `--reduced-motion` | off |
| `--no-full` | full-page shots are the default |
| `--start-server` | spawns `dev/server.mjs` if nothing answers on `--base`, and stops it at the end |
| `--concurrency` | `2` pages in parallel |
| `--strict` | exit code 1 if any page has errors, overflow or Liquid errors |
| `--browser <path>` | overrides the Edge/Chrome lookup (or set `CHROME_PATH`) |

Viewports: phone 390×844 (mobile, touch, DPR 2), small 320×640 (mobile, touch, DPR 2), tablet 820×1180
(touch), tabletLandscape 1180×820 (touch), desktop 1440×900.

The runner writes `<out>/report.json` (one entry per route × viewport, plus a snapshot of `/__errors`) and
prints a table: `errs` = console + page errors + failed requests + Liquid boxes, `ovfl` = px of horizontal
scroll, `stuck` = stuck reveals, `taps` = small tap targets, `i18n` = missing translations.

> Git Bash rewrites arguments that start with `/` (`/cart` → `C:/Program Files/Git/cart`). The runner undoes
> this, but `MSYS_NO_PATHCONV=1` or PowerShell avoids it altogether.

## How routing and rendering work

| URL | Template | Objects |
|---|---|---|
| `/` | `index` | — |
| `/collections` | `list-collections` | `collections` (paginate-able) |
| `/collections/:handle[/:tag+tag]` | `collection` | `collection` (filtered, sorted), `current_tags` |
| `/collections/vendors?q=` · `/collections/types?q=` | `collection` | virtual collection |
| `/collections/:c/products/:p` · `/products/:handle[?variant=]` | `product` | `product` (`selected_variant`, …), `collection` |
| `/search?q=&type=&filter.*&sort_by=` | `search` | `search` |
| `/cart` | `cart` | `cart` |
| `/pages/:handle` | `page.<handle>` if the file exists, else `page` | `page` |
| `/blogs/:blog[/tagged/:tag]` · `/blogs/:blog/:article` | `blog` / `article` | `blog`, `article`, `current_tags` |
| `/account/login`, `/register`, `/activate`, `/reset` | `customers/*` | — |
| `/account`, `/account/orders/:id`, `/account/addresses` | `customers/*` | `customer` (anonymous visitors are redirected to login) |
| `/password` | `password` (layout `password`) | — |
| `/gift_card`, `/gift_cards/:code` | `gift_card.liquid` | `gift_card`, `recipient` |
| `/policies/:handle` | built-in page | — |
| anything else | `404` (status 404) | — |

- `?view=x` picks `<template>.x.json` when it exists.
- **JSON templates**: each section in `order` is rendered with `section = { id: "template--vault__<key>", settings, blocks, block_order, index, location }` and wrapped in `<div id="shopify-section-template--vault__<key>" class="shopify-section">`. The schema's `tag`/`class` are honoured, and `disabled` sections and blocks are skipped.
- **How settings resolve**: schema defaults are merged with the template values and then resolved by type. `collection`/`product` take a handle and give a drop; `collection_list`/`product_list` give arrays; `image_picker` gives an image (any string becomes mock art); `link_list` gives a menu; `url` turns `shopify://collections/x` into `/collections/x`; `color` gives a Color drop; `color_scheme` gives the id; `video_url` gives `{id, type, url}`; `font_picker` gives a font drop; `page`, `blog` and `article` give drops.
- **Section groups** (`{% sections 'header-group' %}`) read `sections/<group>.json`. Ids are `sections--vault__<key>` and the wrapper class is `shopify-section shopify-section-group-<group>`.
- **Static sections** (`{% section 'x' %}`) use `settings_data.json → current.sections.x`, falling back to the schema `default`.
- Layout comes from the JSON template's `layout` key or `{% layout %}` in Liquid templates, defaulting to `theme` (or `password` on `/password`).
- **Section Rendering API**: `?section_id=<id>` returns just that section's wrapper HTML and `?sections=a,b` returns a JSON map (a missing id gives `null`). The id can be `template--vault__<key>` (current template), `sections--vault__<key>` (any group) or a section filename such as `cart-drawer`, `cart-icon-bubble` or `predictive-search`.

### Cart and storefront APIs

- `POST /cart/add(.js)` accepts JSON `{items:[…]}` or `{id, quantity, properties}`, form-encoded data or multipart `FormData` (`properties[...]`, `items[0][id]`). `POST /cart/change(.js)` takes `id` (a variant id or line key) or `line`, plus `quantity`. Also: `POST /cart/update(.js)` (`updates` as a map or array, `note`, `attributes`), `POST /cart/clear(.js)` and `GET /cart.js`. The `.js` endpoints accept `sections` and `sections_url` and return the rendered `sections` map. Inventory is enforced with `422 {status, message:"Cart Error", description:"You can only add N of this item to your cart."}`. Non-JS posts redirect to `/cart`, and `POST /cart` with `checkout` goes to a placeholder checkout page.
- `GET /products/<handle>.js` returns the AJAX product JSON.
- `GET /search/suggest?q=&section_id=predictive-search` renders the section with `predictive_search`. `/search/suggest.json` returns JSON.
- `GET /recommendations/products?product_id=&section_id=&limit=&intent=` renders the section with `recommendations`. `.json` returns JSON.
- **Forms**:
  - `POST /contact` redirects back with `?contact_posted=true` (or `customer_posted=true` for newsletters), so `form.posted_successfully?` is true. If the email is missing, the page re-renders with `form.errors`.
  - `POST /account/login` with any email and password sets a `vault_customer` cookie. `/account/logout` clears it.
  - Add `?customer=1` to any URL to render it logged in without the cookie.

## Mock store (`dev/mock/`)

- **Products (33)**, all with fictional card names, players and sets:
  - 12 graded slabs (PSA/BGS/CGC/SGC/TAG), including `base-set-holo-dragon-psa-10`
  - 11 raw singles with `Condition` (Near Mint / Lightly Played / Moderately Played) × optional `Language` (English / Japanese) variants, each with its own price and inventory
  - 6 sealed products (`type: "Sealed"`)
  - 4 supplies (`type: "Supplies"`), including sleeves with colour variants and their own media
  - The set includes sold-out items, sale items (`compare_at_price`), products created in the last 1–4 days (badged "New"), and quantity-1/2 stock (badged "low stock").
- **Collector data**: about half the cards store it in `metafields.custom.*` (`{value, type}`); the rest use tags like `rarity:Secret Rare`, `grade:PSA 10`, `set:…`, `number:…`, `game:…`, `cert:…`, `year:…`, `language:…`, `pop:…`, `grader:…`. Every product also has plain tags (`graded`, `raw`, `sealed`, `supplies`, the grader name, `vintage`, …), so tag URLs like `/collections/pokemon/graded` work.
- **Collections**: all, new-arrivals, graded-slabs, raw-singles, sealed, supplies, pokemon, magic-the-gathering, yu-gi-oh, one-piece, lorcana, sports-cards, vintage.
- **Storefront filters**: Availability, Price, Product type, Game, Grade and Rarity, with facet counts, `url_to_add`/`url_to_remove` and every Shopify `sort_by` option.
- **Menus**: `main-menu` (Shop ▸ games ▸ Graded/Raw/Sealed, Graded ▸ PSA/BGS/CGC, Sealed, New Arrivals, Sell to Us, Journal), `footer` and `footer-shop`. `active`, `current` and `child_active` follow the URL.
- **Pages**: about, contact, shipping, faq, sell-to-us, grading-guide. **Blog**: `news` ("Journal") with 6 articles.
- **Customer**: Jordan Reyes, with 3 orders, 2 addresses and tags. Also a gift card and policies.
- **Art (`dev/mock/art.mjs`)**: deterministic procedural SVGs served from `/mock/img/<name>.svg`. Kinds are card fronts, card backs, graded slabs (front and back, red/white labels), sealed boxes/packs/tins, supplies, collection banners, blog scenes and avatars. Any unknown name renders a scene, and `image_picker` strings map onto it. `image_url` returns protocol-relative URLs (`//localhost:4173/mock/img/…?width=600`) like Shopify's CDN.

## Liquid surface

**Tags:**
- From liquidjs: everything in ARCHITECTURE §12, including `render` with `with`/`for`/`as`, `{% # %}` comments and `#` lines inside `{% liquid %}`.
- Added here: `section`, `sections`, `schema`, `style`, `stylesheet`, `javascript`, `form` (all 15 types, extra attributes, a `form` object inside), `paginate` (works on any array path and supports `window_size`) and `layout`.
- `forloop.parentloop` is patched in.
- `content_for` deliberately errors.

**Filters:** everything in ARCHITECTURE §12, plus `payment_button`, `font_modify`, `color_to_hsl`/`hex`, `color_saturate`/`desaturate`, `color_contrast`, `item_count_for_variant`, `line_items_for` and `metafield_text`. Unknown filters pass the value through and are reported both when a file loads (a static scan, so unexecuted branches count too) and when they run.

## Known gaps vs real Shopify

- Only one in-memory cart per server process (no sessions). Discounts, selling plans, quantity rules, markets and currency conversion are not modelled.
- `t` uses only `en.default.json`. Schema translations (`t:` keys) and the `_html` escaping rules are not applied. Shopify-provided default keys are not built in either, so anything missing shows as `translation missing`.
- Search is a simple all-words match. Facet counts for the Game, Grade and Rarity filters use the mock collector data (metafield or tag).
- Fonts load from Google Fonts. `font_face`/`font_url` are stubs. `shopify_asset_url` serves stubs for `vendor/qrcode.js`, `shopify_common.js` and payment icons only.
- No theme editor: `request.design_mode` is always false and `shopify:*` editor events never fire. `block.shopify_attributes` still outputs a `data-shopify-editor-block` attribute so you can see where it goes.
- `{% render %}` isolation follows liquidjs: snippets see globals (`settings`, `product`, `cart`, …) but not the parent's variables, `section` or `block`, as on Shopify. Rendering limits and Shopify's per-page Liquid resource limits are not enforced.
- `image_url` ignores `crop` and `format`. The mock SVGs scale perfectly, so check real photo cropping on Shopify.
- Customer and contact form posts never send anything. Address create/edit/delete simply redirects.
- Shopify runs Theme Check-style validation on upload. Run `npm run check` for that; this server does not validate schemas beyond parsing them.
