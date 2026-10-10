/*!
 * VAULT — section-announcement-bar.js
 * <announcement-bar data-mode="rotate">: auto-advances every data-interval seconds; the
 * outgoing message slides up and fades, the next one springs in (Motion). Pauses on hover,
 * focus, hidden tabs and while a block is selected in the theme editor. Arrows (≥750px) and
 * horizontal swipes (touch) navigate manually; manual changes are announced politely.
 */
(() => {
  'use strict';

  if (customElements.get('announcement-bar')) return;

  const Vault = window.Vault || {};
  const motionOK = () => typeof Vault.motionOK === 'function' && Vault.motionOK();
  const ease = Vault.ease || { in: [0.55, 0, 1, 0.45] };
  const stop = (anim) => {
    try {
      if (anim && typeof anim.stop === 'function') anim.stop();
    } catch (_) { /* already finished */ }
  };
  const clear = (el) => {
    el.style.removeProperty('transform');
    el.style.removeProperty('opacity');
  };

  class AnnouncementBar extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this.slides = Array.from(this.querySelectorAll('[data-announcement-slide]'));
      if (this.dataset.mode !== 'rotate' || this.slides.length < 2) return;
      this._bound = true;
      this.viewport = this.querySelector('[data-announcement-viewport]');
      this.index = Math.max(0, this.slides.findIndex((s) => s.classList.contains('is-active')));
      this.delay = Math.max(2, parseFloat(this.dataset.interval) || 4.5) * 1000;
      this.hovering = false;
      this.focused = false;
      this.editorHold = false;
      this.cleanups = [];
      this.slides.forEach((slide, i) => { slide.inert = i !== this.index; });

      const listen = (target, type, fn, opts) => {
        if (!target) return;
        target.addEventListener(type, fn, opts);
        this.cleanups.push(() => target.removeEventListener(type, fn, opts));
      };
      listen(this.querySelector('[data-announcement-prev]'), 'click', () => this.go(this.index - 1, -1, true));
      listen(this.querySelector('[data-announcement-next]'), 'click', () => this.go(this.index + 1, 1, true));
      listen(this, 'pointerenter', (e) => { if (e.pointerType === 'mouse') this.hovering = true; });
      listen(this, 'pointerleave', () => { this.hovering = false; });
      listen(this, 'focusin', () => { this.focused = true; });
      listen(this, 'focusout', (e) => { if (!this.contains(e.relatedTarget)) this.focused = false; });

      // Touch swipe
      listen(this.viewport, 'pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        this.swipe = { x: e.clientX, y: e.clientY };
      }, { passive: true });
      listen(this.viewport, 'pointerup', (e) => {
        if (!this.swipe) return;
        const dx = e.clientX - this.swipe.x;
        const dy = e.clientY - this.swipe.y;
        this.swipe = null;
        if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          const dir = dx < 0 ? 1 : -1;
          this.go(this.index + dir, dir, true);
        }
      });
      listen(this.viewport, 'pointercancel', () => { this.swipe = null; });

      // Theme editor: show the selected announcement and hold it.
      listen(document, 'shopify:block:select', (e) => {
        const i = this.slides.findIndex((s) => s === e.target || s.contains(e.target));
        if (i === -1) return;
        this.editorHold = true;
        this.go(i, i >= this.index ? 1 : -1);
      });
      listen(document, 'shopify:block:deselect', (e) => {
        if (this.slides.some((s) => s === e.target || s.contains(e.target))) this.editorHold = false;
      });

      this.start();
    }

    disconnectedCallback() {
      this.stopTimer();
      (this.cleanups || []).forEach((fn) => fn());
      this.cleanups = [];
      this._bound = false;
    }

    get paused() {
      return this.hovering || this.focused || this.editorHold || document.hidden;
    }

    start() {
      this.stopTimer();
      this.timer = setInterval(() => {
        if (!this.paused) this.go(this.index + 1, 1);
      }, this.delay);
    }

    stopTimer() {
      clearInterval(this.timer);
    }

    go(target, dir = 1, user = false) {
      const n = this.slides.length;
      const next = ((target % n) + n) % n;
      if (next === this.index) return;
      const outgoing = this.slides[this.index];
      const incoming = this.slides[next];
      this.index = next;
      if (user) {
        this.viewport.setAttribute('aria-live', 'polite');
        this.start();
      }

      outgoing.classList.remove('is-active');
      outgoing.setAttribute('aria-hidden', 'true');
      outgoing.inert = true;
      incoming.classList.remove('is-leaving');
      incoming.classList.add('is-active');
      incoming.removeAttribute('aria-hidden');
      incoming.inert = false;

      stop(outgoing._anim);
      stop(incoming._anim);
      if (!motionOK()) {
        clear(outgoing);
        clear(incoming);
        return;
      }
      const M = Vault.Motion;
      outgoing.classList.add('is-leaving');
      outgoing._anim = M.animate(outgoing, { y: [0, -16 * dir], opacity: [1, 0] }, { duration: 0.3, ease: ease.in });
      Promise.resolve(outgoing._anim).then(() => {
        if (outgoing.classList.contains('is-active')) return;
        outgoing.classList.remove('is-leaving');
        clear(outgoing);
      }, () => {});
      incoming._anim = M.animate(
        incoming,
        { y: [18 * dir, 0], opacity: [0, 1] },
        { type: 'spring', stiffness: 300, damping: 22, mass: 0.9, delay: 0.1, opacity: { duration: 0.3, delay: 0.1 } },
      );
      Promise.resolve(incoming._anim).then(() => {
        if (incoming.classList.contains('is-active')) clear(incoming);
      }, () => {});
    }
  }

  customElements.define('announcement-bar', AnnouncementBar);
})();
