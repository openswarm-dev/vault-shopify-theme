/*
 * Vault — FAQ section
 * <faq-accordion> wraps the question list. Core (theme.js) animates each
 * details[data-accordion]; this element only adds:
 *   - theme editor: selecting a question block opens it (and closes siblings in a single-open group)
 *   - deep links: /pages/faq#Faq-<block-id> opens and scrolls to that answer
 */
if (!customElements.get('faq-accordion')) {
  customElements.define('faq-accordion', class extends HTMLElement {
    connectedCallback() {
      this.onBlockSelect = (event) => {
        const details = event.target.closest('details[data-accordion]');
        if (details && this.contains(details)) this.reveal(details, false);
      };
      this.onHashChange = () => this.openFromHash();
      this.addEventListener('shopify:block:select', this.onBlockSelect);
      window.addEventListener('hashchange', this.onHashChange);
      this.openFromHash();
    }

    disconnectedCallback() {
      this.removeEventListener('shopify:block:select', this.onBlockSelect);
      window.removeEventListener('hashchange', this.onHashChange);
    }

    openFromHash() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id || !/^Faq-/.test(id)) return;
      const details = document.getElementById(id);
      if (details && this.contains(details)) this.reveal(details, true);
    }

    /* Opens one question instantly (no height tween) so editor/deep-link jumps land precisely. */
    reveal(details, scroll) {
      const group = details.closest('[data-accordion-group]');
      if (group) {
        group.querySelectorAll('details[data-accordion][open]').forEach((other) => {
          if (other !== details && other.closest('[data-accordion-group]') === group) other.open = false;
        });
      }
      details.open = true;
      if (scroll) {
        const smooth = window.Vault && window.Vault.motionOK && window.Vault.motionOK();
        details.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
      }
    }
  });
}
