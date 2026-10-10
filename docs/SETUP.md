# Vault — Store setup guide

Vault is a Shopify Online Store 2.0 theme built for trading-card stores: dark graphite + crimson,
holographic product cards, and choreographed animation powered by **Motion** (the library formerly
known as Framer Motion). This guide takes you from zip file to a fully dressed store.

---

## 1. Install the theme

**Option A — upload a zip (no tools needed)**
1. On your computer, run `npm install` once, then `npm run package`. This creates `dist/vault-theme.zip`.
2. In Shopify admin go to **Online Store → Themes → Add theme → Upload zip file** and pick that zip.
3. Click **Customize** on the uploaded theme to preview it before publishing.

**Option B — Shopify CLI (live preview while editing code)**
```bash
npm install -g @shopify/cli
shopify theme dev --path theme --store your-store.myshopify.com
```
To push it as a new unpublished theme: `shopify theme push --path theme --unpublished`.

---

## 2. Menus (Online Store → Navigation)

| Menu | Used by | Suggested structure |
|---|---|---|
| `main-menu` | Header, mobile menu, dock "Shop" | **Shop** › Pokémon, Magic: The Gathering, Yu-Gi-Oh!, One Piece, Lorcana, Sports Cards (each can have children like Graded / Raw singles / Sealed — 3 levels turns on the mega menu) · **Graded** › PSA, BGS, CGC · **Sealed** · **New Arrivals** · **Sell to Us** · **Journal** |
| `footer` | Footer "Help" column | Search, Shipping & protection, Returns, Grading guide, Contact, FAQ |

Mega-menu promo cards are set in **Customize → Header → Mega menu promo** blocks. Type the top-level
menu title (e.g. `Shop`) in *Menu item* so the promo shows inside that dropdown.

---

## 3. Card details: metafields and tags

The badges (grade slab label, rarity), the spec table on product pages and the "Verify cert" button come from
**product metafields** in the `custom` namespace. Create them in **Settings → Custom data → Products → Add definition**:

| Name | Namespace and key | Type | Example |
|---|---|---|---|
| Game | `custom.game` | Single line text | Pokémon |
| Set | `custom.set_name` | Single line text | Base Set |
| Card number | `custom.card_number` | Single line text | 4/102 |
| Rarity | `custom.rarity` | Single line text | Holo Rare |
| Grade | `custom.grade` | Single line text | PSA 10 |
| Grading company | `custom.grading_company` | Single line text | PSA |
| Cert number | `custom.cert_number` | Single line text | 84512397 |
| Condition | `custom.condition` | Single line text | Near Mint |
| Language | `custom.language` | Single line text | Japanese |
| Year | `custom.year` | Single line text (or integer) | 1999 |
| Population | `custom.population` | Single line text | 121 |

Prefer tags? Leave the metafields empty and tag products instead. Vault reads tags such as:
`rarity:Secret Rare` · `grade:PSA 10` · `grader:BGS` · `set:Base Set` · `number:4/102` · `condition:Near Mint` ·
`language:Japanese` · `year:1999` · `cert:84512397` · `game:Pokémon` · `pop:121` · `sealed`.

Rarity text maps to badge styles automatically: anything containing *secret, hyper, gold, special illustration, alt art*
gets the animated rainbow foil badge; *ultra, full art, ex, gx, vmax, vstar, mythic, starlight* gets the red glow; *holo,
foil, reverse* gets the holo outline; *rare* is gold, *uncommon* teal, *promo* violet, everything else grey.
Grades of 10 (or BGS 9.5+) glow as "gem mint". Cert numbers link to PSA, BGS, CGC, SGC or TAG verification pages
(turn off in **Theme settings → Collector data**).

The metafield namespace can be changed in **Theme settings → Collector data** if your store already uses a different one.

---

## 4. Filters on collection pages

Install Shopify's free **Search & Discovery** app and add filters under **Filters**:
Availability, Price, Product type, and the metafields above (Game, Grade, Rarity, Condition, Language).
Vault renders them automatically: a sticky sidebar on desktop, a swipeable bottom sheet on phones and tablets.

---

## 5. Product photos that look incredible

- Shoot or scan cards on a **dark or transparent background**. White backgrounds fight the dark theme.
- Use the trading card ratio **63 : 88** (e.g. 1260 × 1760 px). Slabs work too: pick *Portrait* in
  **Theme settings → Product cards → Image shape** if most of your catalogue is slabs.
- Upload the **back of the card / slab as the second image**. Cards show it on hover, and product pages get a
  **Flip** button that spins the card around.

---

## 6. Theme settings tour (Customize → Theme settings)

- **Colors:** five schemes ship with the theme: Graphite (default), Carbon (near-black), Steel (lighter grey),
  Crimson (red background) and Bone (light). Every section has a *Color scheme* picker.
- **Typography:** display font (Unbounded by default; Archivo Expanded, Chakra Petch, Space Grotesk, Syne, Oswald
  and Bebas Neue are also available) and body font, heading case and scale.
- **Animations:** on/off, intensity (subtle / standard / bold), page transitions, scroll progress bar, cursor glow,
  film grain. Visitors who set "reduce motion" on their device always get a calm, static version.
- **Product cards:** image shape and fit, holographic shine, 3D tilt, second image on hover, quick add, "New" badge
  window, low-stock threshold.
- **Cart:** drawer or page, free-shipping threshold (progress bar), order note, fly-to-cart animation,
  drawer recommendations collection.
- **Mobile:** app-style bottom navigation for phones.

---

## 7. Local preview (for developers)

```bash
npm install
npm run dev        # http://localhost:4173 — mock store, live reload
npm run shots      # screenshots of every page at phone / tablet / desktop sizes → dev/screenshots
npm run check      # Shopify Theme Check
```
`/__preview` shows the page at four device sizes side by side, `/__routes` lists every mock page and
`/__errors` lists any Liquid errors or missing translations.
