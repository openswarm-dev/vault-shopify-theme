/*!
 * VAULT — component-product-gallery.js
 *
 * <product-gallery>  (snippets/product-gallery.liquid)
 *   Keeps thumbnails / counter / tools in sync with the <vault-carousel> stage, flips the featured card
 *   180° on a Motion spring to reveal media[1], opens the zoom lightbox and pauses off-screen video.
 *   Public: showMedia(mediaId) — used by <product-info> on variant change. goTo(index, instant).
 *
 * <product-zoom>     (inside <vault-drawer class="pz-drawer">)
 *   Swipe / arrows / ←→ between images, click or tap to zoom at a point, mouse-move or drag to pan,
 *   two-finger pinch to scale. Public: show(mediaId), currentMediaId().
 *
 * Everything works without Motion; animation is gated by Vault.motionOK().
 */
(() => {
  'use strict';

  const motionOK = () => !!(window.Vault && typeof window.Vault.motionOK === 'function' && window.Vault.motionOK());
  const canHover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const rafThrottle = (fn) => {
    let queued = false;
    return (...args) => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn(...args);
      });
    };
  };

  /* ------------------------------------------------------------------ *
   * <product-gallery>
   * ------------------------------------------------------------------ */
  class ProductGallery extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;

      this.carousel = this.querySelector('vault-carousel');
      this.track = this.querySelector('[data-carousel-track]');
      this.slides = Array.from(this.querySelectorAll('[data-media-slide]'));
      this.thumbs = Array.from(this.querySelectorAll('[data-thumb]'));
      this.counter = this.querySelector('[data-counter]');
      this.flipEl = this.querySelector('[data-flip]');
      this.flipBtn = this.querySelector('[data-flip-toggle]');
      this.zoomBtn = this.querySelector('[data-zoom-current]');
      this.index = -1;
      this.flipped = false;
      this.flipAngle = 0;

      this.onCarouselChange = (e) => this.setActive(clamp(e.detail.index, 0, this.slides.length - 1));
      this.onClick = this.onClick.bind(this);
      this.carousel?.addEventListener('carousel:change', this.onCarouselChange);
      this.addEventListener('click', this.onClick);
      this.thumbs.forEach((thumb) => {
        thumb.addEventListener('click', () => this.goTo(Number(thumb.dataset.thumb)));
      });
      this.flipBtn?.addEventListener('click', () => this.toggleFlip());

      const initial = clamp(parseInt(this.dataset.initialIndex || '0', 10) || 0, 0, Math.max(0, this.slides.length - 1));
      this.setActive(initial, true);
      if (initial > 0) requestAnimationFrame(() => this.goTo(initial, true));

      this.loadModels();
      this.intro();
    }

    disconnectedCallback() {
      this.carousel?.removeEventListener('carousel:change', this.onCarouselChange);
      this.removeEventListener('click', this.onClick);
      this.flipAnim?.stop?.();
      this.stopIntro?.();
      clearTimeout(this.introTimer);
    }

    /* Scroll the stage to slide i (smooth unless instant / reduced motion). */
    goTo(i, instant = false) {
      const slide = this.slides[i];
      if (!slide || !this.track) return;
      const left = slide.offsetLeft;
      if (instant || !motionOK()) this.track.scrollTo({ left, behavior: 'auto' });
      else this.track.scrollTo({ left, behavior: 'smooth' });
      this.setActive(i);
    }

    showMedia(mediaId) {
      if (!mediaId) return;
      const i = this.slides.findIndex((s) => s.dataset.mediaId === String(mediaId));
      if (i < 0) return;
      if (i === 0 && this.flipped) this.toggleFlip(false);
      this.goTo(i);
    }

    setActive(i, force = false) {
      if (i === this.index && !force) return;
      this.index = i;
      this.thumbs.forEach((t, n) => t.setAttribute('aria-current', String(n === i)));
      this.revealThumb(this.thumbs[i]);
      if (this.counter) this.counter.textContent = String(i + 1);
      const slide = this.slides[i];
      if (this.flipBtn) this.flipBtn.hidden = i !== 0;
      if (this.zoomBtn) this.zoomBtn.hidden = !slide || slide.dataset.mediaType !== 'image';
      this.pauseMedia(i);
    }

    /* Keep the active thumbnail visible inside its own strip (never scrolls the page). */
    revealThumb(thumb) {
      const strip = thumb && thumb.parentElement;
      if (!strip || !strip.getClientRects().length) return;
      const sr = strip.getBoundingClientRect();
      const tr = thumb.getBoundingClientRect();
      const behavior = motionOK() ? 'smooth' : 'auto';
      let dx = 0;
      let dy = 0;
      if (tr.top < sr.top) dy = tr.top - sr.top - 8;
      else if (tr.bottom > sr.bottom) dy = tr.bottom - sr.bottom + 8;
      if (tr.left < sr.left) dx = tr.left - sr.left - 8;
      else if (tr.right > sr.right) dx = tr.right - sr.right + 8;
      if (dx || dy) strip.scrollBy({ left: dx, top: dy, behavior });
    }

    pauseMedia(activeIndex) {
      this.slides.forEach((slide, n) => {
        if (n === activeIndex) return;
        slide.querySelectorAll('video').forEach((v) => { if (!v.paused) v.pause(); });
        slide.querySelectorAll('iframe').forEach((frame) => {
          try {
            const src = frame.getAttribute('src') || '';
            if (/youtube/.test(src)) frame.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
            else if (/vimeo/.test(src)) frame.contentWindow.postMessage('{"method":"pause"}', '*');
          } catch (_) { /* cross-origin frame not ready */ }
        });
      });
    }

    /* ---- 3D flip: spring-driven rotateY with a subtle scale dip; faces swap at 90°. ---- */
    toggleFlip(force) {
      if (!this.flipEl) return;
      const next = typeof force === 'boolean' ? force : !this.flipped;
      if (next === this.flipped) return;
      this.flipped = next;
      this.flipBtn?.setAttribute('aria-pressed', String(next));
      this.flipEl.classList.toggle('is-flipped', next);

      const front = this.flipEl.querySelector('.pg__face--front');
      const back = this.flipEl.querySelector('.pg__face--back');
      const M = window.Motion;
      if (!motionOK() || !M || !front || !back) {
        this.flipAngle = next ? 180 : 0;
        return;
      }

      const setFaces = (deg) => {
        const showBack = Math.cos((deg * Math.PI) / 180) < 0;
        front.style.visibility = showBack ? 'hidden' : 'visible';
        back.style.visibility = showBack ? 'visible' : 'hidden';
      };
      const from = this.flipAngle;
      const to = next ? 180 : 0;
      this.flipAnim?.stop?.();
      this.classList.add('is-flipping');
      this.flipAnim = M.animate(from, to, {
        type: 'spring',
        stiffness: 150,
        damping: 17,
        mass: 1,
        restDelta: 0.05,
        onUpdate: (deg) => {
          this.flipAngle = deg;
          const lift = Math.sin(clamp(Math.abs(deg - from) / 180, 0, 1) * Math.PI);
          this.flipEl.style.transform = `rotateY(${deg.toFixed(2)}deg) scale(${(1 - 0.07 * lift).toFixed(4)})`;
          setFaces(deg);
        },
      });
      Promise.resolve(this.flipAnim).then(() => {
        if (this.flipped !== next) return;
        this.flipAngle = to;
        this.flipEl.style.transform = `rotateY(${to}deg)`;
        setFaces(to);
        this.classList.remove('is-flipping');
        // On touch screens, let light catch the foil once the card settles.
        if (!canHover()) this.flipEl.closest('holo-card')?.sweep?.();
      }, () => this.classList.remove('is-flipping'));
    }

    /* ---- Zoom ---- */
    onClick(e) {
      const hit = e.target.closest('[data-zoom-open], [data-zoom-current]');
      if (!hit || !this.contains(hit)) return;
      let mediaId = hit.dataset.zoomOpen || (this.slides[this.index] && this.slides[this.index].dataset.mediaId);
      if (this.index === 0 && this.flipped && this.dataset.backMediaId) mediaId = this.dataset.backMediaId;
      this.openZoom(mediaId, hit);
    }

    openZoom(mediaId, trigger) {
      const drawer = this.dataset.zoomId && document.getElementById(this.dataset.zoomId);
      if (!drawer || typeof drawer.open !== 'function') return;
      const zoom = drawer.querySelector('product-zoom');
      drawer.open(trigger);
      if (zoom && typeof zoom.show === 'function') zoom.show(mediaId);
      // Follow the image the visitor ended on when the lightbox closes.
      drawer.addEventListener('drawer:close', () => {
        const id = zoom && typeof zoom.currentMediaId === 'function' ? zoom.currentMediaId() : null;
        if (!id) return;
        const backId = this.dataset.backMediaId;
        if (this.index === 0 && this.flipped && id === backId) return;
        const i = this.slides.findIndex((s) => s.dataset.mediaId === id);
        if (i >= 0 && i !== this.index) {
          if (i === 0 && this.flipped) this.toggleFlip(false);
          this.goTo(i, true);
        }
      }, { once: true });
    }

    /* ---- Entrance: the crimson aura ignites and a light sweep crosses the foil. ---- */
    intro() {
      const glow = this.querySelector('.pg__glow');
      const M = window.Motion;
      if (!motionOK() || !M) {
        if (glow) glow.style.opacity = '';
        return;
      }
      this.stopIntro = M.inView(this, () => {
        if (glow) {
          M.animate(glow, { opacity: [0, 0.85], scale: [0.55, 1] }, { duration: 1.4, ease: [0.16, 1, 0.3, 1] });
        }
        const card = this.slides[Math.max(0, this.index)]?.querySelector('holo-card');
        if (card && typeof card.sweep === 'function') {
          this.introTimer = setTimeout(() => card.sweep(), 600);
        }
        this.stopIntro?.();
        this.stopIntro = null;
      }, { amount: 0.35 });
    }

    /* Shopify 3D models need the model-viewer UI feature. */
    loadModels() {
      const models = Array.from(this.querySelectorAll('model-viewer'));
      const shopify = window.Shopify;
      if (!models.length || !shopify || typeof shopify.loadFeatures !== 'function') return;
      shopify.loadFeatures([{
        name: 'model-viewer-ui',
        version: '1.0',
        onLoad: (err) => {
          if (err || !shopify.ModelViewerUI) return;
          models.forEach((m) => {
            if (m._vaultUI) return;
            try { m._vaultUI = new shopify.ModelViewerUI(m); } catch (_) { /* unsupported */ }
          });
        },
      }]);
    }
  }
  if (!customElements.get('product-gallery')) customElements.define('product-gallery', ProductGallery);

  /* ------------------------------------------------------------------ *
   * <product-zoom>
   * ------------------------------------------------------------------ */
  const ZOOM_SCALE = 2.5;
  const MAX_SCALE = 4;

  class ProductZoom extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      this.track = this.querySelector('[data-zoom-track]');
      this.slides = Array.from(this.querySelectorAll('[data-zoom-slide]'));
      this.counter = this.querySelector('[data-zoom-counter]');
      this.prevBtn = this.querySelector('[data-zoom-prev]');
      this.nextBtn = this.querySelector('[data-zoom-next]');
      this.frames = [];
      this.index = 0;
      if (!this.track || !this.slides.length) return;

      this.prevBtn?.addEventListener('click', () => this.go(this.index - 1));
      this.nextBtn?.addEventListener('click', () => this.go(this.index + 1));
      this.track.addEventListener('scroll', rafThrottle(() => this.onScroll()), { passive: true });
      this.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); this.go(this.index + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); this.go(this.index - 1); }
      });
      this.slides.forEach((slide) => {
        const frame = slide.querySelector('[data-zoom-frame]');
        if (frame) this.frames.push(this.bindFrame(frame));
      });
      this.drawer = this.closest('vault-drawer');
      this.onDrawerClose = () => this.resetAll();
      this.drawer?.addEventListener('drawer:close', this.onDrawerClose);
      this.setIndex(0, true);
    }

    disconnectedCallback() {
      this.drawer?.removeEventListener('drawer:close', this.onDrawerClose);
    }

    show(mediaId) {
      if (!this.track) return;
      const found = this.slides.findIndex((s) => s.dataset.mediaId === String(mediaId));
      const i = Math.max(0, found);
      this.resetAll();
      this.track.scrollTo({ left: this.slides[i].offsetLeft, behavior: 'auto' });
      this.setIndex(i, true);
    }

    currentMediaId() {
      return this.slides[this.index] ? this.slides[this.index].dataset.mediaId : null;
    }

    go(i) {
      const n = clamp(i, 0, this.slides.length - 1);
      if (n === this.index) return;
      this.track.scrollTo({ left: this.slides[n].offsetLeft, behavior: motionOK() ? 'smooth' : 'auto' });
      this.setIndex(n);
    }

    onScroll() {
      const w = this.track.clientWidth || 1;
      const i = clamp(Math.round(this.track.scrollLeft / w), 0, this.slides.length - 1);
      if (i !== this.index) this.setIndex(i);
    }

    setIndex(i, force = false) {
      if (i === this.index && !force) return;
      const prev = this.frames[this.index];
      if (prev && i !== this.index) prev.reset();
      this.index = i;
      if (this.counter) this.counter.textContent = String(i + 1);
      if (this.prevBtn) this.prevBtn.disabled = i <= 0;
      if (this.nextBtn) this.nextBtn.disabled = i >= this.slides.length - 1;
    }

    resetAll() {
      this.frames.forEach((f) => f.reset());
    }

    /* Zoom / pan / pinch for one image frame. Returns { reset }. */
    bindFrame(frame) {
      const img = frame.querySelector('img');
      const st = { s: 1, ox: 0.5, oy: 0.5 };
      const pointers = new Map();
      let start = null;
      let pinch = null;
      let moved = false;

      const rel = (x, y) => {
        const r = frame.getBoundingClientRect();
        return { x: clamp((x - r.left) / (r.width || 1), 0, 1), y: clamp((y - r.top) / (r.height || 1), 0, 1) };
      };
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const apply = () => {
        if (!img) return;
        img.style.transformOrigin = `${(st.ox * 100).toFixed(2)}% ${(st.oy * 100).toFixed(2)}%`;
        img.style.transform = st.s > 1 ? `scale(${st.s.toFixed(3)})` : '';
        frame.classList.toggle('is-zoomed', st.s > 1);
      };
      const toggleAt = (x, y) => {
        if (st.s > 1) {
          st.s = 1;
        } else {
          const p = x == null ? { x: 0.5, y: 0.5 } : rel(x, y);
          st.ox = p.x;
          st.oy = p.y;
          st.s = ZOOM_SCALE;
        }
        apply();
      };

      frame.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 1) {
          start = { x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy, t: performance.now() };
          moved = false;
          if (st.s > 1) frame.setPointerCapture?.(e.pointerId);
        } else if (pointers.size === 2) {
          const [a, b] = Array.from(pointers.values());
          pinch = { d: dist(a, b), s: st.s };
          if (st.s <= 1) {
            const m = rel((a.x + b.x) / 2, (a.y + b.y) / 2);
            st.ox = m.x;
            st.oy = m.y;
          }
          moved = true;
          frame.classList.add('is-gesturing');
          pointers.forEach((_, id) => frame.setPointerCapture?.(id));
        }
      });

      frame.addEventListener('pointermove', (e) => {
        if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2 && pinch) {
          const [a, b] = Array.from(pointers.values());
          st.s = clamp((pinch.s * dist(a, b)) / pinch.d, 1, MAX_SCALE);
          apply();
          return;
        }
        if (st.s <= 1) return;
        // Mouse hovering a zoomed image: the image follows the cursor.
        if (e.pointerType === 'mouse' && !pointers.size) {
          const p = rel(e.clientX, e.clientY);
          st.ox = p.x;
          st.oy = p.y;
          apply();
          return;
        }
        // Drag to pan (touch, pen, or a held mouse button).
        if (pointers.size === 1 && start) {
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (!moved && Math.abs(dx) + Math.abs(dy) > 6) {
            moved = true;
            frame.classList.add('is-gesturing');
          }
          if (!moved) return;
          const r = frame.getBoundingClientRect();
          const k = Math.max(0.01, st.s - 1);
          st.ox = clamp(start.ox - dx / ((r.width || 1) * k), 0, 1);
          st.oy = clamp(start.oy - dy / ((r.height || 1) * k), 0, 1);
          apply();
        }
      });

      const end = (e) => {
        const wasTap = pointers.size === 1 && start && !moved && performance.now() - start.t < 400;
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinch = null;
        if (pointers.size === 1) {
          // One finger lifted after a pinch: continue as a pan from here.
          const [p] = Array.from(pointers.values());
          start = { x: p.x, y: p.y, ox: st.ox, oy: st.oy, t: 0 };
          moved = true;
          return;
        }
        if (pointers.size === 0) {
          frame.classList.remove('is-gesturing');
          if (e.type === 'pointerup' && wasTap) toggleAt(e.clientX, e.clientY);
          else if (st.s < 1.08 && st.s !== 1) { st.s = 1; apply(); }
          start = null;
        }
      };
      frame.addEventListener('pointerup', end);
      frame.addEventListener('pointercancel', end);
      frame.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'mouse' && !pointers.size && st.s > 1) {
          // Ease back toward centre so the next hover doesn't start at an edge.
          st.ox = 0.5;
          st.oy = 0.5;
          apply();
        }
      });
      // Keyboard activation (Enter / Space) arrives as a click with detail 0.
      frame.addEventListener('click', (e) => {
        if (e.detail === 0) toggleAt(null, null);
      });

      return {
        reset() {
          st.s = 1;
          st.ox = 0.5;
          st.oy = 0.5;
          pointers.clear();
          pinch = null;
          start = null;
          frame.classList.remove('is-gesturing');
          apply();
        },
      };
    }
  }
  if (!customElements.get('product-zoom')) customElements.define('product-zoom', ProductZoom);
})();
