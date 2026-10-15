'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const locales = require('../../i18n/locales.json');
const services = fs.readFileSync(path.join(__dirname, '../../source/js/services.js'), 'utf8');
const appearance = fs.readFileSync(path.join(__dirname, '../../source/js/appearance.js'), 'utf8');

test('player controls stay open when their clicked icon is replaced; outside clicks still close', () => {
  const listeners = {};
  const control = { addEventListener() {} };
  const dock = { open: true, addEventListener() {}, querySelector: () => control };
  const context = {
    document: {
      querySelector: selector => selector === '.music-dock' ? dock : null,
      addEventListener: (name, fn) => { listeners[name] = fn; }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../source/js/appearance.js'), 'utf8'), context);
  const detachedIcon = { closest: () => null };
  listeners.click({ target: detachedIcon, composedPath: () => [detachedIcon, dock] });
  assert.equal(dock.open, true, 'replaced play/pause icons are still inside clicks');
  listeners.click({ target: detachedIcon, composedPath: () => [detachedIcon] });
  assert.equal(dock.open, false, 'actual outside clicks still dismiss the panel');
});

function popupHarness() {
  const listeners = new Map(), dispatched = [], focusChanges = [], classes = new Set();
  let layoutSyncs = 0, navigations = 0;
  const doc = {};
  function element() {
    const attributes = new Map();
    return {
      isConnected: true,
      getAttribute: name => attributes.get(name) ?? null,
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: name => attributes.delete(name),
      closest: () => null,
      focus(options) { doc.activeElement = this; focusChanges.push({ item: this, options }); }
    };
  }
  function button(selector) {
    const item = element();
    item.closest = query => query === selector ? item : null;
    return item;
  }
  const close = button('[data-music-popup-close]');
  const trigger = button('[data-music-return]'); trigger.href = '/music/#music-player-slot';
  trigger.setAttribute('aria-expanded', 'false');
  let triggers = [trigger];
  const iframe = Object.freeze({ src: 'https://w.soundcloud.com/player/?url=verified-song' });
  const audio = Object.freeze({ currentTime: 84, paused: false,
    play() { throw new Error('Opening or closing must not play the audio'); },
    pause() { throw new Error('Opening or closing must not pause the audio'); },
    load() { throw new Error('Opening or closing must not reload the audio'); }
  });
  const inline = button('[data-music-inline-player]');
  inline.children = Object.freeze([iframe, audio]);
  inline.querySelector = selector => selector === '[data-music-popup-close]' ? close : null;
  for (const method of ['append', 'appendChild', 'remove', 'replaceChildren']) {
    inline[method] = () => { throw new Error('Popup controls must never detach or replace the playing media'); };
  }
  const emit = event => { for (const listener of listeners.get(event.type) || []) listener(event); };
  Object.assign(doc, {
    activeElement: trigger,
    body: { classList: { toggle(name, active) { if (active) classes.add(name); else classes.delete(name); } } },
    querySelector: selector => selector === '[data-music-inline-player]' ? inline : selector === '[data-music-return]' ? triggers[0] : null,
    querySelectorAll: selector => selector === '[data-music-return]' ? triggers : [],
    addEventListener(name, listener) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(listener); },
    dispatchEvent(event) { dispatched.push(event.type); emit(event); }
  });
  const context = { document: doc, Event: class Event { constructor(type) { this.type = type; } },
    SiteMusicLayout: { create: () => ({ sync() { layoutSyncs++; } }) }
  };
  context.window = context;
  const run = () => vm.runInNewContext(appearance, context);
  run();
  function click(target, path = [target]) {
    const event = { type: 'click', target, composedPath: () => path, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; } };
    emit(event);
    if (target.href && !event.defaultPrevented) navigations++;
    return event;
  }
  function key(key) {
    const event = { type: 'keydown', key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    emit(event); return event;
  }
  return { context, doc, inline, trigger, close, iframe, audio, classes, listeners, dispatched, focusChanges,
    button, click, key, emit, run, replaceTriggers(value) { triggers = value; },
    get layoutSyncs() { return layoutSyncs; }, get navigations() { return navigations; }
  };
}

test('the music shortcut toggles the popup and accessibility state without navigating', () => {
  const h = popupHarness();
  const first = h.click(h.trigger);
  assert.equal(first.defaultPrevented, true); assert.equal(h.navigations, 0);
  assert.equal(h.inline.getAttribute('data-music-popup-open'), 'true');
  assert.equal(h.inline.getAttribute('role'), 'dialog');
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'true'); assert.equal(h.classes.has('music-open'), true);
  assert.equal(h.doc.activeElement, h.close);
  assert.deepEqual(h.dispatched, ['site:music-popup-open']);
  h.click(h.trigger);
  assert.equal(h.inline.getAttribute('data-music-popup-open'), 'false');
  assert.equal(h.inline.getAttribute('role'), null);
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'false'); assert.equal(h.classes.has('music-open'), false);
  assert.equal(h.doc.activeElement, h.trigger); assert.equal(h.navigations, 0);
  assert.deepEqual(h.dispatched, ['site:music-popup-open'], 'closing does not repeat the open notification');
  assert.equal(h.layoutSyncs, 2);
});

