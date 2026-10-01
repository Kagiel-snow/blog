'use strict';
(() => {
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
    });
  }
  document.querySelectorAll('.film-card video').forEach(video => {
    video.addEventListener('play', () => {
      document.querySelectorAll('.film-card video').forEach(other => { if (other !== video) other.pause(); });
    });
  });
})();
