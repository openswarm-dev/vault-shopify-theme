/*!
 * VAULT — section-search.js
 * <search-hero> — the big search field on the search page:
 *   · shows the clear button only when there's text; clear (or Esc) empties and refocuses
 *   · blocks empty submissions (keeps focus in the field instead of reloading the page)
 *   · a soft spring "press" on submit
 */
(() => {
  'use strict';

  const V = () => window.Vault || {};
  const motion = () => !!(V().motionOK && V().motionOK());

  class SearchHero extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this.form = this.querySelector('form');
      this.input = this.querySelector('[data-search-input]');
      this.clearBtn = this.querySelector('[data-search-clear]');
      if (!this.form || !this.input) return;
      this._bound = true;

      this.sync = this.sync.bind(this);
      this.onClear = this.onClear.bind(this);
      this.onKey = this.onKey.bind(this);
      this.onSubmit = this.onSubmit.bind(this);

      this.input.addEventListener('input', this.sync);
      this.input.addEventListener('keydown', this.onKey);
      this.form.addEventListener('submit', this.onSubmit);
      this.clearBtn?.addEventListener('click', this.onClear);
      this.sync();
    }

    disconnectedCallback() {
      this.input?.removeEventListener('input', this.sync);
      this.input?.removeEventListener('keydown', this.onKey);
      this.form?.removeEventListener('submit', this.onSubmit);
      this.clearBtn?.removeEventListener('click', this.onClear);
      this._bound = false;
    }

    sync() {
      if (this.clearBtn) this.clearBtn.hidden = this.input.value.length === 0;
    }

    onClear() {
      this.input.value = '';
      this.sync();
      this.input.focus();
    }

    onKey(e) {
      if (e.key === 'Escape' && this.input.value) {
        e.preventDefault();
        this.onClear();
      }
    }

    onSubmit(e) {
      if (!this.input.value.trim()) {
        e.preventDefault();
        this.input.focus();
        if (motion()) {
          V().Motion.animate(this.querySelector('.search-hero__field'), { x: [0, -8, 7, -4, 2, 0] }, { duration: 0.42, ease: 'easeOut' });
        }
        return;
      }
      const field = this.querySelector('.search-hero__field');
      if (field && motion()) V().Motion.animate(field, { scale: [1, 0.985, 1] }, { duration: 0.3, ease: V().ease.out });
    }
  }

  if (!customElements.get('search-hero')) customElements.define('search-hero', SearchHero);
})();
