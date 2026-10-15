'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Layout = require('../../source/js/music-layout.js');

function harness(options = {}) {
  const frames = [], events = new Map(), resizeObservers = [], mutationObservers = [];
  let writes = 0;
  function element(rect) {
    const values = { left: '', top: '', width: '', height: '' }, attrs = new Map();
    return {
      style: new Proxy(values, { set(target, name, value) { writes++; target[name] = value; return true; } }),
      getBoundingClientRect() { return typeof rect === 'function' ? rect(this) : rect; },
      getAttribute: name => attrs.get(name), setAttribute(name, value) { writes++; attrs.set(name, value); },
      append() { throw new Error('Layout must never move a player'); },
      replaceChildren() { throw new Error('Layout must never replace a player'); },
      remove() { throw new Error('Layout must never detach a player'); }
    };
  }
  const iframe = { src: 'https://w.soundcloud.com/player/?url=public-song' };
  const shell = element(item => ({ left: 0, top: 0, width: Number.parseFloat(item.style.width) || 900,
    height: options.height?.(Number.parseFloat(item.style.width) || 900) ?? 226 }));
  shell.children = [iframe]; iframe.parentElement = shell;
  const initialSlot = element({ left: 80, top: 300, width: 640, height: 0 });
  if (options.popup) shell.setAttribute('data-music-popup-open', 'true');
  if (options.slotHeight) initialSlot.style.height = options.slotHeight;
  let currentSlot = options.slot === false ? null : initialSlot, currentShell = options.shell === false ? null : shell;
  const listen = kind => (name, listener) => { const key = kind + ':' + name; if (!events.has(key)) events.set(key, []); events.get(key).push(listener); };
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.observed = new Set(); resizeObservers.push(this); }
    observe(target) { this.observed.add(target); }
    unobserve(target) { this.observed.delete(target); }
  }
  class MutationObserver {
    constructor(callback) { this.callback = callback; mutationObservers.push(this); }
    observe(target, config) { this.target = target; this.config = config; }
  }
  const doc = {
    body: element({}), documentElement: element({}),
    querySelector: selector => selector === '[data-music-inline-player]' ? currentShell : selector === '[data-music-player-slot]' ? currentSlot : null,
    addEventListener: listen('document'), fonts: { addEventListener: listen('fonts') }
  };
  const win = { document: doc, scrollX: 10, scrollY: 120, ResizeObserver, MutationObserver,
    requestAnimationFrame(callback) { frames.push(callback); }, addEventListener: listen('window') };
  const instance = Layout.create({ window: win, document: doc });
  const emit = key => events.get(key)?.forEach(callback => callback());
  const flush = () => { const pending = frames.splice(0); pending.forEach(callback => callback()); };
  return { instance, shell, iframe, initialSlot, doc, win, frames, events, resizeObservers, mutationObservers, element, emit, flush,
    get writes() { return writes; }, setSlot(value) { currentSlot = value; }, setShell(value) { currentShell = value; } };
}

test('inline player aligns with the reserved document coordinates without moving the iframe', () => {
  const h = harness();
  assert.equal(h.shell.getAttribute('data-music-layout'), 'inline');
  assert.deepEqual([h.shell.style.left, h.shell.style.top, h.shell.style.width], ['90px', '420px', '640px']);
  assert.equal(h.initialSlot.style.height, '226px');
  assert.equal(h.iframe.parentElement, h.shell); assert.equal(h.shell.children[0], h.iframe);
  assert.equal(h.iframe.src, 'https://w.soundcloud.com/player/?url=public-song');
});

test('PJAX absence uses normal footer flow and returning reserves a new slot for the same player', () => {
  const h = harness(); h.setSlot(null); h.emit('document:pjax:complete'); h.flush();
  assert.equal(h.shell.getAttribute('data-music-layout'), 'footer');
  assert.deepEqual([h.shell.style.left, h.shell.style.top, h.shell.style.width], ['', '', '']);
  assert.equal(h.initialSlot.style.height, '');
  const nextSlot = h.element({ left: 30, top: 800, width: 360, height: 0 });
  h.setSlot(nextSlot); h.emit('document:pjax:complete'); h.flush();
  assert.equal(h.shell.getAttribute('data-music-layout'), 'inline'); assert.equal(h.shell.style.top, '920px');
  assert.equal(nextSlot.style.height, '226px'); assert.equal(h.shell.children[0], h.iframe); assert.equal(h.iframe.parentElement, h.shell);
});

