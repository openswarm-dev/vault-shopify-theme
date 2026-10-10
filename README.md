# Vault — Shopify theme for trading-card collectors

A premium Shopify Online Store 2.0 theme: dark graphite + crimson, holographic 3D product cards, and
choreographed animation powered by **Motion** (formerly Framer Motion). Built mobile-first and tuned for
phones and tablets.

| Path | What it is |
|---|---|
| `theme/` | The Shopify theme (this is what gets uploaded to Shopify) |
| `dev/` | Local storefront emulator with a demo catalogue, used for previews and screenshots |
| `docs/SETUP.md` | Store setup: installing, menus, card metafields/tags, filters, photo tips |
| `docs/ARCHITECTURE.md` | Developer contract: tokens, motion system, components, conventions |

## Preview locally

```bash
npm install
npm run dev          # http://localhost:4173  ·  /__preview shows phone, tablet and desktop side by side
```

## Install on Shopify

```bash
npm run package      # → dist/vault-theme.zip, upload in Online Store → Themes → Add theme
```
or with the Shopify CLI: `shopify theme dev --path theme --store <your-store>.myshopify.com`.

## Hosted preview

`render.yaml` deploys the demo storefront (`node dev/server.mjs`, `NODE_ENV=production`) to Render.
It uses mock products and a per-visitor in-memory cart; checkout is handled by Shopify on the real store.

## Quality checks

```bash
npm run check        # Shopify Theme Check
npm run shots        # screenshots of every page at phone / tablet / desktop sizes → dev/screenshots
```
