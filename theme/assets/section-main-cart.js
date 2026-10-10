/*!
 * VAULT — section-main-cart.js
 * <main-cart data-section-id="…"> progressive enhancement for the cart page.
 *  - Quantity changes and removals go through Vault.cart.change (keyed by line item key,
 *    serialised in a queue) and the registered section re-renders the swap regions
 *    [data-cart-swap="<id>"][data-cart-swap-key="count|items|summary|bar"].
 *  - Removal collapses the line with Motion; empty <-> filled transitions swap the whole section.
 *  - Order note autosaves; free-shipping bar animates between values; the sticky
 *    checkout bar hides while the summary checkout button is on screen.
 * Without JS the page is a regular form (updates[] + Update / Check out buttons).
 */
(() => {
  'use strict';

  if (customElements.get('main-cart')) return;

  const QTY_DELAY = 380;
  const NOTE_DELAY = 650;

  class MainCart extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      const V = window.Vault;
      if (!V || !V.cart) return;
      this._bound = true;
      this.V = V;
      this.M = V.Motion;
      this.sectionId = this.dataset.sectionId;
      this.queue = Promise.resolve();
      this.pending = 0;
      this.timers = new Map();

      V.cart.register(this.sectionId);
      this.classList.add('is-enhanced');

      this.onChange = this.onChange.bind(this);
      this.onClick = this.onClick.bind(this);
      this.onInput = this.onInput.bind(this);
      this.onKeydown = this.onKeydown.bind(this);
      this.addEventListener('change', this.onChange);
      this.addEventListener('click', this.onClick);
      this.addEventListener('input', this.onInput);
      this.addEventListener('keydown', this.onKeydown);
      this.offUpdated = V.on('vault:cart:updated', (e) => this.onUpdated(e));

      this.setup();
      this.intro();
    }

    disconnectedCallback() {
      this.offUpdated?.();
      this.io?.disconnect();
      this.timers?.forEach((t) => clearTimeout(t));
      clearTimeout(this.noteTimer);
      const id = this.sectionId;
      // Theme editor re-renders insert a fresh element with the same id; only unregister if none remains.
      setTimeout(() => {
        if (!document.querySelector(`main-cart[data-section-id="${id}"]`)) this.V?.cart.unregister(id);
      }, 0);
    }

    /* ---------------- helpers ---------------- */

    msg(name, replacements = {}) {
      let text = this.dataset[name] || '';
      Object.entries(replacements).forEach(([k, v]) => { text = text.replace(`[${k}]`, v); });
      return text;
    }

    announce(text) {
      const status = this.querySelector('[data-cart-status]');
      if (!status || !text) return;
      status.textContent = '';
      requestAnimationFrame(() => { status.textContent = text; });
    }

    lineByKey(key) {
      const safe = window.CSS && CSS.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
      return this.querySelector(`[data-cart-line][data-key="${safe}"]`);
    }

    enqueue(task) {
      this.pending += 1;
      this.setBusy(true);
      const run = this.queue.then(task, task);
      this.queue = run.catch(() => {}).finally(() => {
        this.pending -= 1;
        if (this.pending === 0) this.setBusy(false);
      });
      return run;
    }

    setBusy(busy) {
      if (busy) this.setAttribute('aria-busy', 'true');
      else this.removeAttribute('aria-busy');
      this.querySelectorAll('button[name="checkout"]').forEach((btn) => {
        btn.classList.toggle('is-loading', busy);
        if (busy) btn.setAttribute('aria-disabled', 'true');
        else btn.removeAttribute('aria-disabled');
      });
    }

    showLineError(key, message) {
      const line = this.lineByKey(key);
      const box = line?.querySelector('[data-line-error]');
      if (!box) return;
      const text = box.querySelector('[data-line-error-text]');
      if (text) text.textContent = message;
      box.hidden = false;
      if (this.V.motionOK()) this.M.animate(box, { opacity: [0, 1], y: [-6, 0] }, { duration: 0.35, ease: this.V.ease.out });
    }

    clearLineError(line) {
      const box = line?.querySelector('[data-line-error]');
      if (box) box.hidden = true;
    }

    /* ---------------- setup ---------------- */

    setup() {
      this.bindBar();
      const ship = this.querySelector('[data-cart-ship]');
      this.shipP = ship ? parseFloat(ship.style.getPropertyValue('--p')) || 0 : 0;
    }

    intro() {
      if (!this.V.motionOK()) return;
      const lines = Array.from(this.querySelectorAll('[data-cart-line]')).slice(0, 8);
      if (!lines.length) return;
      const anim = this.M.animate(
        lines,
        { opacity: [0, 1], y: [22, 0] },
        { duration: 0.7, ease: this.V.ease.out, delay: this.M.stagger(0.07, { startDelay: 0.12 }) },
      );
      Promise.resolve(anim).finally(() => lines.forEach((l) => {
        l.style.removeProperty('opacity');
        l.style.removeProperty('transform');
      }));
    }

    /* Sticky bar: hidden whenever the summary's checkout button is visible. */
    bindBar() {
      this.io?.disconnect();
      const bar = this.querySelector('[data-cart-bar]');
      const target = this.querySelector('[data-cart-checkout]');
      if (!bar || !target || !('IntersectionObserver' in window)) return;
      this.io = new IntersectionObserver(([entry]) => {
        const hide = entry.isIntersecting;
        bar.classList.toggle('is-hidden', hide);
        bar.inert = hide;
      }, { rootMargin: '0px 0px -40px 0px' });
      this.io.observe(target);
    }

    /* ---------------- events ---------------- */

    onChange(e) {
      const input = e.target.closest('input[name="updates[]"]');
      if (!input) return;
      const line = input.closest('[data-cart-line]');
      if (!line) return;
      const key = line.dataset.key;
      clearTimeout(this.timers.get(key));
      this.timers.set(key, setTimeout(() => {
        this.timers.delete(key);
        if (input.value === '') {
          input.value = input.defaultValue;
          return;
        }
        const qty = Math.max(0, parseInt(input.value, 10) || 0);
        if (qty === Number(input.defaultValue)) return;
        if (qty === 0) this.removeLine(line);
        else this.updateLine(line, qty);
      }, QTY_DELAY));
    }

    onClick(e) {
      const remove = e.target.closest('[data-cart-remove]');
      if (!remove || !this.contains(remove)) return;
      e.preventDefault();
      const line = remove.closest('[data-cart-line]');
      if (line && !line.classList.contains('is-removing')) this.removeLine(line);
    }

    /* Enter in a quantity field: apply it through AJAX instead of implicitly submitting the form
       (its first submit button is the no-JS Update button, hidden once enhanced). */
    onKeydown(e) {
      if (e.key !== 'Enter' || e.isComposing) return;
      const input = e.target.closest('input[name="updates[]"]');
      if (!input || !this.contains(input)) return;
      e.preventDefault();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    onInput(e) {
      const note = e.target.closest('textarea[name="note"]');
      if (!note) return;
      clearTimeout(this.noteTimer);
      const saved = this.querySelector('[data-note-saved]');
      if (saved) saved.textContent = '';
      this.noteTimer = setTimeout(() => {
        this.enqueue(() => this.V.cart.update({ note: note.value }))
          .then(() => {
            const flag = this.querySelector('[data-note-saved]');
            if (flag) flag.textContent = this.msg('msgNote');
            this.announce(this.msg('msgNote'));
          })
          .catch((err) => this.V.toast(err.message || this.msg('msgError'), { type: 'error' }));
      }, NOTE_DELAY);
    }

    /* ---------------- mutations ---------------- */

    rememberFocus(line) {
      const active = document.activeElement;
      if (!active || !line.contains(active)) return null;
      if (active.dataset.qty) return `[data-qty="${active.dataset.qty}"]`;
      if (active.matches('input')) return 'input[name="updates[]"]';
      return null;
    }

    restoreFocus(key, selector) {
      if (!selector) return;
      const line = this.lineByKey(key);
      if (!line) return;
      let target = line.querySelector(selector);
      if (!target || target.disabled) target = line.querySelector('input[name="updates[]"]');
      target?.focus({ preventScroll: true });
    }

    updateLine(line, quantity) {
      const key = line.dataset.key;
      const focusSel = this.rememberFocus(line);
      line.classList.add('is-busy');
      line.setAttribute('aria-busy', 'true');
      this.clearLineError(line);

      return this.enqueue(async () => {
        try {
          const cart = await this.V.cart.change({ id: key, quantity });
          const item = (cart.items || []).find((i) => i.key === key);
          this.restoreFocus(key, focusSel);
          if (item && item.quantity < quantity) {
            this.showLineError(key, this.msg('msgQuantity', { quantity: item.quantity }));
          }
          this.announce(this.msg('msgUpdated', { total: this.V.formatMoney(cart.total_price) }));
        } catch (err) {
          const current = this.lineByKey(key) || line;
          current.classList.remove('is-busy');
          current.removeAttribute('aria-busy');
          const input = current.querySelector('input[name="updates[]"]');
          if (input) {
            input.value = input.defaultValue;
            input.dispatchEvent(new Event('input', { bubbles: false }));
          }
          const message = err.message || this.msg('msgError');
          this.showLineError(key, message);
          this.announce(message);
        }
      });
    }

    removeLine(line) {
      const key = line.dataset.key;
      const title = line.dataset.title || '';
      const lines = Array.from(this.querySelectorAll('[data-cart-line]'));
      const index = lines.indexOf(line);
      this.clearLineError(line);
      const collapsing = this.collapse(line);

      return this.enqueue(async () => {
        try {
          await this.V.cart.change({ id: key, quantity: 0 });
          this.announce(this.msg('msgRemoved', { title }));
          // Keep keyboard users in place: focus the line that slid into this slot, or the summary.
          const next = this.querySelectorAll('[data-cart-line]')[index]
            || this.querySelectorAll('[data-cart-line]')[index - 1];
          const focusTarget = next?.querySelector('.cart-page-line__title a') || this.querySelector('h1');
          if (focusTarget && document.activeElement === document.body) focusTarget.focus({ preventScroll: true });
        } catch (err) {
          await collapsing;
          this.restoreLine(line);
          const message = err.message || this.msg('msgError');
          this.showLineError(key, message);
          this.V.toast(message, { type: 'error' });
        }
      });
    }

    collapse(line) {
      line.classList.add('is-removing');
      line.setAttribute('aria-hidden', 'true');
      if (!this.V.motionOK()) {
        line.style.opacity = '0.35';
        return Promise.resolve();
      }
      const M = this.M;
      const cs = getComputedStyle(line);
      const h = line.getBoundingClientRect().height;
      line.style.overflow = 'hidden';
      const fade = M.animate(
        line,
        { opacity: [1, 0], x: [0, -28], filter: ['blur(0px)', 'blur(4px)'] },
        { duration: 0.26, ease: this.V.ease.in },
      );
      const fold = M.animate(
        line,
        {
          height: [`${h}px`, '0px'],
          paddingTop: [cs.paddingTop, '0px'],
          paddingBottom: [cs.paddingBottom, '0px'],
          marginTop: [cs.marginTop, '0px'],
          borderTopWidth: [cs.borderTopWidth, '0px'],
          borderBottomWidth: [cs.borderBottomWidth, '0px'],
        },
        { duration: 0.42, delay: 0.14, ease: this.V.ease.inOut },
      );
      return Promise.allSettled([fade, fold].map((a) => Promise.resolve(a)));
    }

    restoreLine(line) {
      line.classList.remove('is-removing');
      line.removeAttribute('aria-hidden');
      ['opacity', 'transform', 'filter', 'height', 'padding-top', 'padding-bottom', 'margin-top', 'border-top-width', 'border-bottom-width', 'overflow']
        .forEach((p) => line.style.removeProperty(p));
      if (this.V.motionOK()) this.M.animate(line, { opacity: [0, 1], y: [8, 0] }, this.V.spring);
    }

    /* ---------------- section updates ---------------- */

    onUpdated(e) {
      const markup = e.detail?.sections?.[this.sectionId];
      if (!markup) return;
      const fresh = this.V.parseHTML(markup).querySelector('main-cart');
      if (!fresh) return;

      const wasEmpty = !!this.querySelector('[data-cart-page-empty]');
      const nowEmpty = !!fresh.querySelector('[data-cart-page-empty]');
      if (wasEmpty !== nowEmpty) {
        this.replaceAll(fresh);
        return;
      }
      this.animateShipping();
    }

    async replaceAll(fresh) {
      const motion = this.V.motionOK();
      if (motion) {
        try {
          await this.M.animate(this, { opacity: 0 }, { duration: 0.22, ease: this.V.ease.in });
        } catch (_) { /* noop */ }
      }
      this.innerHTML = fresh.innerHTML;
      this.V.init(this);
      this.setup();
      if (motion) {
        const anim = this.M.animate(this, { opacity: [0, 1] }, { duration: 0.45, ease: this.V.ease.out });
        Promise.resolve(anim).finally(() => this.style.removeProperty('opacity'));
        this.intro();
      } else {
        this.style.removeProperty('opacity');
      }
      const heading = this.querySelector('h1');
      if (heading && (document.activeElement === document.body || !this.contains(document.activeElement))) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }

    animateShipping() {
      const ship = this.querySelector('[data-cart-ship]');
      if (!ship) return;
      const next = parseFloat(ship.style.getPropertyValue('--p')) || 0;
      const prev = this.shipP ?? next;
      this.shipP = next;
      if (prev === next || !this.V.motionOK()) return;
      const fill = ship.querySelector('[data-cart-ship-fill]');
      if (fill) {
        this.M.animate(fill, { scaleX: [prev, next] }, { type: 'spring', stiffness: 140, damping: 22 });
      }
      if (prev < 1 && next >= 1) {
        ship.classList.add('is-celebrating');
        this.M.animate(ship, { scale: [1, 1.03, 1] }, { duration: 0.6, ease: this.V.ease.back });
        setTimeout(() => ship.classList.remove('is-celebrating'), 1400);
      }
    }
  }

  customElements.define('main-cart', MainCart);
})();
