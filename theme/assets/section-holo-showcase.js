/*!
 * VAULT — <holo-showcase> (sections/holo-showcase.liquid)
 *
 * Pinned mode (≥990px wide, ≥620px tall, motion allowed — mirrors the CSS media query):
 *   Motion scroll (target = section, offset start start → end end) drives
 *   · the card rotator: front → turns to its back → home again, with a slight scale-up,
 *   · the holo foil vars, so the shine travels across the card as it turns,
 *   · callouts (.is-in / .is-active), their connector lines and the segmented progress rail.
 *   Pointer hover still tilts the card through <holo-card> (that layer sits inside the rotator).
 * Free mode (everything else): tilt sweep when the card scrolls into view; tap the card or the
 *   Flip button (aria-pressed) to turn it over with a spring. Reduced motion flips instantly via CSS.
 * The mode is re-evaluated live, so an iPad rotating between portrait and landscape just works.
 */
(() => {
  'use strict';

  if (customElements.get('holo-showcase')) return;

  const PIN_QUERY = '(min-width: 990px) and (min-height: 620px)';
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  class HoloShowcase extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      const V = window.Vault;
      this.rotator = this.querySelector('[data-hs-rotator]');
      this.card = this.querySelector('[data-hs-card]');
      if (!V || !this.rotator || !this.card) return;
      this._bound = true;

      this.V = V;
      this.M = V.Motion;
      this.motion = V.motionOK();
      this.holo = this.querySelector('[data-hs-holo]');
      this.flipBtn = this.querySelector('[data-hs-flip]');
      this.features = V.$$('[data-hs-feature]', this);
      this.segments = V.$$('[data-hs-seg]', this);
      this.counter = this.querySelector('[data-hs-current]');
      this.stops = [];
      this.anims = [];
      this.flipped = false;
      this.pinned = null;
      this.active = -2;

      this.classList.add('is-ready');
      this.classList.toggle('is-motion', this.motion);

      this.onToggle = () => this.toggleFlip();
      this.onCardClick = () => { if (!this.pinned) this.toggleFlip(); };
      this.onBlockSelect = (e) => this.revealBlock(e.target);
      this.flipBtn?.addEventListener('click', this.onToggle);
      this.card.addEventListener('click', this.onCardClick);
      this.addEventListener('shopify:block:select', this.onBlockSelect);

      this.mq = window.matchMedia(PIN_QUERY);
      this.onMedia = () => this.setMode();
      this.mq.addEventListener('change', this.onMedia);
      this.setMode();
    }

    disconnectedCallback() {
      if (!this._bound) return;
      this._bound = false;
      this.teardown();
      this.mq?.removeEventListener('change', this.onMedia);
      this.flipBtn?.removeEventListener('click', this.onToggle);
      this.card?.removeEventListener('click', this.onCardClick);
      this.removeEventListener('shopify:block:select', this.onBlockSelect);
    }

    setMode() {
      const pin = this.motion && this.mq.matches;
      if (pin === this.pinned) return;
      this.teardown();
      this.pinned = pin;
      this.classList.toggle('is-pinned', pin);
      if (this.flipBtn) this.flipBtn.hidden = pin;
      if (pin) this.setupPinned();
      else this.setupFree();
    }

    /* Feature i appears once progress passes its threshold (spread across 6%–90% of the scroll). */
    threshold(i) {
      return 0.06 + i * (0.84 / Math.max(1, this.features.length));
    }

    setupPinned() {
      const { animate, scroll } = this.M;
      const options = { target: this, offset: ['start start', 'end end'] };
      const k = this.V.intensity;

      // Front (0–20%) → turns to the back (20–42%) → holds (42–58%) → turns home (58–80%).
      const turn = animate(
        this.rotator,
        {
          rotateY: [0, 0, 180, 180, 360, 360],
          rotateX: [10 * k, 0, -5 * k, 0, 4 * k, 0],
          scale: [0.92, 1, 1.04, 1.04, 1.07, 1.07],
        },
        { times: [0, 0.2, 0.42, 0.58, 0.8, 1], ease: 'easeInOut' },
      );
      this.anims.push(turn);
      this.stops.push(scroll(turn, options));
      this.stops.push(scroll((p) => this.onProgress(p), options));
    }

    onProgress(p) {
      const n = this.features.length;
      let active = -1;
      for (let i = 0; i < n; i += 1) if (p >= this.threshold(i)) active = i;

      if (active !== this.active) {
        this.active = active;
        this.features.forEach((f, i) => {
          f.classList.toggle('is-in', i <= active);
          f.classList.toggle('is-active', i === active);
        });
        if (this.counter) this.counter.textContent = String(Math.max(1, active + 1)).padStart(2, '0');
      }

      this.segments.forEach((seg, i) => {
        const a = this.threshold(i);
        const b = i + 1 < n ? this.threshold(i + 1) : 0.96;
        seg.style.setProperty('--seg', clamp((p - a) / (b - a), 0, 1).toFixed(3));
      });

      // Let the foil catch the light as the card turns — unless the visitor is hovering it.
      const holo = this.holo;
      if (holo && !holo.classList.contains('is-active') && !holo.classList.contains('is-sweeping')) {
        const px = 0.5 + 0.45 * Math.sin(p * Math.PI * 3);
        const py = 0.5 + 0.3 * Math.cos(p * Math.PI * 2);
        const hyp = 0.3 + 0.55 * Math.abs(Math.sin(p * Math.PI * 4));
        holo.style.setProperty('--px', px.toFixed(3));
        holo.style.setProperty('--py', py.toFixed(3));
        holo.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
        holo.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
        holo.style.setProperty('--hyp', hyp.toFixed(3));
      }
    }

    setupFree() {
      this.setFlipped(false, true);
      if (!this.motion) return;
      // A gentle tilt sweep the first time the card comes into view.
      const { animate, inView } = this.M;
      this.stops.push(inView(this.card, () => {
        if (this.flipped) return;
        animate(this.rotator, { rotateY: [-28, 0], rotateX: [8, 0] }, { type: 'spring', stiffness: 80, damping: 12, mass: 1 });
      }, { amount: 0.5 }));
    }

    toggleFlip() {
      this.setFlipped(!this.flipped);
    }

    setFlipped(state, instant = false) {
      this.flipped = state;
      this.classList.toggle('is-flipped', state);
      this.flipBtn?.setAttribute('aria-pressed', String(state));
      if (!this.motion) return;
      this.M.animate(
        this.rotator,
        { rotateY: state ? 180 : 0, rotateX: 0, scale: 1 },
        instant ? { duration: 0 } : { type: 'spring', stiffness: 130, damping: 14, mass: 1 },
      );
    }

    teardown() {
      this.stops.forEach((stop) => typeof stop === 'function' && stop());
      this.stops = [];
      this.anims.forEach((anim) => {
        try { anim.cancel(); } catch (_) { /* already finished */ }
      });
      this.anims = [];
      this.active = -2;
      this.features.forEach((f) => f.classList.remove('is-in', 'is-active'));
      this.segments.forEach((seg) => seg.style.removeProperty('--seg'));
      if (this.holo) ['--px', '--py', '--mx', '--my', '--hyp'].forEach((p) => this.holo.style.removeProperty(p));
      if (this.motion && this.M) this.M.animate(this.rotator, { rotateY: 0, rotateX: 0, scale: 1 }, { duration: 0 });
    }

    /* Theme editor: selecting a feature block scrolls the pinned story to it. */
    revealBlock(target) {
      const feature = target && target.closest ? target.closest('[data-hs-feature]') : null;
      if (!feature || !this.pinned) return;
      const i = this.features.indexOf(feature);
      if (i < 0) return;
      const top = window.scrollY + this.getBoundingClientRect().top;
      const travel = Math.max(0, this.offsetHeight - window.innerHeight);
      window.scrollTo({ top: top + travel * Math.min(1, this.threshold(i) + 0.05), behavior: 'auto' });
    }
  }

  customElements.define('holo-showcase', HoloShowcase);
})();
