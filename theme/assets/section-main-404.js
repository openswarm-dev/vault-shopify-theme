/*!
 * VAULT — section-main-404.js
 * <flip-card-404> — the 404 card spins in when it enters the viewport, flips with a
 * bouncy spring on tap/click (or the "Flip card" button) and can be spun by dragging
 * horizontally; release snaps to the nearest face using the drag velocity.
 * Reduced motion / no Motion: the button still flips instantly.
 */
(() => {
  'use strict';

  if (customElements.get('flip-card-404')) return;

  customElements.define('flip-card-404', class extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this.inner = this.querySelector('[data-flip-inner]');
      this.stage = this.querySelector('.nf-card__stage');
      this.button = this.querySelector('[data-flip-toggle]');
      if (!this.inner || !this.stage) return;
      this._bound = true;
      this.V = window.Vault;
      this.M = this.V && this.V.Motion;
      this.motion = !!(this.V && this.V.motionOK());
      this.angle = 0;

      this.button?.addEventListener('click', () => this.flip());
      this.bindDrag();

      if (this.motion) this.intro();
    }

    disconnectedCallback() {
      this.anim?.stop?.();
      this.stopInView?.();
    }

    setAngle(deg) {
      this.angle = deg;
      this.inner.style.transform = `rotateY(${deg.toFixed(2)}deg)`;
    }

    syncPressed(angle = this.angle) {
      const faces = Math.round(angle / 180);
      const back = Math.abs(faces) % 2 === 1;
      this.button?.setAttribute('aria-pressed', String(back));
    }

    animateTo(target, velocity = 0, spring = null) {
      this.anim?.stop?.();
      this.syncPressed(target);
      if (!this.motion) {
        this.setAngle(target);
        return;
      }
      this.anim = this.M.animate(this.angle, target, {
        ...(spring || this.V.springBouncy),
        velocity,
        onUpdate: (v) => this.setAngle(v),
      });
    }

    flip() {
      const target = Math.round(this.angle / 180) * 180 + 180;
      if (this.motion) {
        this.M.animate(this.stage, { scale: [1, 0.94, 1] }, { duration: 0.5, ease: this.V.ease.out });
      }
      this.animateTo(target);
    }

    intro() {
      const M = this.M;
      this.stage.style.opacity = '0';
      this.setAngle(-180);
      this.stopInView = M.inView(this.stage, () => {
        M.animate(this.stage, { opacity: [0, 1], y: [48, 0], scale: [0.9, 1] }, { duration: 0.9, ease: this.V.ease.out });
        this.animateTo(0, 0, { type: 'spring', stiffness: 90, damping: 13, mass: 1 });
        setTimeout(() => this.stage.style.removeProperty('transform'), 1000);
      }, { amount: 0.3 });
    }

    bindDrag() {
      const stage = this.stage;
      let down = false;
      let moved = false;
      let startX = 0;
      let startAngle = 0;
      let lastX = 0;
      let lastT = 0;
      let velocity = 0; // deg per second

      stage.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        down = true;
        moved = false;
        startX = lastX = e.clientX;
        lastT = performance.now();
        startAngle = this.angle;
        velocity = 0;
        this.anim?.stop?.();
      });

      stage.addEventListener('pointermove', (e) => {
        if (!down) return;
        const dx = e.clientX - startX;
        if (!moved && Math.abs(dx) > 6) {
          moved = true;
          stage.classList.add('is-dragging');
          stage.setPointerCapture?.(e.pointerId);
        }
        if (!moved) return;
        const now = performance.now();
        const dt = Math.max(1, now - lastT);
        velocity = ((e.clientX - lastX) / dt) * 1000 * 0.6;
        lastX = e.clientX;
        lastT = now;
        this.setAngle(startAngle + dx * 0.6);
      });

      const release = (e, cancelled = false) => {
        if (!down) return;
        down = false;
        stage.classList.remove('is-dragging');
        if (!moved) {
          if (!cancelled) this.flip();
          return;
        }
        const projected = this.angle + velocity * 0.18;
        const target = Math.round(projected / 180) * 180;
        this.animateTo(target, velocity, { type: 'spring', stiffness: 220, damping: 20, mass: 1 });
        if (e && stage.hasPointerCapture?.(e.pointerId)) stage.releasePointerCapture(e.pointerId);
      };

      stage.addEventListener('pointerup', (e) => release(e));
      stage.addEventListener('pointercancel', (e) => release(e, true));
    }
  });
})();