test('close and Escape restore the opener without replacing, stopping or reloading current media', () => {
  const h = popupHarness(), originalChildren = h.inline.children;
  h.click(h.trigger); h.click(h.close);
  assert.equal(h.inline.getAttribute('data-music-popup-open'), 'false'); assert.equal(h.doc.activeElement, h.trigger);
  h.click(h.trigger);
  const escape = h.key('Escape');
  assert.equal(escape.defaultPrevented, true); assert.equal(h.doc.activeElement, h.trigger);
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(h.inline.children, originalChildren); assert.equal(h.inline.children[0], h.iframe);
  assert.equal(h.iframe.src, 'https://w.soundcloud.com/player/?url=verified-song');
  assert.equal(h.audio.currentTime, 84); assert.equal(h.audio.paused, false);
  assert.equal(h.key('Escape').defaultPrevented, false, 'an already closed popup does not consume Escape');
  assert.deepEqual(h.dispatched, ['site:music-popup-open', 'site:music-popup-open']);
  assert.equal(h.focusChanges.every(change => change.options.preventScroll === true), true);
});

test('a replaced inside icon keeps the popup open, while outside dismissal preserves outside focus', () => {
  const h = popupHarness(); h.click(h.trigger);
  const detachedIcon = { closest: () => null };
  h.click(detachedIcon, [detachedIcon, h.inline]);
  assert.equal(h.inline.getAttribute('data-music-popup-open'), 'true');
  const outside = h.button('[data-outside-control]'); outside.focus();
  const focusCount = h.focusChanges.length;
  h.click(outside);
  assert.equal(h.inline.getAttribute('data-music-popup-open'), 'false');
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(h.doc.activeElement, outside); assert.equal(h.focusChanges.length, focusCount);
  assert.deepEqual(h.dispatched, ['site:music-popup-open']);
});

test('PJAX and repeated initialization reuse the popup and allow the current shortcut to reopen it', () => {
  const h = popupHarness(), controller = h.context.siteMusicPopup;
  h.click(h.trigger); h.click(h.close);
  h.emit({ type: 'pjax:send' }); h.emit({ type: 'pjax:complete' }); h.run();
  assert.equal(h.context.siteMusicPopup, controller);
  assert.equal(h.listeners.get('click').length, 1); assert.equal(h.listeners.get('keydown').length, 1);
  const nextTrigger = h.button('[data-music-return]'); nextTrigger.href = '/music/';
  h.trigger.isConnected = false; h.replaceTriggers([nextTrigger]);
  h.click(nextTrigger);
  assert.equal(h.inline.getAttribute('data-music-popup-open'), 'true');
  assert.equal(nextTrigger.getAttribute('aria-expanded'), 'true'); assert.equal(h.navigations, 0);
  h.key('Escape'); assert.equal(h.doc.activeElement, nextTrigger);
  assert.equal(h.inline.children[0], h.iframe); assert.equal(h.audio.currentTime, 84);
  assert.deepEqual(h.dispatched, ['site:music-popup-open', 'site:music-popup-open']);
});

test('the public popup controls notify on opening and closing does not focus a disconnected shortcut', () => {
  const h = popupHarness();
  h.context.siteMusicPopup.open();
  assert.equal(h.inline.getAttribute('data-music-popup-open'), 'true');
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'true');
  h.trigger.isConnected = false;
  const outside = h.button('[data-outside-control]'); outside.focus();
  h.context.siteMusicPopup.close();
  assert.equal(h.inline.getAttribute('data-music-popup-open'), 'false'); assert.equal(h.doc.activeElement, outside);
  assert.deepEqual(h.dispatched, ['site:music-popup-open']);
});

