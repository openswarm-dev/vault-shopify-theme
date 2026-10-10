/*!
 * VAULT — section-collection-banner.js
 * <collection-banner>
 *   · Deals the card fan in with springs (front card rises, side cards fan out from behind it)
 *   · Desktop pointer: the fan spreads and leans toward the cursor; settles back on leave
 *   · Phones: "Read more" toggle for the clamped description (only when it actually overflows)
 *   · Theme editor: selecting a quick-link block scrolls it into view in the pill row
 * Everything is static and fully visible without JS or with reduced motion.
 */
(() => {
  'use strict';

  const V = () => window.Vault || {};
  const motion = () => !!(V().motionOK && V().motionOK());
  const mqMobile = window.matchMedia('(max-width: 749px)');

  // Resting pose of each card, mirrored from the CSS custom properties.
  const POSE = {
    left: { x: -36, y: 5, r: -13 },
    right: { x: 36, y: 5, r: 13 },
    front: { x: 0, y: -3, r: 0 },
  };

  class CollectionBanner extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      this.fan = this.querySelector('[data-banner-fan]');
      this.cards = this.fan ? Array.from(this.fan.querySelectorAll('[data-fan-card]')) : [];
      this.desc = this.querySelector('[data-desc-body]');
      this.toggle = this.querySelector('[data-desc-toggle]');

      this.onToggle = this.onToggle.bind(this);
      // One fan update per frame, however fast the pointer reports.
      this.onMove = V().rafThrottle ? V().rafThrottle(this.onMove.bind(this)) : this.onMove.bind(this);
      this.onLeave = this.onLeave.bind(this);
      this.onBlockSelect = this.onBlockSelect.bind(this);
      this.measureDesc = this.measureDesc.bind(this);

      this.deal();
      this.bindPointer();

      if (this.desc && this.toggle) {
        this.toggle.addEventListener('click', this.onToggle);
        this.ro = new ResizeObserver(() => this.measureDesc());
        this.ro.observe(this.desc);
        mqMobile.addEventListener?.('change', this.measureDesc);
        this.measureDesc();
      }

      document.addEventListener('shopify:block:select', this.onBlockSelect);
    }

    disconnectedCallback() {
      this.ro?.disconnect();
      mqMobile.removeEventListener?.('change', this.measureDesc);
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
      this.media?.removeEventListener('pointermove', this.onMove);
      this.media?.removeEventListener('pointerleave', this.onLeave);
      this._bound = false;
    }

    /* ---------- Card fan ---------- */
    deal() {
      if (!this.fan) return;
      if (!motion() || !this.cards.length) {
        this.fan.classList.add('is-ready');
        return;
      }
      const M = V().Motion;
      const plate = this.fan.querySelector('[data-fan-plate]');
      // Collapse every card into the deck position before revealing the fan.
      this.cards.forEach((card) => {
        card.style.opacity = '0';
        card.style.transform = 'translateX(0%) translateY(18%) rotate(0deg) scale(0.9)';
      });
      if (plate) plate.style.opacity = '0';
      this.fan.classList.add('is-ready');

      M.inView(this.fan, () => {
        if (plate) {
          M.animate(plate, { opacity: [0, 0.62], rotate: [-1, -7], scale: [0.92, 1] }, { duration: 1.1, ease: V().ease.out });
        }
        const order = ['front', 'left', 'right'];
        const anims = this.cards
          .slice()
          .sort((a, b) => order.indexOf(a.dataset.fanCard) - order.indexOf(b.dataset.fanCard))
          .map((card, i) => {
            const p = POSE[card.dataset.fanCard] || POSE.front;
            const delay = 0.15 + i * 0.12;
            return M.animate(
              card,
              { opacity: [0, 1], x: ['0%', `${p.x}%`], y: ['18%', `${p.y}%`], rotate: [0, p.r], scale: [0.9, 1] },
              {
                type: 'spring',
                stiffness: 130,
                damping: 16,
                mass: 1,
                delay,
                opacity: { duration: 0.4, ease: V().ease.out, delay },
              },
            );
          });
        Promise.allSettled(anims).then(() => { this.dealt = true; });
      }, { amount: 0.3 });
    }

    bindPointer() {
      this.media = this.querySelector('.collection-banner__media');
      if (!this.media || !this.cards.length || !motion() || !V().canHover || !V().canHover()) return;
      this.media.addEventListener('pointermove', this.onMove);
      this.media.addEventListener('pointerleave', this.onLeave);
    }

    onMove(e) {
      if (!this.dealt || e.pointerType !== 'mouse') return;
      const r = this.media.getBoundingClientRect();
      const px = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      const py = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      this.pose(1, px, py);
    }

    onLeave() {
      if (this.dealt) this.pose(0, 0, 0);
    }

    /** spread 0 = resting hand, 1 = fanned wide; px/py lean the hand toward the pointer. */
    pose(spread, px, py) {
      const M = V().Motion;
      const spring = { type: 'spring', stiffness: 180, damping: 20, mass: 0.8 };
      this.cards.forEach((card) => {
        const side = card.dataset.fanCard;
        const p = POSE[side] || POSE.front;
        const dir = side === 'left' ? -1 : side === 'right' ? 1 : 0;
        M.animate(card, {
          x: `${p.x + dir * 12 * spread + px * 4}%`,
          y: `${p.y - (side === 'front' ? 4 : 2) * spread + py * 2}%`,
          rotate: p.r + dir * 5 * spread + px * 3,
        }, spring);
      });
    }

    /* ---------- Description ---------- */
    measureDesc() {
      if (!this.desc || !this.toggle) return;
      if (!mqMobile.matches) {
        this.toggle.hidden = true;
        this.desc.classList.remove('is-short');
        return;
      }
      if (this.desc.classList.contains('is-open')) {
        this.toggle.hidden = false;
        return;
      }
      this.desc.classList.remove('is-short');
      const overflowing = this.desc.scrollHeight > this.desc.clientHeight + 4;
      this.desc.classList.toggle('is-short', !overflowing);
      this.toggle.hidden = !overflowing;
    }

    async onToggle() {
      const open = this.toggle.getAttribute('aria-expanded') !== 'true';
      const label = this.toggle.querySelector('[data-desc-label]');
      this.toggle.setAttribute('aria-expanded', String(open));
      if (label) label.textContent = open ? this.toggle.dataset.labelLess : this.toggle.dataset.labelMore;

      if (!motion()) {
        this.desc.classList.toggle('is-open', open);
        return;
      }
      const M = V().Motion;
      const from = this.desc.offsetHeight;
      // Measure the target height, then animate with the clamp lifted so nothing snaps.
      this.desc.classList.toggle('is-open', open);
      const to = this.desc.offsetHeight;
      this.desc.classList.add('is-open');
      this.desc.style.overflow = 'hidden';
      try {
        await M.animate(this.desc, { height: [`${from}px`, `${to}px`] }, { duration: open ? 0.5 : 0.35, ease: open ? V().ease.out : V().ease.inOut });
      } finally {
        this.desc.classList.toggle('is-open', open);
        this.desc.style.removeProperty('height');
        this.desc.style.removeProperty('overflow');
      }
      if (!open) this.toggle.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    /* ---------- Theme editor ---------- */
    onBlockSelect(e) {
      if (!this.contains(e.target)) return;
      e.target.scrollIntoView({ block: 'nearest', inline: 'center', behavior: motion() ? 'smooth' : 'auto' });
    }
  }

  if (!customElements.get('collection-banner')) customElements.define('collection-banner', CollectionBanner);
})();
