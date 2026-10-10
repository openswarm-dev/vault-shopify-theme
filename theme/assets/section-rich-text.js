/*
 * Vault — Rich text section
 * <rich-text-word> drifts the giant background word sideways as the section
 * scrolls through the viewport (Motion scroll-linked animation, transform only).
 * Static when motion is reduced/disabled or Motion is unavailable.
 */
if (!customElements.get('rich-text-word')) {
  customElements.define('rich-text-word', class extends HTMLElement {
    connectedCallback() {
      const V = window.Vault;
      if (this.cancel || !V || !V.Motion || !V.motionOK()) return;
      const inner = this.querySelector('.rich-text__word-inner');
      const target = this.closest('.section') || this.parentElement;
      if (!inner || !target) return;
      const { animate, scroll } = V.Motion;
      const travel = (V.isMobile() ? 10 : 14) * (V.intensity || 1);
      this.cancel = scroll(
        animate(inner, { x: [`${travel}%`, `${-travel}%`] }, { ease: 'linear' }),
        { target, offset: ['start end', 'end start'] },
      );
    }

    disconnectedCallback() {
      if (typeof this.cancel === 'function') this.cancel();
      this.cancel = null;
    }
  });
}
