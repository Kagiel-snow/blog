'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const locales = require('../../i18n/locales.json');
const services = fs.readFileSync(path.join(__dirname, '../../source/js/services.js'), 'utf8');

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
