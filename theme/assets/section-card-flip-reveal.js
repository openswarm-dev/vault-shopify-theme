/*!
 * VAULT — <card-flip-reveal> (sections/card-flip-reveal.liquid)
 *
 * Cards start face-down (CSS, motion only). Mode "auto": when the list scrolls into view the cards
 * flip one after another. Mode "click": each card waits for a tap/click (or "Reveal all").
 * A flip = spring rotateY 180 → 0 on the rotator, while the lift layer rises and scales up to a peak
 * mid-flip and the shadow grows; chase cards fire a red glow burst behind them.
 * Every card keeps a toggle button (aria-pressed) so it can be flipped back and forth by keyboard.
 * Without motion the fronts are shown and nothing flips.
 */
(() => {
  'use strict';

  if (customElements.get('card-flip-reveal')) return;

  class CardFlipReveal extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      const V = window.Vault;
      if (!V) return;
      this._bound = true;
      this.V = V;
      this.M = V.Motion;
      this.timers = [];
      this.cleanups = [];

      if (!V.motionOK()) {
        this.classList.add('is-static');
        return;
      }

      this.mode = this.dataset.mode === 'click' ? 'click' : 'auto';
      this.stagger = parseFloat(this.dataset.stagger) || 0.15;
      this.list = this.querySelector('[data-cfr-list]');
      this.revealAllBtn = this.querySelector('[data-cfr-reveal-all]');
      this.items = V.$$('[data-cfr-item]', this).map((el) => ({
        el,
        card: el.querySelector('[data-cfr-card]'),
        lift: el.querySelector('[data-cfr-lift]'),
        rotator: el.querySelector('[data-cfr-rotator]'),
        shadow: el.querySelector('[data-cfr-shadow]'),
        burst: el.querySelector('[data-cfr-burst]'),
        toggle: el.querySelector('[data-cfr-toggle]'),
        chase: el.hasAttribute('data-chase'),
        revealed: false,
      })).filter((it) => it.card && it.rotator && it.lift);

      // Hand the face-down pose (already shown by CSS) to Motion so springs start from it.
      this.items.forEach((it) => {
        this.M.animate(it.rotator, { rotateY: 180 }, { duration: 0 });
        it.el.classList.remove('is-revealed');
        if (it.toggle) {
          it.toggle.hidden = false;
          it.toggle.setAttribute('aria-pressed', 'false');
          it.onToggle = (e) => {
            e.stopPropagation();
            this.flip(it);
          };
          it.toggle.addEventListener('click', it.onToggle);
        }
        it.onCard = (e) => {
          if (it.revealed) return;
          e.preventDefault();
          this.reveal(it);
        };
        it.card.addEventListener('click', it.onCard);
      });
      this.classList.add('is-ready');

      if (this.revealAllBtn) {
        this.revealAllBtn.hidden = false;
        this.onRevealAll = () => this.revealSequence(0);
        this.revealAllBtn.addEventListener('click', this.onRevealAll);
      }

      if (this.mode === 'auto' && this.list) {
        this.cleanups.push(this.M.inView(this.list, () => {
          this.revealSequence(0.1);
        }, { amount: 0.3 }));
      }

      this.onBlockSelect = (e) => {
        const it = this.items.find((item) => item.el === e.target || item.el.contains(e.target));
        if (it) this.reveal(it);
      };
      this.addEventListener('shopify:block:select', this.onBlockSelect);
      this.sync();
    }

    disconnectedCallback() {
      if (!this._bound) return;
      this._bound = false;
      this.timers.forEach(clearTimeout);
      this.timers = [];
      this.cleanups.forEach((fn) => typeof fn === 'function' && fn());
      this.cleanups = [];
      (this.items || []).forEach((it) => {
        it.toggle?.removeEventListener('click', it.onToggle);
        it.card.removeEventListener('click', it.onCard);
      });
      this.revealAllBtn?.removeEventListener('click', this.onRevealAll);
      if (this.onBlockSelect) this.removeEventListener('shopify:block:select', this.onBlockSelect);
    }

    later(fn, seconds) {
      this.timers.push(setTimeout(fn, Math.max(0, seconds * 1000)));
    }

    revealSequence(startDelay) {
      this.items
        .filter((it) => !it.revealed)
        .forEach((it, i) => this.reveal(it, startDelay + i * this.stagger));
    }

    flip(it) {
      if (it.revealed) this.hide(it);
      else this.reveal(it);
    }

    reveal(it, delay = 0) {
      if (it.revealed) return;
      it.revealed = true;
      const { animate } = this.M;
      const V = this.V;
      const k = V.intensity;
      it.toggle?.setAttribute('aria-pressed', 'true');
      this.later(() => it.el.classList.add('is-revealed'), delay + 0.12);

      animate(it.rotator, { rotateY: 0 }, { type: 'spring', stiffness: 120, damping: 13, mass: 1, delay });
      animate(it.lift, { y: [0, -26 * k, 0], scale: [1, 1 + 0.07 * k, 1] }, {
        duration: 0.62, delay, ease: 'easeInOut', times: [0, 0.4, 1],
      });
      if (it.shadow) {
        animate(it.shadow, { opacity: [0.5, 0.95, 0.55], scale: [0.92, 1.22, 1] }, {
          duration: 0.62, delay, ease: 'easeInOut', times: [0, 0.4, 1],
        });
      }
      if (it.chase && it.burst) {
        animate(it.burst, { opacity: [0, 1, 0], scale: [0.4, 1.3, 1.75] }, { duration: 1.1, delay: delay + 0.22, ease: V.ease.out });
        this.later(() => it.el.classList.add('is-lit'), delay + 0.32);
      }
      this.later(() => this.sync(), delay);
    }

    hide(it) {
      if (!it.revealed) return;
      it.revealed = false;
      const { animate } = this.M;
      it.el.classList.remove('is-revealed', 'is-lit');
      it.toggle?.setAttribute('aria-pressed', 'false');
      animate(it.rotator, { rotateY: 180 }, { type: 'spring', stiffness: 120, damping: 15, mass: 1 });
      animate(it.lift, { y: [0, -16, 0], scale: [1, 1.04, 1] }, { duration: 0.55, ease: 'easeInOut', times: [0, 0.4, 1] });
      this.sync();
    }

    /* "Reveal all" is only useful while something is still face-down. */
    sync() {
      if (this.revealAllBtn) this.revealAllBtn.disabled = this.items.every((it) => it.revealed);
    }
  }

  customElements.define('card-flip-reveal', CardFlipReveal);
})();
