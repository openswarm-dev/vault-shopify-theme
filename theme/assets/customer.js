/*!
 * VAULT — customer.js (classic customer accounts)
 *  - Show/hide password toggles ([data-password-toggle], aria-controls → input id)
 *  - Country → province selects for address forms (Shopify.CountryProvinceSelector from shopify_common.js)
 *  - Confirm before deleting an address ([data-address-delete][data-confirm])
 *  - [data-details-close] buttons close their <details> (keeps core's animated accordion)
 *  - Login ⇄ recover panel transitions (CSS :target does the switching; Motion adds the polish)
 *  - Loading state on submit + focus on the first form message after a post
 * Safe to load more than once on a page.
 */
(() => {
  'use strict';

  if (window.VaultCustomer) return;
  window.VaultCustomer = true;

  const V = () => window.Vault;
  const motionOK = () => !!(V() && V().motionOK());

  const ready = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };

  /* Password visibility */
  const bindPasswordToggles = () => {
    document.querySelectorAll('[data-password-toggle]').forEach((btn) => {
      const input = document.getElementById(btn.getAttribute('aria-controls'));
      if (!input || btn.dataset.bound) return;
      btn.dataset.bound = 'true';
      btn.hidden = false;
      btn.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', String(show));
        btn.setAttribute('aria-label', show ? btn.dataset.hideLabel : btn.dataset.showLabel);
        input.focus({ preventScroll: true });
      });
    });
  };

  /* Country / province */
  const bindCountrySelectors = () => {
    const Shopify = window.Shopify;
    if (!Shopify || typeof Shopify.CountryProvinceSelector !== 'function') return;
    document.querySelectorAll('[data-address-country]').forEach((select) => {
      if (select.dataset.bound) return;
      select.dataset.bound = 'true';
      // eslint-disable-next-line no-new
      new Shopify.CountryProvinceSelector(select.id, select.dataset.provinceId, {
        hideElement: select.dataset.containerId,
      });
    });
  };

  /* Login ⇄ recover */
  const bindAuthPanels = () => {
    const card = document.querySelector('[data-auth-card]');
    if (!card) return;
    const panels = {
      recover: card.querySelector('[data-auth-panel="recover"]'),
      login: card.querySelector('[data-auth-panel="login"]'),
    };
    if (!panels.recover || !panels.login) return;

    const show = () => {
      const name = window.location.hash === '#recover' ? 'recover' : 'login';
      const panel = panels[name];
      if (motionOK()) {
        V().Motion.animate(
          panel,
          { opacity: [0, 1], x: [name === 'recover' ? 28 : -28, 0] },
          { type: 'spring', stiffness: 260, damping: 28 },
        );
        V().Motion.animate(card, { scale: [0.985, 1] }, { duration: 0.4, ease: V().ease.out });
      }
      const input = panel.querySelector('input:not([type="hidden"])');
      (input || panel).focus({ preventScroll: true });
    };

    window.addEventListener('hashchange', () => {
      if (window.location.hash === '#recover' || window.location.hash === '#login') show();
    });
  };

  ready(() => {
    bindPasswordToggles();
    bindCountrySelectors();
    bindAuthPanels();

    // Focus the first error/success message so screen readers announce the result of a post.
    const message = document.querySelector('.customer [data-form-message]');
    if (message && message.offsetParent !== null) {
      requestAnimationFrame(() => message.focus({ preventScroll: false }));
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;

    const del = form.closest('[data-address-delete]');
    if (del) {
      if (!window.confirm(del.dataset.confirm || '')) {
        e.preventDefault();
        return;
      }
    }

    if (!form.closest('.customer')) return;
    const btn = e.submitter || form.querySelector('[type="submit"]');
    if (btn && btn.classList.contains('btn')) {
      btn.classList.add('is-loading');
      btn.setAttribute('aria-busy', 'true');
    }
  });

  // Restore buttons when the page is shown from the back/forward cache.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    document.querySelectorAll('.customer .btn.is-loading').forEach((btn) => {
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-busy');
    });
  });

  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-details-close]');
    if (!closer) return;
    const details = closer.closest('details');
    const summary = details && details.querySelector(':scope > summary');
    if (!details || !details.open || !summary) return;
    e.preventDefault();
    summary.click();
    summary.focus({ preventScroll: true });
  });
})();
