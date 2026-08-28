/* ============================================================
 * VIVA Eventos · Captação de operadores
 * Header, menu mobile, reveal on scroll, FAQ e links de contato.
 * As constantes vêm de config.js.
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- Header com fundo ao rolar ---------- */
  var header = document.getElementById('siteHeader');
  function onScroll() {
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 12);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Menu mobile ---------- */
  var toggle = document.getElementById('navToggle');
  var mobile = document.getElementById('mobileNav');

  function closeMenu() {
    if (!toggle || !mobile) return;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menu');
    mobile.hidden = true;
  }

  if (toggle && mobile) {
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      toggle.setAttribute('aria-label', open ? 'Abrir menu' : 'Fechar menu');
      mobile.hidden = open;
    });

    Array.prototype.forEach.call(mobile.querySelectorAll('a'), function (a) {
      a.addEventListener('click', closeMenu);
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 880) closeMenu();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  }

  /* ---------- Reveal on scroll ---------- */
  var alvos = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(alvos, function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    Array.prototype.forEach.call(alvos, function (el, i) {
      el.style.transitionDelay = (Math.min(i % 4, 3) * 70) + 'ms';
      io.observe(el);
    });
  }

  /* ---------- FAQ (accordion) ---------- */
  var faq = document.getElementById('faqList');
  if (faq) {
    Array.prototype.forEach.call(faq.querySelectorAll('.faq-q'), function (btn) {
      var item = btn.parentElement;
      btn.setAttribute('aria-expanded', 'false');

      btn.addEventListener('click', function () {
        var abrindo = !item.classList.contains('open');

        Array.prototype.forEach.call(faq.querySelectorAll('.faq-item'), function (other) {
          other.classList.remove('open');
          var q = other.querySelector('.faq-q');
          if (q) q.setAttribute('aria-expanded', 'false');
        });

        if (abrindo) {
          item.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  /* ---------- Links de contato e redes ---------- */
  function setHref(id, url) {
    var el = document.getElementById(id);
    if (el && url) el.href = url;
  }

  var msg = typeof WHATS_MSG !== 'undefined'
    ? WHATS_MSG
    : 'Oi! Vim pela página de operadores da VIVA.';
  var waLink = 'https://wa.me/' + (typeof WHATS !== 'undefined' ? WHATS : '') +
    '?text=' + encodeURIComponent(msg);

  setHref('waFloat', waLink);
  setHref('ctaWhats', waLink);

  /* ---------- Contador de praças abertas ---------- */
  var pracas = typeof PRACAS_ABERTAS !== 'undefined' ? PRACAS_ABERTAS : 0;
  var elNum = document.getElementById('numPracas');

  if (pracas > 0) {
    if (elNum) elNum.textContent = String(pracas);
  } else {
    var cardPracas = elNum ? elNum.closest('.num-card') : null;
    if (cardPracas) cardPracas.remove();
  }

  /* ---------- Ano no rodapé ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
