/*!
 * VAULT — component-product-form.js
 *
 * <product-info data-section-id data-product-url data-form-id data-update-url="true|false">
 *   Variant selection for main-product and featured-product:
 *   1. finds the variant from <script data-product-json> (falls back to the closest existing combination),
 *   2. keeps pill / option states (available · sold-out · missing) in sync,
 *   3. updates the URL (?variant=), the hidden id input and the gallery,
 *   4. re-renders the section through the Section Rendering API and swaps every
 *      [data-variant-swap="price|badges|inventory|buy|quantity|specs|sticky"] region (stale requests aborted).
 *   Also drives the sticky add-to-cart bar (shown while the main buy buttons are out of view).
 *   Emits `product:variant-change` { sectionId, variant } on document.
 *
 * <product-share data-url data-title data-copied data-copy-error>
 *   Copy link (with toast) + native share sheet on touch devices.
 */
(() => {
  'use strict';

  const V = () => window.Vault || null;
  const motionOK = () => !!(V() && typeof V().motionOK === 'function' && V().motionOK());
  const strings = () => (window.theme && window.theme.strings) || {};
  const html = document.documentElement;

  class ProductInfo extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      this.sectionId = this.dataset.sectionId;
      this.productUrl = this.dataset.productUrl;
      this.updateUrl = this.dataset.updateUrl === 'true';
      this.form = this.dataset.formId ? document.getElementById(this.dataset.formId) : null;
      try {
        const json = this.querySelector('[data-product-json]');
        this.product = json ? JSON.parse(json.textContent) : null;
      } catch (_) {
        this.product = null;
      }

      this.onChange = this.onChange.bind(this);
      this.onAdded = this.onAdded.bind(this);
      this.onBlockSelect = this.onBlockSelect.bind(this);
      this.addEventListener('change', this.onChange);
      this.addEventListener('cart:added', this.onAdded);
      document.addEventListener('shopify:block:select', this.onBlockSelect);

      this.initSticky();
    }

    disconnectedCallback() {
      this.abortCtrl?.abort();
      this.removeEventListener('change', this.onChange);
      this.removeEventListener('cart:added', this.onAdded);
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
      this.destroySticky();
    }

    /* ------------------------------------------------------------ *
     * Options → variant
     * ------------------------------------------------------------ */
    get groups() {
      return Array.from(this.querySelectorAll('[data-option-index]'))
        .sort((a, b) => Number(a.dataset.optionIndex) - Number(b.dataset.optionIndex));
    }

    getSelectedOptions() {
      return this.groups.map((group) => {
        const select = group.querySelector('select[data-option-input]');
        if (select) return select.value;
        const checked = group.querySelector('[data-option-input]:checked');
        return checked ? checked.value : null;
      });
    }

    setSelectedOptions(options) {
      this.groups.forEach((group) => {
        const value = options[Number(group.dataset.optionIndex)];
        const select = group.querySelector('select[data-option-input]');
        if (select) {
          select.value = value;
          return;
        }
        group.querySelectorAll('[data-option-input]').forEach((input) => {
          input.checked = input.value === value;
        });
      });
    }

    /* Named so it never shadows Element.prototype.matches(). */
    variantMatches(variant, options) {
      return variant.options.every((o, i) => o === options[i]);
    }

    findVariant(options) {
      if (!this.product) return null;
      return this.product.variants.find((v) => this.variantMatches(v, options)) || null;
    }

    /* Nearest real variant that keeps the option the visitor just picked (prefers available, then earlier options). */
    closestVariant(options, changedIndex) {
      if (!this.product) return null;
      const pool = this.product.variants.filter((v) => v.options[changedIndex] === options[changedIndex]);
      if (!pool.length) return null;
      const score = (v) => v.options.reduce((s, o, i) => s + (o === options[i] ? 10 - i : 0), 0) + (v.available ? 100 : 0);
      return pool.slice().sort((a, b) => score(b) - score(a))[0];
    }

    updateOptionStates(selected) {
      if (!this.product) return;
      const { variants } = this.product;
      const soldOut = this.dataset.strSoldOut || strings().soldOut || '';
      const unavailable = this.dataset.strUnavailable || strings().unavailable || '';
      const stateFor = (index, value) => {
        const combo = selected.slice();
        combo[index] = value;
        const hits = variants.filter((v) => v.options.every((o, i) => o === combo[i]));
        if (hits.some((v) => v.available)) return 'available';
        return hits.length ? 'sold-out' : 'missing';
      };

      this.groups.forEach((group) => {
        const index = Number(group.dataset.optionIndex);
        const current = group.querySelector('[data-option-current]');
        if (current) current.textContent = selected[index] || '';

        const select = group.querySelector('select[data-option-input]');
        if (select) {
          Array.from(select.options).forEach((opt) => {
            const state = stateFor(index, opt.value);
            opt.dataset.state = state;
            const suffix = state === 'sold-out' ? ` — ${soldOut}` : state === 'missing' ? ` — ${unavailable}` : '';
            opt.textContent = `${opt.value}${suffix}`;
          });
          return;
        }
        group.querySelectorAll('input[data-option-input]').forEach((input) => {
          const state = stateFor(index, input.value);
          const label = group.querySelector(`label[for="${input.id}"]`);
          if (!label) return;
          label.dataset.state = state;
          const sr = label.querySelector('[data-state-text]');
          if (sr) sr.textContent = state === 'sold-out' ? `, ${soldOut}` : state === 'missing' ? `, ${unavailable}` : '';
        });
      });
    }

    onChange(e) {
      const input = e.target.closest('[data-option-input]');
      if (!input || !this.product) return;
      const group = input.closest('[data-option-index]');
      const changedIndex = group ? Number(group.dataset.optionIndex) : 0;

      let selected = this.getSelectedOptions();
      let variant = this.findVariant(selected);
      if (!variant) {
        variant = this.closestVariant(selected, changedIndex);
        if (variant) {
          selected = variant.options.slice();
          this.setSelectedOptions(selected);
        }
      }
      this.updateOptionStates(selected);
      this.applyQuickState(variant);
      if (!variant) return;

      this.currentVariant = variant;
      const idInput = this.form && this.form.querySelector('input[name="id"]');
      if (idInput) {
        idInput.value = variant.id;
        idInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (this.updateUrl) {
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('variant', variant.id);
          window.history.replaceState(window.history.state, '', url.toString());
        } catch (_) { /* sandboxed preview */ }
      }
      const gallery = this.querySelector('product-gallery');
      if (gallery && variant.featured_media && typeof gallery.showMedia === 'function') {
        gallery.showMedia(variant.featured_media.id);
      }
      V()?.emit?.('product:variant-change', { sectionId: this.sectionId, variant });
      this.renderVariant(variant.id);
    }

    /* Instant feedback before the server render lands. */
    applyQuickState(variant) {
      const s = strings();
      const unavailable = !variant || !variant.available;
      this.classList.toggle('is-unavailable', unavailable);
      // Sold out / missing: lock the quantity stepper too (the dynamic checkout hides via CSS).
      this.querySelectorAll('[data-qty-fieldset]').forEach((set) => { set.disabled = unavailable; });
      this.atcButtons().forEach((btn) => {
        const label = btn.querySelector('[data-atc-label]');
        btn.disabled = !variant || !variant.available;
        if (!label) return;
        if (!variant) label.textContent = s.unavailable || label.textContent;
        else if (!variant.available) label.textContent = s.soldOut || label.textContent;
        else label.textContent = s.addToCart || label.textContent;
      });
    }

    atcButtons() {
      const list = Array.from(this.querySelectorAll('[data-atc]'));
      if (this.sticky) list.push(...this.sticky.querySelectorAll('[data-atc]'));
      return list;
    }

    /* ------------------------------------------------------------ *
     * Section Rendering swap
     * ------------------------------------------------------------ */
    async renderVariant(variantId) {
      const Vault = V();
      if (!Vault || !this.sectionId || !this.productUrl) return;
      this.abortCtrl?.abort();
      const ctrl = new AbortController();
      this.abortCtrl = ctrl;
      this.classList.add('is-updating');
      this.setAttribute('aria-busy', 'true');

      const url = new URL(this.productUrl, window.location.origin);
      url.searchParams.set('variant', variantId);
      url.searchParams.set('section_id', this.sectionId);
      try {
        // Same request as Vault.fetchSection(), with an AbortSignal so a newer selection cancels this one.
        const res = await fetch(url.toString(), { signal: ctrl.signal, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        if (!res.ok) throw new Error(`Section render failed (${res.status})`);
        const doc = Vault.parseHTML(await res.text());
        if (ctrl.signal.aborted) return;
        this.applySwaps(doc);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        // Main product page: fall back to a full navigation so price / stock are never stale.
        if (this.updateUrl) {
          const fallback = new URL(this.productUrl, window.location.origin);
          fallback.searchParams.set('variant', variantId);
          window.location.assign(fallback.toString());
        }
      } finally {
        if (this.abortCtrl === ctrl) {
          this.abortCtrl = null;
          this.classList.remove('is-updating');
          this.removeAttribute('aria-busy');
        }
      }
    }

    swapTargets() {
      const list = Array.from(this.querySelectorAll('[data-variant-swap]'))
        .filter((el) => el.closest('product-info') === this);
      if (this.sticky) list.push(...this.sticky.querySelectorAll('[data-variant-swap]'));
      return list;
    }

    applySwaps(doc) {
      const fresh = doc.querySelector(`product-info[data-section-id="${this.sectionId}"]`);
      if (!fresh) return;
      const sourcesByKey = new Map();
      fresh.querySelectorAll('[data-variant-swap]').forEach((el) => {
        if (el.closest('product-info') !== fresh) return;
        const key = el.dataset.variantSwap;
        if (!sourcesByKey.has(key)) sourcesByKey.set(key, []);
        sourcesByKey.get(key).push(el);
      });
      const seen = new Map();
      const changed = [];
      this.swapTargets().forEach((target) => {
        const key = target.dataset.variantSwap;
        const n = seen.get(key) || 0;
        seen.set(key, n + 1);
        const source = (sourcesByKey.get(key) || [])[n];
        if (!source) return;
        if (key === 'quantity') {
          this.syncQuantity(target, source);
          return;
        }
        if (target.innerHTML === source.innerHTML) return;
        target.innerHTML = source.innerHTML;
        changed.push(target);
        if (key === 'specs') {
          const block = target.closest('.pdp-specs');
          if (block) block.hidden = !target.textContent.trim();
        }
      });
      if (motionOK() && window.Motion && changed.length) {
        window.Motion.animate(changed, { opacity: [0.35, 1] }, { duration: 0.45, ease: [0.16, 1, 0.3, 1] });
      }
    }

    /* Keep what the visitor typed; only move the stock cap (and its hint). */
    syncQuantity(target, source) {
      const input = target.querySelector('input[name="quantity"]');
      const next = source.querySelector('input[name="quantity"]');
      if (input && next) {
        if (next.hasAttribute('max')) input.max = next.max;
        else input.removeAttribute('max');
        const max = input.max ? Number(input.max) : Infinity;
        if (Number(input.value) > max) {
          input.value = String(max);
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const hint = target.querySelector('[data-qty-hint]');
      const nextHint = source.querySelector('[data-qty-hint]');
      if (hint && nextHint) {
        hint.textContent = nextHint.textContent;
        hint.hidden = nextHint.hidden;
      }
    }

    /* ------------------------------------------------------------ *
     * Feedback after a successful add
     * ------------------------------------------------------------ */
    onAdded() {
      const added = this.dataset.strAdded;
      clearTimeout(this.addedTimer);
      const restore = this.atcButtons().map((btn) => {
        const label = btn.querySelector('[data-atc-label]');
        const original = label ? label.textContent : '';
        btn.classList.add('is-added');
        if (label && added) label.textContent = added;
        return () => {
          btn.classList.remove('is-added');
          if (label && label.textContent === added) label.textContent = original;
        };
      });
      this.addedTimer = setTimeout(() => restore.forEach((fn) => fn()), 1800);
    }

    /* ------------------------------------------------------------ *
     * Theme editor: selecting a collapsible tab opens it
     * ------------------------------------------------------------ */
    onBlockSelect(e) {
      if (!e.detail || e.detail.sectionId !== this.sectionId) return;
      const el = this.querySelector(`[data-block-id="${e.detail.blockId}"]`);
      if (el && el.tagName === 'DETAILS') el.open = true;
    }

    /* ------------------------------------------------------------ *
     * Sticky add-to-cart bar
     * ------------------------------------------------------------ */
    initSticky() {
      const bar = this.querySelector('[data-sticky-atc]');
      const buy = this.querySelector('[data-buy-block]');
      if (!bar) return;
      if (!buy || !this.form) {
        bar.remove();
        return;
      }
      this.sticky = bar;
      this.stickyShown = false;
      // Portal out of <main>'s stacking context so the bar always layers above page content.
      document.body.appendChild(bar);

      // 'mobile' mode = phones + tablets: narrow viewports, plus touch tablets in landscape (≥ 990px wide
      // but no hover / coarse pointer), where the long info column also pushes Add to cart below the fold.
      // Mirrors the CSS guard in section-main-product.css.
      const mqDesktop = window.matchMedia('(min-width: 990px)');
      const mqTouch = window.matchMedia('(hover: none), (pointer: coarse)');
      const enabled = () => bar.dataset.mode === 'all' || !mqDesktop.matches || mqTouch.matches;
      // "passed" = the buy buttons have scrolled above the viewport. A huge bottom root margin makes the
      // observed area run from the viewport top to far below the page, so the state flips exactly when
      // the block leaves past the top edge — even after a fast fling or an anchor jump over it.
      let passed = buy.getBoundingClientRect().bottom < 0;
      const margin = '0px 0px 100000px 0px';
      const update = () => {
        if (!enabled()) {
          this.setStickyVisible(false);
          html.classList.remove('has-pdp-sticky');
          return;
        }
        html.classList.add('has-pdp-sticky');
        this.setStickyVisible(passed);
      };

      const M = window.Motion;
      if (M && typeof M.inView === 'function') {
        this.stopStickyView = M.inView(buy, () => {
          passed = false;
          update();
          return () => {
            passed = buy.getBoundingClientRect().bottom < 0;
            update();
          };
        }, { margin });
      } else if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(([entry]) => {
          passed = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
          update();
        }, { rootMargin: margin });
        io.observe(buy);
        this.stopStickyView = () => io.disconnect();
      }

      this.onMq = () => update();
      mqDesktop.addEventListener?.('change', this.onMq);
      mqTouch.addEventListener?.('change', this.onMq);
      this.mqDesktop = mqDesktop;
      this.mqTouch = mqTouch;

      const measure = () => html.style.setProperty('--pdp-sticky-h', `${Math.round(bar.offsetHeight)}px`);
      measure();
      if ('ResizeObserver' in window) {
        this.stickyRO = new ResizeObserver(measure);
        this.stickyRO.observe(bar);
      }

      this.onStickyClick = (e) => {
        if (!e.target.closest('[data-sticky-top]')) return;
        const target = this.querySelector('product-gallery') || this;
        const top = target.getBoundingClientRect().top + window.scrollY - 24;
        window.scrollTo({ top: Math.max(0, top), behavior: motionOK() ? 'smooth' : 'auto' });
      };
      bar.addEventListener('click', this.onStickyClick);
      update();
    }

    setStickyVisible(show) {
      const bar = this.sticky;
      if (!bar || this.stickyShown === show) return;
      this.stickyShown = show;
      bar.classList.toggle('is-visible', show);
      bar.toggleAttribute('inert', !show);
      bar.setAttribute('aria-hidden', String(!show));
      html.classList.toggle('pdp-sticky-visible', show);
      const M = window.Motion;
      if (motionOK() && M) {
        this.stickyAnim?.stop?.();
        this.stickyAnim = show
          ? M.animate(bar, { y: ['110%', '0%'], opacity: [0, 1] }, { y: { type: 'spring', stiffness: 380, damping: 32, mass: 0.9 }, opacity: { duration: 0.2 } })
          : M.animate(bar, { y: '110%', opacity: 0 }, { duration: 0.28, ease: [0.55, 0, 1, 0.45] });
      }
    }

    destroySticky() {
      this.stopStickyView?.();
      this.stickyRO?.disconnect();
      this.mqDesktop?.removeEventListener?.('change', this.onMq);
      this.mqTouch?.removeEventListener?.('change', this.onMq);
      this.stickyAnim?.stop?.();
      if (this.sticky) {
        this.sticky.removeEventListener('click', this.onStickyClick);
        this.sticky.remove();
        this.sticky = null;
      }
      html.classList.remove('has-pdp-sticky', 'pdp-sticky-visible');
    }
  }
  if (!customElements.get('product-info')) customElements.define('product-info', ProductInfo);

  /* ------------------------------------------------------------------ *
   * <product-share>
   * ------------------------------------------------------------------ */
  const copyText = async (text) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* fall through */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
    return ok;
  };

  class ProductShare extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      const url = this.dataset.url || window.location.href;
      const title = this.dataset.title || document.title;
      const nativeBtn = this.querySelector('[data-share-native]');
      const copyBtn = this.querySelector('[data-share-copy]');
      const coarse = window.matchMedia('(pointer: coarse)').matches;

      if (nativeBtn && navigator.share && coarse) {
        nativeBtn.hidden = false;
        nativeBtn.addEventListener('click', async () => {
          try { await navigator.share({ title, url }); } catch (_) { /* dismissed */ }
        });
      }
      copyBtn?.addEventListener('click', async () => {
        const ok = await copyText(url);
        V()?.toast?.(ok ? this.dataset.copied : this.dataset.copyError, { type: ok ? 'success' : 'error' });
        if (ok) {
          copyBtn.classList.add('is-copied');
          clearTimeout(this.timer);
          this.timer = setTimeout(() => copyBtn.classList.remove('is-copied'), 1600);
        }
      });
    }
  }
  if (!customElements.get('product-share')) customElements.define('product-share', ProductShare);

  /* ------------------------------------------------------------------ *
   * <gift-card-recipient> (snippets/product-gift-card-recipient.liquid)
   * Fields are disabled while "send to a recipient" is off, so no recipient
   * properties are posted; the timezone offset lets Shopify honour "Send on".
   * ------------------------------------------------------------------ */
  class GiftCardRecipient extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this.toggle = this.querySelector('[data-gift-toggle]');
      if (!this.toggle) return;
      this._bound = true;
      const offset = this.querySelector('[data-gift-offset]');
      if (offset) offset.value = String(new Date().getTimezoneOffset());
      this.onToggle = () => this.sync(true);
      this.toggle.addEventListener('change', this.onToggle);
      this.sync(false);
    }

    disconnectedCallback() {
      this.toggle?.removeEventListener('change', this.onToggle);
      this._bound = false;
    }

    sync(animate) {
      const on = this.toggle.checked;
      this.classList.toggle('is-open', on);
      this.querySelectorAll('[data-gift-input]').forEach((input) => { input.disabled = !on; });
      const email = this.querySelector('input[type="email"][data-gift-input]');
      if (email) email.required = on;
      const fields = this.querySelector('[data-gift-fields]');
      if (on && animate && fields && motionOK() && window.Motion) {
        window.Motion.animate(fields, { opacity: [0, 1], y: [-8, 0] }, { duration: 0.35, ease: [0.16, 1, 0.3, 1] });
      }
      if (on && animate && email) email.focus({ preventScroll: true });
    }
  }
  if (!customElements.get('gift-card-recipient')) customElements.define('gift-card-recipient', GiftCardRecipient);
})();
