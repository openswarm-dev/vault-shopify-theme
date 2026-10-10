/*!
 * VAULT — <featured-collection> tabs
 * Markup: sections/featured-collection.liquid
 *   <featured-collection [data-link-auto]>
 *     [data-fc-scroller] > [data-fc-tablist][role=tablist] > [data-fc-indicator] + button[data-fc-tab][role=tab]…
 *     [data-fc-panel][role=tabpanel][data-url]…   (all but the first carry `hidden`)
 *   </featured-collection>
 * - Springy indicator that follows the active tab (Motion), instant when motion is off.
 * - WAI-ARIA tabs keyboard model with automatic activation: ←/→ wrap, Home/End.
 * - Panel swap: outgoing panel fades down, incoming cards rise in with a stagger.
 * - Theme editor: shopify:block:select opens that block's tab.
 * - "View all" header link follows the active collection when the merchant left it blank.
 */
(() => {
  'use strict';

  if (customElements.get('featured-collection')) return;

  const V = () => window.Vault || {};
  const motion = () => {
    const vault = V();
    return vault.Motion && typeof vault.motionOK === 'function' && vault.motionOK() ? vault.Motion : null;
  };
  const SPRING_INDICATOR = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 };
  const SPRING_CARDS = { type: 'spring', stiffness: 260, damping: 26, mass: 0.9 };
  const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];

  class FeaturedCollection extends HTMLElement {
    connectedCallback() {
      this.tablist = this.querySelector('[data-fc-tablist]');
      if (!this.tablist) return;
      this.scroller = this.querySelector('[data-fc-scroller]');
      this.indicator = this.querySelector('[data-fc-indicator]');
      this.tabs = Array.from(this.tablist.querySelectorAll('[data-fc-tab]'));
      this.panels = Array.from(this.querySelectorAll('[data-fc-panel]'));
      this.link = this.hasAttribute('data-link-auto') ? this.querySelector('.section-header__actions a') : null;
      this.index = Math.max(0, this.tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true'));
      this.token = 0;

      this.onClick = (e) => {
        const tab = e.target.closest('[data-fc-tab]');
        if (tab) this.select(this.tabs.indexOf(tab));
      };
      this.onKeydown = (e) => this.handleKey(e);
      this.onBlockSelect = (e) => {
        const panel = e.target && e.target.closest ? e.target.closest('[data-fc-panel]') : null;
        const i = this.panels.indexOf(panel);
        if (i > -1) this.select(i, { animate: false });
      };

      this.tablist.addEventListener('click', this.onClick);
      this.tablist.addEventListener('keydown', this.onKeydown);
      this.addEventListener('shopify:block:select', this.onBlockSelect);

      this.place(false);
      this.tablist.classList.add('is-ready');

      // Keep the indicator glued to its tab through font loads, resizes and editor changes.
      this.ro = new ResizeObserver(() => this.place(false));
      this.ro.observe(this.tablist);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => { if (this.isConnected) this.place(false); });
      }
    }

    disconnectedCallback() {
      if (this.ro) this.ro.disconnect();
      if (!this.tablist) return;
      this.tablist.removeEventListener('click', this.onClick);
      this.tablist.removeEventListener('keydown', this.onKeydown);
      this.removeEventListener('shopify:block:select', this.onBlockSelect);
    }

    handleKey(e) {
      if (!NAV_KEYS.includes(e.key)) return;
      const current = this.tabs.indexOf(e.target.closest('[data-fc-tab]'));
      if (current < 0) return;
      e.preventDefault();
      const last = this.tabs.length - 1;
      let next = current;
      if (e.key === 'ArrowRight') next = current === last ? 0 : current + 1;
      else if (e.key === 'ArrowLeft') next = current === 0 ? last : current - 1;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = last;
      this.tabs[next].focus();
      this.select(next);
    }

    select(next, { animate = true } = {}) {
      if (next < 0 || next >= this.tabs.length || next === this.index) return;
      this.index = next;
      this.tabs.forEach((tab, i) => {
        const active = i === next;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      const M = animate ? motion() : null;
      this.place(!!M);
      this.reveal(!!M);
      if (this.link) {
        const url = this.panels[next] && this.panels[next].dataset.url;
        if (url) this.link.href = url;
      }
      this.swap(next, M);
    }

    /* Move the red pill under the active tab. */
    place(animate) {
      const tab = this.tabs[this.index];
      if (!tab || !this.indicator) return;
      const x = tab.offsetLeft;
      const width = tab.offsetWidth;
      const M = V().Motion;
      if (M) {
        M.animate(this.indicator, { x, width }, animate ? SPRING_INDICATOR : { duration: 0 });
      } else {
        this.indicator.style.transform = `translateX(${x}px)`;
        this.indicator.style.width = `${width}px`;
      }
    }

    /* On phones the tab strip scrolls: centre the active tab. */
    reveal(smooth) {
      const sc = this.scroller;
      const tab = this.tabs[this.index];
      if (!sc || !tab || sc.scrollWidth <= sc.clientWidth + 1) return;
      const sr = sc.getBoundingClientRect();
      const tr = tab.getBoundingClientRect();
      const delta = tr.left + tr.width / 2 - (sr.left + sr.width / 2);
      sc.scrollBy({ left: delta, behavior: smooth ? 'smooth' : 'auto' });
    }

    async swap(next, M) {
      const token = ++this.token;
      const target = this.panels[next];
      if (!target) return;
      const outgoing = this.panels.filter((p) => p !== target && !p.hidden);

      if (M && outgoing.length) {
        await Promise.allSettled(outgoing.map((p) => Promise.resolve(
          M.animate(p, { opacity: 0, y: 10 }, { duration: 0.18, ease: V().ease ? V().ease.in : 'easeIn' }),
        )));
        if (token !== this.token) return; // a newer selection took over
      }

      this.panels.forEach((p) => {
        p.hidden = p !== target;
        if (M) M.animate(p, { opacity: 1, y: 0 }, { duration: 0 });
      });
      if (!M) return;

      const items = Array.from(target.querySelectorAll('.fc__item')).filter((el) => el.getClientRects().length);
      if (!items.length) return;
      const anim = M.animate(
        items,
        { opacity: [0, 1], y: [28, 0], scale: [0.96, 1] },
        { ...SPRING_CARDS, delay: (i) => Math.min(i, 8) * 0.05 },
      );
      Promise.resolve(anim).then(() => {
        if (token !== this.token) return;
        items.forEach((el) => {
          el.style.removeProperty('opacity');
          el.style.removeProperty('transform');
        });
      }, () => {});
    }
  }

  customElements.define('featured-collection', FeaturedCollection);
})();
