'use strict';
(() => {
  const inline = document.querySelector('[data-music-inline-player]');
  if (inline && !window.siteMusicPopup) {
    let opener;
    const open = () => inline.getAttribute('data-music-popup-open') === 'true';
    function setOpen(value, restoreFocus = false) {
      inline.setAttribute('data-music-popup-open', String(value));
      if (value) inline.setAttribute('role', 'dialog'); else inline.removeAttribute('role');
      document.querySelectorAll('[data-music-return]').forEach(button => button.setAttribute('aria-expanded', String(value)));
      document.body.classList.toggle('music-open', value);
      window.SiteMusicLayout?.create({ window, document }).sync();
      if (value) {
        document.dispatchEvent(new Event('site:music-popup-open'));
        inline.querySelector('[data-music-popup-close]')?.focus({ preventScroll: true });
      } else if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
    }
    window.siteMusicPopup = { open: () => { opener = document.querySelector('[data-music-return]'); setOpen(true); }, close: () => setOpen(false, true) };
    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-music-return]');
      if (trigger) { event.preventDefault(); opener = trigger; setOpen(!open(), true); return; }
      if (event.target.closest('[data-music-popup-close]')) { setOpen(false, true); return; }
      if (open() && !event.composedPath().includes(inline)) setOpen(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && open()) { event.preventDefault(); setOpen(false, true); }
    });
  }
  const dock = document.querySelector('.music-dock');
  if (dock && !inline) {
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
