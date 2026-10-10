/*!
 * VAULT — section-collection-grid.js  (collection + search product grids)
 *
 * <collection-toolbar>  sticky glass toolbar: .is-stuck state under the header and a live
 *                       --toolbar-height on the section (offsets the sticky filter sidebar).
 * <grid-density>        per-viewer grid density (phones 1–2 · tablet 2–3 · desktop 3–5 columns),
 *                       remembered in localStorage and applied as html[data-grid-*] attributes.
 *                       Cards glide into their new slots (FLIP with Motion springs).
 * <load-more>           "Load more" button or infinite scroll: fetches the next page of the section
 *                       and appends each [data-append-target] group's items. The numbered
 *                       pagination stays in the markup as the no-JS fallback.
 */
(() => {
  'use strict';

  const html = document.documentElement;
  const V = () => window.Vault || {};
  const motion = () => !!(V().motionOK && V().motionOK());
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ------------------------------------------------------------------ *
   * <collection-toolbar>
   * ------------------------------------------------------------------ */
  class CollectionToolbar extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      this.host = this.closest('.section') || this.parentElement;
      this.sentinel = document.createElement('div');
      this.sentinel.className = 'collection-toolbar__sentinel';
      this.sentinel.setAttribute('aria-hidden', 'true');
      this.before(this.sentinel);

      this.measure = this.measure.bind(this);
      this.ro = new ResizeObserver(() => this.measure());
      this.ro.observe(this);
      this.measure();

      this.observe();
      this.onResize = V().debounce ? V().debounce(() => this.observe(true), 200) : () => this.observe(true);
      window.addEventListener('resize', this.onResize, { passive: true });
      // The sticky offset changes when the header hides/reveals (html.header-hidden): re-arm the observer.
      this.mo = new MutationObserver(() => this.observe());
      this.mo.observe(html, { attributes: true, attributeFilter: ['class'] });
    }

    disconnectedCallback() {
      this.ro?.disconnect();
      this.io?.disconnect();
      this.mo?.disconnect();
      window.removeEventListener('resize', this.onResize);
      this.sentinel?.remove();
      this._bound = false;
    }

    measure() {
      if (this.host) this.host.style.setProperty('--toolbar-height', `${Math.round(this.offsetHeight)}px`);
    }

    observe(force = false) {
      const hidden = html.classList.contains('header-hidden');
      if (!force && this.io && hidden === this.lastHidden) return;
      this.lastHidden = hidden;
      this.io?.disconnect();
      const header = hidden ? 0 : parseFloat(getComputedStyle(html).getPropertyValue('--header-height')) || 0;
      const offset = Math.round(header + 10);
      this.io = new IntersectionObserver(([entry]) => {
        this.classList.toggle('is-stuck', !entry.isIntersecting && entry.boundingClientRect.top < offset);
      }, { rootMargin: `-${offset}px 0px 0px 0px`, threshold: 0 });
      this.io.observe(this.sentinel);
    }
  }
  if (!customElements.get('collection-toolbar')) customElements.define('collection-toolbar', CollectionToolbar);

  /* ------------------------------------------------------------------ *
   * <grid-density>
   * ------------------------------------------------------------------ */
  const STORE_KEY = 'vault:grid-density';
  const BREAKPOINTS = ['mobile', 'tablet', 'desktop'];
  const LIMITS = { mobile: [1, 2], tablet: [2, 3], desktop: [3, 5] };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const readStore = () => {
    try {
      const value = JSON.parse(window.localStorage.getItem(STORE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch (_) {
      return {};
    }
  };
  const writeStore = (value) => {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(value)); } catch (_) { /* private mode */ }
  };
  const valid = (bp, n) => Number.isInteger(n) && n >= LIMITS[bp][0] && n <= LIMITS[bp][1];
  const applyToRoot = (state) => {
    BREAKPOINTS.forEach((bp) => {
      const n = parseInt(state[bp], 10);
      if (valid(bp, n)) html.dataset[`grid${cap(bp)}`] = String(n);
    });
  };
  const currentBreakpoint = () => {
    if (window.matchMedia('(min-width: 990px)').matches) return 'desktop';
    if (window.matchMedia('(min-width: 750px)').matches) return 'tablet';
    return 'mobile';
  };

  class GridDensity extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      this.state = readStore();
      applyToRoot(this.state);
      this.onClick = this.onClick.bind(this);
      this.onExternal = this.onExternal.bind(this);
      this.addEventListener('click', this.onClick);
      document.addEventListener('vault:grid-density', this.onExternal);
      this.sync();
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.onClick);
      document.removeEventListener('vault:grid-density', this.onExternal);
      this._bound = false;
    }

    value(bp) {
      const saved = parseInt(this.state[bp], 10);
      if (valid(bp, saved)) return saved;
      const fallback = parseInt(this.dataset[`default${cap(bp)}`], 10);
      const [lo, hi] = LIMITS[bp];
      return Math.min(hi, Math.max(lo, fallback || lo));
    }

    onClick(e) {
      const btn = e.target.closest('[data-density]');
      if (!btn || !this.contains(btn)) return;
      const [bp, raw] = btn.dataset.density.split(':');
      let n = parseInt(raw, 10);
      if (btn.hasAttribute('data-density-toggle')) n = this.value(bp) === 1 ? 2 : 1;
      if (!LIMITS[bp] || !valid(bp, n) || n === this.value(bp)) return;
      this.set(bp, n);
    }

    onExternal() {
      this.state = readStore();
      this.sync();
    }

    set(bp, n) {
      const grids = $$('.product-grid[data-density]');
      const animate = motion() && bp === currentBreakpoint();
      const first = animate ? this.snapshot(grids) : null;

      this.state = { ...readStore(), [bp]: n };
      writeStore(this.state);
      applyToRoot(this.state);
      this.sync();
      document.dispatchEvent(new CustomEvent('vault:grid-density', { detail: { breakpoint: bp, columns: n } }));

      if (first) this.play(first);
      // Let the browser pick sharper (or lighter) images for the new card width.
      requestAnimationFrame(() => grids.forEach((grid) => this.resizeImages(grid)));
    }

    sync() {
      $$('[data-density]', this).forEach((btn) => {
        const [bp, raw] = btn.dataset.density.split(':');
        const pressed = btn.hasAttribute('data-density-toggle')
          ? this.value(bp) === 1
          : this.value(bp) === parseInt(raw, 10);
        btn.setAttribute('aria-pressed', String(pressed));
      });
    }

    /** FLIP: remember where on-screen cards were before the column change… */
    snapshot(grids) {
      const map = new Map();
      grids.forEach((grid) => {
        $$(':scope > .product-grid__item', grid).forEach((item) => {
          const r = item.getBoundingClientRect();
          if (r.bottom > -200 && r.top < window.innerHeight + 200) map.set(item, r);
        });
      });
      return map;
    }

    /** …then spring them from their old slot to the new one. */
    play(first) {
      const M = V().Motion;
      if (!M) return;
      first.forEach((before, item) => {
        const after = item.getBoundingClientRect();
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        const s = before.width / Math.max(1, after.width);
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(1 - s) < 0.01) return;
        item.style.transformOrigin = '0 0';
        const anim = M.animate(
          item,
          { x: [dx, 0], y: [dy, 0], scale: [s, 1] },
          { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 },
        );
        Promise.resolve(anim).finally(() => {
          item.style.removeProperty('transform');
          item.style.removeProperty('transform-origin');
        });
      });
    }

    resizeImages(grid) {
      $$(':scope > .product-grid__item', grid).forEach((item) => {
        const w = Math.ceil(item.getBoundingClientRect().width);
        if (!w) return;
        $$('img[srcset]', item).forEach((img) => { img.sizes = `${w}px`; });
      });
    }
  }
  if (!customElements.get('grid-density')) customElements.define('grid-density', GridDensity);

  /* ------------------------------------------------------------------ *
   * <load-more data-mode="load_more|infinite" data-section-id data-next-url data-shown data-total>
   * ------------------------------------------------------------------ */
  const stripSectionParams = (url) => {
    try {
      const u = new URL(url, window.location.origin);
      u.searchParams.delete('section_id');
      u.searchParams.delete('sections');
      return `${u.pathname}${u.search}`;
    } catch (_) {
      return url;
    }
  };

  class LoadMore extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      this.sectionId = this.dataset.sectionId;
      this.nextUrl = this.dataset.nextUrl || '';
      this.onClick = this.onClick.bind(this);
      this.addEventListener('click', this.onClick);
      if (this.dataset.mode === 'infinite' && this.nextUrl) this.watch();
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.onClick);
      this.unwatch();
      this._bound = false;
    }

    get results() {
      return this.closest('[data-facets-results]') || this.parentElement;
    }

    onClick(e) {
      const btn = e.target.closest('[data-load-more-button]');
      if (!btn) return;
      // After a failed request the button behaves as the plain "next page" link it is.
      if (this.failed || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      this.load({ fromKeyboard: e.detail === 0 });
    }

    watch() {
      const M = V().Motion;
      const margin = '0px 0px 600px 0px';
      if (M && M.inView) {
        this.stopWatch = M.inView(this, () => { this.load(); }, { margin });
      } else if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
          if (entries.some((en) => en.isIntersecting)) this.load();
        }, { rootMargin: margin });
        io.observe(this);
        this.stopWatch = () => io.disconnect();
      }
    }

    unwatch() {
      if (this.stopWatch) this.stopWatch();
      this.stopWatch = null;
    }

    async load({ fromKeyboard = false } = {}) {
      if (this.loading || !this.nextUrl || !this.sectionId) return;
      this.loading = true;
      const btn = this.querySelector('[data-load-more-button]');
      btn?.classList.add('is-loading');
      btn?.setAttribute('aria-busy', 'true');
      const root = this.results;
      let firstNew = null;

      try {
        const doc = await V().fetchSection(this.sectionId, stripSectionParams(this.nextUrl));
        if (!this.isConnected) return;

        $$('[data-append-target]', doc).forEach((source) => {
          const key = source.dataset.appendTarget;
          const dest = root.querySelector(`[data-append-target="${key}"]`);
          if (!dest) return;
          const group = dest.closest('[data-append-group]');
          if (group && source.children.length) group.hidden = false;
          const items = Array.from(source.children);
          items.forEach((item) => dest.appendChild(document.importNode(item, true)));
          if (!firstNew && items.length) firstNew = dest.children[dest.children.length - items.length];
        });

        const next = doc.querySelector('load-more');
        this.update(next);
        if (fromKeyboard && firstNew) {
          const focusable = firstNew.querySelector('a[href], button:not([disabled])');
          focusable?.focus({ preventScroll: false });
        }
      } catch (err) {
        console.error('[Vault load more]', err);
        this.failed = true;
        this.unwatch();
        if (this.dataset.errorMessage && V().toast) V().toast(this.dataset.errorMessage, { type: 'error' });
        return;
      } finally {
        this.loading = false;
        btn?.classList.remove('is-loading');
        btn?.removeAttribute('aria-busy');
      }

      // Infinite mode: keep going while the end of the grid is still near the viewport.
      if (this.dataset.mode === 'infinite' && this.nextUrl) {
        requestAnimationFrame(() => {
          const r = this.getBoundingClientRect();
          if (r.top < window.innerHeight + 600) this.load();
        });
      }
    }

    update(next) {
      const shown = next ? parseInt(next.dataset.shown, 10) : parseInt(this.dataset.total, 10);
      const total = parseInt(this.dataset.total, 10) || shown;
      this.nextUrl = next ? next.dataset.nextUrl || '' : '';
      this.dataset.nextUrl = this.nextUrl;
      this.dataset.shown = String(shown);
      this.style.setProperty('--progress', String(total ? Math.min(1, shown / total) : 1));

      const status = this.querySelector('[data-load-more-status]');
      const nextStatus = next && next.querySelector('[data-load-more-status]');
      if (status && nextStatus) status.innerHTML = nextStatus.innerHTML;

      const btn = this.querySelector('[data-load-more-button]');
      const nextBtn = next && next.querySelector('[data-load-more-button]');
      if (btn && nextBtn) {
        btn.setAttribute('href', nextBtn.getAttribute('href'));
      } else if (btn) {
        // Last page: swap the button for the "all loaded" note.
        const done = next && next.querySelector('.load-more__done');
        if (done) btn.replaceWith(document.importNode(done, true));
        else btn.remove();
        this.unwatch();
      }

      const live = this.closest('vault-facets')?.querySelector('[data-facets-live]');
      if (live && status) {
        live.textContent = '';
        window.setTimeout(() => { live.textContent = status.textContent.trim(); }, 120);
      }
    }
  }
  if (!customElements.get('load-more')) customElements.define('load-more', LoadMore);
})();
