'use strict';
(() => {
  const dock = document.querySelector('.music-dock');
  if (dock) {
    const summary = dock.querySelector('summary');
    dock.addEventListener('toggle', () => document.body.classList.toggle('music-open', dock.open));
    dock.querySelector('.music-close').addEventListener('click', () => { dock.open = false; summary.focus(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && dock.open) { dock.open = false; summary.focus(); }
    });
    // APlayer replaces the clicked SVG when play/pause changes. The event's
    // original path still identifies an inside click after that node detaches.
    document.addEventListener('click', event => { if (dock.open && !event.composedPath().includes(dock) && !event.target.closest('[data-track-id]')) dock.open = false; });
  }
})();
