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
  const toggle = document.querySelector('.mascot-toggle');
  if (!toggle) return;
  let hidden = false;
  try { hidden = localStorage.getItem('kagiel:mascot-hidden') === 'true'; } catch { /* Storage can be disabled. */ }
  const update = () => {
    document.body.classList.toggle('mascot-hidden', hidden);
    toggle.setAttribute('aria-pressed', String(hidden));
    const label = hidden ? toggle.dataset.show : toggle.dataset.hide;
    toggle.querySelector('span').textContent = label;
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  };
  update();
  document.addEventListener('pjax:complete', update);
  toggle.addEventListener('click', () => {
    hidden = !hidden; update();
    try { localStorage.setItem('kagiel:mascot-hidden', String(hidden)); } catch { /* Keep the session preference. */ }
  });
  // Live2D loads asynchronously. Only offer its control when the widget exists.
  const reveal = () => {
    if (!document.getElementById('live2d-widget')) return false;
    toggle.hidden = false; return true;
  };
  if (!reveal()) {
    const observer = new MutationObserver(() => { if (reveal()) observer.disconnect(); });
    observer.observe(document.body, { childList: true });
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  }
})();
