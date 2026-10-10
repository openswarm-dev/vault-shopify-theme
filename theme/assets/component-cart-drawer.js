/*!
 * VAULT — component-cart-drawer.js
 * <cart-drawer-items> wraps the contents of <vault-drawer id="CartDrawer">.
 *  - Registers the "cart-drawer" section so every cart mutation re-renders its swap regions.
 *  - Quantity changes (debounced 300ms per line) → Vault.cart.change({ id: lineKey, quantity }),
 *    run one at a time; per-line loading state; on failure: toast + previous quantity restored.
 *  - Remove: the line collapses with Motion (height/opacity), then quantity 0 is sent; it
 *    springs back open if the request fails.
 *  - Order note saved with Vault.cart.update({ note }) (debounced) — it lives outside the swap
 *    regions so typing is never interrupted.
 *  - Free-shipping bar animates from its previous value; a sparkle burst marks the unlock.
 *  - Focus is restored to the equivalent control after a region swap; counts are announced.
 */
(() => {
  'use strict';

  if (customElements.get('cart-drawer-items')) return;

  const Vault = window.Vault;
  if (!Vault || !Vault.cart) return;

  const strings = (window.theme && window.theme.strings) || {};
  const motionOK = () => Vault.motionOK();
  const QTY_DEBOUNCE = 300;
  const NOTE_DEBOUNCE = 600;
  const FOCUSABLE_IN_LINE = ['[data-cart-remove]', '[data-qty="plus"]', '[data-qty="minus"]', '[data-cart-qty]'];

  class CartDrawerItems extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      Vault.cart.register('cart-drawer');

      this.drawer = this.closest('vault-drawer');
      this.timers = new Map();
      this.queue = Promise.resolve();
      this.live = this.querySelector('[data-cart-live]');
      this.note = this.querySelector('[data-cart-note]');
      this.count = this.readCount();
      this.lastUpdate = 0;
      const progress = this.querySelector('[data-cart-progress]');
      this.progressValue = progress ? parseFloat(progress.dataset.progress) || 0 : 0;
      this.unlocked = progress ? progress.dataset.unlocked === 'true' : false;

      this.onChange = this.onChange.bind(this);
      this.onClick = this.onClick.bind(this);
      this.onInput = this.onInput.bind(this);
      this.onKeydown = this.onKeydown.bind(this);
      this.onOpen = () => {
        // Skip when the drawer opens right after an add (the update already animated).
        if (performance.now() - this.lastUpdate > 250) this.animateProgress(true);
      };

      this.addEventListener('change', this.onChange);
      this.addEventListener('click', this.onClick);
      this.addEventListener('input', this.onInput);
      this.addEventListener('keydown', this.onKeydown);
      if (this.drawer) this.drawer.addEventListener('drawer:open', this.onOpen);
      this.offUpdated = Vault.on('vault:cart:updated', (e) => this.onUpdated(e));
    }

    disconnectedCallback() {
      this.removeEventListener('change', this.onChange);
      this.removeEventListener('click', this.onClick);
      this.removeEventListener('input', this.onInput);
      this.removeEventListener('keydown', this.onKeydown);
      if (this.drawer) this.drawer.removeEventListener('drawer:open', this.onOpen);
      if (this.offUpdated) this.offUpdated();
      this.timers.forEach((t) => clearTimeout(t));
      this.timers.clear();
      clearTimeout(this.noteTimer);
      this._bound = false;
    }

    /* ---------- helpers ---------- */
    readCount() {
      const el = this.querySelector('[data-cart-item-count]');
      return el ? Number(el.dataset.cartItemCount) || 0 : 0;
    }

    /** Serialises cart requests so overlapping edits never race. */
    enqueue(task) {
      const run = this.queue.then(task);
      this.queue = run.catch(() => {});
      return run;
    }

    setLoading(line, on) {
      line.classList.toggle('is-loading', on);
      if (on) line.setAttribute('aria-busy', 'true');
      else line.removeAttribute('aria-busy');
    }

    showError(line, err) {
      const message = (err && err.message) || strings.cartError || '';
      Vault.toast(message, { type: 'error' });
      const box = line && line.isConnected ? line.querySelector('[data-cart-line-error]') : null;
      if (box) {
        box.textContent = message;
        box.hidden = false;
      }
    }

    rememberFocus(line) {
      const active = document.activeElement;
      if (!active || !line.contains(active)) {
        this.focusMemo = null;
        return;
      }
      const lines = Array.from(this.querySelectorAll('[data-cart-line]'));
      this.focusMemo = {
        index: lines.indexOf(line),
        selector: FOCUSABLE_IN_LINE.find((sel) => active.matches(sel)) || '[data-cart-qty]',
      };
    }

    restoreFocus() {
      const memo = this.focusMemo;
      this.focusMemo = null;
      if (!memo) return;
      const active = document.activeElement;
      if (active && active !== document.body && this.contains(active)) return;
      const lines = Array.from(this.querySelectorAll('[data-cart-line]'));
      const line = lines[Math.min(memo.index, lines.length - 1)];
      let target = line ? line.querySelector(memo.selector) : null;
      if (target && target.disabled) target = line.querySelector('[data-cart-qty]');
      if (!target) target = this.querySelector('[data-cart-empty] a, .cart-drawer__close');
      if (target) target.focus({ preventScroll: true });
    }

    announce() {
      if (!this.live) return;
      const el = this.querySelector('[data-cart-item-count]');
      const text = el ? el.textContent.trim() : '';
      this.live.textContent = '';
      requestAnimationFrame(() => { this.live.textContent = text; });
    }

    /* ---------- quantity ---------- */
    onKeydown(e) {
      // Enter in a quantity field must not submit #CartDrawerForm (its first button is checkout).
      if (e.key !== 'Enter') return;
      const input = e.target.closest('[data-cart-qty]');
      if (!input) return;
      e.preventDefault();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    onChange(e) {
      const input = e.target.closest('[data-cart-qty]');
      if (!input) return;
      const line = input.closest('[data-cart-line]');
      if (!line) return;
      clearTimeout(this.timers.get(line));
      this.timers.set(line, setTimeout(() => {
        this.timers.delete(line);
        if (!line.isConnected) return;
        const quantity = Math.max(0, parseInt(input.value, 10) || 0);
        if (quantity === 0) this.removeLine(line);
        else this.updateLine(line, quantity);
      }, QTY_DEBOUNCE));
    }

    async updateLine(line, quantity) {
      const input = line.querySelector('[data-cart-qty]');
      const previous = Number(input.dataset.lineQty) || 0;
      if (quantity === previous) return;
      const error = line.querySelector('[data-cart-line-error]');
      if (error) error.hidden = true;
      this.rememberFocus(line);
      this.setLoading(line, true);
      try {
        await this.enqueue(() => Vault.cart.change({ id: line.dataset.key, quantity }));
      } catch (err) {
        input.value = previous;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        this.focusMemo = null;
        this.showError(line, err);
      } finally {
        if (line.isConnected) this.setLoading(line, false);
      }
    }

    /* ---------- remove ---------- */
    onClick(e) {
      const remove = e.target.closest('[data-cart-remove]');
      if (!remove || !this.contains(remove)) return;
      e.preventDefault();
      const line = remove.closest('[data-cart-line]');
      if (line) this.removeLine(line);
    }

    async removeLine(line) {
      if (line.dataset.removing) return;
      line.dataset.removing = 'true';
      this.rememberFocus(line);
      const height = line.offsetHeight;
      const M = Vault.Motion;
      line.style.overflow = 'hidden';
      if (motionOK()) {
        try {
          await M.animate(line, { opacity: [1, 0], height: [height, 0] }, { duration: 0.38, ease: Vault.ease.inOut });
        } catch (_) { /* interrupted */ }
      } else {
        this.setLoading(line, true);
      }

      try {
        await this.enqueue(() => Vault.cart.change({ id: line.dataset.key, quantity: 0 }));
      } catch (err) {
        delete line.dataset.removing;
        this.focusMemo = null;
        if (line.isConnected) {
          this.setLoading(line, false);
          const input = line.querySelector('[data-cart-qty]');
          if (input) input.value = input.dataset.lineQty;
          if (motionOK()) {
            try {
              await M.animate(line, { opacity: [0, 1], height: [0, height] }, { duration: 0.34, ease: Vault.ease.out });
            } catch (_) { /* interrupted */ }
          }
          ['height', 'opacity', 'overflow'].forEach((p) => line.style.removeProperty(p));
        }
        this.showError(line, err);
      }
    }

    /* ---------- note ---------- */
    onInput(e) {
      const note = e.target.closest('[data-cart-note-input]');
      if (!note) return;
      const status = this.querySelector('[data-cart-note-status]');
      clearTimeout(this.noteTimer);
      this.noteTimer = setTimeout(async () => {
        if (status) status.textContent = status.dataset.saving || '';
        try {
          await this.enqueue(() => Vault.cart.update({ note: note.value }));
          if (status) status.textContent = status.dataset.saved || '';
        } catch (err) {
          if (status) status.textContent = '';
          Vault.toast((err && err.message) || strings.cartError, { type: 'error' });
        }
      }, NOTE_DEBOUNCE);
    }

    /* ---------- after every cart mutation (regions already swapped by core) ---------- */
    onUpdated(e) {
      this.lastUpdate = performance.now();
      const count = this.readCount();
      if (this.note) this.note.hidden = count === 0;
      this.animateProgress(false);
      if (this.count > 0 && count === 0) this.animateEmpty();
      const source = e && e.detail ? e.detail.source : '';
      if (count !== this.count || source === 'change') this.announce();
      this.count = count;
      this.restoreFocus();
    }

    animateProgress(fromOpen) {
      const wrap = this.querySelector('[data-cart-progress]');
      if (!wrap) {
        this.progressValue = 0;
        this.unlocked = false;
        return;
      }
      const fill = wrap.querySelector('[data-cart-progress-fill]');
      const target = Math.min(1, Math.max(0, parseFloat(wrap.dataset.progress) || 0));
      const unlocked = wrap.dataset.unlocked === 'true';
      const from = fromOpen ? 0 : this.progressValue;
      if (fill && motionOK() && Math.abs(target - from) > 0.001) {
        Vault.Motion.animate(fill, { scaleX: [from, target] }, { type: 'spring', stiffness: 120, damping: 22, mass: 1 });
      }
      if (unlocked && !this.unlocked && !fromOpen) this.burst(wrap);
      this.progressValue = target;
      this.unlocked = unlocked;
    }

    burst(wrap) {
      if (!motionOK()) return;
      const host = wrap.querySelector('[data-cart-progress-burst]');
      if (!host) return;
      const M = Vault.Motion;
      const anims = [];
      for (let i = 0; i < 12; i += 1) {
        const spark = document.createElement('span');
        spark.className = 'cart-progress__spark';
        host.appendChild(spark);
        const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
        const distance = 18 + Math.random() * 26;
        anims.push(M.animate(
          spark,
          { x: [0, Math.cos(angle) * distance], y: [0, Math.sin(angle) * distance], scale: [0, 1.2, 0], opacity: [1, 1, 0] },
          { duration: 0.75 + Math.random() * 0.35, ease: Vault.ease.out },
        ));
      }
      Promise.allSettled(anims.map((a) => Promise.resolve(a))).then(() => { host.textContent = ''; });
      const text = wrap.querySelector('.cart-progress__text');
      if (text) M.animate(text, { scale: [1, 1.05, 1] }, { duration: 0.5, ease: Vault.ease.out });
    }

    animateEmpty() {
      if (!motionOK()) return;
      const empty = this.querySelector('[data-cart-empty]');
      if (!empty) return;
      const M = Vault.Motion;
      const items = Array.from(empty.children);
      const anim = M.animate(items, { opacity: [0, 1], y: [16, 0] }, { duration: 0.5, ease: Vault.ease.out, delay: M.stagger(0.06) });
      Promise.resolve(anim).then(() => items.forEach((el) => {
        el.style.removeProperty('opacity');
        el.style.removeProperty('transform');
      }), () => {});
    }
  }

  customElements.define('cart-drawer-items', CartDrawerItems);
})();
