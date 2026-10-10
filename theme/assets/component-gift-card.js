/*!
 * VAULT — component-gift-card.js (templates/gift_card.liquid)
 * Renders the redemption QR code (Shopify's vendor/qrcode.js), copies the code to the
 * clipboard with feedback, and prints the page.
 */
(() => {
  'use strict';

  const ready = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };

  const copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('copy failed');
  };

  ready(() => {
    const qr = document.querySelector('[data-gift-qr]');
    if (qr && typeof window.QRCode === 'function' && qr.dataset.giftQr) {
      // eslint-disable-next-line no-new
      new window.QRCode(qr, { text: qr.dataset.giftQr, width: 120, height: 120 });
      qr.removeAttribute('title');
    }

    const copy = document.querySelector('[data-gift-copy]');
    const status = document.querySelector('[data-gift-status]');
    if (copy) {
      const label = copy.querySelector('[data-gift-copy-label]');
      const original = label ? label.textContent : '';
      let timer;
      copy.addEventListener('click', async () => {
        try {
          await copyText(copy.dataset.code || '');
          if (label) label.textContent = copy.dataset.copied;
          if (status) status.textContent = copy.dataset.copied;
          copy.classList.add('is-done');
          const V = window.Vault;
          if (V && V.motionOK()) V.Motion.animate(copy, { scale: [1, 1.06, 1] }, { duration: 0.4, ease: V.ease.back });
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (label) label.textContent = original;
            copy.classList.remove('is-done');
          }, 2400);
        } catch (_) {
          if (status) status.textContent = copy.dataset.copyError;
          window.Vault?.toast?.(copy.dataset.copyError, { type: 'error' });
        }
      });
    }

    document.querySelector('[data-gift-print]')?.addEventListener('click', () => window.print());
  });
})();
