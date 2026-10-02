'use strict';
(() => {
  let cleanup = () => {};
  const init = () => {
    cleanup();
    const controller = new AbortController();
    const options = { signal: controller.signal };
    cleanup = () => controller.abort();
    const comments = document.querySelector('.collection-comments');
    if (comments) {
      const openComments = () => { if (location.hash === '#post-comment') comments.open = true; };
      openComments();
      window.addEventListener('hashchange', openComments, options);
      document.addEventListener('click', event => {
        const anchor = event.target.closest('a[href]');
        if (!anchor) return;
        const target = new URL(anchor.href, location.href);
        if (target.origin === location.origin && target.pathname === location.pathname && target.hash === '#post-comment') comments.open = true;
      }, options);
    }
    const filters = document.querySelector('.gallery-filters');
    if (filters) {
      filters.hidden = false;
      const cards = [...document.querySelectorAll('[data-gallery-group]')];
      filters.addEventListener('click', event => {
        const button = event.target.closest('[data-gallery-filter]');
        if (!button) return;
        const selected = button.dataset.galleryFilter;
        filters.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        cards.forEach(card => { card.hidden = selected !== 'all' && card.dataset.galleryGroup !== selected; });
      }, options);
    }
    document.querySelectorAll('.film-card video').forEach(video => {
      video.addEventListener('play', () => {
        document.querySelectorAll('.film-card video').forEach(other => { if (other !== video) other.pause(); });
      }, options);
    });
  };
  init();
  document.addEventListener('pjax:complete', init);
})();
