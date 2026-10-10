/*!
 * VAULT — section-main-password.js
 * <password-teaser> — card fan entrance (Motion stagger, then a CSS spring-like spread),
 * pointer parallax on the fan (desktop), a live launch countdown with rolling digits,
 * auto-opening the owner password modal when the password was wrong, and focusing
 * the newsletter result message after a post.
 */
(() => {
  'use strict';

  if (customElements.get('password-teaser')) return;

  const pad = (n) => String(n).padStart(2, '0');

  customElements.define('password-teaser', class extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      this.V = window.Vault;
      this.M = this.V && this.V.Motion;
      this.motion = !!(this.V && this.V.motionOK());
      this.fan = this.querySelector('[data-fan]');

      this.introFan();
      this.bindParallax();
      this.bindCountdown();
      this.openModalOnError();
      this.focusSignupMessage();
    }

    disconnectedCallback() {
      clearInterval(this.timer);
      clearTimeout(this.fanTimer);
    }

    introFan() {
      if (!this.fan) return;
      if (!this.motion) {
        this.fan.classList.add('is-fanned');
        return;
      }
      const M = this.M;
      const lifts = Array.from(this.fan.querySelectorAll('[data-fan-card]'));
      const anim = M.animate(
        lifts,
        { opacity: [0, 1], y: [70, 0], scale: [0.9, 1] },
        { duration: 1, ease: this.V.ease.out, delay: M.stagger(0.07, { from: 'center', startDelay: 0.15 }) },
      );
      Promise.resolve(anim).finally(() => lifts.forEach((l) => {
        l.style.removeProperty('opacity');
        l.style.removeProperty('transform');
      }));
      this.fanTimer = setTimeout(() => this.fan.classList.add('is-fanned'), 420);
    }

    bindParallax() {
      if (!this.fan || !this.motion || !this.V.canHover()) return;
      const hero = this.querySelector('.pw__hero');
      if (!hero) return;
      const M = this.M;
      const follow = { type: 'spring', stiffness: 120, damping: 18, mass: 0.8 };
      hero.addEventListener('pointermove', this.V.rafThrottle((e) => {
        if (e.pointerType !== 'mouse') return;
        const r = hero.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        M.animate(this.fan, { rotateY: x * 16, rotateX: y * -10 }, follow);
      }));
      hero.addEventListener('pointerleave', () => {
        M.animate(this.fan, { rotateY: 0, rotateX: 0 }, this.V.springSoft);
      });
    }

    bindCountdown() {
      const root = this.querySelector('[data-countdown]');
      if (!root) return;
      const target = parseInt(root.dataset.countdown, 10) * 1000;
      if (!Number.isFinite(target) || target <= Date.now()) {
        root.classList.add('is-live');
        return;
      }
      const nodes = {};
      root.querySelectorAll('[data-unit]').forEach((n) => { nodes[n.dataset.unit] = n; });
      let first = true;

      const set = (node, value) => {
        if (!node) return;
        const text = pad(value);
        if (node.textContent === text) return;
        node.textContent = text;
        if (!first && this.motion) {
          this.M.animate(node, { y: ['-55%', '0%'], opacity: [0, 1] }, { duration: 0.45, ease: this.V.ease.out });
        }
      };

      const tick = () => {
        let diff = target - Date.now();
        if (diff <= 0) {
          clearInterval(this.timer);
          root.classList.add('is-live');
          return;
        }
        const days = Math.floor(diff / 86400000);
        diff -= days * 86400000;
        const hours = Math.floor(diff / 3600000);
        diff -= hours * 3600000;
        const minutes = Math.floor(diff / 60000);
        diff -= minutes * 60000;
        const seconds = Math.floor(diff / 1000);
        set(nodes.days, days);
        set(nodes.hours, hours);
        set(nodes.minutes, minutes);
        set(nodes.seconds, seconds);
        first = false;
      };
      tick();
      this.timer = setInterval(tick, 1000);
    }

    openModalOnError() {
      const modal = this.parentElement?.querySelector('vault-drawer[data-open-on-load]');
      if (!modal) return;
      customElements.whenDefined('vault-drawer').then(() => {
        requestAnimationFrame(() => {
          if (typeof modal.open === 'function') modal.open();
        });
      });
    }

    focusSignupMessage() {
      const msg = this.querySelector('[data-signup-message]');
      if (!msg) return;
      requestAnimationFrame(() => {
        msg.scrollIntoView({ block: 'center' });
        msg.focus({ preventScroll: true });
      });
    }
  });
})();
