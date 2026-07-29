/* ==========================================================================
   Mahasagar storefront runtime: cart, order API and the motion layer.
   No build step and no third-party libraries — every animation is transform/
   opacity only, and everything degrades to a static page if JS is unavailable.
   ========================================================================== */
(function () {
  'use strict';

  /* -------------------------------------------------- config */
  // Online ordering only switches on once a reachable backend is configured:
  // set window.MAHASAGAR_API (e.g. in a <script> before this file) to its /api/v1
  // base. Until then the storefront stays fully usable and the cart is checked out
  // by email instead — a visitor never meets a broken form.
  var API = (window.MAHASAGAR_API || '').replace(/\/$/, '');
  var ONLINE = API.length > 0;
  var ORDER_EMAIL = window.MAHASAGAR_EMAIL || 'info@mahasagar.com';
  var CART_KEY = 'mahasagar.cart.v1';
  var ORDERS_KEY = 'mahasagar.orders.v1';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var rupee = function (n) {
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  /* -------------------------------------------------- storage helpers */
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* private mode — the cart simply will not survive a reload */
    }
  }

  /* -------------------------------------------------- cart */
  var Cart = {
    items: function () {
      var items = read(CART_KEY, []);
      return Array.isArray(items) ? items : [];
    },
    save: function (items) {
      write(CART_KEY, items);
      Cart.paint();
      window.dispatchEvent(new CustomEvent('cart:change'));
    },
    count: function () {
      return Cart.items().reduce(function (n, i) { return n + i.qty; }, 0);
    },
    subtotal: function () {
      return Cart.items().reduce(function (n, i) { return n + i.price * i.qty; }, 0);
    },
    add: function (item, qty) {
      qty = qty || 1;
      var items = Cart.items();
      var found = null;
      for (var i = 0; i < items.length; i++) {
        if (items[i].variantId === item.variantId) { found = items[i]; break; }
      }
      if (found) {
        found.qty = Math.min(999, found.qty + qty);
      } else {
        items.push({
          variantId: item.variantId, slug: item.slug, name: item.name,
          variantName: item.variantName, price: item.price, mrp: item.mrp || null,
          image: item.image, qty: Math.min(999, qty)
        });
      }
      Cart.save(items);
      toast('Added to cart — ' + item.name);
    },
    setQty: function (variantId, qty) {
      var items = Cart.items().map(function (i) {
        if (i.variantId === variantId) i.qty = Math.max(0, Math.min(999, qty));
        return i;
      }).filter(function (i) { return i.qty > 0; });
      Cart.save(items);
    },
    remove: function (variantId) {
      Cart.save(Cart.items().filter(function (i) { return i.variantId !== variantId; }));
    },
    clear: function () { Cart.save([]); },
    paint: function () {
      var n = Cart.count();
      document.querySelectorAll('[data-cart-count]').forEach(function (el) {
        el.textContent = n > 99 ? '99+' : String(n);
        el.classList.toggle('on', n > 0);
      });
    }
  };

  /* -------------------------------------------------- orders */
  var Orders = {
    all: function () {
      var o = read(ORDERS_KEY, []);
      return Array.isArray(o) ? o : [];
    },
    remember: function (receipt) {
      var all = Orders.all();
      all.unshift({ orderNumber: receipt.orderNumber, total: receipt.total, createdAt: receipt.createdAt });
      write(ORDERS_KEY, all.slice(0, 25));
    },
    place: function (payload) {
      return fetch(API + '/website/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(readJson);
    },
    track: function (orderNumber) {
      return fetch(API + '/website/orders/' + encodeURIComponent(orderNumber)).then(readJson);
    }
  };

  function readJson(res) {
    return res.text().then(function (text) {
      var body = null;
      try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
      if (!res.ok) {
        var msg = (body && (body.message || body.error)) || 'Something went wrong. Please try again.';
        throw new Error(Array.isArray(msg) ? msg.join(', ') : msg);
      }
      return body;
    });
  }

  /* -------------------------------------------------- toast */
  function toast(message, isError) {
    var wrap = document.querySelector('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      wrap.setAttribute('role', 'status');
      wrap.setAttribute('aria-live', 'polite');
      document.body.appendChild(wrap);
    }
    var el = document.createElement('div');
    el.className = 'toast' + (isError ? ' err' : '');
    el.innerHTML = (isError
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
    ) + '<span></span>';
    el.querySelector('span').textContent = message;
    wrap.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      setTimeout(function () { el.remove(); }, 320);
    }, 2600);
  }

  /* -------------------------------------------------- motion layer */
  function initReveal() {
    var targets = document.querySelectorAll('.rv');
    if (!targets.length) return;
    if (reduced || !('IntersectionObserver' in window)) {
      targets.forEach(function (t) { t.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        // stagger siblings so a grid arrives as a wave, not all at once
        var delay = Number(el.getAttribute('data-delay') || 0);
        setTimeout(function () { el.classList.add('in'); }, delay);
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    targets.forEach(function (t) { io.observe(t); });
  }

  /** Hero wave layers move at different rates — the depth cue. */
  function initParallax() {
    var layers = document.querySelectorAll('[data-parallax]');
    if (!layers.length || reduced) return;
    var ticking = false;
    function frame() {
      var y = window.scrollY;
      layers.forEach(function (el) {
        var rate = Number(el.getAttribute('data-parallax')) || 0.1;
        el.style.transform = 'translate3d(0,' + (y * rate).toFixed(2) + 'px,0)';
      });
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(frame); }
    }, { passive: true });
    frame();
  }

  function initHeader() {
    var header = document.querySelector('header');
    if (!header) return;
    var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 10); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /** Hero brand mark: entrance, gentle float and a one-off sheen. The artwork is a
      full-colour illustration, so nothing recolours or reshapes it — only the plate
      it sits on moves. */
  function initLogo() {
    var rk = document.querySelector('.rk');
    if (rk) requestAnimationFrame(function () { rk.classList.add('in'); });

    // The masked wordmark (if a page uses it) washes with water once, then drains,
    // so the mark is never left permanently recoloured.
    var word = document.querySelector('.logo-anim');
    if (!word) return;
    if (reduced) { word.style.setProperty('--fill-top', '100%'); return; }
    requestAnimationFrame(function () {
      word.classList.add('play');
      setTimeout(function () { word.style.setProperty('--fill-top', '-10%'); }, 300);
      setTimeout(function () { word.style.setProperty('--fill-top', '100%'); }, 2400);
    });
  }

  function initBubbles() {
    var host = document.querySelector('.bubbles');
    if (!host || reduced) return;
    var n = window.innerWidth < 600 ? 9 : 16;
    for (var i = 0; i < n; i++) {
      var b = document.createElement('span');
      var size = 6 + Math.random() * 26;
      b.className = 'bubble';
      b.style.width = b.style.height = size.toFixed(0) + 'px';
      b.style.left = (Math.random() * 100).toFixed(2) + '%';
      b.style.setProperty('--dur', (13 + Math.random() * 14).toFixed(1) + 's');
      b.style.setProperty('--del', (-Math.random() * 20).toFixed(1) + 's');
      b.style.setProperty('--drift', ((Math.random() - 0.5) * 90).toFixed(0) + 'px');
      host.appendChild(b);
    }
  }

  /** Count-up for the stat band. */
  function initCounters() {
    var els = document.querySelectorAll('[data-count]');
    if (!els.length) return;
    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.textContent = el.getAttribute('data-count'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);
        var target = Number(el.getAttribute('data-count'));
        var suffix = el.getAttribute('data-suffix') || '';
        var started = null;
        var step = function (ts) {
          if (started === null) started = ts;
          var p = Math.min(1, (ts - started) / 1400);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased).toLocaleString('en-IN') + suffix;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* -------------------------------------------------- add-to-cart wiring */
  function initAddButtons() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-add]');
      if (!btn) return;
      e.preventDefault();
      var data;
      try { data = JSON.parse(btn.getAttribute('data-add')); } catch (err) { return; }
      var qtyEl = document.querySelector('[data-qty-value]');
      var qty = btn.hasAttribute('data-use-qty') && qtyEl ? Number(qtyEl.textContent) : 1;
      Cart.add(data, qty);
    });
  }

  /** Cart → a ready-to-send order email, used while online ordering is off. */
  function mailtoOrder() {
    var items = Cart.items();
    var lines = items.map(function (i) {
      return '- ' + i.name + (i.variantName ? ' (' + i.variantName + ')' : '') +
             '  x' + i.qty + '   Rs ' + (i.price * i.qty);
    });
    var body = [
      'Hello Mahasagar,', '',
      'I would like to order:', '',
      lines.join('\n'), '',
      'Items total: Rs ' + Cart.subtotal(), '',
      'My details', 'Name: ', 'Mobile: ', 'Address: ', 'City / Pincode: ', '',
      'Thank you.'
    ].join('\n');
    return 'mailto:' + ORDER_EMAIL +
           '?subject=' + encodeURIComponent('New order from mahasagar.com') +
           '&body=' + encodeURIComponent(body);
  }

  /* -------------------------------------------------- expose + boot */
  window.Mahasagar = {
    API: API, online: ONLINE, email: ORDER_EMAIL, mailtoOrder: mailtoOrder,
    Cart: Cart, Orders: Orders, toast: toast, rupee: rupee, reduced: reduced
  };

  function boot() {
    Cart.paint();
    initHeader();
    initLogo();
    initBubbles();
    initReveal();
    initParallax();
    initCounters();
    initAddButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
