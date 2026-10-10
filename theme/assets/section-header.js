/*!
 * VAULT — section-header.js
 * <vault-header> (sections/header.liquid)
 *  - Scroll state: transparent at the top → frosted glass (.is-scrolled) after 8px.
 *  - Sticky "scroll_up": hides on scroll down past 200px, springs back (Motion) on scroll up.
 *  - Desktop navigation: <details> dropdowns / mega menus with hover intent (120ms), click,
 *    keyboard (Enter/Space/ArrowDown open, arrows move, Esc closes and returns focus),
 *    Motion reveals (opacity + y + clip-path, links stagger 0.03s).
 *  - Shared indicator pill that springs between hovered top-level links.
 *  - Cart count bubble pop on vault:cart:updated.
 *  - Search palette shortcut: ⌘K / Ctrl K, or "/" when not typing.
 * Everything degrades to plain links + native <details> without JS or with reduced motion.
 */
(() => {
  'use strict';

  if (customElements.get('vault-header')) return;

  const Vault = window.Vault || {};
  const motionOK = () => typeof Vault.motionOK === 'function' && Vault.motionOK();
  const ease = Vault.ease || { out: [0.16, 1, 0.3, 1], in: [0.55, 0, 1, 0.45], inOut: [0.65, 0, 0.35, 1] };
  const mqDesktop = window.matchMedia('(min-width: 990px)');
  const rafThrottle = (fn) => {
    let queued = false;
    return (...args) => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn(...args);
      });
    };
  };
  const stop = (anim) => {
    try {
      if (anim && typeof anim.stop === 'function') anim.stop();
    } catch (_) { /* already finished */ }
  };

  const OPEN_DELAY = 120;
  const SWITCH_DELAY = 40;
  const CLOSE_DELAY = 220;
  const HIDE_AFTER = 200;
  const HIDE_DISTANCE = 24;
  const SHOW_DISTANCE = 8;

  class VaultHeader extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this.header = this.querySelector('[data-header]');
      if (!this.header) return;
      this._bound = true;
      this.cleanups = [];
      this.sticky = this.dataset.sticky || 'none';
      this.nav = this.querySelector('.header__nav');
      this.items = Array.from(this.querySelectorAll('[data-nav-item]'));
      this.indicator = this.querySelector('[data-nav-indicator]');
      this.openItem = null;
      this.openSource = null;
      this.isHidden = false;
      this.scrolled = null;
      this.lastY = window.scrollY;
      this.travel = 0;

      this.bindScroll();
      this.bindNav();
      this.bindIndicator();
      this.bindCartBubble();
      this.bindShortcuts();
      this.bindEditor();
    }

    disconnectedCallback() {
      this.cleanups.forEach((fn) => fn());
      this.cleanups = [];
      clearTimeout(this.openTimer);
      clearTimeout(this.closeTimer);
      document.documentElement.classList.remove('header-hidden');
      this._bound = false;
    }

    listen(target, type, fn, opts) {
      if (!target) return;
      target.addEventListener(type, fn, opts);
      this.cleanups.push(() => target.removeEventListener(type, fn, opts));
    }

    /* ---------------------------------------------------------------- *
     * Scroll: glass state + hide on scroll down / reveal on scroll up
     * ---------------------------------------------------------------- */
    bindScroll() {
      const update = rafThrottle(() => this.onScroll());
      this.listen(window, 'scroll', update, { passive: true });
      this.onScroll(true);
      // Keyboard users tabbing into a hidden header bring it back.
      this.listen(this.header, 'focusin', () => this.setHidden(false));
    }

    onScroll(initial = false) {
      const y = Math.max(0, window.scrollY);
      const scrolled = y > 8;
      if (scrolled !== this.scrolled) {
        this.scrolled = scrolled;
        this.header.classList.toggle('is-scrolled', scrolled);
      }
      if (this.sticky === 'scroll_up' && !initial && !document.documentElement.classList.contains('is-locked')) {
        const dy = y - this.lastY;
        if (y <= HIDE_AFTER) {
          this.travel = 0;
          this.setHidden(false);
        } else if (dy > 0) {
          this.travel = Math.max(0, this.travel) + dy;
          if (this.travel > HIDE_DISTANCE && !this.openItem) this.setHidden(true);
        } else if (dy < 0) {
          this.travel = Math.min(0, this.travel) + dy;
          if (-this.travel > SHOW_DISTANCE) this.setHidden(false);
        }
      }
      this.lastY = y;
    }

    hasVisibleFocus() {
      try {
        return !!this.header.querySelector(':focus-visible');
      } catch (_) {
        return false;
      }
    }

    setHidden(hide) {
      if (hide === this.isHidden) return;
      if (hide && this.hasVisibleFocus()) return;
      this.isHidden = hide;
      this.header.classList.toggle('is-hidden', hide);
      document.documentElement.classList.toggle('header-hidden', hide);
      if (hide) this.closeAll(true);
      if (motionOK()) {
        stop(this.hideAnim);
        this.hideAnim = Vault.Motion.animate(
          this.header,
          { y: hide ? '-100%' : '0%' },
          hide ? { duration: 0.3, ease: ease.in } : { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 },
        );
      } else {
        this.header.style.transform = hide ? 'translateY(-100%)' : '';
      }
    }

    /* ---------------------------------------------------------------- *
     * Desktop navigation
     * ---------------------------------------------------------------- */
    bindNav() {
      this.items.forEach((item) => {
        const details = item.querySelector('[data-nav-details]');
        if (!details) {
          // Plain links close an open panel once the pointer settles on them.
          this.listen(item, 'pointerenter', (e) => {
            if (e.pointerType !== 'mouse' || !this.openItem) return;
            clearTimeout(this.openTimer);
            clearTimeout(this.closeTimer);
            const open = this.openItem;
            this.closeTimer = setTimeout(() => this.close(open), CLOSE_DELAY);
          });
          return;
        }
        const summary = details.querySelector(':scope > summary');
        const panel = details.querySelector('[data-nav-panel]');
        details.open = false;
        summary.setAttribute('aria-expanded', 'false');

        this.listen(summary, 'click', (e) => this.onSummaryClick(e, item));
        this.listen(summary, 'keydown', (e) => {
          if (e.key !== 'ArrowDown') return;
          e.preventDefault();
          this.open(item, 'keyboard');
          this.focusPanelLink(item, 0);
        });
        this.listen(item, 'pointerenter', (e) => this.onItemEnter(e, item));
        this.listen(item, 'pointerleave', (e) => this.onItemLeave(e, item));
        this.listen(item, 'focusout', (e) => {
          if (this.openItem === item && e.relatedTarget && !item.contains(e.relatedTarget)) this.close(item);
        });
        if (panel) this.listen(panel, 'keydown', (e) => this.onPanelKey(e, item));
      });

      this.listen(document, 'pointerdown', (e) => {
        this.lastPointer = e.pointerType;
        if (this.openItem && !this.openItem.contains(e.target)) this.close(this.openItem);
      });
      this.listen(document, 'keydown', (e) => {
        if (e.key !== 'Escape' || !this.openItem) return;
        const item = this.openItem;
        this.close(item);
        const summary = item.querySelector('summary');
        if (summary) summary.focus();
      });
      // Any drawer (menu, search, cart) takes over — close panels instantly.
      this.listen(document, 'drawer:open', () => this.closeAll(true));
      const onBreakpoint = () => this.closeAll(true);
      mqDesktop.addEventListener('change', onBreakpoint);
      this.cleanups.push(() => mqDesktop.removeEventListener('change', onBreakpoint));
    }

    onSummaryClick(e, item) {
      e.preventDefault();
      const details = item.querySelector('[data-nav-details]');
      if (details.open && this.openItem === item) {
        // A mouse click right after hover intent opened the panel keeps it open.
        if (this.openSource === 'hover' && e.detail > 0 && this.lastPointer === 'mouse') {
          this.openSource = 'click';
          return;
        }
        this.close(item);
      } else {
        this.open(item, e.detail === 0 ? 'keyboard' : 'click');
      }
    }

    onItemEnter(e, item) {
      if (e.pointerType !== 'mouse' || !mqDesktop.matches) return;
      clearTimeout(this.closeTimer);
      clearTimeout(this.openTimer);
      if (this.openItem === item) return;
      this.openTimer = setTimeout(() => this.open(item, 'hover'), this.openItem ? SWITCH_DELAY : OPEN_DELAY);
    }

    onItemLeave(e, item) {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(this.openTimer);
      if (this.openItem !== item || this.openSource !== 'hover') return;
      this.closeTimer = setTimeout(() => this.close(item), CLOSE_DELAY);
    }

    open(item, source = 'click') {
      clearTimeout(this.openTimer);
      clearTimeout(this.closeTimer);
      if (this.openItem === item) {
        this.openSource = source;
        return;
      }
      const prev = this.openItem;
      if (prev) this.close(prev, { instant: true });

      const details = item.querySelector('[data-nav-details]');
      if (!details) return;
      const summary = details.querySelector(':scope > summary');
      const panel = details.querySelector('[data-nav-panel]');
      details.open = true;
      this.openItem = item;
      this.openSource = source;
      item.classList.add('is-open');
      this.header.classList.add('is-open');
      summary.setAttribute('aria-expanded', 'true');
      this.setHidden(false);
      this.moveIndicator(summary);

      if (!panel || !motionOK()) return;
      const M = Vault.Motion;
      const token = {};
      panel._token = token;
      stop(panel._anim);
      stop(panel._itemsAnim);
      const mega = panel.classList.contains('header__panel--mega');
      let keyframes;
      if (prev) keyframes = { opacity: [0, 1] };
      else if (mega) keyframes = { opacity: [0, 1], y: [-8, 0], clipPath: ['inset(0% 0% 100% 0%)', 'inset(0% 0% 0% 0%)'] };
      else keyframes = { opacity: [0, 1], y: [-8, 0], clipPath: ['inset(0% 0% 100% 0% round 14px)', 'inset(0% 0% 0% 0% round 14px)'] };
      panel._anim = M.animate(panel, keyframes, { duration: prev ? 0.22 : mega ? 0.55 : 0.36, ease: ease.out });
      Promise.resolve(panel._anim).then(() => {
        if (panel._token === token) panel.style.removeProperty('clip-path');
      }, () => {});

      const items = Array.from(panel.querySelectorAll('[data-panel-item]'));
      if (items.length) {
        panel._itemsAnim = M.animate(
          items,
          { opacity: [0, 1], y: [10, 0] },
          { duration: 0.45, ease: ease.out, delay: M.stagger(0.03, { startDelay: prev ? 0.02 : 0.08 }) },
        );
        Promise.resolve(panel._itemsAnim).then(() => {
          if (panel._token !== token) return;
          items.forEach((el) => {
            el.style.removeProperty('opacity');
            el.style.removeProperty('transform');
          });
        }, () => {});
      }
    }

    close(item, { instant = false } = {}) {
      if (!item) return;
      const details = item.querySelector('[data-nav-details]');
      if (!details) return;
      const summary = details.querySelector(':scope > summary');
      const panel = details.querySelector('[data-nav-panel]');
      clearTimeout(this.closeTimer);
      if (this.openItem === item) {
        this.openItem = null;
        this.openSource = null;
        this.header.classList.remove('is-open');
      }
      item.classList.remove('is-open');
      summary.setAttribute('aria-expanded', 'false');
      if (!details.open) return;

      const token = {};
      if (panel) {
        panel._token = token;
        stop(panel._anim);
        stop(panel._itemsAnim);
      }
      const finish = () => {
        if (panel && panel._token !== token) return;
        if (this.openItem !== item) details.open = false;
        if (!panel) return;
        ['opacity', 'transform', 'clip-path'].forEach((p) => panel.style.removeProperty(p));
        panel.querySelectorAll('[data-panel-item]').forEach((el) => {
          el.style.removeProperty('opacity');
          el.style.removeProperty('transform');
        });
      };
      if (instant || !panel || !motionOK()) finish();
      else {
        panel._anim = Vault.Motion.animate(panel, { opacity: 0, y: -6 }, { duration: 0.18, ease: ease.in });
        Promise.resolve(panel._anim).then(finish, finish);
      }
      if (!this.openItem) this.restIndicator();
    }

    closeAll(instant = false) {
      if (this.openItem) this.close(this.openItem, { instant });
    }

    panelLinks(item) {
      const panel = item.querySelector('[data-nav-panel]');
      return panel ? Array.from(panel.querySelectorAll('a[href]')) : [];
    }

    focusPanelLink(item, index) {
      const links = this.panelLinks(item);
      if (!links.length) return;
      links[(index + links.length) % links.length].focus();
    }

    onPanelKey(e, item) {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      const links = this.panelLinks(item);
      const i = links.indexOf(document.activeElement);
      if (i === -1) return;
      e.preventDefault();
      if (e.key === 'Home') links[0].focus();
      else if (e.key === 'End') links[links.length - 1].focus();
      else if (e.key === 'ArrowUp' && i === 0) item.querySelector('summary').focus();
      else this.focusPanelLink(item, i + (e.key === 'ArrowDown' ? 1 : -1));
    }

    /* ---------------------------------------------------------------- *
     * Shared indicator (Framer-style shared layout feel)
     * ---------------------------------------------------------------- */
    bindIndicator() {
      if (!this.indicator || !this.nav || !motionOK()) return;
      this.nav.classList.add('has-indicator');
      this.indicatorVisible = false;
      this.nav.querySelectorAll('[data-nav-link]').forEach((link) => {
        this.listen(link, 'pointerenter', (e) => {
          if (e.pointerType === 'mouse') this.moveIndicator(link);
        });
        this.listen(link, 'focus', () => this.moveIndicator(link));
      });
      const menu = this.nav.querySelector('[data-nav-menu]');
      this.listen(menu, 'pointerleave', (e) => {
        if (e.pointerType === 'mouse') this.restIndicator();
      });
      this.listen(this.nav, 'focusout', (e) => {
        if (!this.nav.contains(e.relatedTarget)) this.restIndicator();
      });
      const snap = rafThrottle(() => this.restIndicator(true));
      const ro = new ResizeObserver(snap);
      ro.observe(this.nav);
      this.cleanups.push(() => ro.disconnect());
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(snap);
    }

    moveIndicator(link, instant = false) {
      if (!this.indicator || !this.nav || !this.nav.classList.contains('has-indicator')) return;
      const base = (this.indicator.offsetParent || this.nav).getBoundingClientRect();
      const r = link.getBoundingClientRect();
      if (!r.width || !base.width) return;
      const M = Vault.Motion;
      const x = r.left - base.left;
      const width = r.width;
      if (instant || !this.indicatorVisible) {
        M.animate(this.indicator, { x, width }, { duration: 0 });
        M.animate(this.indicator, { opacity: 1 }, { duration: instant ? 0 : 0.22, ease: ease.out });
      } else {
        M.animate(
          this.indicator,
          { x, width, opacity: 1 },
          { type: 'spring', stiffness: 520, damping: 40, mass: 0.8, opacity: { duration: 0.2 } },
        );
      }
      this.indicatorVisible = true;
    }

    restIndicator(instant = false) {
      if (!this.indicator || !this.nav || !this.nav.classList.contains('has-indicator')) return;
      const target = (this.openItem && this.openItem.querySelector('[data-nav-link]'))
        || this.nav.querySelector('[data-nav-link][data-active]');
      if (target) {
        this.moveIndicator(target, instant);
        return;
      }
      if (this.indicatorVisible) Vault.Motion.animate(this.indicator, { opacity: 0 }, { duration: instant ? 0 : 0.2 });
      this.indicatorVisible = false;
    }

    /* ---------------------------------------------------------------- *
     * Cart bubble pop (header + dock share the swapped markup)
     * ---------------------------------------------------------------- */
    readCartCount() {
      const bubble = document.querySelector('[data-cart-swap="cart-icon-bubble"] .cart-bubble');
      return bubble ? Number(bubble.dataset.count) || 0 : 0;
    }

    bindCartBubble() {
      this.cartCount = this.readCartCount();
      this.listen(document, 'vault:cart:updated', () => {
        const count = this.readCartCount();
        if (count === this.cartCount) return;
        const grew = count > this.cartCount;
        this.cartCount = count;
        if (!motionOK()) return;
        document.querySelectorAll('[data-cart-swap="cart-icon-bubble"] .cart-bubble').forEach((bubble) => {
          Vault.Motion.animate(
            bubble,
            { scale: [grew ? 0.3 : 1.35, 1] },
            { type: 'spring', stiffness: 520, damping: 14, mass: 0.8 },
          );
        });
      });
    }

    /* ---------------------------------------------------------------- *
     * Search shortcut
     * ---------------------------------------------------------------- */
    bindShortcuts() {
      const kbd = this.querySelector('[data-search-kbd]');
      const apple = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
      if (kbd) {
        kbd.textContent = apple ? '⌘K' : 'Ctrl K';
        kbd.hidden = false;
      }
      const typing = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      this.listen(document, 'keydown', (e) => {
        const search = document.getElementById('SearchDrawer');
        if (!search || typeof search.open !== 'function') return;
        const combo = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
        const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target);
        if (!combo && !slash) return;
        const other = document.querySelector('vault-drawer[open]');
        if (other && other !== search) return;
        e.preventDefault();
        if (search.isOpen) {
          if (combo) search.close();
        } else {
          search.open();
        }
      });
    }

    /* ---------------------------------------------------------------- *
     * Theme editor: selecting a mega promo block opens its panel
     * ---------------------------------------------------------------- */
    bindEditor() {
      if (!window.Shopify || !window.Shopify.designMode) return;
      this.listen(document, 'shopify:block:select', (e) => {
        if (!this.contains(e.target)) return;
        const item = this.items.find((i) => i.contains(e.target));
        if (item && mqDesktop.matches) {
          this.open(item, 'editor');
          return;
        }
        const drawer = document.getElementById('MenuDrawer');
        if (drawer && drawer.contains(e.target) && typeof drawer.open === 'function') drawer.open();
      });
      this.listen(document, 'shopify:block:deselect', (e) => {
        if (this.openItem && this.openItem.contains(e.target)) this.close(this.openItem);
      });
    }
  }

  customElements.define('vault-header', VaultHeader);
})();
