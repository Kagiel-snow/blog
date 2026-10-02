'use strict';
(() => {
  const metadata = 'meta[name="description"], meta[name="keywords"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"], link[hreflang], script[type="application/ld+json"]';
  function apply() {
    const page = window.sitePage;
    if (!page || !document.body) return;
    document.documentElement.lang = page.lang;
    for (const name of ['data-site-language', 'data-page-kind', 'data-section']) document.body.removeAttribute(name);
    for (const [name, value] of Object.entries(page.body)) document.body.setAttribute(name, value);
    document.head.querySelectorAll(metadata).forEach(el => el.remove());
    document.head.insertAdjacentHTML('beforeend', page.metadata.join(''));
    const setText = (selector, text) => { const el = document.querySelector(selector); if (el) el.textContent = text; };
    setText('.music-dock > summary span', page.appearance.music);
    setText('.music-panel-heading > span', page.appearance.player);
    document.querySelector('.music-close')?.setAttribute('aria-label', page.appearance.close);
    const mascot = document.querySelector('.mascot-toggle');
    if (mascot) { mascot.dataset.show = page.appearance.showMascot; mascot.dataset.hide = page.appearance.hideMascot; }
    setText('.search-dialog-title', page.search.title);
    document.querySelector('.local-search-input input')?.setAttribute('placeholder', page.search.placeholder || '');
  }
  window.siteNavigation = { apply };
  apply();
  document.addEventListener('pjax:send', () => {
    document.querySelectorAll('video').forEach(video => video.pause());
    // A replaced mobile menu must not leave the document locked against scrolling.
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  });
  document.addEventListener('pjax:complete', apply);
})();
