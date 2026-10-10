/*!
 * Vault — Testimonials <testimonial-reel>
 * Adds the controls the core <vault-marquee> leaves to sections:
 * - a pause/play toggle (keyboard + touch equivalent of pause-on-hover, WCAG 2.2.2)
 * - pause while a card has keyboard focus or a finger is held on a row
 * - theme editor: selecting a review pauses the rows / scrolls the carousel to it
 */
(() => {
  'use strict';

  if (customElements.get('testimonial-reel')) return;

  class TestimonialReel extends HTMLElement {
    connectedCallback() {
      if (!this._bound) {
        this._bound = true;
        this.setup();
      }
      document.addEventListener('shopify:block:select', this.onBlockSelect);
      document.addEventListener('shopify:block:deselect', this.onBlockDeselect);
    }

    disconnectedCallback() {
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
      document.removeEventListener('shopify:block:deselect', this.onBlockDeselect);
    }

    setup() {

      this.marquees = Array.from(this.querySelectorAll('vault-marquee'));
      this.carousel = this.querySelector('vault-carousel');
      this.toggle = this.querySelector('[data-ts-toggle]');
      this.toggleLabel = this.toggle && this.toggle.querySelector('.ts-toggle__label');
      this.strings = (window.theme && window.theme.strings) || {};
      this.userPaused = false;
      this.focusPaused = false;
      this.touchPaused = false;
      this.editorPaused = false;

      if (this.toggle) {
        this.toggle.addEventListener('click', () => {
          this.userPaused = !this.userPaused;
          this.toggle.dataset.paused = String(this.userPaused);
          if (this.toggleLabel) {
            this.toggleLabel.textContent = this.userPaused
              ? (this.toggle.dataset.playLabel || this.strings.play || 'Play')
              : (this.toggle.dataset.pauseLabel || this.strings.pause || 'Pause');
          }
          this.apply();
        });
      }

      this.marquees.forEach((m) => {
        // Core un-pauses on pointerleave; re-assert any pause we own (listener runs after core's).
        m.addEventListener('pointerleave', () => this.apply());
        m.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'mouse') return;
          this.touchPaused = true;
          this.apply();
        }, { passive: true });
        const release = (e) => {
          if (e.pointerType === 'mouse' || !this.touchPaused) return;
          this.touchPaused = false;
          this.apply();
        };
        m.addEventListener('pointerup', release, { passive: true });
        m.addEventListener('pointercancel', release, { passive: true });
      });

      // Keyboard focus on a card (product link) holds the rows still; the toggle itself doesn't.
      const inRow = (el) => !!(el && el.closest && el.closest('vault-marquee') && this.contains(el));
      this.addEventListener('focusin', (e) => {
        if (!inRow(e.target)) return;
        this.focusPaused = true;
        this.apply();
      });
      this.addEventListener('focusout', (e) => {
        if (inRow(e.relatedTarget)) return;
        if (!this.focusPaused) return;
        this.focusPaused = false;
        this.apply();
      });

      this.onBlockSelect = (e) => {
        if (!this.contains(e.target)) return;
        this.editorPaused = true;
        this.apply();
        if (this.carousel && typeof this.carousel.goTo === 'function') {
          const slides = Array.from(this.carousel.querySelectorAll('[data-carousel-track] > *'));
          const i = slides.findIndex((s) => s.contains(e.target));
          if (i > -1) this.carousel.goTo(i);
        }
      };
      this.onBlockDeselect = (e) => {
        if (!this.contains(e.target)) return;
        this.editorPaused = false;
        this.apply();
      };
    }

    apply() {
      const paused = this.userPaused || this.focusPaused || this.touchPaused || this.editorPaused;
      this.marquees.forEach((m) => {
        if (paused) m.paused = true;
        else if (!m.matches(':hover')) m.paused = false;
      });
    }
  }

  customElements.define('testimonial-reel', TestimonialReel);
})();
