/*!
 * VAULT — theme core
 * Requires assets/motion.js (Motion, formerly Framer Motion) loaded before this file.
 * Everything degrades gracefully when Motion is missing or the visitor prefers reduced motion.
 *
 * Public API (window.Vault):
 *   Motion, motionOK(), canHover(), isMobile(), isDesktop(), intensity, ease, spring*
 *   $, $$, clamp, lerp, debounce, rafThrottle, emit, on, parseHTML
 *   fetchSection(id, url), fetchSections(ids, url), applySections(sections)
 *   lockScroll(), unlockScroll(), formatMoney(cents, format), toast(msg, opts)
 *   cart.{add, change, update, get, refresh, register, unregister}, flyToCart(el)
 *   init(root) — (re)binds data-attribute enhancers inside root (idempotent)
 * Custom elements: <holo-card>, <vault-drawer>, <vault-carousel>, <vault-marquee>, <quantity-input>
 */
(() => {
  'use strict';

  const M = window.Motion || null;
  const html = document.documentElement;
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mqHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  const mqMobile = window.matchMedia('(max-width: 749px)');
  const mqDesktop = window.matchMedia('(min-width: 990px)');
  const config = window.theme || {};
  const settings = config.settings || {};
  const strings = config.strings || {};
  const routes = window.routes || {};

  if (!M) html.classList.remove('motion-ok');

  const Vault = (window.Vault = window.Vault || {});

  /* ------------------------------------------------------------------ *
   * Environment
   * ------------------------------------------------------------------ */
  Vault.Motion = M;
  Vault.motionOK = () => !!M && html.classList.contains('motion-ok') && !mqReduce.matches;
  Vault.canHover = () => mqHover.matches;
  Vault.isMobile = () => mqMobile.matches;
  Vault.isDesktop = () => mqDesktop.matches;
  Vault.intensity = { subtle: 0.6, standard: 1, bold: 1.35 }[html.dataset.anim] || 1;
  Vault.ease = {
    out: [0.16, 1, 0.3, 1],
    inOut: [0.65, 0, 0.35, 1],
    in: [0.55, 0, 1, 0.45],
    back: [0.34, 1.56, 0.64, 1],
  };
  Vault.spring = { type: 'spring', stiffness: 320, damping: 32, mass: 1 };
  Vault.springSoft = { type: 'spring', stiffness: 160, damping: 22, mass: 1 };
  Vault.springBouncy = { type: 'spring', stiffness: 420, damping: 18, mass: 0.9 };

  mqHover.addEventListener?.('change', () => html.classList.toggle('can-hover', mqHover.matches));

  /* ------------------------------------------------------------------ *
   * Utilities
   * ------------------------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  Vault.$ = $;
  Vault.$$ = $$;
  Vault.clamp = clamp;
  Vault.lerp = lerp;
  Vault.debounce = (fn, wait = 200) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };
  Vault.rafThrottle = (fn) => {
    let queued = false;
    let lastArgs;
    return (...args) => {
      lastArgs = args;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn(...lastArgs);
      });
    };
  };
  Vault.emit = (name, detail = {}) => document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  Vault.on = (name, fn) => {
    document.addEventListener(name, fn);
    return () => document.removeEventListener(name, fn);
  };
  Vault.parseHTML = (text) => new DOMParser().parseFromString(text, 'text/html');

  Vault.fetchSection = async (sectionId, url = window.location.href) => {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('section_id', sectionId);
    const res = await fetch(u.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!res.ok) throw new Error(`Section "${sectionId}" failed to load (${res.status})`);
    return Vault.parseHTML(await res.text());
  };

  Vault.fetchSections = async (ids, url = window.location.href) => {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('sections', ids.join(','));
    const res = await fetch(u.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!res.ok) throw new Error(`Sections failed to load (${res.status})`);
    return res.json();
  };

  let lockCount = 0;
  Vault.lockScroll = () => {
    lockCount += 1;
    if (lockCount === 1) html.classList.add('is-locked');
  };
  Vault.unlockScroll = () => {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) html.classList.remove('is-locked');
  };

  Vault.formatMoney = (cents, format = config.moneyFormat || '${{amount}}') => {
    let value = typeof cents === 'string' ? Number(cents.replace(/[^\d-]/g, '')) : Number(cents);
    if (!Number.isFinite(value)) value = 0;
    const fmt = (n, decimals, thousands = ',', decimal = '.') => {
      const [int, dec] = (n / 100).toFixed(decimals).split('.');
      const intStr = int.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
      return dec ? intStr + decimal + dec : intStr;
    };
    return String(format).replace(/\{\{\s*(\w+)\s*\}\}/, (_, key) => {
      switch (key) {
        case 'amount_no_decimals': return fmt(value, 0);
        case 'amount_with_comma_separator': return fmt(value, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator': return fmt(value, 0, '.', ',');
        case 'amount_with_apostrophe_separator': return fmt(value, 2, "'", '.');
        case 'amount_no_decimals_with_space_separator': return fmt(value, 0, ' ', ',');
        case 'amount_with_space_separator': return fmt(value, 2, ' ', ',');
        case 'amount_with_period_and_space_separator': return fmt(value, 2, ' ', '.');
        default: return fmt(value, 2);
      }
    });
  };

  const ICON_CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';
  const ICON_ALERT = '<path d="M12 4 21 19.5H3L12 4Z"/><path d="M12 10v4M12 16.8h.01"/>';
  Vault.toast = (message, { type = 'success', duration = 3800 } = {}) => {
    const region = $('[data-toast-region]');
    if (!region || !message) return;
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.innerHTML = `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${type === 'error' ? ICON_ALERT : ICON_CHECK}</svg><span></span>`;
    el.querySelector('span').textContent = message;
    region.appendChild(el);
    if (Vault.motionOK()) M.animate(el, { opacity: [0, 1], y: [24, 0], scale: [0.96, 1] }, Vault.spring);
    setTimeout(async () => {
      if (Vault.motionOK()) {
        try { await M.animate(el, { opacity: 0, y: 12, scale: 0.98 }, { duration: 0.25, ease: Vault.ease.in }); } catch (_) { /* noop */ }
      }
      el.remove();
    }, duration);
  };

  const inViewport = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
  };
  Vault.inViewport = inViewport;

  /* ------------------------------------------------------------------ *
   * Scroll velocity (shared by marquees and other scroll-reactive pieces)
   * ------------------------------------------------------------------ */
  Vault.scrollVelocity = 0;
  Vault.scrollDirection = 1;
  {
    let lastY = window.scrollY;
    let lastT = performance.now();
    let decayRaf = null;
    const decay = () => {
      Vault.scrollVelocity *= 0.9;
      if (Math.abs(Vault.scrollVelocity) > 1) decayRaf = requestAnimationFrame(decay);
      else { Vault.scrollVelocity = 0; decayRaf = null; }
    };
    window.addEventListener('scroll', Vault.rafThrottle(() => {
      const now = performance.now();
      const dy = window.scrollY - lastY;
      const dt = Math.max(1, now - lastT);
      Vault.scrollVelocity = lerp(Vault.scrollVelocity, (dy / dt) * 1000, 0.5);
      if (dy !== 0) Vault.scrollDirection = dy > 0 ? 1 : -1;
      lastY = window.scrollY;
      lastT = now;
      if (!decayRaf) decayRaf = requestAnimationFrame(decay);
    }), { passive: true });
  }

  /* ------------------------------------------------------------------ *
   * Reveal system — [data-reveal="fade-up|fade|fade-down|left|right|scale|blur|clip|zoom|card"]
   * Elements that enter the viewport together are auto-staggered in visual order.
   * Optional: data-reveal-delay="0.2" (s), data-reveal-duration="1.1" (s)
   * ------------------------------------------------------------------ */
  const k = Vault.intensity;
  const REVEALS = {
    'fade-up': () => ({ opacity: [0, 1], y: [28 * k, 0] }),
    fade: () => ({ opacity: [0, 1] }),
    'fade-down': () => ({ opacity: [0, 1], y: [-20 * k, 0] }),
    left: () => ({ opacity: [0, 1], x: [-36 * k, 0] }),
    right: () => ({ opacity: [0, 1], x: [36 * k, 0] }),
    scale: () => ({ opacity: [0, 1], scale: [1 - 0.08 * k, 1] }),
    blur: () => ({ opacity: [0, 1], filter: ['blur(14px)', 'blur(0px)'], y: [12 * k, 0] }),
    clip: () => ({ clipPath: ['inset(0% 0% 100% 0%)', 'inset(0% 0% 0% 0%)'] }),
    zoom: () => ({ scale: [1 + 0.12 * k, 1] }),
    card: () => ({
      opacity: [0, 1],
      transform: [
        `perspective(900px) translateY(${40 * k}px) rotateX(${18 * k}deg)`,
        'perspective(900px) translateY(0px) rotateX(0deg)',
      ],
    }),
  };
  const CLEAR_PROPS = ['opacity', 'transform', 'filter', 'clip-path', 'will-change'];
  const revealQueue = new Set();
  let revealScheduled = false;

  const finishReveal = (el) => {
    el.classList.add('is-revealed');
    CLEAR_PROPS.forEach((p) => el.style.removeProperty(p));
    el.dispatchEvent(new CustomEvent('reveal:done', { bubbles: false }));
  };

  const playReveal = (el, baseDelay = 0) => {
    const type = el.dataset.reveal || 'fade-up';
    const keyframes = (REVEALS[type] || REVEALS['fade-up'])();
    const delay = baseDelay + (parseFloat(el.dataset.revealDelay) || 0);
    const duration = parseFloat(el.dataset.revealDuration) || (type === 'clip' || type === 'zoom' ? 1.2 : 0.9);
    try {
      const anim = M.animate(el, keyframes, { duration, delay, ease: Vault.ease.out });
      Promise.resolve(anim).then(() => finishReveal(el), () => finishReveal(el));
    } catch (_) {
      finishReveal(el);
    }
  };

  const flushReveals = () => {
    revealScheduled = false;
    const items = Array.from(revealQueue).filter((el) => el.isConnected);
    revealQueue.clear();
    const rects = new Map(items.map((el) => [el, el.getBoundingClientRect()]));
    items.sort((a, b) => {
      const ra = rects.get(a);
      const rb = rects.get(b);
      return (Math.round(ra.top / 48) - Math.round(rb.top / 48)) || (ra.left - rb.left);
    });
    const step = 0.075;
    items.forEach((el, i) => playReveal(el, Math.min(i, 10) * step));
  };

  const bindReveal = (el) => {
    if (el.classList.contains('is-revealed')) return;
    if (!Vault.motionOK()) {
      el.classList.add('is-revealed');
      return;
    }
    M.inView(el, () => {
      revealQueue.add(el);
      if (!revealScheduled) {
        revealScheduled = true;
        requestAnimationFrame(flushReveals);
      }
    }, { margin: '0px 0px -40px 0px' });
  };

  /* ------------------------------------------------------------------ *
   * Split text — [data-split] (words) or [data-split="chars"]
   * Masks each word and slides it up on reveal. Optional data-split-delay.
   * ------------------------------------------------------------------ */
  const GRADIENT_CLASSES = ['text-gradient', 'text-holo', 'text-outline', 'text-accent'];
  const splitText = (el) => {
    if (el.classList.contains('is-split')) return;
    const chars = el.dataset.split === 'chars';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (!node.textContent.trim()) return;
      let inherit = '';
      for (let p = node.parentElement; p && p !== el.parentElement; p = p.parentElement) {
        const hit = GRADIENT_CLASSES.find((c) => p.classList.contains(c));
        if (hit) { inherit = hit; break; }
        if (p === el) break;
      }
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(part));
          return;
        }
        const outer = document.createElement('span');
        outer.className = 'split-word';
        const inner = document.createElement('span');
        inner.className = `split-word__inner${inherit ? ` ${inherit}` : ''}`;
        if (chars) {
          Array.from(part).forEach((ch) => {
            const c = document.createElement('span');
            c.className = 'split-char';
            c.textContent = ch;
            inner.appendChild(c);
          });
        } else {
          inner.textContent = part;
        }
        outer.appendChild(inner);
        frag.appendChild(outer);
      });
      node.replaceWith(frag);
    });
    el.classList.add('is-split');
  };

  const bindSplit = (el) => {
    if (!Vault.motionOK()) {
      el.classList.add('is-split', 'is-split-done');
      return;
    }
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.textContent.trim().replace(/\s+/g, ' '));
    splitText(el);
    const targets = $$(el.dataset.split === 'chars' ? '.split-char' : '.split-word__inner', el);
    targets.forEach((t) => t.setAttribute('aria-hidden', 'true'));
    M.inView(el, () => {
      const delay = parseFloat(el.dataset.splitDelay) || 0;
      const each = el.dataset.split === 'chars' ? 0.022 : 0.06;
      const anim = M.animate(
        targets,
        { y: ['110%', '0%'], rotate: [6 * k, 0] },
        { duration: 0.95, ease: Vault.ease.out, delay: M.stagger(each, { startDelay: delay }) },
      );
      Promise.resolve(anim).then(() => {
        el.classList.add('is-split-done');
        targets.forEach((t) => t.style.removeProperty('transform'));
      });
    }, { margin: '0px 0px -40px 0px' });
  };

  /* ------------------------------------------------------------------ *
   * Counters — [data-count-to="25000"] (+ data-count-decimals, -prefix, -suffix)
   * ------------------------------------------------------------------ */
  const bindCounter = (el) => {
    const to = parseFloat(el.dataset.countTo);
    if (!Number.isFinite(to)) return;
    const decimals = parseInt(el.dataset.countDecimals || '0', 10);
    const nf = new Intl.NumberFormat(config.locale || undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const prefix = el.dataset.countPrefix || '';
    const suffix = el.dataset.countSuffix || '';
    const render = (v) => { el.textContent = `${prefix}${nf.format(v)}${suffix}`; };
    if (!Vault.motionOK()) {
      render(to);
      return;
    }
    render(0);
    M.inView(el, () => {
      M.animate(0, to, { duration: parseFloat(el.dataset.countDuration) || 2, ease: Vault.ease.out, onUpdate: render });
    }, { amount: 0.4 });
  };

  /* ------------------------------------------------------------------ *
   * Parallax — [data-parallax="0.15"] (fraction of viewport height travelled)
   * Optional [data-parallax-root] ancestor sets the scroll target.
   * ------------------------------------------------------------------ */
  const bindParallax = (el) => {
    if (!Vault.motionOK()) return;
    const speed = parseFloat(el.dataset.parallax) || 0.15;
    const target = el.closest('[data-parallax-root]') || el.parentElement || el;
    const dist = window.innerHeight * speed * (Vault.isMobile() ? 0.5 : 1) * k;
    M.scroll(M.animate(el, { y: [-dist, dist] }, { ease: 'linear' }), { target, offset: ['start end', 'end start'] });
  };

  /* ------------------------------------------------------------------ *
   * Magnetic — [data-magnetic="0.35"] (desktop pointer only)
   * ------------------------------------------------------------------ */
  const bindMagnetic = (el) => {
    if (!Vault.motionOK() || !Vault.canHover()) return;
    const strength = parseFloat(el.dataset.magnetic) || 0.3;
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) * strength;
      const y = (e.clientY - (r.top + r.height / 2)) * strength;
      M.animate(el, { x, y }, { type: 'spring', stiffness: 260, damping: 18, mass: 0.6 });
    });
    el.addEventListener('pointerleave', () => {
      M.animate(el, { x: 0, y: 0 }, { type: 'spring', stiffness: 220, damping: 12, mass: 0.7 });
    });
  };

  /* ------------------------------------------------------------------ *
   * Accordion — <details class="accordion" data-accordion>
   *   <summary>…<span class="accordion__icon">+</span></summary>
   *   <div class="accordion__content"><div class="accordion__inner">…</div></div>
   * </details>
   * Wrap several in [data-accordion-group] to keep only one open.
   * ------------------------------------------------------------------ */
  const bindAccordion = (details) => {
    const summary = details.querySelector(':scope > summary');
    const content = details.querySelector(':scope > .accordion__content');
    if (!summary || !content) return;
    let busy = false;

    const open = async () => {
      details.open = true;
      const group = details.closest('[data-accordion-group]');
      if (group) {
        $$('details[data-accordion][open]', group)
          .filter((d) => d !== details && d.closest('[data-accordion-group]') === group)
          .forEach((d) => d.querySelector(':scope > summary')?.click());
      }
      const h = content.scrollHeight;
      try {
        await M.animate(content, { height: [0, h], opacity: [0, 1] }, { duration: 0.45, ease: Vault.ease.out });
      } finally {
        content.style.removeProperty('height');
        content.style.removeProperty('opacity');
      }
    };
    const close = async () => {
      const h = content.offsetHeight;
      try {
        await M.animate(content, { height: [h, 0], opacity: [1, 0] }, { duration: 0.32, ease: Vault.ease.inOut });
      } finally {
        details.open = false;
        content.style.removeProperty('height');
        content.style.removeProperty('opacity');
      }
    };

    summary.addEventListener('click', async (e) => {
      if (!Vault.motionOK()) return;
      e.preventDefault();
      if (busy) return;
      busy = true;
      try {
        if (details.open) await close();
        else await open();
      } finally {
        busy = false;
      }
    });
  };

  /* ------------------------------------------------------------------ *
   * Enhancer registry + init
   * ------------------------------------------------------------------ */
  const ENHANCERS = [
    ['[data-reveal]', bindReveal],
    ['[data-split]', bindSplit],
    ['[data-count-to]', bindCounter],
    ['[data-parallax]', bindParallax],
    ['[data-magnetic]', bindMagnetic],
    ['details[data-accordion]', bindAccordion],
  ].map(([selector, fn]) => ({ selector, fn, seen: new WeakSet() }));

  Vault.init = (root = document) => {
    if (!root || !root.querySelectorAll) return;
    ENHANCERS.forEach(({ selector, fn, seen }) => {
      const list = $$(selector, root);
      if (root.matches && root.matches(selector)) list.unshift(root);
      list.forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        try { fn(el); } catch (err) { console.error('[Vault]', selector, err); }
      });
    });
  };

  /* ------------------------------------------------------------------ *
   * <holo-card> — 3D tilt + holographic foil + glare
   *   <holo-card data-foil="subtle|rainbow|intense|none" data-tilt="true|false" data-max-tilt="12">
   *     <div class="holo"> …media… <span class="holo__shine"></span><span class="holo__glare"></span></div>
   *   </holo-card>
   * Pointer devices: spring-follow tilt. Touch devices: a light sweep when scrolled into view or tapped.
   * ------------------------------------------------------------------ */
  class HoloCard extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      this.tiltEnabled = this.dataset.tilt !== 'false' && settings.tilt !== false;
      this.foilEnabled = this.dataset.foil !== 'none' && settings.holo !== false;
      if (!this.foilEnabled) this.dataset.foil = 'none';
      this.max = (parseFloat(this.dataset.maxTilt) || 12) * k;
      this.rest = { rx: 0, ry: 0, px: 0.5, py: 0.5, hyp: 0 };
      this.state = { ...this.rest };
      this.target = { ...this.rest };
      this.vel = { rx: 0, ry: 0, px: 0, py: 0, hyp: 0 };
      this.raf = null;
      this.last = 0;
      this.tick = this.tick.bind(this);
      if (!Vault.motionOK() || (!this.tiltEnabled && !this.foilEnabled)) return;

      if (Vault.canHover()) {
        this.addEventListener('pointerenter', (e) => this.onMove(e, true));
        this.addEventListener('pointermove', (e) => this.onMove(e));
        this.addEventListener('pointerleave', () => this.reset());
      } else {
        this.stopInView = M.inView(this, () => { this.sweep(); }, { amount: 0.6 });
        this.addEventListener('pointerdown', (e) => {
          if (e.pointerType !== 'mouse') this.sweep();
        }, { passive: true });
      }
    }

    disconnectedCallback() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
      if (this.stopInView) this.stopInView();
    }

    onMove(e, entering = false) {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      const r = this.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const px = clamp((e.clientX - r.left) / r.width, 0, 1);
      const py = clamp((e.clientY - r.top) / r.height, 0, 1);
      this.target = {
        rx: this.tiltEnabled ? (py - 0.5) * 2 * this.max : 0,
        ry: this.tiltEnabled ? -(px - 0.5) * 2 * this.max : 0,
        px,
        py,
        hyp: 1,
      };
      if (entering) this.classList.add('is-active');
      this.kick();
    }

    reset() {
      this.target = { ...this.rest };
      this.classList.remove('is-active');
      this.kick();
    }

    kick() {
      if (!this.raf) {
        this.last = 0;
        this.raf = requestAnimationFrame(this.tick);
      }
    }

    tick(t) {
      const dt = this.last ? Math.min(0.032, (t - this.last) / 1000) : 1 / 60;
      this.last = t;
      let moving = false;
      const stiffness = 170;
      const damping = 20;
      Object.keys(this.state).forEach((key) => {
        const force = (this.target[key] - this.state[key]) * stiffness - this.vel[key] * damping;
        this.vel[key] += force * dt;
        this.state[key] += this.vel[key] * dt;
        if (Math.abs(this.target[key] - this.state[key]) > 0.0015 || Math.abs(this.vel[key]) > 0.0015) moving = true;
      });
      this.apply();
      if (moving) this.raf = requestAnimationFrame(this.tick);
      else {
        this.raf = null;
        this.state = { ...this.target };
        this.apply();
      }
    }

    apply() {
      const s = this.state;
      const st = this.style;
      if (this.tiltEnabled) {
        st.setProperty('--rx', `${s.rx.toFixed(2)}deg`);
        st.setProperty('--ry', `${s.ry.toFixed(2)}deg`);
      }
      st.setProperty('--mx', `${(s.px * 100).toFixed(1)}%`);
      st.setProperty('--my', `${(s.py * 100).toFixed(1)}%`);
      st.setProperty('--px', s.px.toFixed(3));
      st.setProperty('--py', s.py.toFixed(3));
      st.setProperty('--hyp', clamp(s.hyp, 0, 1).toFixed(3));
    }

    sweep() {
      if (this.sweeping || !Vault.motionOK()) return;
      this.sweeping = true;
      this.classList.add('is-sweeping');
      const max = this.max * 0.6;
      const anim = M.animate(0, 1, {
        duration: 1.5,
        ease: Vault.ease.inOut,
        onUpdate: (p) => {
          this.state.px = p;
          this.state.py = 0.25 + p * 0.5;
          this.state.hyp = Math.sin(p * Math.PI);
          if (this.tiltEnabled) {
            this.state.ry = Math.sin(p * Math.PI * 2) * -max;
            this.state.rx = Math.sin(p * Math.PI) * max * 0.4;
          }
          this.apply();
        },
      });
      Promise.resolve(anim).finally(() => {
        this.sweeping = false;
        this.classList.remove('is-sweeping');
        this.state = { ...this.rest };
        this.apply();
      });
    }
  }
  if (!customElements.get('holo-card')) customElements.define('holo-card', HoloCard);

  /* ------------------------------------------------------------------ *
   * <vault-drawer> — drawers, bottom sheets and modals built on <dialog>
   *   <vault-drawer id="CartDrawer" data-placement="right|left|bottom|center" data-mobile-placement="bottom|full">
   *     <dialog class="drawer" aria-labelledby="CartDrawerTitle">
   *       <div class="drawer__overlay" data-drawer-close></div>
   *       <div class="drawer__panel">
   *         <div class="drawer__handle" data-drawer-handle></div>
   *         <div class="drawer__header">…<button data-drawer-close>×</button></div>
   *         <div class="drawer__body">…</div>
   *         <div class="drawer__footer">…</div>
   *       </div>
   *     </dialog>
   *   </vault-drawer>
   * Open with any element: [data-drawer-open="CartDrawer"] (or element.open()). Close: [data-drawer-close], Esc, overlay.
   * Children with [data-drawer-item] stagger in on open. Events: drawer:open, drawer:close (bubble from the element).
   * ------------------------------------------------------------------ */
  class VaultDrawer extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this._bound = true;
      this.dialog = this.querySelector(':scope > dialog');
      this.panel = this.querySelector('.drawer__panel');
      this.overlay = this.querySelector('.drawer__overlay');
      if (!this.dialog || !this.panel) return;
      this.dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        this.close();
      });
      this.dialog.addEventListener('click', (e) => {
        if (e.target === this.dialog) this.close();
      });
      this.addEventListener('click', (e) => {
        const closer = e.target.closest('[data-drawer-close]');
        if (closer && this.contains(closer)) {
          e.preventDefault();
          this.close();
        }
      });
      this.bindDrag();
    }

    get isOpen() {
      return !!this.dialog?.open;
    }

    placement() {
      if (Vault.isMobile() && this.dataset.mobilePlacement === 'bottom') return 'bottom';
      return this.dataset.placement || 'right';
    }

    triggers() {
      return $$(`[data-drawer-open="${this.id}"]`);
    }

    async open(trigger) {
      if (!this.dialog || this.isOpen) return;
      this.trigger = trigger || document.activeElement;
      this.dialog.showModal();
      this.setAttribute('open', '');
      Vault.lockScroll();
      this.triggers().forEach((t) => t.setAttribute('aria-expanded', 'true'));
      const focusTarget = this.querySelector('[data-drawer-focus]');
      if (focusTarget) requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
      this.dispatchEvent(new CustomEvent('drawer:open', { bubbles: true }));
      if (!Vault.motionOK()) return;

      const p = this.placement();
      const anims = [];
      if (this.overlay) anims.push(M.animate(this.overlay, { opacity: [0, 1] }, { duration: 0.35, ease: Vault.ease.out }));
      if (p === 'center') {
        anims.push(M.animate(this.panel, { opacity: [0, 1], scale: [0.96, 1], y: [24, 0] }, { type: 'spring', stiffness: 380, damping: 32 }));
      } else if (p === 'bottom') {
        anims.push(M.animate(this.panel, { y: [this.panel.offsetHeight, 0] }, { type: 'spring', stiffness: 360, damping: 38 }));
      } else {
        const w = this.panel.offsetWidth;
        anims.push(M.animate(this.panel, { x: [p === 'left' ? -w : w, 0] }, { type: 'spring', stiffness: 360, damping: 38 }));
      }
      const items = $$('[data-drawer-item]', this.panel);
      if (items.length) {
        anims.push(M.animate(items, { opacity: [0, 1], y: [16, 0] }, { duration: 0.5, ease: Vault.ease.out, delay: M.stagger(0.04, { startDelay: 0.12 }) }));
      }
      await Promise.allSettled(anims);
      items.forEach((el) => { el.style.removeProperty('opacity'); el.style.removeProperty('transform'); });
    }

    async close() {
      if (!this.isOpen || this.closing) return;
      this.closing = true;
      if (Vault.motionOK()) {
        const p = this.placement();
        const anims = [];
        if (this.overlay) anims.push(M.animate(this.overlay, { opacity: 0 }, { duration: 0.25, ease: Vault.ease.inOut }));
        if (p === 'center') anims.push(M.animate(this.panel, { opacity: 0, scale: 0.97, y: 12 }, { duration: 0.2, ease: Vault.ease.in }));
        else if (p === 'bottom') anims.push(M.animate(this.panel, { y: this.panel.offsetHeight }, { duration: 0.3, ease: Vault.ease.inOut }));
        else anims.push(M.animate(this.panel, { x: p === 'left' ? -this.panel.offsetWidth : this.panel.offsetWidth }, { duration: 0.32, ease: Vault.ease.inOut }));
        await Promise.allSettled(anims);
      }
      this.dialog.close();
      this.removeAttribute('open');
      ['transform', 'opacity'].forEach((prop) => {
        this.panel.style.removeProperty(prop);
        this.overlay?.style.removeProperty(prop);
      });
      Vault.unlockScroll();
      this.triggers().forEach((t) => t.setAttribute('aria-expanded', 'false'));
      if (this.trigger && this.trigger.isConnected && typeof this.trigger.focus === 'function') {
        this.trigger.focus({ preventScroll: true });
      }
      this.closing = false;
      this.dispatchEvent(new CustomEvent('drawer:close', { bubbles: true }));
    }

    toggle(trigger) {
      return this.isOpen ? this.close() : this.open(trigger);
    }

    bindDrag() {
      const zones = $$('[data-drawer-handle], .drawer__header', this.panel);
      zones.forEach((zone) => {
        zone.addEventListener('pointerdown', (e) => {
          if (this.placement() !== 'bottom' || !this.isOpen) return;
          if (e.target.closest('button, a, input, select, textarea, label')) return;
          const startY = e.clientY;
          let lastY = startY;
          let lastT = performance.now();
          let velocity = 0;
          let dy = 0;
          const h = this.panel.offsetHeight;
          zone.setPointerCapture?.(e.pointerId);
          const move = (ev) => {
            const raw = ev.clientY - startY;
            dy = raw < 0 ? raw * 0.15 : raw;
            const now = performance.now();
            velocity = (ev.clientY - lastY) / Math.max(1, now - lastT);
            lastY = ev.clientY;
            lastT = now;
            this.panel.style.transform = `translateY(${dy}px)`;
            if (this.overlay) this.overlay.style.opacity = String(clamp(1 - dy / h, 0, 1));
          };
          const up = () => {
            zone.removeEventListener('pointermove', move);
            zone.removeEventListener('pointerup', up);
            zone.removeEventListener('pointercancel', up);
            if (dy > h * 0.25 || velocity > 0.6) {
              this.close();
            } else if (M) {
              M.animate(this.panel, { y: [dy, 0] }, { type: 'spring', stiffness: 420, damping: 36 });
              if (this.overlay) M.animate(this.overlay, { opacity: 1 }, { duration: 0.2 });
            } else {
              this.panel.style.removeProperty('transform');
              this.overlay?.style.removeProperty('opacity');
            }
          };
          zone.addEventListener('pointermove', move);
          zone.addEventListener('pointerup', up);
          zone.addEventListener('pointercancel', up);
        });
      });
    }
  }
  if (!customElements.get('vault-drawer')) customElements.define('vault-drawer', VaultDrawer);

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-drawer-open]');
    if (!trigger) return;
    const drawer = document.getElementById(trigger.dataset.drawerOpen);
    if (!drawer || typeof drawer.open !== 'function') return;
    e.preventDefault();
    drawer.open(trigger);
  });

  /* ------------------------------------------------------------------ *
   * <vault-carousel> — scroll-snap carousel with buttons, progress, dots, mouse drag, autoplay
   *   <vault-carousel style="--per-view-mobile:1.2;--per-view-tablet:2.5;--per-view-desktop:4" data-autoplay="0">
   *     <div class="carousel__track" data-carousel-track tabindex="0" role="region" aria-label="…">
   *       <div class="carousel__slide">…</div>
   *     </div>
   *     <div class="carousel__controls">
   *       <button class="carousel__btn" data-carousel-prev aria-label="…">‹</button>
   *       <div class="carousel__progress"><span data-carousel-progress></span></div>
   *       <button class="carousel__btn" data-carousel-next aria-label="…">›</button>
   *     </div>
   *     <div class="carousel__dots" data-carousel-dots></div>   (optional; built by JS)
   *   </vault-carousel>
   * Emits carousel:change { index } on the element.
   * ------------------------------------------------------------------ */
  class VaultCarousel extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this.track = this.querySelector('[data-carousel-track]');
      if (!this.track) return;
      this._bound = true;
      this.prevBtn = this.querySelector('[data-carousel-prev]');
      this.nextBtn = this.querySelector('[data-carousel-next]');
      this.progress = this.querySelector('[data-carousel-progress]');
      this.dotsWrap = this.querySelector('[data-carousel-dots]');
      this.index = 0;
      this.prevBtn?.addEventListener('click', () => this.go(-1));
      this.nextBtn?.addEventListener('click', () => this.go(1));
      this.track.addEventListener('scroll', Vault.rafThrottle(() => this.update()), { passive: true });
      this.ro = new ResizeObserver(Vault.rafThrottle(() => { this.buildDots(); this.update(); }));
      this.ro.observe(this.track);
      this.bindDrag();
      this.bindAutoplay();
      this.buildDots();
      this.update();
    }

    disconnectedCallback() {
      this.ro?.disconnect();
      clearInterval(this.timer);
      this.stopInView?.();
    }

    get slides() {
      return Array.from(this.track.children).filter((el) => el.getClientRects().length);
    }

    metrics() {
      const slides = this.slides;
      const gap = parseFloat(getComputedStyle(this.track).columnGap) || 0;
      const slideW = slides[0] ? slides[0].getBoundingClientRect().width + gap : this.track.clientWidth;
      const perPage = Math.max(1, Math.floor((this.track.clientWidth + gap + 2) / slideW));
      const max = Math.max(0, this.track.scrollWidth - this.track.clientWidth);
      return { slides, gap, slideW, perPage, pageW: perPage * slideW, max };
    }

    go(dir) {
      const { pageW } = this.metrics();
      const behavior = Vault.motionOK() ? 'smooth' : 'auto';
      this.track.scrollBy({ left: dir * pageW, behavior });
    }

    goTo(i) {
      const slide = this.slides[i];
      if (!slide) return;
      const pad = parseFloat(getComputedStyle(this.track).paddingLeft) || 0;
      const left = slide.offsetLeft - this.track.offsetLeft - pad;
      this.track.scrollTo({ left, behavior: Vault.motionOK() ? 'smooth' : 'auto' });
    }

    buildDots() {
      if (!this.dotsWrap) return;
      const { max, pageW } = this.metrics();
      const pages = max > 2 ? Math.round(max / pageW) + 1 : 0;
      if (pages === this.pages) return;
      this.pages = pages;
      this.dotsWrap.innerHTML = '';
      for (let i = 0; i < pages; i += 1) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'carousel__dot';
        b.setAttribute('aria-label', `${i + 1} / ${pages}`);
        b.addEventListener('click', () => this.track.scrollTo({ left: Math.min(max, i * pageW), behavior: Vault.motionOK() ? 'smooth' : 'auto' }));
        this.dotsWrap.appendChild(b);
      }
    }

    update() {
      const { max, pageW, slideW } = this.metrics();
      const left = this.track.scrollLeft;
      const p = max > 0 ? clamp(left / max, 0, 1) : 1;
      this.progress?.style.setProperty('--progress', p.toFixed(4));
      if (this.prevBtn) this.prevBtn.disabled = left <= 2;
      if (this.nextBtn) this.nextBtn.disabled = left >= max - 2;
      this.toggleAttribute('data-scrollable', max > 2);
      if (this.dotsWrap && this.pages) {
        const current = left >= max - 2 ? this.pages - 1 : Math.round(left / pageW);
        Array.from(this.dotsWrap.children).forEach((d, i) => d.setAttribute('aria-current', String(i === current)));
      }
      const index = Math.round(left / Math.max(1, slideW));
      if (index !== this.index) {
        this.index = index;
        this.dispatchEvent(new CustomEvent('carousel:change', { detail: { index } }));
      }
    }

    bindDrag() {
      let down = false;
      let moved = false;
      let startX = 0;
      let startLeft = 0;
      let lastX = 0;
      let lastT = 0;
      let v = 0;
      this.track.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        down = true;
        moved = false;
        startX = lastX = e.clientX;
        lastT = performance.now();
        startLeft = this.track.scrollLeft;
      });
      window.addEventListener('pointermove', (e) => {
        if (!down) return;
        const dx = e.clientX - startX;
        if (!moved && Math.abs(dx) > 6) {
          moved = true;
          this.track.classList.add('is-dragging');
        }
        if (!moved) return;
        const now = performance.now();
        v = (e.clientX - lastX) / Math.max(1, now - lastT);
        lastX = e.clientX;
        lastT = now;
        this.track.scrollLeft = startLeft - dx;
      });
      window.addEventListener('pointerup', () => {
        if (!down) return;
        down = false;
        if (!moved) return;
        const { slideW, max } = this.metrics();
        const projected = this.track.scrollLeft - v * 220;
        const target = clamp(Math.round(projected / slideW) * slideW, 0, max);
        this.track.scrollTo({ left: target, behavior: 'smooth' });
        setTimeout(() => this.track.classList.remove('is-dragging'), 450);
        const block = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
        this.track.addEventListener('click', block, { capture: true, once: true });
        setTimeout(() => this.track.removeEventListener('click', block, { capture: true }), 50);
      });
    }

    bindAutoplay() {
      const seconds = parseFloat(this.dataset.autoplay);
      if (!seconds || !Vault.motionOK()) return;
      let paused = false;
      const pause = () => { paused = true; };
      const resume = () => { paused = false; };
      this.addEventListener('pointerenter', pause);
      this.addEventListener('pointerleave', resume);
      this.addEventListener('focusin', pause);
      this.addEventListener('focusout', resume);
      this.track.addEventListener('pointerdown', pause, { passive: true });
      this.stopInView = M.inView(this, () => {
        this.timer = setInterval(() => {
          if (paused || document.hidden) return;
          const { max } = this.metrics();
          if (this.track.scrollLeft >= max - 2) this.track.scrollTo({ left: 0, behavior: 'smooth' });
          else this.go(1);
        }, seconds * 1000);
        return () => clearInterval(this.timer);
      });
    }
  }
  if (!customElements.get('vault-carousel')) customElements.define('vault-carousel', VaultCarousel);

  /* ------------------------------------------------------------------ *
   * <vault-marquee> — infinite ticker that speeds up with scroll velocity
   *   <vault-marquee data-speed="40" data-direction="left|right" data-scroll-velocity="true" data-pause-hover data-fade>
   *     <div class="marquee__track"><div class="marquee__group">…items…</div></div>
   *   </vault-marquee>
   * Without motion the group simply scrolls horizontally.
   * ------------------------------------------------------------------ */
  class VaultMarquee extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this.track = this.querySelector('.marquee__track');
      this.group = this.querySelector('.marquee__group');
      if (!this.track || !this.group || !Vault.motionOK()) return;
      this._bound = true;
      this.speed = parseFloat(this.dataset.speed || 40);
      this.dir = this.dataset.direction === 'right' ? 1 : -1;
      this.reactive = this.dataset.scrollVelocity !== 'false';
      this.x = 0;
      this.boost = 0;
      this.factor = 1;
      this.paused = false;
      this.last = 0;
      this.loop = this.loop.bind(this);
      this.fill();
      this.ro = new ResizeObserver(Vault.debounce(() => this.fill(), 150));
      this.ro.observe(this);
      if (this.hasAttribute('data-pause-hover')) {
        this.addEventListener('pointerenter', () => { this.paused = true; });
        this.addEventListener('pointerleave', () => { this.paused = false; });
      }
      this.stopInView = M.inView(this, () => {
        this.running = true;
        this.last = 0;
        this.raf = requestAnimationFrame(this.loop);
        return () => {
          this.running = false;
          cancelAnimationFrame(this.raf);
        };
      }, { margin: '120px' });
    }

    disconnectedCallback() {
      this.ro?.disconnect();
      this.stopInView?.();
      cancelAnimationFrame(this.raf);
    }

    fill() {
      $$('.marquee__group[data-clone]', this.track).forEach((c) => c.remove());
      const gw = this.group.getBoundingClientRect().width;
      if (!gw) return;
      this.gw = gw;
      const needed = Math.max(1, Math.ceil((this.clientWidth * 2) / gw));
      for (let i = 0; i < needed; i += 1) {
        const clone = this.group.cloneNode(true);
        clone.setAttribute('data-clone', '');
        clone.setAttribute('aria-hidden', 'true');
        $$('a, button, input, [tabindex]', clone).forEach((el) => el.setAttribute('tabindex', '-1'));
        this.track.appendChild(clone);
      }
    }

    loop(t) {
      if (!this.running) return;
      const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 0;
      this.last = t;
      if (this.reactive) {
        const target = clamp(Math.abs(Vault.scrollVelocity) / 350, 0, 7);
        this.boost = lerp(this.boost, target, 0.08);
      }
      this.factor = lerp(this.factor, this.paused ? 0 : 1, 0.08);
      const dir = this.reactive && this.dataset.flip === 'true' ? this.dir * Vault.scrollDirection : this.dir;
      this.x += dir * this.speed * (1 + this.boost) * this.factor * dt;
      if (this.gw) {
        if (this.x <= -this.gw) this.x += this.gw;
        if (this.x > 0) this.x -= this.gw;
      }
      this.track.style.transform = `translate3d(${this.x.toFixed(2)}px, 0, 0)`;
      this.raf = requestAnimationFrame(this.loop);
    }
  }
  if (!customElements.get('vault-marquee')) customElements.define('vault-marquee', VaultMarquee);

  /* ------------------------------------------------------------------ *
   * <quantity-input class="qty"> <button data-qty="minus"> <input type="number"> <button data-qty="plus">
   * Fires a bubbling "change" on the input when a button changes it.
   * ------------------------------------------------------------------ */
  class QuantityInput extends HTMLElement {
    connectedCallback() {
      if (this._bound) return;
      this.input = this.querySelector('input');
      if (!this.input) return;
      this._bound = true;
      this.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-qty]');
        if (!btn) return;
        e.preventDefault();
        const step = Number(this.input.step) || 1;
        const min = this.input.min !== '' ? Number(this.input.min) : 0;
        const max = this.input.max !== '' ? Number(this.input.max) : Infinity;
        const prev = Number(this.input.value) || 0;
        const next = clamp(btn.dataset.qty === 'plus' ? prev + step : prev - step, min, max);
        if (next !== prev) {
          this.input.value = next;
          this.input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        this.updateButtons();
      });
      this.input.addEventListener('change', () => this.updateButtons());
      this.input.addEventListener('input', () => this.updateButtons());
      this.updateButtons();
    }

    updateButtons() {
      const v = Number(this.input.value) || 0;
      const min = this.input.min !== '' ? Number(this.input.min) : 0;
      const max = this.input.max !== '' ? Number(this.input.max) : Infinity;
      const minus = this.querySelector('[data-qty="minus"]');
      const plus = this.querySelector('[data-qty="plus"]');
      if (minus) minus.disabled = v <= min;
      if (plus) plus.disabled = v >= max;
    }
  }
  if (!customElements.get('quantity-input')) customElements.define('quantity-input', QuantityInput);

  /* ------------------------------------------------------------------ *
   * Cart — AJAX API + Section Rendering
   * Any element [data-cart-swap="<section-id>"] (optionally with data-cart-swap-key="x")
   * is refreshed from the matching element in that section's rendered HTML after cart changes.
   * Components that render cart sections call Vault.cart.register('<section-id>').
   * Event: vault:cart:updated { cart?, item?, sections, source: 'add'|'change'|'update'|'refresh' }
   * ------------------------------------------------------------------ */
  const cartSections = new Set(['cart-icon-bubble']);

  Vault.applySections = (sections) => {
    if (!sections) return;
    Object.entries(sections).forEach(([id, markup]) => {
      if (!markup) return;
      const doc = Vault.parseHTML(markup);
      $$(`[data-cart-swap="${id}"]`).forEach((target) => {
        const key = target.dataset.cartSwapKey;
        const selector = key ? `[data-cart-swap="${id}"][data-cart-swap-key="${key}"]` : `[data-cart-swap="${id}"]`;
        const source = doc.querySelector(selector);
        if (!source) return;
        target.innerHTML = source.innerHTML;
        Vault.init(target);
      });
    });
  };

  const cartRequest = async (url, body) => {
    const ids = Array.from(cartSections).slice(0, 5);
    const init = { method: 'POST', headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } };
    if (body instanceof FormData) {
      if (ids.length) {
        body.set('sections', ids.join(','));
        body.set('sections_url', window.location.pathname);
      }
      init.body = body;
    } else {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(ids.length ? { ...body, sections: ids.join(','), sections_url: window.location.pathname } : body);
    }
    const res = await fetch(url, init);
    let data = {};
    try { data = await res.json(); } catch (_) { /* empty */ }
    if (!res.ok || data.status) {
      const err = new Error(data.description || data.message || strings.cartError || 'Something went wrong');
      err.data = data;
      throw err;
    }
    return data;
  };

  Vault.cart = {
    sections: cartSections,
    register(id) { if (id) cartSections.add(id); },
    unregister(id) { cartSections.delete(id); },

    async add(input, { source = null, open = true } = {}) {
      let body = input;
      if (!(input instanceof FormData)) body = input.items ? input : { items: [input] };
      const data = await cartRequest(`${routes.cart_add || '/cart/add'}.js`, body);
      if (settings.cartType === 'page' && open) {
        window.location.href = routes.cart || '/cart';
        return data;
      }
      if (source && settings.flyToCart !== false) Vault.flyToCart(source);
      Vault.applySections(data.sections);
      Vault.emit('vault:cart:updated', { item: data, sections: data.sections, source: 'add' });
      const drawer = document.getElementById('CartDrawer');
      if (open && drawer && typeof drawer.open === 'function') drawer.open();
      else if (open) Vault.toast(strings.added || 'Added to cart');
      return data;
    },

    async change({ id, line, quantity }) {
      const body = { quantity };
      if (line) body.line = line;
      else body.id = String(id);
      const data = await cartRequest(`${routes.cart_change || '/cart/change'}.js`, body);
      Vault.applySections(data.sections);
      Vault.emit('vault:cart:updated', { cart: data, sections: data.sections, source: 'change' });
      return data;
    },

    async update(payload) {
      const data = await cartRequest(`${routes.cart_update || '/cart/update'}.js`, payload);
      Vault.applySections(data.sections);
      Vault.emit('vault:cart:updated', { cart: data, sections: data.sections, source: 'update' });
      return data;
    },

    async get() {
      const res = await fetch(`${routes.cart || '/cart'}.js`, { headers: { Accept: 'application/json' } });
      return res.json();
    },

    async refresh() {
      const ids = Array.from(cartSections).slice(0, 5);
      if (!ids.length) return null;
      const sections = await Vault.fetchSections(ids, window.location.pathname);
      Vault.applySections(sections);
      Vault.emit('vault:cart:updated', { sections, source: 'refresh' });
      return sections;
    },
  };

  // Progressive AJAX add-to-cart for any <form data-cart-form action="/cart/add">.
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-cart-form]');
    if (!form || settings.cartType === 'page') return;
    e.preventDefault();
    const btn = e.submitter || form.querySelector('[type="submit"]');
    btn?.classList.add('is-loading');
    btn?.setAttribute('aria-busy', 'true');
    try {
      const scope = form.closest('[data-product-card], [data-product]') || form;
      const source = scope.querySelector('[data-fly-source] img') || scope.querySelector('img');
      await Vault.cart.add(new FormData(form), { source });
      form.dispatchEvent(new CustomEvent('cart:added', { bubbles: true }));
    } catch (err) {
      Vault.toast(err.message || strings.cartError, { type: 'error' });
      form.dispatchEvent(new CustomEvent('cart:error', { bubbles: true, detail: { message: err.message } }));
    } finally {
      btn?.classList.remove('is-loading');
      btn?.removeAttribute('aria-busy');
    }
  });

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) Vault.cart.refresh().catch(() => {});
  });

  /* Fly-to-cart: clones an image and arcs it into the visible [data-cart-icon]. */
  Vault.flyToCart = (sourceEl) => {
    if (!Vault.motionOK() || !sourceEl) return;
    const img = sourceEl.tagName === 'IMG' ? sourceEl : sourceEl.querySelector?.('img');
    const target = $$('[data-cart-icon]').find((el) => el.getClientRects().length && inViewport(el));
    if (!img || !target) return;
    const from = img.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    if (!from.width) return;
    const clone = document.createElement('img');
    clone.src = img.currentSrc || img.src;
    clone.alt = '';
    clone.className = 'fly-clone';
    Object.assign(clone.style, {
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
    });
    document.body.appendChild(clone);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = Math.max(0.08, Math.min(to.width / from.width, 0.25));
    const anim = M.animate(
      clone,
      { x: [0, dx], y: [0, dy], scale: [1, scale], rotate: [0, -14], opacity: [1, 1, 0.3] },
      { duration: 0.85, ease: Vault.ease.inOut, y: { duration: 0.85, ease: [0.5, -0.55, 0.75, 1] } },
    );
    Promise.resolve(anim).finally(() => {
      clone.remove();
      M.animate(target, { scale: [1, 1.28, 1] }, { duration: 0.5, ease: Vault.ease.back });
    });
  };

  /* ------------------------------------------------------------------ *
   * Global effects: header height var, dock flag, scroll progress, cursor glow, spotlight
   * ------------------------------------------------------------------ */
  const watchHeader = () => {
    const header = $('[data-header]');
    if (!header) return;
    const set = () => {
      const h = Math.round(header.getBoundingClientRect().height);
      if (h) html.style.setProperty('--header-height', `${h}px`);
    };
    set();
    new ResizeObserver(set).observe(header);
  };

  const setupDock = () => {
    html.classList.toggle('has-dock', !!$('[data-dock]'));
  };

  const setupScrollProgress = () => {
    const bar = $('[data-scroll-progress]');
    if (!bar || !Vault.motionOK()) return;
    M.scroll(M.animate(bar, { scaleX: [0, 1] }, { ease: 'linear' }));
  };

  const setupCursorGlow = () => {
    const glow = $('[data-cursor-glow]');
    if (!glow || !Vault.motionOK() || !Vault.canHover()) return;
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx;
    let cy = ty;
    let running = false;
    const loop = () => {
      cx = lerp(cx, tx, 0.12);
      cy = lerp(cy, ty, 0.12);
      glow.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
      if (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.4) requestAnimationFrame(loop);
      else running = false;
    };
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX;
      ty = e.clientY;
      glow.classList.add('is-active');
      if (!running) {
        running = true;
        requestAnimationFrame(loop);
      }
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => glow.classList.remove('is-active'));
  };

  const setupSpotlight = () => {
    if (!Vault.canHover()) return;
    document.addEventListener('pointermove', Vault.rafThrottle((e) => {
      const el = e.target && e.target.closest ? e.target.closest('[data-spotlight]') : null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--spot-x', `${(e.clientX - r.left).toFixed(0)}px`);
      el.style.setProperty('--spot-y', `${(e.clientY - r.top).toFixed(0)}px`);
    }), { passive: true });
  };

  /* ------------------------------------------------------------------ *
   * Cross-document View Transitions: morph the clicked product card image into the PDP image.
   * Product cards: [data-product-card][data-product-url] containing [data-vt-media].
   * PDP: [data-vt-media="pdp"] carries the name via CSS.
   * ------------------------------------------------------------------ */
  const productHandle = (url) => {
    try {
      const m = new URL(url, window.location.origin).pathname.match(/\/products\/([^/?#]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch (_) {
      return null;
    }
  };
  window.addEventListener('pageswap', (e) => {
    if (!e.viewTransition || !e.activation || !e.activation.entry) return;
    const handle = productHandle(e.activation.entry.url);
    if (!handle || productHandle(window.location.href)) return;
    const card = $$('[data-product-card][data-product-url]')
      .find((c) => productHandle(c.dataset.productUrl) === handle && inViewport(c));
    const media = card && card.querySelector('[data-vt-media]');
    if (!media) return;
    media.style.viewTransitionName = 'vt-product';
    e.viewTransition.finished.finally(() => { media.style.viewTransitionName = ''; });
  });

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  const boot = () => {
    watchHeader();
    setupDock();
    setupScrollProgress();
    setupCursorGlow();
    setupSpotlight();
    Vault.init(document);

    const mo = new MutationObserver((records) => {
      const roots = new Set();
      records.forEach((r) => r.addedNodes.forEach((n) => { if (n.nodeType === 1) roots.add(n); }));
      if (!roots.size) return;
      requestAnimationFrame(() => roots.forEach((n) => { if (n.isConnected) Vault.init(n); }));
    });
    mo.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('shopify:section:load', (e) => {
      Vault.init(e.target);
      setupDock();
    });

    Vault.ready = true;
    html.classList.add('vault-ready');
    Vault.emit('vault:ready');
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
