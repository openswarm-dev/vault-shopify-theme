/*!
 * Vault — Drop countdown <drop-countdown>
 * - Parses the merchant's "YYYY-MM-DD HH:MM" + UTC offset safely (falls back to the server epoch).
 * - Rolls each changing digit (outgoing slides up, incoming springs up from below).
 * - Final 24h progress bar, screen-reader summary refreshed once a minute (role="timer").
 * - Switches to the live layout at zero: content crossfade, card flip, glow burst.
 * Without JS the date is shown in words; without motion every state change is instant.
 */
(() => {
  'use strict';

  if (customElements.get('drop-countdown')) return;

  const MIN_EPOCH = 946684800000; // 2000-01-01 — anything earlier is treated as invalid
  const pad = (n) => String(n).padStart(2, '0');

  /**
   * "2026-11-20 18:00" (also accepts T separator, seconds, "6:00 pm", / or . date separators)
   * interpreted in the given UTC offset ("-05:00") → epoch milliseconds, or NaN.
   */
  const parseTarget = (raw, offset) => {
    const m = String(raw || '').trim().match(
      /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[\sT]+(\d{1,2})(?:[:.h](\d{2}))?(?::(\d{2}))?\s*([ap]\.?m\.?)?)?$/i,
    );
    if (!m) return NaN;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    let h = Number(m[4] || 0);
    const mi = Number(m[5] || 0);
    const s = Number(m[6] || 0);
    const meridiem = (m[7] || '').toLowerCase().replace(/\./g, '');
    if (meridiem) {
      if (h < 1 || h > 12) return NaN;
      h = (h % 12) + (meridiem === 'pm' ? 12 : 0);
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return NaN;
    if (new Date(Date.UTC(y, mo - 1, d)).getUTCDate() !== d) return NaN; // e.g. 2026-02-31

    const o = String(offset || '').trim().match(/^(?:UTC|GMT)?\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i);
    const offsetMinutes = o ? (o[1] === '-' ? -1 : 1) * (Number(o[2]) * 60 + Number(o[3] || 0)) : 0;
    const t = Date.UTC(y, mo - 1, d, h, mi, s) - offsetMinutes * 60000;
    return t > MIN_EPOCH ? t : NaN;
  };

  class DropCountdown extends HTMLElement {
    connectedCallback() {
      if (!this._bound) {
        this._bound = true;
        this.setup();
      }
      this.start();
    }

    disconnectedCallback() {
      this.stop();
    }

    /* One-time wiring (survives the element being moved in the DOM, e.g. section reorder). */
    setup() {
      this.V = window.Vault || null;
      this.M = (this.V && this.V.Motion) || null;
      this.motion = !!(this.V && this.M && this.V.motionOK());

      this.pre = this.querySelector('[data-dc-pre]');
      this.live = this.querySelector('[data-dc-live]');
      this.timerEl = this.querySelector('[data-dc-timer]');
      this.finalEl = this.querySelector('[data-dc-final]');
      this.fillEl = this.querySelector('[data-dc-fill]');
      this.srEl = this.querySelector('[data-dc-sr]');
      this.whenEl = this.querySelector('[data-dc-when]');
      this.flip = this.querySelector('[data-dc-flip]');
      this.burst = this.querySelector('[data-dc-burst]');
      this.values = {};
      this.querySelectorAll('[data-dc-value]').forEach((el) => { this.values[el.dataset.dcValue] = el; });
      this.isLive = false;
      this.final = null;
      this.lastMinute = null;
      this.visible = !this.motion;

      this.restoreNotify();
      this.bindTilt();

      let target = parseTarget(this.dataset.date, this.dataset.offset);
      if (!Number.isFinite(target)) {
        const serverEpoch = Number(this.dataset.epoch) * 1000;
        target = serverEpoch > MIN_EPOCH ? serverEpoch : NaN;
      }
      this.target = target;
      this.localizeWhen();

      // Merchant preview, or the server already saw the drop open → stay live.
      if (this.dataset.forceLive === 'true' || this.dataset.state === 'live') {
        this.goLive(false);
        return;
      }
      if (!Number.isFinite(this.target)) return;
      if (this.timerEl) this.timerEl.hidden = false;
      this.tick(false);
      if (!this.isLive && this.motion) this.classList.add('is-armed');
    }

    /* Per-connection work: the clock, visibility resync and the in-view flag. */
    start() {
      if (this.isLive || !Number.isFinite(this.target)) return;
      this.stop();
      this.tick(false);
      if (this.isLive) return;
      if (this.motion) {
        this.stopInView = this.M.inView(this, () => {
          this.visible = true;
          this.entrance();
          return () => { this.visible = false; };
        }, { margin: '80px 0px' });
      }
      this.schedule();
      this.onVisibility = () => {
        if (document.hidden || this.isLive) return;
        clearTimeout(this.timer);
        this.tick(false);
        if (!this.isLive) this.schedule();
      };
      document.addEventListener('visibilitychange', this.onVisibility);
    }

    stop() {
      clearTimeout(this.timer);
      if (this.stopInView) this.stopInView();
      this.stopInView = null;
      if (this.onVisibility) document.removeEventListener('visibilitychange', this.onVisibility);
      this.onVisibility = null;
    }

    /* Tick just after each wall-clock second so all visitors roll in sync. */
    schedule() {
      const delay = 1000 - (Date.now() % 1000) + 12;
      this.timer = setTimeout(() => {
        this.tick(true);
        if (!this.isLive) this.schedule();
      }, delay);
    }

    tick(animate) {
      const diff = this.target - Date.now();
      if (diff <= 0) {
        this.goLive(animate && this.visible);
        return;
      }
      const total = Math.floor(diff / 1000);
      const d = Math.min(999, Math.floor(total / 86400));
      const h = Math.floor((total % 86400) / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      const roll = animate && this.motion && this.visible;

      this.setValue('days', pad(d), roll);
      this.setValue('hours', pad(h), roll);
      this.setValue('minutes', pad(m), roll);
      this.setValue('seconds', pad(s), roll);

      const final = total < 86400;
      if (final !== this.final) {
        this.final = final;
        this.classList.toggle('is-final', final);
        if (this.finalEl) this.finalEl.hidden = !final;
      }
      if (final && this.fillEl) {
        this.fillEl.style.transform = `scaleX(${(1 - total / 86400).toFixed(4)})`;
      }

      if (this.srEl && m !== this.lastMinute) {
        this.lastMinute = m;
        const tpl = this.dataset.srTemplate || '';
        if (tpl) this.srEl.textContent = tpl.replace('[d]', d).replace('[h]', h).replace('[m]', m);
      }
    }

    makeChar(ch) {
      const c = document.createElement('span');
      c.className = 'dc-digit__char';
      c.textContent = ch;
      return c;
    }

    setValue(unit, str, roll) {
      const wrap = this.values[unit];
      if (!wrap) return;
      while (wrap.children.length < str.length) {
        const slot = document.createElement('span');
        slot.className = 'dc-digit';
        slot.appendChild(this.makeChar('0'));
        wrap.prepend(slot);
      }
      while (wrap.children.length > str.length) wrap.firstElementChild.remove();
      if (wrap.dataset.digits !== String(str.length)) wrap.dataset.digits = String(str.length);
      Array.from(wrap.children).forEach((slot, i) => this.setDigit(slot, str[i], roll));
    }

    /* Only the digits that change animate: old char slides up and out, new one springs up from below. */
    setDigit(slot, ch, roll) {
      const current = slot.lastElementChild;
      if (current && current.textContent === ch) return;
      Array.from(slot.children).forEach((c) => { if (c !== current) c.remove(); });

      if (!roll || !current) {
        if (current) {
          current.textContent = ch;
          current.removeAttribute('style');
        } else {
          slot.appendChild(this.makeChar(ch));
        }
        return;
      }

      const next = this.makeChar(ch);
      slot.appendChild(next);
      const out = this.M.animate(
        current,
        { y: ['0%', '-100%'], opacity: [1, 0], filter: ['blur(0px)', 'blur(3px)'] },
        { duration: 0.32, ease: this.V.ease.in },
      );
      Promise.resolve(out).then(() => current.remove(), () => current.remove());
      this.M.animate(
        next,
        { y: ['100%', '0%'], opacity: [0, 1] },
        { type: 'spring', stiffness: 420, damping: 28, mass: 0.8 },
      );
    }

    /* First time the tiles scroll into view: spring them in, staggered. */
    entrance() {
      if (this.entered) return;
      this.entered = true;
      const tiles = Array.from(this.querySelectorAll('.dc-tile'));
      const seps = Array.from(this.querySelectorAll('.dc-sep'));
      const clear = (els) => els.forEach((el) => { el.style.removeProperty('opacity'); el.style.removeProperty('transform'); });
      const done = () => {
        this.classList.remove('is-armed');
        clear(tiles);
        clear(seps);
      };
      if (!tiles.length) {
        done();
        return;
      }
      const M = this.M;
      const a = M.animate(
        tiles,
        { opacity: [0, 1], y: [28, 0], scale: [0.9, 1] },
        { type: 'spring', stiffness: 260, damping: 22, delay: M.stagger(0.08, { startDelay: 0.1 }) },
      );
      if (seps.length) {
        M.animate(seps, { opacity: [0, 1], scale: [0.4, 1] }, { duration: 0.5, ease: this.V.ease.back, delay: M.stagger(0.08, { startDelay: 0.3 }) });
      }
      Promise.resolve(a).then(done, done);
    }

    goLive(animate) {
      if (this.isLive) return;
      this.isLive = true;
      this.stop();
      this.classList.remove('is-armed', 'is-final');

      if (!animate || !this.motion || !this.pre || !this.live) {
        this.dataset.state = 'live';
        if (this.pre) this.pre.hidden = true;
        if (this.live) this.live.hidden = false;
        return;
      }

      const M = this.M;
      const V = this.V;
      // Hold the card face-down for the start of the flip, then let CSS own the live state.
      if (this.flip) this.flip.style.transform = 'rotateY(0deg)';
      this.dataset.state = 'live';

      const out = M.animate(this.pre, { opacity: [1, 0], y: [0, -18] }, { duration: 0.35, ease: V.ease.in });
      Promise.resolve(out).then(() => {
        this.pre.hidden = true;
        this.pre.style.removeProperty('opacity');
        this.pre.style.removeProperty('transform');
        this.live.hidden = false;
        const items = Array.from(this.live.children);
        const inAnim = M.animate(
          items,
          { opacity: [0, 1], y: [26, 0] },
          { type: 'spring', stiffness: 240, damping: 24, delay: M.stagger(0.08) },
        );
        Promise.resolve(inAnim).then(() => items.forEach((el) => {
          el.style.removeProperty('opacity');
          el.style.removeProperty('transform');
        }));
      });

      if (this.flip) {
        M.animate(this.flip, { rotateY: [0, 180] }, { type: 'spring', stiffness: 110, damping: 13, mass: 1.1, delay: 0.2 });
      }
      if (this.burst) {
        M.animate(this.burst, { opacity: [0, 0.9, 0], scale: [0.5, 1.5], z: [-120, -120] }, { duration: 1.4, ease: V.ease.out, delay: 0.25 });
      }
    }

    /* Shopify reloads the page after a customer form posts; only claim success if it was ours. */
    restoreNotify() {
      const success = this.querySelector('[data-dc-success]');
      const form = success && success.closest('form');
      const hash = window.location.hash.slice(1);
      if (!success || !form || !hash || hash === form.id) return;
      success.remove();
      const row = form.querySelector('[data-dc-row]');
      if (row) row.hidden = false;
    }

    /* Rewrite the date in the visitor's language and time zone. */
    localizeWhen() {
      if (!this.whenEl || !Number.isFinite(this.target)) return;
      try {
        const locale = (window.theme && window.theme.locale) || document.documentElement.lang || undefined;
        const date = new Date(this.target);
        this.whenEl.textContent = new Intl.DateTimeFormat(locale, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        }).format(date);
        this.whenEl.setAttribute('datetime', date.toISOString());
      } catch (_) {
        /* keep the server-rendered date */
      }
    }

    /* Desktop: the card stack leans toward the pointer on a soft spring. */
    bindTilt() {
      if (!this.motion || !this.V.canHover()) return;
      const visual = this.querySelector('[data-dc-visual]');
      const stack = this.querySelector('[data-dc-stack]');
      if (!visual || !stack) return;
      const M = this.M;
      const follow = { type: 'spring', stiffness: 150, damping: 18, mass: 0.9 };
      const move = this.V.rafThrottle((e) => {
        const r = visual.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) - 0.5;
        const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) - 0.5;
        M.animate(stack, { rotateY: px * 16, rotateX: py * -12 }, follow);
      });
      visual.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'mouse') move(e);
      });
      visual.addEventListener('pointerleave', () => {
        M.animate(stack, { rotateY: 0, rotateX: 0 }, { type: 'spring', stiffness: 120, damping: 12 });
      });
    }
  }

  customElements.define('drop-countdown', DropCountdown);
})();