test('width changes measure the new wrapped height and repeated observations stop writing', () => {
  const h = harness({ height: width => width < 400 ? 300 : 200 });
  assert.equal(h.initialSlot.style.height, '200px');
  const mobileSlot = h.element({ left: 12, top: 100, width: 366, height: 0 });
  h.setSlot(mobileSlot); h.emit('window:resize'); h.resizeObservers[0].callback(); h.flush();
  assert.equal(h.shell.style.width, '366px'); assert.equal(mobileSlot.style.height, '300px');
  const previous = h.writes;
  h.resizeObservers[0].callback(); h.flush(); h.instance.sync();
  assert.equal(h.writes, previous, 'stable height and coordinates do not feed another layout change');
  assert.equal(h.frames.length, 0);
});

test('events, font changes and content mutations share one animation frame', () => {
  const h = harness();
  h.emit('window:resize'); h.emit('window:orientationchange'); h.emit('document:load'); h.emit('fonts:loadingdone');
  h.mutationObservers[0].callback(); h.resizeObservers[0].callback();
  assert.equal(h.frames.length, 1); h.flush(); assert.equal(h.frames.length, 0);
  assert.deepEqual(h.mutationObservers[0].config.attributeFilter, ['hidden', 'class', 'open', 'data-music-popup-open']);
});

test('create is a document singleton and installs listeners and observers only once', () => {
  const h = harness(), again = Layout.create({ window: h.win, document: h.doc });
  assert.equal(again, h.instance); assert.equal(h.resizeObservers.length, 1); assert.equal(h.mutationObservers.length, 1);
  for (const listeners of h.events.values()) assert.equal(listeners.length, 1);
  assert.equal(h.events.has('document:pjax:send'), false, 'starting navigation does not tear down playback');
});

test('a missing slot or player is safe and a later available player can be measured', () => {
  assert.doesNotThrow(() => Layout.create({ window: {} }).sync());
  const h = harness({ slot: false, shell: false }); assert.doesNotThrow(() => h.instance.sync());
  h.setShell(h.shell); h.instance.sync(); assert.equal(h.shell.getAttribute('data-music-layout'), 'footer');
  h.setSlot(h.initialSlot); h.instance.sync(); assert.equal(h.shell.getAttribute('data-music-layout'), 'inline');
});

test('zero-width transient slots keep the real player visible in footer flow', () => {
  const h = harness(), hiddenSlot = h.element({ left: 0, top: 0, width: 0, height: 0 });
  h.setSlot(hiddenSlot); h.instance.sync();
  assert.equal(h.shell.getAttribute('data-music-layout'), 'footer'); assert.equal(h.shell.style.width, '');
  assert.equal(h.shell.children[0], h.iframe); assert.equal(h.shell.hidden, undefined);
});

test('slot cleanup respects a height subsequently changed by another owner', () => {
  const h = harness(); h.initialSlot.style.height = '500px'; h.setSlot(null); h.instance.sync();
  assert.equal(h.initialSlot.style.height, '500px');
});

test('timer fallback and absent observer APIs still allow explicit layout updates', () => {
  const callbacks = [];
  const shell = { style: {}, getBoundingClientRect: () => ({ height: 120 }), setAttribute(name, value) { this[name] = value; } };
  const slot = { style: {}, getBoundingClientRect: () => ({ left: 2, top: 3, width: 400 }) };
  const listeners = {};
  const doc = { querySelector: selector => selector.includes('inline-player') ? shell : slot, addEventListener(name, callback) { listeners[name] = callback; } };
  const instance = Layout.create({ window: {}, document: doc, clock: { setTimeout(callback) { callbacks.push(callback); } } });
  assert.equal(slot.style.height, '120px'); listeners['pjax:complete'](); listeners['pjax:complete']();
  assert.equal(callbacks.length, 1); callbacks[0](); assert.doesNotThrow(() => instance.sync());
});

