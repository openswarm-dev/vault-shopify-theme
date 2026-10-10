/*!
 * VAULT — component-menu-drawer.js
 * <menu-drawer> inside <vault-drawer id="MenuDrawer">: nested levels slide in as panels
 * (Motion spring on x), the level underneath recedes and becomes inert, focus moves to the
 * panel heading, "Back" returns focus to the opener. The mobile dock's Shop button can open
 * the drawer straight at a panel via data-menu-target.
 * <localization-form>: submits the country/language form on change (shared with the footer).
 */
(() => {
  'use strict';

  if (!customElements.get('localization-form')) {
    customElements.define('localization-form', class extends HTMLElement {
      connectedCallback() {
        if (this._bound) return;
        this._bound = true;
        this.addEventListener('change', (e) => {
          if (!(e.target instanceof HTMLSelectElement)) return;
          const form = this.querySelector('form');
          if (!form) return;
          this.setAttribute('aria-busy', 'true');
          form.submit();
        });
      }
    });
  }

  if (customElements.get('menu-drawer')) return;

  const Vault = window.Vault || {};
  const motionOK = () => typeof Vault.motionOK === 'function' && Vault.motionOK();
  const ease = Vault.ease || { out: [0.16, 1, 0.3, 1], inOut: [0.65, 0, 0.35, 1] };
  const RECEDE = '-24%';
  const clear = (el, props = ['transform', 'opacity']) => props.forEach((p) => el.style.removeProperty(p));
  const stop = (anim) => {
    try {
      if (anim && typeof anim.stop === 'function') anim.stop();
    } catch (_) { /* already finished */ }
  };

  class MenuDrawer extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this.drawer = this.closest('vault-drawer');
      this.root = this.querySelector('.menu-drawer__level--root');
      if (!this.drawer || !this.root) return;
      this._bound = true;
      this.stack = [this.root];

      this.onClick = (e) => {
        const opener = e.target.closest('[data-submenu-open]');
        if (opener && this.contains(opener)) {
          e.preventDefault();
          this.open(opener.getAttribute('aria-controls'), opener);
          return;
        }
        const back = e.target.closest('[data-submenu-back]');
        if (back && this.contains(back)) {
          e.preventDefault();
          this.back();
        }
      };
      this.onDrawerOpen = () => {
        this.reset();
        const trigger = this.drawer.trigger;
        const target = trigger && trigger.dataset ? trigger.dataset.menuTarget : '';
        if (target) this.open(target, null, { instant: true });
      };
      this.onDrawerClose = () => this.reset();

      this.addEventListener('click', this.onClick);
      this.drawer.addEventListener('drawer:open', this.onDrawerOpen);
      this.drawer.addEventListener('drawer:close', this.onDrawerClose);
      this.reset();
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.onClick);
      if (this.drawer) {
        this.drawer.removeEventListener('drawer:open', this.onDrawerOpen);
        this.drawer.removeEventListener('drawer:close', this.onDrawerClose);
      }
      this._bound = false;
    }

    levels() {
      return Array.from(this.querySelectorAll('[data-menu-level]'));
    }

    panelById(id) {
      if (!id) return null;
      const el = document.getElementById(id);
      return el && this.contains(el) ? el : null;
    }

    /** Back to the root level, no animation (drawer opened or closed). */
    reset() {
      this.levels().forEach((level) => {
        stop(level._anim);
        clear(level);
        level.classList.remove('is-covered');
        const isRoot = level === this.root;
        level.classList.toggle('is-active', isRoot);
        level.inert = !isRoot;
      });
      this.querySelectorAll('[data-submenu-open][aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
      this.stack = [this.root];
    }

    open(id, trigger, { instant = false } = {}) {
      const panel = this.panelById(id);
      const current = this.stack[this.stack.length - 1];
      if (!panel || panel === current) return;
      panel._trigger = trigger || null;
      this.stack.push(panel);
      stop(panel._anim);
      stop(current._anim);
      panel.scrollTop = 0;
      panel.inert = false;
      panel.classList.add('is-active');
      current.inert = true;
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
      const heading = panel.querySelector('[data-submenu-heading]');

      const settle = () => {
        if (this.stack[this.stack.length - 1] !== panel) return;
        current.classList.add('is-covered');
        clear(current);
        clear(panel);
      };

      if (instant || !motionOK()) {
        settle();
        // Run after the drawer's own [data-drawer-focus] handling.
        if (heading) requestAnimationFrame(() => requestAnimationFrame(() => heading.focus({ preventScroll: true })));
        return;
      }

      const M = Vault.Motion;
      panel._anim = M.animate(panel, { x: ['100%', '0%'] }, { type: 'spring', stiffness: 380, damping: 40, mass: 0.9 });
      current._anim = M.animate(current, { x: ['0%', RECEDE], opacity: [1, 0.15] }, { duration: 0.42, ease: ease.out });
      const items = Array.from(panel.querySelectorAll('[data-submenu-item]')).slice(0, 14);
      if (items.length) {
        const anim = M.animate(items, { opacity: [0, 1], x: [28, 0] }, { duration: 0.5, ease: ease.out, delay: M.stagger(0.035, { startDelay: 0.08 }) });
        Promise.resolve(anim).then(() => items.forEach((el) => clear(el)), () => {});
      }
      if (heading) heading.focus({ preventScroll: true });
      Promise.all([panel._anim, current._anim].map((a) => Promise.resolve(a))).then(settle, settle);
    }

    back() {
      if (this.stack.length < 2) return;
      const panel = this.stack.pop();
      const prev = this.stack[this.stack.length - 1];
      stop(panel._anim);
      stop(prev._anim);
      prev.classList.remove('is-covered');
      prev.inert = false;
      panel.inert = true;
      const trigger = panel._trigger;
      if (trigger) trigger.setAttribute('aria-expanded', 'false');

      const settle = () => {
        if (this.stack.includes(panel)) return;
        panel.classList.remove('is-active');
        clear(panel);
        clear(prev);
      };
      const focusTarget = trigger && prev.contains(trigger) ? trigger : prev.querySelector('a[href], button:not([disabled])');

      if (!motionOK()) {
        settle();
        if (focusTarget) focusTarget.focus({ preventScroll: true });
        return;
      }
      const M = Vault.Motion;
      panel._anim = M.animate(panel, { x: ['0%', '100%'] }, { duration: 0.36, ease: ease.inOut });
      prev._anim = M.animate(prev, { x: [RECEDE, '0%'], opacity: [0.15, 1] }, { type: 'spring', stiffness: 380, damping: 40, mass: 0.9, opacity: { duration: 0.3 } });
      if (focusTarget) focusTarget.focus({ preventScroll: true });
      Promise.all([panel._anim, prev._anim].map((a) => Promise.resolve(a))).then(settle, settle);
    }
  }

  customElements.define('menu-drawer', MenuDrawer);
})();
