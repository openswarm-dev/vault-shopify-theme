/*!
 * VAULT — section-main-article.js
 * <main-article> — reading progress (Motion scroll linked to the article body, tucked
 * under the live header), copy-link + native share buttons.
 */
(() => {
  'use strict';

  if (customElements.get('main-article')) return;

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

  customElements.define('main-article', class extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      this.V = window.Vault;
      this.bindProgress();
      this.bindShare();
    }

    disconnectedCallback() {
      this.stopScroll?.();
      clearTimeout(this.copyTimer);
    }

    bindProgress() {
      const V = this.V;
      const section = this.closest('section');
      const wrap = section?.querySelector('[data-article-progress]');
      const bar = wrap?.querySelector('[data-article-progress-bar]');
      const body = this.querySelector('[data-article-body]');
      if (!V || !wrap || !bar || !body || !V.motionOK()) return;

      const header = document.querySelector('[data-header]');
      let lastTop = -1;
      let active = false;

      this.stopScroll = V.Motion.scroll((progress) => {
        // Sit directly under the header while it is on screen; slide to the top when it hides.
        if (header) {
          const top = Math.max(0, Math.round(header.getBoundingClientRect().bottom));
          if (top !== lastTop) {
            lastTop = top;
            wrap.style.setProperty('--progress-top', `${top}px`);
          }
        }
        bar.style.transform = `scaleX(${progress.toFixed(4)})`;
        const next = progress > 0.001 && progress < 0.999;
        if (next !== active) {
          active = next;
          wrap.classList.toggle('is-active', active);
        }
      }, { target: body, offset: ['start 0.6', 'end end'] });
    }

    bindShare() {
      const copyBtn = this.querySelector('[data-share-copy]');
      const nativeBtn = this.querySelector('[data-share-native]');

      if (nativeBtn && typeof navigator.share === 'function') {
        nativeBtn.hidden = false;
        nativeBtn.addEventListener('click', () => {
          navigator.share({ title: nativeBtn.dataset.title || document.title, url: nativeBtn.dataset.url }).catch(() => {});
        });
      }

      if (!copyBtn) return;
      const label = copyBtn.querySelector('[data-share-copy-label]');
      const original = label ? label.textContent : '';
      copyBtn.addEventListener('click', async () => {
        const url = copyBtn.dataset.url || window.location.href;
        try {
          await copyText(url);
          if (label) label.textContent = this.dataset.msgCopied;
          copyBtn.classList.add('is-done');
          this.V?.toast(this.dataset.msgCopied);
          if (this.V?.motionOK()) this.V.Motion.animate(copyBtn, { scale: [1, 1.06, 1] }, { duration: 0.4, ease: this.V.ease.back });
          clearTimeout(this.copyTimer);
          this.copyTimer = setTimeout(() => {
            if (label) label.textContent = original;
            copyBtn.classList.remove('is-done');
          }, 2400);
        } catch (_) {
          this.V?.toast(this.dataset.msgCopyError, { type: 'error' });
        }
      });
    }
  });
})();
