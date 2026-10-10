/*!
 * Vault — CTA banner <cta-banner>
 * Deals the fanned card trio in when it scrolls into view: the centre card lands first,
 * then the side cards spring out from underneath it. Hover spread is pure CSS.
 * Without motion the cards are simply shown in their fanned positions.
 */
(() => {
  'use strict';

  if (customElements.get('cta-banner')) return;

  // Inverse of each card's fan offset → every card starts stacked under the centre card.
  const FROM = [
    { x: '46%', y: 30, rotate: 14 },
    { x: '0%', y: 46, rotate: -4 },
    { x: '-46%', y: 30, rotate: -14 },
  ];
  const DELAYS = [0.32, 0.08, 0.4];

  class CtaBanner extends HTMLElement {
    connectedCallback() {
      if (!this._bound) {
        this._bound = true;
        const V = window.Vault;
        this.deals = Array.from(this.querySelectorAll('[data-cta-deal]'));
        if (!V || !V.Motion || !V.motionOK() || !this.deals.length) return;
        this.V = V;
        this.M = V.Motion;
        this.classList.add('is-armed');
      }
      if (!this.M || this.dealt || this.stopInView) return;
      const fan = this.querySelector('[data-cta-fan]') || this;
      this.stopInView = this.M.inView(fan, () => this.deal(), { amount: 0.35 });
    }

    disconnectedCallback() {
      if (this.stopInView) this.stopInView();
      this.stopInView = null;
    }

    deal() {
      if (this.dealt) return;
      this.dealt = true;
      const M = this.M;
      const anims = this.deals.map((el, i) => {
        const from = FROM[i] || FROM[1];
        return M.animate(
          el,
          { opacity: [0, 1], x: [from.x, '0%'], y: [from.y, 0], rotate: [from.rotate, 0], scale: [0.9, 1] },
          { type: 'spring', stiffness: 170, damping: 18, mass: 1, delay: DELAYS[i] ?? 0.2 },
        );
      });
      const finish = () => {
        this.classList.remove('is-armed');
        this.deals.forEach((el) => {
          el.style.removeProperty('opacity');
          el.style.removeProperty('transform');
        });
      };
      Promise.allSettled(anims.map((a) => Promise.resolve(a))).then(finish);
      if (this.stopInView) {
        this.stopInView();
        this.stopInView = null;
      }
    }
  }

  customElements.define('cta-banner', CtaBanner);
})();