test('opening a popup releases document coordinates without moving playback or shrinking the page', () => {
  const h = harness();
  h.shell.setAttribute('data-music-popup-open', 'true');
  h.mutationObservers[0].callback(); h.flush();
  assert.equal(h.shell.getAttribute('data-music-layout'), 'popup');
  assert.deepEqual([h.shell.style.left, h.shell.style.top, h.shell.style.width], ['', '', '']);
  assert.equal(h.initialSlot.style.height, '226px');
  assert.equal(h.shell.children[0], h.iframe); assert.equal(h.iframe.parentElement, h.shell);
});

test('popup content changes never replace the inline reservation and closing measures the current width', () => {
  let contentHeight = 600;
  const h = harness({ height: width => width < 700 ? contentHeight : 100 });
  assert.equal(h.initialSlot.style.height, '600px');
  h.shell.setAttribute('data-music-popup-open', 'true'); h.instance.sync();
  contentHeight = 900;
  h.resizeObservers[0].callback(); h.flush();
  assert.equal(h.initialSlot.style.height, '600px', 'fixed-panel scrolling height does not collapse the document');
  const previous = h.writes; h.instance.sync();
  assert.equal(h.writes, previous, 'stable popup layout stops writing');
  h.shell.setAttribute('data-music-popup-open', 'false'); h.instance.sync();
  assert.equal(h.shell.getAttribute('data-music-layout'), 'inline');
  assert.equal(h.shell.style.width, '640px'); assert.equal(h.initialSlot.style.height, '900px');
});

test('an initially open popup preserves the original slot height until it closes', () => {
  const h = harness({ popup: true, slotHeight: '480px', height: () => 1000 });
  assert.equal(h.shell.getAttribute('data-music-layout'), 'popup');
  assert.equal(h.initialSlot.style.height, '480px');
  h.shell.setAttribute('data-music-popup-open', 'false'); h.instance.sync();
  assert.equal(h.initialSlot.style.height, '1000px');
  h.setSlot(null); h.instance.sync();
  assert.equal(h.initialSlot.style.height, '480px', 'leaving restores the original inline style');
});

test('an open popup survives PJAX and a new music-page slot is measured only after closing', () => {
  const h = harness();
  h.shell.setAttribute('data-music-popup-open', 'true'); h.instance.sync();
  h.setSlot(null); h.emit('document:pjax:complete'); h.flush();
  assert.equal(h.shell.getAttribute('data-music-layout'), 'popup'); assert.equal(h.initialSlot.style.height, '');
  const nextSlot = h.element({ left: 30, top: 800, width: 360, height: 156 });
  nextSlot.style.height = '156px'; h.setSlot(nextSlot); h.emit('document:pjax:complete'); h.flush();
  assert.equal(nextSlot.style.height, '156px'); assert.equal(h.shell.getAttribute('data-music-layout'), 'popup');
  assert.equal(h.shell.children[0], h.iframe); assert.equal(h.iframe.parentElement, h.shell);
  h.shell.setAttribute('data-music-popup-open', 'false'); h.instance.sync();
  assert.equal(h.shell.getAttribute('data-music-layout'), 'inline');
  assert.equal(nextSlot.style.height, '226px'); assert.equal(h.shell.style.top, '920px');
});

test('a popup can open and close away from the music page using the existing footer player', () => {
  const h = harness({ slot: false });
  h.shell.setAttribute('data-music-popup-open', 'true'); h.instance.sync();
  assert.equal(h.shell.getAttribute('data-music-layout'), 'popup');
  h.shell.setAttribute('data-music-popup-open', 'false'); h.instance.sync();
  assert.equal(h.shell.getAttribute('data-music-layout'), 'footer');
  assert.deepEqual([h.shell.style.left, h.shell.style.top, h.shell.style.width], ['', '', '']);
  assert.equal(h.shell.children[0], h.iframe);
});
