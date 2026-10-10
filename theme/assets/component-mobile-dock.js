/*!
 * VAULT — component-mobile-dock.js
 * <mobile-dock data-dock>: a red pill springs between dock items (Motion). It follows taps,
 * jumps to Shop / Search / Cart while their drawer is open, and returns to the current page's
 * item when the drawer closes. Without Motion the current item keeps a static highlight.
 */
(() => {
  'use strict';

  if (customElements.get('mobile-dock')) return;

  const Vault = window.Vault || {};
  const motionOK = () => typeof Vault.motionOK === 'function' && Vault.motionOK();
  const DRAWER_ITEM = { MenuDrawer: 'shop', SearchDrawer: 'search', CartDrawer: 'cart' };

  class MobileDock extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this.nav = this.querySelector('.dock__nav');
      this.pill = this.querySelector('[data-dock-pill]');
      this.items = Array.from(this.querySelectorAll('[data-dock-item]'));
      if (!this.nav || !this.pill || !this.items.length || !motionOK()) return;
      this._bound = true;
      this.home = this.items.find((item) => item.hasAttribute('aria-current')) || null;
      this.active = null;
      this.pillVisible = false;
      this.cleanups = [];
      this.classList.add('is-enhanced');

      const listen = (target, type, fn, opts) => {
        target.addEventListener(type, fn, opts);
        this.cleanups.push(() => target.removeEventListener(type, fn, opts));
      };
      listen(this, 'click', (e) => {
        const item = e.target.closest('[data-dock-item]');
        if (item && this.contains(item)) this.place(item);
      });
      listen(document, 'drawer:open', (e) => {
        const key = DRAWER_ITEM[e.target && e.target.id];
        const item = key && this.items.find((i) => i.dataset.dockItem === key);
        if (item) this.place(item);
      });
      listen(document, 'drawer:close', () => {
        requestAnimationFrame(() => {
          if (!document.querySelector('vault-drawer[open]')) this.place(this.home);
        });
      });
      listen(window, 'pageshow', (e) => {
        if (e.persisted) this.place(this.home, true);
      });

      const ro = new ResizeObserver(() => this.place(this.active, true));
      ro.observe(this.nav);
      this.cleanups.push(() => ro.disconnect());
      this.place(this.home, true);
    }

    disconnectedCallback() {
      (this.cleanups || []).forEach((fn) => fn());
      this.cleanups = [];
      this._bound = false;
    }

    place(item, instant = false) {
      const M = Vault.Motion;
      this.items.forEach((i) => i.classList.toggle('is-active', i === item));
      this.active = item;
      if (!item) {
        if (this.pillVisible) M.animate(this.pill, { opacity: 0, scale: 0.6 }, { duration: instant ? 0 : 0.2 });
        this.pillVisible = false;
        return;
      }
      const icon = item.querySelector('.dock__icon') || item;
      const navRect = this.nav.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      if (!navRect.width || !iconRect.width) return; // hidden (≥750px)
      const x = iconRect.left - navRect.left + (iconRect.width - this.pill.offsetWidth) / 2;
      const y = iconRect.top - navRect.top + (iconRect.height - this.pill.offsetHeight) / 2 - this.pill.offsetTop;

      if (instant || !this.pillVisible) {
        M.animate(this.pill, { x, y }, { duration: 0 });
        M.animate(
          this.pill,
          { opacity: [instant ? 1 : 0, 1], scale: [instant ? 1 : 0.6, 1] },
          instant ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 26 },
        );
      } else {
        M.animate(
          this.pill,
          { x, y, opacity: 1, scaleX: [1.35, 1] },
          { type: 'spring', stiffness: 520, damping: 30, mass: 0.8, opacity: { duration: 0.15 } },
        );
      }
      this.pillVisible = true;
    }
  }

  customElements.define('mobile-dock', MobileDock);
})();
