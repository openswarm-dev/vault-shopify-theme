/*!
 * VAULT — component-predictive-search.js
 * <predictive-search> inside the search palette (<vault-drawer id="SearchDrawer">).
 *  - Debounced (220ms) fetch of routes.predictive_search with section_id=predictive-search,
 *    AbortController for stale requests, small in-memory cache, skeleton while loading.
 *  - Combobox/listbox pattern: ArrowUp/Down move aria-activedescendant, Enter opens the active
 *    option, Esc clears the query first (a second Esc closes the palette).
 *  - Popular-search chips fill the input; results stagger in with Motion.
 * Without JS (or with suggestions disabled) the palette is a plain GET form to routes.search_url.
 */
(() => {
  'use strict';

  if (customElements.get('predictive-search')) return;

  const Vault = window.Vault || {};
  const motionOK = () => typeof Vault.motionOK === 'function' && Vault.motionOK();
  const ease = Vault.ease || { out: [0.16, 1, 0.3, 1] };
  const DEBOUNCE = 220;
  const CACHE_SIZE = 40;
  const RESOURCES = 'resources[type]=product,collection,query,article,page&resources[limit]=6&resources[limit_scope]=each';

  const debounce = (fn, wait) => {
    let t;
    const run = (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
    run.cancel = () => clearTimeout(t);
    return run;
  };

  const skeletonLine = (mod = '') => `<span class="skeleton ps-skeleton__line${mod ? ` ps-skeleton__line--${mod}` : ''}"></span>`;
  const skeletonRow = `<div class="ps-skeleton__row"><span class="skeleton ps-skeleton__thumb"></span><span class="ps-skeleton__lines">${skeletonLine('mid')}${skeletonLine('short')}</span></div>`;
  const SKELETON = `<div class="ps-skeleton" aria-hidden="true">`
    + `<div class="ps-skeleton__col">${skeletonLine('mid')}${skeletonLine()}${skeletonLine('short')}${skeletonLine('mid')}</div>`
    + `<div class="ps-skeleton__col">${skeletonRow.repeat(4)}</div>`
    + '</div>';

  class PredictiveSearch extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this.input = this.querySelector('[data-ps-input]');
      this.results = this.querySelector('[data-ps-results]');
      if (!this.input || !this.results) return;
      this._bound = true;

      this.form = this.input.form;
      this.body = this.querySelector('[data-ps-body]');
      this.clearBtn = this.querySelector('[data-ps-clear]');
      this.status = this.querySelector('[data-ps-status]');
      this.drawer = this.closest('vault-drawer');
      this.enabled = this.dataset.enabled === 'true' && 'AbortController' in window && 'DOMParser' in window;
      this.cache = new Map();
      this.options = [];
      this.activeIndex = -1;
      this.query = '';
      this.controller = null;
      this.searchSoon = debounce(() => this.search(), DEBOUNCE);

      this.onInput = () => {
        this.syncClear();
        if (!this.input.value.trim()) {
          this.searchSoon.cancel();
          this.reset();
        } else if (this.enabled) {
          this.searchSoon();
        }
      };
      this.onKeydown = (e) => this.handleKey(e);
      this.onClick = (e) => {
        const clearBtn = e.target.closest('[data-ps-clear]');
        if (clearBtn) {
          e.preventDefault();
          this.input.value = '';
          this.syncClear();
          this.reset();
          this.input.focus();
          return;
        }
        const chip = e.target.closest('[data-ps-chip]');
        if (chip && this.enabled) {
          e.preventDefault();
          this.input.value = chip.dataset.psChip || chip.textContent.trim();
          this.syncClear();
          this.input.focus();
          this.searchSoon.cancel();
          this.search();
        }
      };
      this.onSubmit = (e) => {
        if (this.input.value.trim()) return;
        e.preventDefault();
        this.input.focus();
      };
      this.onDrawerOpen = () => {
        requestAnimationFrame(() => {
          if (this.input.value) this.input.select();
        });
        if (this.enabled && this.input.value.trim() && !this.hasAttribute('data-has-results')) this.search();
      };
      this.onDrawerClose = () => {
        this.searchSoon.cancel();
        if (this.controller) this.controller.abort();
        this.setActive(-1);
      };

      this.input.addEventListener('input', this.onInput);
      this.input.addEventListener('keydown', this.onKeydown);
      this.addEventListener('click', this.onClick);
      if (this.form) this.form.addEventListener('submit', this.onSubmit);
      if (this.drawer) {
        this.drawer.addEventListener('drawer:open', this.onDrawerOpen);
        this.drawer.addEventListener('drawer:close', this.onDrawerClose);
      }
      this.syncClear();
    }

    disconnectedCallback() {
      if (!this._bound) return;
      this.input.removeEventListener('input', this.onInput);
      this.input.removeEventListener('keydown', this.onKeydown);
      this.removeEventListener('click', this.onClick);
      if (this.form) this.form.removeEventListener('submit', this.onSubmit);
      if (this.drawer) {
        this.drawer.removeEventListener('drawer:open', this.onDrawerOpen);
        this.drawer.removeEventListener('drawer:close', this.onDrawerClose);
      }
      this.searchSoon.cancel();
      if (this.controller) this.controller.abort();
      this._bound = false;
    }

    syncClear() {
      if (this.clearBtn) this.clearBtn.hidden = !this.input.value;
    }

    async search() {
      const q = this.input.value.trim();
      if (!q) {
        this.reset();
        return;
      }
      const key = q.toLowerCase();
      if (key === this.query && this.hasAttribute('data-has-results') && !this.loading) return;
      this.query = key;

      if (this.cache.has(key)) {
        if (this.controller) this.controller.abort();
        this.render(this.cache.get(key));
        return;
      }

      if (this.controller) this.controller.abort();
      const controller = new AbortController();
      this.controller = controller;
      this.setLoading(true);

      const base = (window.routes && window.routes.predictive_search) || '/search/suggest';
      const url = `${base}?q=${encodeURIComponent(q)}&section_id=predictive-search&${RESOURCES}`;
      try {
        const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/html' } });
        if (!res.ok) throw new Error(`Predictive search failed (${res.status})`);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const node = doc.querySelector('[data-ps-results-inner]');
        const markup = node ? node.outerHTML : '';
        this.cache.set(key, markup);
        if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value);
        if (controller !== this.controller || this.input.value.trim().toLowerCase() !== key) return;
        this.render(markup);
      } catch (err) {
        if (err.name === 'AbortError') return;
        if (controller === this.controller) {
          // Suggestions are an enhancement: fall back to the idle palette; Enter still searches.
          this.query = '';
          this.clearResults();
        }
      } finally {
        if (controller === this.controller) this.controller = null;
      }
    }

    setLoading(on) {
      this.loading = on;
      if (on) {
        this.results.setAttribute('aria-busy', 'true');
        if (!this.hasAttribute('data-has-results')) {
          this.results.innerHTML = SKELETON;
          this.setAttribute('data-has-results', '');
          this.showingSkeleton = true;
        }
      } else {
        this.results.removeAttribute('aria-busy');
      }
    }

    render(markup) {
      const first = this.showingSkeleton || !this.hasAttribute('data-has-results');
      this.setLoading(false);
      this.showingSkeleton = false;
      this.results.innerHTML = markup;
      this.toggleAttribute('data-has-results', !!markup);
      this.options = Array.from(this.results.querySelectorAll('[role="option"]'));
      this.activeIndex = -1;
      this.input.removeAttribute('aria-activedescendant');
      this.input.setAttribute('aria-expanded', this.options.length ? 'true' : 'false');
      const count = this.results.querySelector('[data-ps-count]');
      this.announce(count ? count.textContent.trim() : '');
      if (this.body) this.body.scrollTop = 0;

      if (!motionOK()) return;
      const M = Vault.Motion;
      if (first) {
        const items = Array.from(this.results.querySelectorAll('[data-ps-item]')).slice(0, 18);
        if (!items.length) return;
        const anim = M.animate(items, { opacity: [0, 1], y: [10, 0] }, { duration: 0.42, ease: ease.out, delay: M.stagger(0.03) });
        Promise.resolve(anim).then(() => items.forEach((el) => {
          el.style.removeProperty('opacity');
          el.style.removeProperty('transform');
        }), () => {});
      } else {
        M.animate(this.results, { opacity: [0.55, 1] }, { duration: 0.2, ease: ease.out });
      }
    }

    reset() {
      if (this.controller) {
        this.controller.abort();
        this.controller = null;
      }
      this.query = '';
      this.clearResults();
    }

    clearResults() {
      this.loading = false;
      this.showingSkeleton = false;
      this.results.innerHTML = '';
      this.results.removeAttribute('aria-busy');
      this.removeAttribute('data-has-results');
      this.options = [];
      this.activeIndex = -1;
      this.input.removeAttribute('aria-activedescendant');
      if (this.enabled) this.input.setAttribute('aria-expanded', 'false');
      this.announce('');
    }

    announce(text) {
      if (this.status) this.status.textContent = text;
    }

    setActive(index) {
      this.options.forEach((option, i) => option.setAttribute('aria-selected', i === index ? 'true' : 'false'));
      this.activeIndex = index;
      if (index < 0 || !this.options[index]) {
        this.input.removeAttribute('aria-activedescendant');
        return;
      }
      const option = this.options[index];
      this.input.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    }

    handleKey(e) {
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowUp': {
          if (!this.options.length) return;
          e.preventDefault();
          const last = this.options.length - 1;
          let next = this.activeIndex + (e.key === 'ArrowDown' ? 1 : -1);
          if (next > last) next = -1;
          if (next < -1) next = last;
          this.setActive(next);
          break;
        }
        case 'Enter': {
          const option = this.options[this.activeIndex];
          if (!option) return;
          e.preventDefault();
          const target = option.querySelector('a[href], button');
          if (target) target.click();
          break;
        }
        case 'Escape': {
          if (!this.input.value) return;
          // First Esc clears the query; the next one closes the palette.
          e.preventDefault();
          e.stopPropagation();
          this.input.value = '';
          this.syncClear();
          this.reset();
          break;
        }
        default:
      }
    }
  }

  customElements.define('predictive-search', PredictiveSearch);
})();
