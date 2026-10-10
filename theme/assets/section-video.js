/*
 * Vault — Video section
 * <video-player> markup (sections/video.liquid):
 *   [data-video-frame] > [data-video-poster] + [data-video-slot] + .video__controls > a[data-video-play]
 *   template[data-video-template] holds the YouTube/Vimeo iframe or hosted <video>; it is only
 *   cloned into the slot when the visitor presses play (no third-party requests before that).
 * Without JS the play control is a plain link to the video.
 * Ambient mode: muted looping hosted video with a pause toggle, paused off-screen and for
 * visitors who prefer reduced motion.
 */
if (!customElements.get('video-player')) {
  customElements.define('video-player', class extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      this.V = window.Vault || {};
      this.frame = this.querySelector('[data-video-frame]');
      this.playEl = this.querySelector('[data-video-play]');
      this.template = this.querySelector('template[data-video-template]');
      this.slot = this.querySelector('[data-video-slot]');
      this.ambientVideo = this.querySelector('video.video__ambient');
      this.toggleBtn = this.querySelector('[data-video-toggle]');

      if (this.playEl && this.template && this.slot) this.bindPlayer();
      if (this.ambientVideo) this.bindAmbient();
    }

    disconnectedCallback() {
      this.cleanup?.forEach((fn) => fn());
      this.cleanup = [];
      this.io?.disconnect();
      this._bound = false;
    }

    listen(target, type, fn, opts) {
      if (!target) return;
      target.addEventListener(type, fn, opts);
      (this.cleanup = this.cleanup || []).push(() => target.removeEventListener(type, fn, opts));
    }

    motionOK() {
      return !!(this.V.motionOK && this.V.motionOK() && this.V.Motion);
    }

    /* ---------------- Click-to-play ---------------- */
    bindPlayer() {
      // The link becomes an in-page button once JS is running.
      this.playEl.setAttribute('role', 'button');
      this.playEl.removeAttribute('target');

      this.listen(this.playEl, 'click', (e) => {
        e.preventDefault();
        this.play();
      });
      this.listen(this.playEl, 'keydown', (e) => {
        if (e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          this.play();
        }
      });
      // The whole poster is a click target too (pointer users).
      this.listen(this.frame, 'click', (e) => {
        if (this.playing || e.target.closest('[data-video-play], [data-video-slot]')) return;
        this.play();
      });

      this.bindMagnet();
    }

    /* The play button drifts toward the pointer anywhere over the poster (desktop only). */
    bindMagnet() {
      if (!this.motionOK() || !this.V.canHover || !this.V.canHover() || !this.frame) return;
      const { animate } = this.V.Motion;
      const btn = this.playEl;
      const follow = { type: 'spring', stiffness: 170, damping: 15, mass: 0.6 };
      const settle = { type: 'spring', stiffness: 220, damping: 13, mass: 0.7 };
      const move = this.V.rafThrottle((e) => {
        if (e.pointerType !== 'mouse' || this.playing) return;
        const r = this.frame.getBoundingClientRect();
        const strength = 0.24;
        const x = (e.clientX - (r.left + r.width / 2)) * strength;
        const y = (e.clientY - (r.top + r.height / 2)) * strength;
        animate(btn, { x, y }, follow);
      });
      this.listen(this.frame, 'pointermove', move, { passive: true });
      this.listen(this.frame, 'pointerleave', () => {
        if (!this.playing) animate(btn, { x: 0, y: 0 }, settle);
      });
    }

    play() {
      if (this.playing) return;
      this.playing = true;
      const fragment = this.template.content.cloneNode(true);
      this.slot.appendChild(fragment);
      const media = this.slot.querySelector('iframe, video');

      if (this.motionOK()) {
        const { animate } = this.V.Motion;
        animate(this.playEl, { scale: 1.35, opacity: 0 }, { duration: 0.35, ease: this.V.ease.in });
        animate(this.slot, { opacity: [0, 1] }, { duration: 0.5, delay: 0.1, ease: this.V.ease.out });
      }
      this.classList.add('is-playing');

      if (media) {
        if (media.tagName === 'VIDEO') {
          media.setAttribute('playsinline', '');
          const p = media.play && media.play();
          if (p && p.catch) p.catch(() => {});
        }
        media.setAttribute('tabindex', '-1');
        try { media.focus({ preventScroll: true }); } catch (_) { /* noop */ }
      }
      this.dispatchEvent(new CustomEvent('video:play', { bubbles: true }));
    }

    /* ---------------- Ambient background video ---------------- */
    bindAmbient() {
      const video = this.ambientVideo;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('tabindex', '-1');
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.userPaused = reduce.matches;
      if (this.userPaused) video.pause();

      const tryPlay = () => {
        const p = video.play();
        if (p && p.catch) p.catch(() => {});
      };

      this.listen(this.toggleBtn, 'click', () => {
        this.userPaused = !this.userPaused;
        if (this.userPaused) video.pause();
        else tryPlay();
        this.syncToggle();
      });
      // Keep the toggle honest if the browser blocks or pauses playback on its own.
      this.listen(video, 'pause', () => this.syncToggle());
      this.listen(video, 'play', () => this.syncToggle());

      if ('IntersectionObserver' in window) {
        this.io = new IntersectionObserver(([entry]) => {
          if (this.userPaused) return;
          if (entry.isIntersecting) tryPlay();
          else video.pause();
        }, { threshold: 0.05 });
        this.io.observe(this);
      }
      this.syncToggle();
    }

    syncToggle() {
      if (!this.toggleBtn) return;
      const paused = this.userPaused || this.ambientVideo.paused;
      this.toggleBtn.classList.toggle('is-paused', !!this.userPaused);
      const label = this.userPaused ? this.toggleBtn.dataset.labelPlay : this.toggleBtn.dataset.labelPause;
      if (label) this.toggleBtn.setAttribute('aria-label', label);
      this.toggleAttribute('data-paused', paused);
    }
  });
}
