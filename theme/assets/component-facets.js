/*!
 * VAULT — component-facets.js
 * Live filtering & sorting for collection and search pages (snippets/facets*.liquid).
 *
 * <vault-facets data-section-id="…" data-base-url="/collections/x">   section controller
 *   form[data-facets-form="inline|drawer|sort"]   real GET forms (work without JS)
 *   [data-facets-swap="key"]                      regions refreshed from the re-rendered section
 *   a[data-facets-link]                           chips / clear links fetched in place
 *   [data-facets-live]                            polite live region for result counts
 * <price-range data-max="250">                    dual-thumb slider synced with the From/To inputs
 *
 * Flow: change → URLSearchParams from the form → Vault.fetchSection(id, url) → swap regions,
 * sync both forms in place (keeps accordions, focus and the drawer open) → history.pushState.
 * Checkboxes apply immediately; price inputs and sliders are debounced (400ms).
 */
(() => {
  'use strict';

  const DEBOUNCE = 400;
  const CACHE_MAX = 24;
  const motion = () => !!(window.Vault && window.Vault.motionOK && window.Vault.motionOK());
  const M = () => window.Vault && window.Vault.Motion;
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const escapeSel = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&'));

  /** Remove params that must never end up in the address bar or the next request. */
  const cleanParams = (search, { dropPage = false } = {}) => {
    const params = new URLSearchParams(search);
    params.delete('section_id');
    params.delete('sections');
    if (dropPage) params.delete('page');
    return params;
  };

  /* ------------------------------------------------------------------ *
   * <price-range>
   * The slider runs on a logarithmic scale (positions 0–1000): a store selling $4 singles and
   * $12,000 slabs still gets fine control at the low end. Values snap to "nice" prices.
   * Only the From/To number inputs are submitted; the sliders have no name.
   * ------------------------------------------------------------------ */
  const STEPS = 1000;
  const nicePrice = (v) => {
    if (v < 20) return Math.round(v);
    if (v < 100) return Math.round(v / 5) * 5;
    if (v < 1000) return Math.round(v / 10) * 10;
    if (v < 10000) return Math.round(v / 50) * 50;
    return Math.round(v / 100) * 100;
  };

  class PriceRange extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this.min = this.querySelector('[data-price-range="min"]');
      this.max = this.querySelector('[data-price-range="max"]');
      this.inMin = this.querySelector('[data-price-input="min"]');
      this.inMax = this.querySelector('[data-price-input="max"]');
      if (!this.inMin || !this.inMax) return;
      this._bound = true;
      this.limit = parseFloat(this.dataset.max) || 0;
      this.onInput = this.onInput.bind(this);
      this.onChange = this.onChange.bind(this);
      this.addEventListener('input', this.onInput);
      this.addEventListener('change', this.onChange);
      this.syncSliders();
      this.paint();
    }

    disconnectedCallback() {
      this.removeEventListener('input', this.onInput);
      this.removeEventListener('change', this.onChange);
      this._bound = false;
    }

    toPos(v) {
      if (!this.limit || v <= 0) return 0;
      if (v >= this.limit) return STEPS;
      return Math.round((STEPS * Math.log1p(v)) / Math.log1p(this.limit));
    }

    toVal(pos) {
      if (pos <= 0) return 0;
      if (pos >= STEPS) return this.limit;
      return Math.min(this.limit, nicePrice(Math.expm1((pos / STEPS) * Math.log1p(this.limit))));
    }

    clampValue(v, fallback) {
      if (v === '' || v === null || Number.isNaN(Number(v))) return fallback;
      return Math.min(this.limit, Math.max(0, Number(v)));
    }

    /** Position the thumbs from the submitted fields (initial render and typing). */
    syncSliders() {
      if (!this.min || !this.max) return;
      const lo = this.clampValue(this.inMin.value, 0);
      const hi = this.clampValue(this.inMax.value, this.limit);
      this.min.value = String(this.toPos(Math.min(lo, hi)));
      this.max.value = String(this.toPos(Math.max(lo, hi)));
      this.describe();
    }

    describe() {
      const money = (v) => (window.Vault && window.Vault.formatMoney ? window.Vault.formatMoney(Math.round(v * 100)) : String(v));
      this.min.setAttribute('aria-valuetext', money(this.toVal(Number(this.min.value))));
      this.max.setAttribute('aria-valuetext', money(this.toVal(Number(this.max.value))));
    }

    onInput(e) {
      const t = e.target;
      if (!this.min || !this.max) return;
      if (t === this.min || t === this.max) {
        let lo = Number(this.min.value);
        let hi = Number(this.max.value);
        if (lo > hi) {
          if (t === this.min) { lo = hi; this.min.value = String(lo); } else { hi = lo; this.max.value = String(hi); }
        }
        // Thumbs at the extremes mean "no limit" → leave the submitted field empty.
        const loVal = this.toVal(lo);
        const hiVal = this.toVal(hi);
        this.inMin.value = lo > 0 && loVal > 0 ? String(loVal) : '';
        this.inMax.value = hi < STEPS ? String(hiVal) : '';
        this.describe();
      } else if (t === this.inMin || t === this.inMax) {
        this.syncSliders();
      }
      this.paint(t);
    }

    onChange(e) {
      // Normalise typed values: clamp to the range and swap reversed bounds.
      if (e.target !== this.inMin && e.target !== this.inMax) return;
      const lo = this.inMin.value === '' ? null : this.clampValue(this.inMin.value, 0);
      const hi = this.inMax.value === '' ? null : this.clampValue(this.inMax.value, this.limit);
      if (lo !== null && hi !== null && lo > hi) {
        this.inMin.value = String(Math.floor(hi));
        this.inMax.value = String(Math.ceil(lo));
      } else {
        if (lo !== null) this.inMin.value = String(Math.floor(lo));
        if (hi !== null) this.inMax.value = String(Math.ceil(hi));
      }
      this.syncSliders();
      this.paint();
    }

    paint(active) {
      if (!this.min || !this.max || !this.limit) return;
      const lo = Number(this.min.value);
      const hi = Number(this.max.value);
      this.style.setProperty('--from', `${((lo / STEPS) * 100).toFixed(2)}%`);
      this.style.setProperty('--to', `${((hi / STEPS) * 100).toFixed(2)}%`);
      // Keep the min thumb grabbable when both thumbs meet at the right edge.
      const minFront = active === this.min || (active !== this.max && lo >= STEPS * 0.9);
      this.min.classList.toggle('is-front', minFront);
      this.max.classList.toggle('is-front', !minFront && active === this.max);
    }
  }
  if (!customElements.get('price-range')) customElements.define('price-range', PriceRange);

  /* ------------------------------------------------------------------ *
   * <vault-facets>
   * ------------------------------------------------------------------ */
  class VaultFacets extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      this.sectionId = this.dataset.sectionId;
      this.baseUrl = this.dataset.baseUrl || window.location.pathname;
      this.cache = new Map();
      this.token = 0;
      this.timer = null;
      this.pendingForm = null;
      this.live = this.querySelector('[data-facets-live]');
      this.drawer = this.querySelector('vault-drawer');

      this.onChange = this.onChange.bind(this);
      this.onInput = this.onInput.bind(this);
      this.onSubmit = this.onSubmit.bind(this);
      this.onClick = this.onClick.bind(this);
      this.onPop = this.onPop.bind(this);
      this.onDrawerClose = this.onDrawerClose.bind(this);

      this.addEventListener('change', this.onChange);
      this.addEventListener('input', this.onInput);
      this.addEventListener('submit', this.onSubmit);
      this.addEventListener('click', this.onClick);
      this.addEventListener('drawer:close', this.onDrawerClose);
      window.addEventListener('popstate', this.onPop);

      // Tag the server-rendered entry so "back" to the unfiltered page is handled in place.
      try {
        const state = { ...(window.history.state || {}), vaultFacets: this.sectionId };
        window.history.replaceState(state, '', window.location.href);
      } catch (_) { /* history unavailable (sandboxed preview) */ }
    }

    disconnectedCallback() {
      this.removeEventListener('change', this.onChange);
      this.removeEventListener('input', this.onInput);
      this.removeEventListener('submit', this.onSubmit);
      this.removeEventListener('click', this.onClick);
      this.removeEventListener('drawer:close', this.onDrawerClose);
      window.removeEventListener('popstate', this.onPop);
      clearTimeout(this.timer);
      this._bound = false;
    }

    /* ---------- events ---------- */
    formOf(target) {
      const form = target && target.form;
      return form && form.matches('[data-facets-form]') && this.contains(form) ? form : null;
    }

    onChange(e) {
      const t = e.target;
      const form = this.formOf(t);
      if (!form) return;
      if (t.matches('[data-price-range], [data-price-input]')) {
        this.schedule(form, DEBOUNCE);
      } else if (t.name === 'sort_by') {
        $$('[data-facets-sort]', this).forEach((sel) => { if (sel !== t) sel.value = t.value; });
        this.submit(form);
      } else if (t.type === 'checkbox') {
        this.submit(form);
      }
    }

    onInput(e) {
      const t = e.target;
      if (!t.matches('[data-price-range], [data-price-input]')) return;
      const form = this.formOf(t);
      if (form) this.schedule(form, DEBOUNCE);
    }

    onSubmit(e) {
      const form = e.target;
      if (!form.matches('[data-facets-form]') || !this.contains(form)) return;
      e.preventDefault();
      if (form.dataset.facetsForm === 'drawer') {
        // "Show N results": everything is already applied live — flush pending input and close.
        if (this.pendingForm) this.flush();
        if (this.drawer && typeof this.drawer.close === 'function') this.drawer.close();
        return;
      }
      this.submit(form);
    }

    onClick(e) {
      const link = e.target.closest('a[data-facets-link]');
      if (link && this.contains(link)) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        // A price field blurred by this click may have queued a submit — the link wins.
        clearTimeout(this.timer);
        this.pendingForm = null;
        const chip = link.closest('[data-chip-key]');
        if (chip) this.chipOut(chip);
        const url = new URL(link.getAttribute('href'), window.location.origin);
        this.render(cleanParams(url.search, { dropPage: true }), { source: link });
        return;
      }
      const more = e.target.closest('[data-show-more]');
      if (more && this.contains(more)) this.toggleMore(more);
    }

    onDrawerClose() {
      if (!this.changedWhileOpen) return;
      this.changedWhileOpen = false;
      this.revealResults();
    }

    onPop() {
      const here = new URL(window.location.href);
      const base = new URL(this.baseUrl, window.location.origin);
      if (here.pathname !== base.pathname) return;
      this.render(cleanParams(here.search), { push: false });
    }

    /* ---------- requests ---------- */
    schedule(form, delay) {
      clearTimeout(this.timer);
      this.pendingForm = form;
      this.timer = setTimeout(() => this.flush(), delay);
    }

    flush() {
      clearTimeout(this.timer);
      const form = this.pendingForm;
      this.pendingForm = null;
      if (form) this.submit(form);
    }

    submit(form) {
      clearTimeout(this.timer);
      this.pendingForm = null;
      this.render(this.paramsFrom(form), { source: form });
    }

    paramsFrom(form) {
      const params = new URLSearchParams();
      const sort = this.querySelector('[data-facets-sort]');
      const defaultSort = sort ? sort.dataset.default : '';
      new FormData(form).forEach((value, key) => {
        if (typeof value !== 'string') return;
        const v = value.trim();
        if (!v) return;
        if (key === 'sort_by' && v === defaultSort) return;
        params.append(key, v);
      });
      return params;
    }

    urlFor(params) {
      const qs = params.toString();
      return `${this.baseUrl}${qs ? `?${qs}` : ''}`;
    }

    async load(url) {
      if (this.cache.has(url)) return this.cache.get(url);
      const doc = await window.Vault.fetchSection(this.sectionId, url);
      this.cache.set(url, doc);
      if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value);
      return doc;
    }

    async render(params, { push = true, source = null } = {}) {
      const url = this.urlFor(params);
      // Redundant events (e.g. a price field's change on blur after it already applied) are no-ops.
      if (push && !this.inFlight && url === `${window.location.pathname}${window.location.search}`) return;
      const token = ++this.token;
      this.inFlight = true;
      this.setLoading(true);
      try {
        const doc = await this.load(url);
        if (token !== this.token || !this.isConnected) return;
        this.apply(doc, source);
        if (push) {
          try { window.history.pushState({ vaultFacets: this.sectionId }, '', url); } catch (_) { /* ignore */ }
        }
        this.announce();
      } catch (err) {
        if (token !== this.token) return;
        console.error('[Vault facets]', err);
        // The plain URL renders the same state server-side.
        window.location.assign(url);
      } finally {
        if (token === this.token) {
          this.inFlight = false;
          this.setLoading(false);
        }
      }
    }

    setLoading(on) {
      this.classList.toggle('is-loading', on);
      $$('[data-facets-results]', this).forEach((el) => {
        el.classList.toggle('is-loading', on);
        el.setAttribute('aria-busy', String(on));
      });
      $$('[data-facets-apply]', this).forEach((btn) => btn.classList.toggle('is-busy', on));
    }

    /* ---------- applying a response ---------- */
    apply(doc, source) {
      const fresh = doc.querySelector(`vault-facets[data-section-id="${escapeSel(this.sectionId)}"]`) || doc;
      const keys = new Set($$('[data-facets-swap]', this).map((el) => el.dataset.facetsSwap));

      keys.forEach((key) => {
        const current = $$(`[data-facets-swap="${key}"]`, this);
        const next = $$(`[data-facets-swap="${key}"]`, fresh);
        current.forEach((el, i) => {
          const src = next[i];
          if (!src) return;
          if (key === 'active') this.swapChips(el, src);
          else if (key === 'results') this.swapResults(el, src);
          else this.swapText(el, src, key);
        });
      });

      $$('form[data-facets-form]', this).forEach((form) => {
        const next = form.id ? fresh.querySelector(`#${escapeSel(form.id)}`) : null;
        if (next) this.syncForm(form, next, source);
      });

      $$('[data-facets-sort]', this).forEach((sel) => {
        const next = sel.id ? fresh.querySelector(`#${escapeSel(sel.id)}`) : null;
        if (next && document.activeElement !== sel) sel.value = next.value;
      });

      this.dispatchEvent(new CustomEvent('facets:updated', { bubbles: true }));
    }

    swapText(el, src, key) {
      const changed = el.innerHTML !== src.innerHTML;
      el.innerHTML = src.innerHTML;
      el.hidden = src.hidden;
      if (!changed || !motion() || el.hidden) return;
      const anim = M();
      if (key === 'filter-count') {
        anim.animate(el, { scale: [1, 1.35, 1] }, { duration: 0.45, ease: window.Vault.ease.back });
      } else if (key === 'count') {
        anim.animate(el, { opacity: [0.2, 1], y: [6, 0] }, { duration: 0.4, ease: window.Vault.ease.out });
      }
    }

    swapResults(el, src) {
      el.innerHTML = src.innerHTML;
      el.hidden = src.hidden;
      // Cards carry data-reveal: core reveals and staggers them as they are inserted.
      if (this.drawer && this.drawer.isOpen) {
        this.changedWhileOpen = true;
        return;
      }
      this.revealResults();
    }

    /** Bring the top of the results back into view when the shopper filtered from further down. */
    revealResults() {
      const layout = this.querySelector('.collection-layout') || this.querySelector('[data-facets-results]');
      if (!layout) return;
      // The toolbar's sticky top already accounts for a visible / hidden header.
      const toolbar = this.querySelector('[data-toolbar]');
      const stickyTop = toolbar ? parseFloat(getComputedStyle(toolbar).top) || 0 : 0;
      const offset = stickyTop + (toolbar ? toolbar.offsetHeight : 0) + 24;
      const top = layout.getBoundingClientRect().top;
      if (top < offset - 1) {
        window.scrollTo({ top: window.scrollY + top - offset, behavior: motion() ? 'smooth' : 'auto' });
      }
    }

    chipOut(chip) {
      if (chip.dataset.leaving) return;
      chip.dataset.leaving = 'true';
      if (motion()) {
        M().animate(chip, { opacity: 0, scale: 0.8, filter: 'blur(4px)' }, { duration: 0.22, ease: window.Vault.ease.in });
      } else {
        chip.style.opacity = '0.4';
      }
    }

    async swapChips(el, src) {
      const keyOf = (c) => c.dataset.chipKey;
      const before = $$('[data-chip-key]', el);
      const oldKeys = new Set(before.map(keyOf));
      const nextKeys = new Set($$('[data-chip-key]', src).map(keyOf));
      const leaving = before.filter((c) => !nextKeys.has(keyOf(c)) && !c.dataset.leaving);
      const markup = src.innerHTML;
      const hidden = src.hidden;

      if (motion() && leaving.length) {
        const anim = M();
        await Promise.allSettled(leaving.map((c) => anim.animate(
          c,
          { opacity: 0, scale: 0.8 },
          { duration: 0.2, ease: window.Vault.ease.in },
        )));
      }
      if (!el.isConnected) return;
      el.innerHTML = markup;
      el.hidden = hidden;
      if (!motion() || hidden) return;
      const added = $$('[data-chip-key]', el).filter((c) => !oldKeys.has(keyOf(c)));
      if (added.length) {
        const anim = M();
        anim.animate(
          added,
          { opacity: [0, 1], scale: [0.8, 1], y: [8, 0] },
          { type: 'spring', stiffness: 460, damping: 28, delay: anim.stagger(0.04) },
        );
      }
    }

    /** Update a form in place so open accordions, "show more", focus and typing survive. */
    syncForm(form, next, source) {
      const groups = $$('[data-filter-key]', form);
      const nextGroups = $$('[data-filter-key]', next);
      const sameShape = groups.length === nextGroups.length
        && groups.every((g, i) => g.dataset.filterKey === nextGroups[i].dataset.filterKey);
      if (!sameShape) {
        this.replaceForm(form, next);
        return;
      }
      groups.forEach((group, i) => this.syncGroup(group, nextGroups[i], source));
      const clears = $$('[data-facets-clear]', next);
      $$('[data-facets-clear]', form).forEach((a, i) => {
        if (!clears[i]) return;
        a.hidden = clears[i].hidden;
        a.setAttribute('href', clears[i].getAttribute('href'));
      });
      const hiddenNext = $$('input[type="hidden"]', next);
      $$('input[type="hidden"]', form).forEach((input, i) => {
        if (hiddenNext[i] && hiddenNext[i].name === input.name) input.value = hiddenNext[i].value;
      });
    }

    syncGroup(group, next, source) {
      const count = group.querySelector('[data-filter-count]');
      const nextCount = next.querySelector('[data-filter-count]');
      if (count && nextCount) {
        count.innerHTML = nextCount.innerHTML;
        count.hidden = nextCount.hidden;
      }
      const body = group.querySelector('[data-filter-body]');
      const nextBody = next.querySelector('[data-filter-body]');
      if (!body || !nextBody) return;

      if (group.dataset.filterType === 'price_range') {
        // Never yank the slider/inputs out from under the shopper — unless a chip / clear link
        // explicitly reset the filters.
        const fromLink = !!(source && source.matches && source.matches('a[data-facets-link]'));
        const busy = body.contains(document.activeElement) || (source && group.contains(source));
        if (!fromLink && (busy || this.pendingForm)) return;
        body.innerHTML = nextBody.innerHTML;
        return;
      }

      const inputs = $$('input[type="checkbox"]', body);
      const nextInputs = $$('input[type="checkbox"]', nextBody);
      const same = inputs.length === nextInputs.length
        && inputs.every((input, i) => input.name === nextInputs[i].name && input.value === nextInputs[i].value);
      if (!same) {
        const list = body.querySelector('[data-collapsible]');
        const expanded = !!(list && list.hasAttribute('data-expanded'));
        const focusId = body.contains(document.activeElement) ? document.activeElement.id : null;
        body.innerHTML = nextBody.innerHTML;
        if (expanded) {
          const btn = body.querySelector('[data-show-more]');
          if (btn) this.toggleMore(btn, true);
        }
        if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
        return;
      }
      inputs.forEach((input, i) => {
        const n = nextInputs[i];
        input.checked = n.hasAttribute('checked');
        input.disabled = n.hasAttribute('disabled');
        const row = input.closest('.facet-option');
        const nextRow = n.closest('.facet-option');
        if (row) row.classList.toggle('is-disabled', input.disabled);
        const c = row && row.querySelector('[data-value-count]');
        const nc = nextRow && nextRow.querySelector('[data-value-count]');
        if (c && nc && c.innerHTML !== nc.innerHTML) c.innerHTML = nc.innerHTML;
      });
    }

    replaceForm(form, next) {
      const known = new Set($$('[data-filter-key]', form).map((d) => d.dataset.filterKey));
      const open = new Set($$('details[data-filter-key][open]', form).map((d) => d.dataset.filterKey));
      const expanded = new Set($$('[data-filter-key]', form)
        .filter((d) => d.querySelector('[data-collapsible][data-expanded]'))
        .map((d) => d.dataset.filterKey));
      const focusId = form.contains(document.activeElement) ? document.activeElement.id : null;
      form.innerHTML = next.innerHTML;
      $$('details[data-filter-key]', form).forEach((d) => {
        const key = d.dataset.filterKey;
        if (known.has(key)) d.open = open.has(key);
        if (expanded.has(key)) {
          const btn = d.querySelector('[data-show-more]');
          if (btn) this.toggleMore(btn, true);
        }
      });
      if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    }

    toggleMore(btn, force) {
      const list = document.getElementById(btn.getAttribute('aria-controls'));
      if (!list) return;
      const expand = typeof force === 'boolean' ? force : btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(expand));
      list.toggleAttribute('data-expanded', expand);
      const label = btn.querySelector('[data-show-more-label]');
      if (label) label.textContent = expand ? btn.dataset.labelLess : btn.dataset.labelMore;
      if (expand && typeof force !== 'boolean' && motion()) {
        const items = $$('.facets__item--overflow', list);
        if (items.length) {
          const anim = M();
          anim.animate(items, { opacity: [0, 1], x: [-8, 0] }, { duration: 0.35, ease: window.Vault.ease.out, delay: anim.stagger(0.025) });
        }
      }
    }

    announce() {
      if (!this.live) return;
      const count = this.querySelector('[data-facets-swap="count"]');
      const text = count ? count.textContent.replace(/\s+/g, ' ').trim() : '';
      this.live.textContent = '';
      window.setTimeout(() => { this.live.textContent = text; }, 120);
    }
  }
  if (!customElements.get('vault-facets')) customElements.define('vault-facets', VaultFacets);
})();
