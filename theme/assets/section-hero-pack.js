/*!
 * VAULT — <hero-pack> (sections/hero-pack.liquid)
 *
 * Intro    sealed pack rises in → a red seam glows and a light beam sweeps across it →
 *          the cards spring out into the fan (centre first) → each card settles into an idle float.
 * Scroll   as the hero leaves the viewport the fan spreads wider and lifts; on desktop the copy
 *          drifts up and fades (Motion scroll, target = hero, offset start start → end start).
 * Pointer  desktop + fine pointer only: the whole stage tilts toward the cursor on a spring and the
 *          cards parallax at different depths. Individual cards keep their own <holo-card> tilt.
 *
 * Everything is gated by Vault.motionOK(). Without it the CSS fan (same geometry) is the final state.
 * Each transform layer of a card is driven by exactly one thing (see section-hero-pack.css header),
 * so the intro, scroll, float and pointer effects compose instead of fighting.
 */
(() => {
  'use strict';

  if (customElements.get('hero-pack')) return;

  const mqTablet = window.matchMedia('(min-width: 750px)');
  const mqDesktop = window.matchMedia('(min-width: 990px)');
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  const cssNumber = (el, prop) => parseFloat(getComputedStyle(el).getPropertyValue(prop)) || 0;
  const RAD = 180 / Math.PI;

  class HeroPack extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      this.cleanups = [];
      this.bindings = [];
      this.floats = [];
      this.visible = true;

      // Full-height heroes fill exactly the rest of the first screen (below the announcement bar,
      // under an overlaid header or below a solid one). Layout only, so it runs without motion too.
      this.measureTop = () => {
        const top = this.getBoundingClientRect().top + window.scrollY;
        if (top < window.innerHeight * 0.6) this.style.setProperty('--hp-top', `${Math.max(0, Math.round(top))}px`);
        else this.style.removeProperty('--hp-top');
      };
      this.onResize = (window.Vault && window.Vault.debounce) ? window.Vault.debounce(this.measureTop, 200) : this.measureTop;
      window.addEventListener('resize', this.onResize, { passive: true });
      if (document.readyState !== 'complete') window.addEventListener('load', this.measureTop, { once: true });
      this.measureTop();

      // A looping background video is motion too: hold it still for reduced-motion visitors.
      const video = this.querySelector('.hero-pack__bg video');
      if (video && mqReduce.matches) {
        video.removeAttribute('autoplay');
        video.pause();
      }

      const V = window.Vault;
      if (!V || !V.motionOK()) {
        this.classList.add('is-intro-done');
        return;
      }
      this.V = V;
      this.M = V.Motion;
      this.fan = this.querySelector('[data-hp-fan]');
      this.content = this.querySelector('[data-hp-content]');
      this.glow = this.querySelector('[data-hp-glow]');
      this.cards = V.$$('[data-hp-card]', this);
      if (!this.fan || !this.cards.length) {
        this.classList.add('is-intro-done');
        return;
      }

      // Idle loops only run while the hero is on screen.
      this.cleanups.push(this.M.inView(this, () => {
        this.visible = true;
        this.floats.forEach((a) => a.play());
        return () => {
          this.visible = false;
          this.floats.forEach((a) => a.pause());
        };
      }, { margin: '80px' }));

      // Scroll distances and the pointer rig depend on the breakpoint (iPads rotate across 990px).
      this.rebind = V.debounce(() => this.bindInteractive(), 150);
      mqTablet.addEventListener('change', this.rebind);
      mqDesktop.addEventListener('change', this.rebind);

      this.bindInteractive();
      requestAnimationFrame(() => this.intro());
    }

    disconnectedCallback() {
      this._bound = false;
      if (this.onResize) window.removeEventListener('resize', this.onResize);
      this.unbindInteractive();
      this.floats.forEach((a) => a.stop());
      this.floats = [];
      this.cleanups.forEach((fn) => typeof fn === 'function' && fn());
      this.cleanups = [];
      if (this.rebind) {
        mqTablet.removeEventListener('change', this.rebind);
        mqDesktop.removeEventListener('change', this.rebind);
      }
    }

    /* ---------------------------------------------------------------- *
     * Intro choreography
     * ---------------------------------------------------------------- */
    async intro() {
      const { animate } = this.M;
      const V = this.V;
      const k = V.intensity;
      const shown = this.cards.filter((card) => card.getClientRects().length);

      // Read each card's final fan pose from CSS (pack state switched off for one synchronous read).
      this.classList.add('is-measuring');
      const items = shown.map((card) => {
        const el = card.querySelector('[data-hp-fan-item]');
        const t = getComputedStyle(el).transform;
        const m = t && t !== 'none' ? new DOMMatrixReadOnly(t) : new DOMMatrixReadOnly();
        const o = cssNumber(card, '--o');
        return {
          el,
          o,
          x: m.e,
          y: m.f,
          rotate: Math.atan2(m.b, m.a) * RAD,
          packY: el.offsetHeight * 0.1,
          packR: o * 2.2,
        };
      });
      this.classList.remove('is-measuring');

      try {
        // 1 — The sealed pack rises into place (same pose as the CSS pack state, so nothing jumps).
        await Promise.all(items.map((it, i) => animate(
          it.el,
          {
            opacity: [0, 1],
            x: [0, 0],
            y: [it.packY + 70 * k, it.packY],
            rotate: [it.packR, it.packR],
            scale: [0.78, 0.84],
          },
          { duration: 0.85, delay: 0.1 + i * 0.05, ease: V.ease.out },
        )));
        if (!this.isConnected) return;

        // 2 — Anticipation squeeze while the seam ignites and a beam tears across the pack.
        const seam = this.querySelector('[data-hp-seam]');
        const beam = this.querySelector('[data-hp-beam]');
        const band = this.querySelector('[data-hp-beam-band]');
        const flash = this.querySelector('[data-hp-flash]');
        if (seam) {
          animate(seam, { scaleX: [0, 1], opacity: [0, 1, 1, 0] }, {
            duration: 0.75,
            ease: V.ease.out,
            opacity: { duration: 0.75, times: [0, 0.12, 0.6, 1], ease: 'linear' },
          });
        }
        if (beam && band) {
          animate(beam, { opacity: [0, 1, 1, 0] }, { duration: 0.7, delay: 0.08, times: [0, 0.15, 0.75, 1], ease: 'linear' });
          animate(band, { x: ['-60%', '60%'] }, { duration: 0.7, delay: 0.08, ease: V.ease.inOut });
        }
        await Promise.all(items.map((it) => animate(
          it.el,
          { scale: [0.84, 0.9], y: [it.packY, it.packY - 8] },
          { duration: 0.38, ease: V.ease.inOut },
        )));
        if (!this.isConnected) return;

        // 3 — Burst: flash, then every card springs out into the fan, centre card first.
        if (flash) animate(flash, { scale: [0.3, 1.45], opacity: [0, 0.95, 0] }, { duration: 1.05, ease: V.ease.out });
        const ranked = [...items].sort((a, b) => Math.abs(a.o) - Math.abs(b.o));
        await Promise.all(items.map((it) => animate(
          it.el,
          { x: it.x, y: it.y, rotate: it.rotate, scale: 1 },
          { type: 'spring', stiffness: 165, damping: 15, mass: 1, delay: ranked.indexOf(it) * 0.075 },
        )));
      } catch (_) {
        /* An interrupted animation still ends in the CSS fan below. */
      }
      if (!this.isConnected) return;
      this.finishIntro(items);
    }

    finishIntro(items) {
      this.classList.add('is-intro-done');
      // CSS now holds the identical fan pose; drop Motion's pixel values so resizes stay fluid.
      requestAnimationFrame(() => {
        items.forEach(({ el }) => ['transform', 'opacity', 'will-change'].forEach((p) => el.style.removeProperty(p)));
      });
      this.startFloat();
    }

    startFloat() {
      const { animate } = this.M;
      const k = this.V.intensity;
      const light = !mqTablet.matches;
      this.floats = this.cards.map((card, i) => {
        const el = card.querySelector('[data-hp-float]');
        const depth = parseFloat(card.dataset.depth) || 1;
        const dir = i % 2 ? 1 : -1;
        const amp = (light ? 4 : 7) * depth * k;
        const anim = animate(
          el,
          { y: [0, -amp], rotate: [0, 1.5 * dir * k] },
          {
            duration: 3.1 + (i % 3) * 0.6,
            delay: i * 0.18,
            repeat: Infinity,
            repeatType: 'mirror',
            ease: 'easeInOut',
          },
        );
        if (!this.visible) anim.pause();
        return anim;
      });
    }

    /* ---------------------------------------------------------------- *
     * Scroll-linked depth + pointer rig (rebuilt when the breakpoint changes)
     * ---------------------------------------------------------------- */
    bindInteractive() {
      this.unbindInteractive();
      if (!this.isConnected) return;
      const { animate, scroll } = this.M;
      const k = this.V.intensity;
      const desktop = mqDesktop.matches;
      const tablet = mqTablet.matches;
      const w = this.fan.clientWidth || 320;
      const options = { target: this, offset: ['start start', 'end start'] };
      const link = (anim) => this.bindings.push({ anim, stop: scroll(anim, options) });

      const spread = (desktop ? 0.11 : tablet ? 0.07 : 0.045) * w * k;
      const lift = (desktop ? 0.12 : 0.05) * w * k;
      this.cards.forEach((card) => {
        const o = cssNumber(card, '--o');
        link(animate(
          card,
          { x: [0, o * spread], y: [0, -lift - Math.abs(o) * lift * 0.3], rotate: [0, o * 6 * k] },
          { ease: 'linear' },
        ));
      });

      // On stacked layouts the copy sits above the fan, so only desktop fades it out.
      if (desktop && this.content) {
        link(animate(
          this.content,
          { y: [0, -120 * k], opacity: [1, 1, 0] },
          { ease: 'linear', opacity: { times: [0, 0.3, 0.85], ease: 'linear' } },
        ));
      }
      if (this.glow) link(animate(this.glow, { scale: [1, 1.25], opacity: [1, 0.35] }, { ease: 'linear' }));

      if (desktop && this.V.canHover()) this.bindPointer();
    }

    unbindInteractive() {
      (this.bindings || []).forEach(({ anim, stop }) => {
        try {
          stop();
          anim.cancel();
        } catch (_) { /* already finished */ }
      });
      this.bindings = [];
      if (this.pointerOff) this.pointerOff();
      this.pointerOff = null;
    }

    bindPointer() {
      const { animate } = this.M;
      const k = this.V.intensity;
      const spring = { type: 'spring', stiffness: 110, damping: 16, mass: 0.9 };
      const layers = this.cards
        .map((card) => [card.querySelector('[data-hp-depth]'), parseFloat(card.dataset.depth) || 1])
        .filter(([el]) => el);

      // Viewport-relative so no layout is read per frame.
      const move = this.V.rafThrottle((e) => {
        if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
        const nx = (e.clientX / window.innerWidth - 0.5) * 2;
        const ny = (e.clientY / window.innerHeight - 0.5) * 2;
        animate(this.fan, { rotateY: nx * 9 * k, rotateX: -ny * 7 * k }, spring);
        layers.forEach(([el, d]) => animate(el, { x: nx * 22 * d * k, y: ny * 14 * d * k }, spring));
      });
      const leave = () => {
        animate(this.fan, { rotateY: 0, rotateX: 0 }, spring);
        layers.forEach(([el]) => animate(el, { x: 0, y: 0 }, spring));
      };
      this.addEventListener('pointermove', move, { passive: true });
      this.addEventListener('pointerleave', leave);
      this.pointerOff = () => {
        this.removeEventListener('pointermove', move);
        this.removeEventListener('pointerleave', leave);
        leave();
      };
    }
  }

  customElements.define('hero-pack', HeroPack);
})();
