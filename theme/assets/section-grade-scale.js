/*!
 * Vault — Grade scale <grade-scale>
 * ARIA tabs (roving tabindex, arrows/Home/End, automatic activation) + hover preview on desktop.
 * The glowing indicator springs between equal-width segments (x in %, so it is resize-proof),
 * panels crossfade with a small y offset, the slab label rolls to the new grade and the
 * simulated wear fades with it. Theme editor: selecting a block shows that grade.
 */
(() => {
  'use strict';

  if (customElements.get('grade-scale')) return;

  const clearInline = (el, props = ['opacity', 'transform']) => {
    if (el) props.forEach((p) => el.style.removeProperty(p));
  };

  class GradeScale extends HTMLElement {
    connectedCallback() {
      if (!this._bound) this.setup();
      if (this._bound && this.onBlockSelect) document.addEventListener('shopify:block:select', this.onBlockSelect);
    }

    disconnectedCallback() {
      clearTimeout(this.hoverTimer);
      if (this.onBlockSelect) document.removeEventListener('shopify:block:select', this.onBlockSelect);
    }

    setup() {
      this.tabs = Array.from(this.querySelectorAll('[role="tab"]'));
      if (!this.tabs.length) return;
      this._bound = true;

      this.V = window.Vault || null;
      this.M = (this.V && this.V.Motion) || null;
      this.motion = !!(this.V && this.M && this.V.motionOK());
      this.canHover = this.V ? this.V.canHover() : window.matchMedia('(hover: hover) and (pointer: fine)').matches;

      this.panels = this.tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
      this.indicator = this.querySelector('[data-gs-indicator]');
      this.rail = this.querySelector('[data-gs-rail]');
      this.slabScore = this.querySelector('[data-gs-score]');
      this.slabAbbr = this.querySelector('[data-gs-abbr]');
      this.slabToken = 0;
      this.index = Math.max(0, this.tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'));

      this.tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => this.select(i));
        tab.addEventListener('keydown', (e) => this.onKey(e, i));
        if (this.canHover) {
          tab.addEventListener('pointerenter', (e) => {
            if (e.pointerType !== 'mouse' || !this.hoverAllowed(e)) return;
            clearTimeout(this.hoverTimer);
            this.hoverTimer = setTimeout(() => this.select(i, { center: false }), 70);
          });
        }
      });
      if (this.rail && this.canHover) {
        this.rail.addEventListener('pointerleave', () => clearTimeout(this.hoverTimer));
        this.rail.addEventListener('pointermove', (e) => { this.lastPointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
      }

      this.onBlockSelect = (e) => {
        const i = this.tabs.findIndex((t) => t === e.target || t.contains(e.target));
        if (i > -1) this.select(i, { animate: false, center: true });
      };

      this.select(this.index, { animate: false, force: true });
    }

    /*
     * Hover previews only on a static rail, only for real pointer movement (not content scrolling
     * under a resting cursor) and never right after keyboard navigation.
     */
    hoverAllowed(e) {
      if (performance.now() < (this.hoverLockUntil || 0)) return false;
      const rail = this.rail;
      if (rail && rail.scrollWidth > rail.clientWidth + 2) return false;
      const last = this.lastPointer;
      if (last && Math.abs(last.x - e.clientX) + Math.abs(last.y - e.clientY) < 1) return false;
      return true;
    }

    onKey(e, i) {
      const last = this.tabs.length - 1;
      let next;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          next = i === last ? 0 : i + 1;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          next = i === 0 ? last : i - 1;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = last;
          break;
        default:
          return;
      }
      e.preventDefault();
      clearTimeout(this.hoverTimer);
      this.hoverLockUntil = performance.now() + 700;
      this.select(next, { focus: true, center: true });
    }

    select(i, { animate = true, focus = false, force = false, center = true } = {}) {
      const tab = this.tabs[i];
      if (!tab) return;
      const prevIndex = this.index;
      if (focus) tab.focus({ preventScroll: true });
      if (i === prevIndex && !force) return;
      this.index = i;

      const M = this.M;
      const V = this.V;
      const run = animate && this.motion;
      const panel = this.panels[i];
      const prevPanel = prevIndex !== i ? this.panels[prevIndex] : null;

      // Tabs
      this.tabs.forEach((t, j) => {
        const on = j === i;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        t.classList.toggle('is-active', on);
      });

      // Shared state (CSS reads these: indicator/stage/slab glow colour, wear overlay)
      if (tab.dataset.color) this.style.setProperty('--gs-color', tab.dataset.color);
      this.style.setProperty('--gs-wear', tab.dataset.wear || '0');

      // Indicator — equal-width segments, so x is simply index × 100% of its own width.
      if (this.indicator) {
        const x = `${i * 100}%`;
        if (this.motion) {
          M.animate(this.indicator, { x }, run ? { type: 'spring', stiffness: 380, damping: 30, mass: 0.9 } : { duration: 0 });
        } else {
          this.indicator.style.transform = `translateX(${x})`;
        }
      }

      // Panels — anything that isn't the incoming or outgoing panel is reset immediately.
      this.panels.forEach((p, j) => {
        if (!p || j === i || j === prevIndex) return;
        p.classList.remove('is-active');
        clearInline(p);
      });
      if (panel) panel.classList.add('is-active');

      if (run && panel) {
        if (prevPanel) {
          const out = M.animate(prevPanel, { opacity: 0, y: [0, -10] }, { duration: 0.18, ease: V.ease.in });
          Promise.resolve(out).then(() => {
            if (this.panels[this.index] === prevPanel) return;
            prevPanel.classList.remove('is-active');
            clearInline(prevPanel);
          });
        }
        M.animate(panel, { opacity: [0, 1], y: [18, 0] }, { type: 'spring', stiffness: 300, damping: 30 });
        const bits = panel.querySelectorAll('[data-gs-stagger]');
        if (bits.length) {
          const a = M.animate(bits, { opacity: [0, 1], y: [14, 0] }, { duration: 0.5, ease: V.ease.out, delay: M.stagger(0.05, { startDelay: 0.04 }) });
          Promise.resolve(a).then(() => bits.forEach((b) => clearInline(b)));
        }
        const fill = panel.querySelector('[data-gs-fill]');
        if (fill) {
          const value = Number(fill.dataset.value);
          M.animate(fill, { scaleX: [0, Number.isFinite(value) ? value : 1] }, { type: 'spring', stiffness: 110, damping: 18, delay: 0.12 });
        }
      } else {
        if (prevPanel) {
          prevPanel.classList.remove('is-active');
          clearInline(prevPanel);
        }
        clearInline(panel);
      }

      this.updateSlab(tab, run);
      if (center && !force) this.centerTab(tab, run);
    }

    /* Slab label: old grade rolls up and out, new one springs in. */
    updateSlab(tab, run) {
      const score = tab.dataset.score || '';
      const abbr = tab.dataset.abbr || '';
      const targets = [this.slabAbbr, this.slabScore].filter(Boolean);
      if (!targets.length) return;
      const apply = () => {
        if (this.slabScore) this.slabScore.textContent = score;
        if (this.slabAbbr) this.slabAbbr.textContent = abbr;
      };
      if (!run) {
        apply();
        targets.forEach((t) => clearInline(t));
        return;
      }
      const token = ++this.slabToken;
      const out = this.M.animate(targets, { opacity: [1, 0], y: ['0%', '-60%'] }, { duration: 0.14, ease: this.V.ease.in });
      Promise.resolve(out).then(() => {
        if (token !== this.slabToken) return;
        apply();
        this.M.animate(targets, { opacity: [0, 1], y: ['60%', '0%'] }, { type: 'spring', stiffness: 420, damping: 26, delay: this.M.stagger(0.04) });
      });
    }

    /* Phones: keep the active segment centred in the swipeable rail. */
    centerTab(tab, smooth) {
      const rail = this.rail;
      if (!rail || rail.scrollWidth <= rail.clientWidth + 2) return;
      const r = rail.getBoundingClientRect();
      const t = tab.getBoundingClientRect();
      const left = rail.scrollLeft + (t.left - r.left) - (r.width - t.width) / 2;
      rail.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
    }
  }

  customElements.define('grade-scale', GradeScale);
})();