const settle = () => new Promise(resolve => setImmediate(resolve));
function harness(locale, origin = 'https://kagiel.top') {
  const listeners = {}, timers = new Map(), requests = [];
  let timerId = 0;
  const values = ['site_uv', 'site_pv', 'page_pv'].map(key => ({
    id: 'busuanzi_value_' + key, textContent: '', removeAttribute() {}
  }));
  const retry = { hidden: true }, note = { textContent: '' };
  const context = {
    URL, AbortController, location: new URL(origin), sessionStorage: { getItem: () => null, setItem() {} },
    fetch(url, options) {
      return new Promise((resolve, reject) => {
        requests.push({ url, options, resolve, reject });
        options.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    },
    document: {
      cookie: '',
      querySelectorAll: () => values,
      querySelector: selector => selector === '[data-retry-stats]' ? retry : selector === '[data-stats-note]' ? note : null,
      getElementById: () => null,
      createElement: () => ({ remove() { this.removed = true; } }),
      addEventListener: (name, fn) => { listeners[name] = fn; }
    },
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    sitePage: { services: locale.services, statistics: { url: 'https://kagiel.top/posts/note/' } }
  };
  context.window = context;
  vm.runInNewContext(services, context);
  const respond = (data, request = requests.at(-1), status = 'success') => request.resolve({ ok: true, json: async () => ({ status, data }) });
  return { context, listeners, timers, requests, values, retry, note, respond };
}

test('statistics time out and retry with a read, not another view increment', async () => {
  for (const locale of locales) {
    const h = harness(locale);
    assert.equal(h.values[0].textContent, locale.services.loading);
    const first = h.requests[0];
    assert.equal(first.options.method, 'POST');
    assert.equal(JSON.parse(first.options.body).isNewUv, true);
    [...h.timers.values()].find(timer => timer.delay === 10000).fn();
    await settle();
    assert.equal(h.values[0].textContent, locale.services.unavailable);
    assert.equal(h.retry.hidden, false);
    h.respond({ site_uv: 99, site_pv: 123, page_pv: 4 }, first); await settle();
    assert.equal(h.values[0].textContent, locale.services.unavailable, 'late responses must not overwrite failure or a new page');
    h.listeners.click({ target: { closest: () => true } });
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].options.method, 'GET');
    h.respond({ site_uv: 42, site_pv: 103, page_pv: 0 }); await settle();
    assert.deepEqual(h.values.map(el => el.textContent), ['42', '103', '0']);
    assert.equal(h.retry.hidden, true);
  }
});

test('statistics discard departed-page responses and handle invalid data or network failure', async () => {
  const h = harness(locales[0]);
  const old = h.requests[0];
  h.listeners['pjax:send']();
  h.context.sitePage.services = locales[3].services;
  h.context.sitePage.statistics.url = 'https://kagiel.top/music/';
  h.listeners['pjax:complete']();
  assert.equal(JSON.parse(h.requests[1].options.body).isNewUv, false);
  h.respond({ site_uv: 100, site_pv: 200, page_pv: 3 }, old); await settle();
  assert.equal(h.values[0].textContent, 'Loading…');
  h.respond({ site_uv: '<script>', site_pv: 2 }); await settle();
  assert.equal(h.values[0].textContent, 'Unavailable');
  h.listeners.click({ target: { closest: () => true } });
  h.requests.at(-1).reject(new Error('offline')); await settle();
  assert.equal(h.values[0].textContent, 'Unavailable');
  assert.equal(h.retry.hidden, false);
});

test('local previews read canonical public counts and label cached responses honestly', async () => {
  const h = harness(locales[0], 'http://127.0.0.1:4000');
  assert.equal(h.requests[0].options.method, 'GET');
  assert.equal(new URL(h.requests[0].url).searchParams.get('url'), 'https://kagiel.top/posts/note/');
  assert.equal(h.context.document.cookie, '');
  h.respond({ site_uv: 12, site_pv: 24, page_pv: 3 }); await settle();
  assert.match(h.note.textContent, /本地仅查看/);
  h.listeners['pjax:complete']();
  h.requests.at(-1).reject(new Error('offline')); await settle();
  assert.deepEqual(h.values.map(el => el.textContent), ['12', '24', '3']);
  assert.match(h.note.textContent, /上次数据/);
  h.context.sitePage.statistics.url = 'https://kagiel.top/music/';
  h.listeners['pjax:complete']();
  h.respond({ site_uv: 0, site_pv: 0, page_pv: 0 }, h.requests.at(-1), 'error'); await settle();
  assert.equal(h.values[0].textContent, locales[0].services.unavailable, 'errors and other-page caches must not become zero or invented page counts');
});

test('pages without visible counters still record visits; noindex pages skip statistics', async () => {
  const h = harness(locales[0]);
  h.respond({ site_uv: 1, site_pv: 1, page_pv: 1 }); await settle();
  h.context.document.querySelectorAll = () => [];
  h.context.sitePage.statistics.url = 'https://kagiel.top/music/';
  h.listeners['pjax:complete']();
  assert.equal(h.requests.length, 2);
  assert.equal(JSON.parse(h.requests[1].options.body).url, 'https://kagiel.top/music/');
  h.context.sitePage.statistics = null;
  h.listeners['pjax:complete']();
  assert.equal(h.requests.length, 2);
  await settle();
});

test('comment loading completes even when Twikoo replaces its mount; translations keep the original path', async () => {
  for (const locale of locales) {
    const host = { isConnected: true, replaceChildren(el) { this.child = el; } };
    const status = { textContent: '' };
    let received;
    const context = {
      document: {
        getElementById: id => id === 'site-comments' ? host : null,
        querySelector: () => status, querySelectorAll: () => [],
        createElement: () => ({}), addEventListener() {}
      },
      setTimeout: () => 1, clearTimeout() {},
      sitePage: { services: locale.services, comments: { lang: locale.id, path: '/2026/08/03/hello%20world/' } },
      twikoo: { init: async options => { received = options; host.child = { id: 'twikoo' }; } }
    };
    context.window = context;
    vm.runInNewContext(services, context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(received.lang, locale.id);
    assert.equal(received.path, '/2026/08/03/hello%20world/');
    assert.equal(status.textContent, '');
  }
});
