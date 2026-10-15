'use strict';
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteMusicLayout = api;
})(typeof globalThis === 'object' ? globalThis : this, function (root) {
  const instances = new WeakMap(), noop = Object.freeze({ sync() {} });
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const pixels = value => Math.round(finite(value) * 1000) / 1000 + 'px';

  function create(options = {}) {
    const win = options.window || root, doc = options.document || win.document;
    if (!doc || typeof doc.querySelector !== 'function') return noop;
    if (instances.has(doc)) return instances.get(doc);
    const clock = options.clock || win;
    let shell, slot, originalHeight = '', assignedHeight, scheduled = false;
    let resizeObserver, mutationObserver;
    const observed = new WeakSet();
    const requestFrame = typeof clock.requestAnimationFrame === 'function'
      ? callback => clock.requestAnimationFrame(callback)
      : typeof clock.setTimeout === 'function' ? callback => clock.setTimeout(callback, 16) : undefined;

    function style(item, name, value) {
      if (item?.style && item.style[name] !== value) item.style[name] = value;
    }
    function observe(item) {
      if (item && typeof item === 'object' && resizeObserver && !observed.has(item)) {
        resizeObserver.observe(item); observed.add(item);
      }
    }
    function releaseSlot() {
      if (!slot) return;
      // Restore only a reservation made by this instance, never another owner.
      if (slot.style?.height === assignedHeight) style(slot, 'height', originalHeight);
      if (resizeObserver && slot !== shell && slot !== doc.documentElement) {
        resizeObserver.unobserve?.(slot); observed.delete(slot);
      }
      slot = undefined; assignedHeight = undefined; originalHeight = '';
    }
    function layout() {
      const currentShell = doc.querySelector('[data-music-inline-player]');
      if (!currentShell?.style || typeof currentShell.getBoundingClientRect !== 'function') return;
      shell = currentShell; observe(shell); observe(doc.documentElement);
      const currentSlot = doc.querySelector('[data-music-player-slot]');
      if (currentSlot !== slot) {
        releaseSlot();
        if (currentSlot?.style && typeof currentSlot.getBoundingClientRect === 'function') {
          slot = currentSlot; originalHeight = slot.style.height || ''; observe(slot);
        }
      }
      const popup = shell.getAttribute?.('data-music-popup-open') === 'true';
      if (popup) {
        if (shell.getAttribute?.('data-music-layout') !== 'popup') shell.setAttribute?.('data-music-layout', 'popup');
        for (const name of ['left', 'top', 'width']) style(shell, name, '');
        // Keep an existing inline reservation while the fixed panel is open.
        // A newly arrived slot keeps its original height until inline layout
        // can measure the full content; popup height includes its own scrolling.
        return;
      }
      const rect = slot?.getBoundingClientRect();
      const inline = Boolean(rect && Number.isFinite(rect.width) && rect.width > 0);
      const mode = inline ? 'inline' : 'footer';
      if (shell.getAttribute?.('data-music-layout') !== mode) shell.setAttribute?.('data-music-layout', mode);
      if (!inline) {
        for (const name of ['left', 'top', 'width']) style(shell, name, '');
        if (slot?.style?.height === assignedHeight) style(slot, 'height', originalHeight);
        assignedHeight = undefined; return;
      }
      const left = finite(rect.left) + finite(win.scrollX ?? win.pageXOffset ?? doc.documentElement?.scrollLeft);
      const top = finite(rect.top) + finite(win.scrollY ?? win.pageYOffset ?? doc.documentElement?.scrollTop);
      style(shell, 'left', pixels(left)); style(shell, 'top', pixels(top)); style(shell, 'width', pixels(rect.width));
      // Apply width first: text wrapping and the visible official iframe determine
      // the actual height. Keep the iframe in its existing parent throughout.
      assignedHeight = pixels(Math.max(0, finite(shell.getBoundingClientRect().height)));
      style(slot, 'height', assignedHeight);
    }
    function schedule() {
      if (scheduled) return;
      if (!requestFrame) { layout(); return; }
      scheduled = true;
      requestFrame(() => { scheduled = false; layout(); });
    }
    const instance = { sync: layout };
    instances.set(doc, instance);
    if (typeof win.ResizeObserver === 'function') {
      resizeObserver = new win.ResizeObserver(schedule);
      observe(doc.documentElement);
    }
    if (typeof win.MutationObserver === 'function' && (doc.body || doc.documentElement)) {
      mutationObserver = new win.MutationObserver(schedule);
      // Exclude style and our own layout attribute: reservation writes must not
      // start a mutation feedback loop. Child/visibility changes affect height.
      mutationObserver.observe(doc.body || doc.documentElement, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'open', 'data-music-popup-open']
      });
    }
    win.addEventListener?.('resize', schedule);
    win.addEventListener?.('orientationchange', schedule);
    doc.addEventListener?.('pjax:complete', schedule);
    doc.addEventListener?.('load', schedule, true);
    doc.fonts?.addEventListener?.('loadingdone', schedule);
    doc.fonts?.ready?.then?.(schedule, () => {});
    layout();
    return instance;
  }
  return { create };
});
