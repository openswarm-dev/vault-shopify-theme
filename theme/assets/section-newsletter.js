/*
 * Vault — Newsletter section
 * <newsletter-form> wraps Shopify's {% form 'customer' %}. Progressive enhancement only:
 *   - swaps the browser's validation bubble for an inline, announced message + a springy shake
 *   - shows a loading state on the submit button while the page posts
 *   - plays a small pop when the success state renders after the redirect
 *   - runs the rotating border / glow animations only while the section is on screen
 * Without JS the native required/type=email validation and Shopify's own errors still work.
 */
if (!customElements.get('newsletter-form')) {
  customElements.define('newsletter-form', class extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      const V = window.Vault || {};
      this.motion = () => !!(V.motionOK && V.motionOK() && V.Motion);

      const section = this.closest('.newsletter');
      if (section && this.motion()) {
        this.stopInView = V.Motion.inView(section, () => {
          section.classList.add('is-inview');
          return () => section.classList.remove('is-inview');
        }, { margin: '80px 0px' });
      }

      const success = this.querySelector('.newsletter__success');
      if (success) {
        this.celebrate(success);
        return;
      }

      this.form = this.querySelector('form');
      this.input = this.querySelector('input[type="email"]');
      this.button = this.querySelector('[type="submit"]');
      this.row = this.querySelector('.newsletter__row');
      this.errorText = this.querySelector('[data-error-text]');
      this.errorBox = this.errorText ? this.errorText.closest('.form-message') : null;
      if (!this.form || !this.input) return;

      this.form.noValidate = true;
      this.serverDescribedBy = this.input.getAttribute('aria-describedby') || '';

      this.onSubmit = (event) => {
        if (this.input.checkValidity()) {
          this.button?.classList.add('is-loading');
          this.button?.setAttribute('aria-busy', 'true');
          return;
        }
        event.preventDefault();
        this.showError(this.input.validationMessage);
      };
      this.onInput = () => {
        if (this.input.getAttribute('aria-invalid') === 'true' && this.input.checkValidity()) this.clearError();
      };
      this.onPageShow = () => {
        this.button?.classList.remove('is-loading');
        this.button?.removeAttribute('aria-busy');
      };

      this.form.addEventListener('submit', this.onSubmit);
      this.input.addEventListener('input', this.onInput);
      window.addEventListener('pageshow', this.onPageShow);
    }

    disconnectedCallback() {
      if (this.onPageShow) window.removeEventListener('pageshow', this.onPageShow);
      if (this.form && this.onSubmit) this.form.removeEventListener('submit', this.onSubmit);
      if (this.input && this.onInput) this.input.removeEventListener('input', this.onInput);
      if (this.stopInView) this.stopInView();
      this.stopInView = null;
      this._bound = false;
    }

    showError(message) {
      if (this.errorBox && this.errorText) {
        this.errorText.textContent = message;
        this.errorBox.hidden = false;
        const ids = [this.serverDescribedBy, this.errorBox.id].filter(Boolean).join(' ');
        this.input.setAttribute('aria-describedby', ids);
      }
      this.input.setAttribute('aria-invalid', 'true');
      this.input.focus();
      if (this.motion() && this.row) {
        window.Vault.Motion.animate(
          this.row,
          { x: [0, -10, 9, -6, 4, -2, 0] },
          { duration: 0.5, ease: 'easeOut' },
        );
      }
    }

    clearError() {
      if (this.errorBox) this.errorBox.hidden = true;
      this.input.removeAttribute('aria-invalid');
      if (this.serverDescribedBy) this.input.setAttribute('aria-describedby', this.serverDescribedBy);
      else this.input.removeAttribute('aria-describedby');
    }

    celebrate(box) {
      if (!this.motion()) return;
      const { Motion } = window.Vault;
      const icon = box.querySelector('.newsletter__success-icon');
      Motion.animate(box, { opacity: [0, 1], y: [16, 0] }, { duration: 0.6, ease: window.Vault.ease.out });
      if (icon) {
        Motion.animate(icon, { scale: [0, 1], rotate: [-90, 0] }, { ...window.Vault.springBouncy, delay: 0.15 });
      }
    }
  });
}
