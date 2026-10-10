/*!
 * VAULT — section-product-recommendations.js
 * <product-recommendations data-url="/recommendations/products?section_id=…&product_id=…&limit=…&intent=…">
 * Loads Shopify's recommendations shortly before the section scrolls into view (Motion inView with a
 * generous margin), swaps in the server-rendered cards, and hides the section when there are none.
 */
(() => {
  'use strict';

  class ProductRecommendations extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      if (this.hasAttribute('data-performed') || !this.dataset.url) {
        if (!this.querySelector('[data-rec-item]')) this.empty();
        return;
      }
      const load = () => this.load();
      const M = window.Motion;
      if (M && typeof M.inView === 'function') {
        this.stopView = M.inView(this, () => { load(); }, { margin: '0px 0px 600px 0px' });
      } else if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
          if (entries.some((en) => en.isIntersecting)) load();
        }, { rootMargin: '0px 0px 600px 0px' });
        io.observe(this);
        this.stopView = () => io.disconnect();
      } else {
        load();
      }
    }

    disconnectedCallback() {
      this.stopView?.();
      this.ctrl?.abort();
    }

    async load() {
      if (this.loading) return;
      this.loading = true;
      this.stopView?.();
      this.stopView = null;
      this.ctrl = new AbortController();
      try {
        const res = await fetch(this.dataset.url, { signal: this.ctrl.signal, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        if (!res.ok) throw new Error(`Recommendations failed (${res.status})`);
        const text = await res.text();
        const doc = new DOMParser().parseFromString(text, 'text/html');
        const fresh = doc.querySelector('product-recommendations');
        if (!fresh || !fresh.querySelector('[data-rec-item]')) {
          this.empty();
          return;
        }
        this.innerHTML = fresh.innerHTML;
        this.setAttribute('data-performed', '');
        this.dispatchEvent(new CustomEvent('recommendations:loaded', { bubbles: true }));
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        this.empty();
      }
    }

    /* Nothing to show: hide for shoppers, explain in the theme editor. */
    empty() {
      const designMode = !!(window.theme && window.theme.designMode) || !!(window.Shopify && window.Shopify.designMode);
      const section = this.closest('.shopify-section') || this.closest('section');
      if (designMode) {
        const note = this.dataset.emptyNote;
        this.querySelector('.recs__skeleton')?.remove();
        if (note && !this.querySelector('.recs__empty')) {
          const p = document.createElement('p');
          p.className = 'recs__empty';
          p.textContent = note;
          this.appendChild(p);
        }
        return;
      }
      if (section) section.hidden = true;
    }
  }

  if (!customElements.get('product-recommendations')) customElements.define('product-recommendations', ProductRecommendations);
})();
