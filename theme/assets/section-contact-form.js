/*!
 * VAULT — section-contact-form.js
 * <contact-form-panel> — small enhancements for the native Shopify contact form:
 *  - focuses (and gently reveals) the success / error message after a post,
 *  - shows a loading state on submit once the browser's validation passes,
 *  - clears aria-invalid on a field as soon as the visitor edits it.
 */
(() => {
  'use strict';

  if (customElements.get('contact-form-panel')) return;

  customElements.define('contact-form-panel', class extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      this.form = this.querySelector('form');
      if (!this.form) return;

      const message = this.querySelector('[data-contact-message]');
      if (message) {
        requestAnimationFrame(() => {
          message.scrollIntoView({ block: 'center', behavior: 'auto' });
          message.focus({ preventScroll: true });
        });
        const V = window.Vault;
        if (V && V.motionOK()) {
          V.Motion.animate(message, { opacity: [0, 1], y: [-10, 0] }, V.spring);
        }
      }

      this.form.addEventListener('submit', () => {
        const btn = this.form.querySelector('[data-contact-submit]');
        if (btn) {
          btn.classList.add('is-loading');
          btn.setAttribute('aria-busy', 'true');
        }
      });

      // Browsers block submission on invalid required fields; remove the loading state if that happens.
      this.form.addEventListener('invalid', () => {
        const btn = this.form.querySelector('[data-contact-submit]');
        btn?.classList.remove('is-loading');
        btn?.removeAttribute('aria-busy');
      }, true);

      this.form.addEventListener('input', (e) => {
        const field = e.target;
        if (field.getAttribute && field.getAttribute('aria-invalid') === 'true') field.removeAttribute('aria-invalid');
      });
    }
  });
})();
