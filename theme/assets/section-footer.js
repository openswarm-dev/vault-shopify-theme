/*!
 * VAULT — section-footer.js
 * <vault-footer>
 *  - Link/text columns are <details data-accordion> on phones; from 750px they are forced
 *    open and toggling is blocked (capture listener runs before core's accordion handler).
 *  - Oversized wordmark: fitted to the container width, and its red gradient fill is linked
 *    to scroll with Motion (bottom-to-top clip reveal) — static and filled without motion.
 *  - Back-to-top button (core's [data-magnetic] adds the pointer pull on desktop).
 *  - Newsletter confirmation/error is scrolled into view after the form posts.
 * <localization-form>: auto-submits country/language changes (shared with the menu drawer).
 */
(() => {
  'use strict';

  if (!customElements.get('localization-form')) {
    customElements.define('localization-form', class extends HTMLElement {
      connectedCallback() {
        if (this._bound) return;
        this._bound = true;
        this.addEventListener('change', (e) => {
          if (!(e.target instanceof HTMLSelectElement)) return;
          const form = this.querySelector('form');
          if (!form) return;
          this.setAttribute('aria-busy', 'true');
          form.submit();
        });
      }
    });
  }

  if (customElements.get('vault-footer')) return;

  const Vault = window.Vault || {};
  const motionOK = () => typeof Vault.motionOK === 'function' && Vault.motionOK();
  const mqWide = window.matchMedia('(min-width: 750px)');
  const MAX_WORDMARK_PX = 300;

  class VaultFooter extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      this.footer = this.querySelector('.footer');
      this.accordions = Array.from(this.querySelectorAll('details[data-footer-accordion]'));
      this.cleanups = [];

      this.bindAccordions();
      this.bindWordmark();
      this.bindBackToTop();
      this.revealNewsletterMessage();
    }

    disconnectedCallback() {
      this.cleanups.forEach((fn) => fn());
      this.cleanups = [];
      this._bound = false;
    }

    listen(target, type, fn, opts) {
      if (!target) return;
      target.addEventListener(type, fn, opts);
      this.cleanups.push(() => target.removeEventListener(type, fn, opts));
    }

    /* ---------- Columns ⇄ accordions ---------- */
    bindAccordions() {
      if (!this.accordions.length) return;
      const sync = () => this.syncAccordions();
      mqWide.addEventListener('change', sync);
      this.cleanups.push(() => mqWide.removeEventListener('change', sync));
      this.accordions.forEach((details) => {
        this.listen(details, 'click', (e) => {
          if (!mqWide.matches) return;
          const summary = e.target.closest('summary');
          if (!summary || summary.parentElement !== details) return;
          e.preventDefault();
          e.stopPropagation();
        }, true);
      });
      this.listen(document, 'shopify:block:select', (e) => {
        const details = this.accordions.find((d) => d === e.target || d.contains(e.target));
        if (details) details.open = true;
      });
      sync();
    }

    syncAccordions() {
      const wide = mqWide.matches;
      if (this.footer) this.footer.classList.toggle('is-static', wide);
      this.accordions.forEach((details) => {
        const summary = details.querySelector(':scope > summary');
        const content = details.querySelector(':scope > .accordion__content');
        if (content) {
          content.style.removeProperty('height');
          content.style.removeProperty('opacity');
        }
        details.open = wide;
        if (!summary) return;
        if (wide) {
          summary.setAttribute('tabindex', '-1');
          summary.setAttribute('aria-disabled', 'true');
        } else {
          summary.removeAttribute('tabindex');
          summary.removeAttribute('aria-disabled');
        }
      });
    }

    /* ---------- Wordmark ---------- */
    bindWordmark() {
      this.wordmark = this.querySelector('[data-wordmark]');
      if (!this.wordmark) return;
      this.wordmarkText = this.wordmark.querySelector('[data-wordmark-text]');
      const fill = this.wordmark.querySelector('[data-wordmark-fill]');

      let t;
      const fitSoon = () => {
        clearTimeout(t);
        t = setTimeout(() => this.fitWordmark(), 100);
      };
      const ro = new ResizeObserver(fitSoon);
      ro.observe(this.wordmark.parentElement);
      this.cleanups.push(() => {
        ro.disconnect();
        clearTimeout(t);
      });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.fitWordmark());
      this.fitWordmark();

      if (!fill || !motionOK()) return;
      const M = Vault.Motion;
      const cancel = M.scroll(
        M.animate(fill, { clipPath: ['inset(100% -12% 0% -12%)', 'inset(-12% -12% -12% -12%)'] }, { ease: 'linear' }),
        { target: this.wordmark, offset: ['start end', 'end end'] },
      );
      this.cleanups.push(() => {
        if (typeof cancel === 'function') cancel();
      });
    }

    /** Scales the font so the word spans the content width (one read, one write, on resize only). */
    fitWordmark() {
      if (!this.wordmark || !this.wordmarkText || !this.wordmark.isConnected) return;
      const box = this.wordmark.parentElement;
      const cs = getComputedStyle(box);
      const available = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const range = document.createRange();
      range.selectNodeContents(this.wordmarkText);
      const textWidth = range.getBoundingClientRect().width;
      const fontSize = parseFloat(getComputedStyle(this.wordmark).fontSize);
      if (!available || !textWidth || !fontSize) return;
      const size = Math.min((fontSize * available * 0.985) / textWidth, MAX_WORDMARK_PX);
      this.wordmark.style.setProperty('--wm-size', `${size.toFixed(2)}px`);
    }

    /* ---------- Back to top ---------- */
    bindBackToTop() {
      const button = this.querySelector('[data-back-to-top]');
      this.listen(button, 'click', (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: motionOK() ? 'smooth' : 'auto' });
        const main = document.getElementById('MainContent');
        if (main) main.focus({ preventScroll: true });
      });
    }

    /* ---------- Newsletter feedback after a post ---------- */
    revealNewsletterMessage() {
      const message = this.querySelector('.footer-newsletter__msg');
      if (!message) return;
      requestAnimationFrame(() => {
        message.scrollIntoView({ block: 'center', behavior: 'auto' });
        message.focus({ preventScroll: true });
      });
    }
  }

  customElements.define('vault-footer', VaultFooter);
})();
