'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const locales = require('../../i18n/locales.json');
const services = fs.readFileSync(path.join(__dirname, '../../source/js/services.js'), 'utf8');

function harness(locale) {
  const listeners = {}, timers = new Map(), scripts = [];
  let timerId = 0;
  const values = ['site_uv', 'site_pv', 'page_pv'].map(key => ({
    id: 'busuanzi_value_' + key, textContent: '', removeAttribute() {}
  }));
  const retry = { hidden: true };
  const context = {
    document: {
      querySelectorAll: () => values,
      querySelector: selector => selector === '[data-retry-stats]' ? retry : null,
      getElementById: () => null,
      createElement: () => ({ remove() { this.removed = true; } }),
      head: { append: script => scripts.push(script) },
      addEventListener: (name, fn) => { listeners[name] = fn; }
    },
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    sitePage: { services: locale.services }
  };
  context.window = context;
  vm.runInNewContext(services, context);
  const currentCallback = () => context[new URL(scripts.at(-1).src).searchParams.get('jsonpCallback')];
  return { context, listeners, timers, scripts, values, retry, currentCallback };
}

test('statistics show real responses in every language; stalled requests stop and retry', () => {
  for (const locale of locales) {
    const h = harness(locale);
    assert.equal(h.values[0].textContent, locale.services.loading);
    const callback = h.currentCallback();
    [...h.timers.values()].find(timer => timer.delay === 8000).fn();
    assert.equal(h.values[0].textContent, locale.services.unavailable);
    assert.equal(h.retry.hidden, false);
    callback({ site_uv: 99, site_pv: 123, page_pv: 4 });
    assert.equal(h.values[0].textContent, locale.services.unavailable, 'late responses must not overwrite failure or a new page');
    h.listeners.click({ target: { closest: () => true } });
    assert.equal(h.scripts.length, 2);
    h.currentCallback()({ site_uv: 42, site_pv: 103, page_pv: 0 });
    assert.deepEqual(h.values.map(el => el.textContent), ['42', '103', '0']);
    assert.equal(h.retry.hidden, true);
  }
});

test('statistics discard departed-page responses and handle invalid data or network failure', () => {
  const h = harness(locales[0]);
  const old = h.currentCallback();
  h.listeners['pjax:send']();
  h.context.sitePage.services = locales[3].services;
  h.listeners['pjax:complete']();
  old({ site_uv: 100, site_pv: 200, page_pv: 3 });
  assert.equal(h.values[0].textContent, 'Loading…');
  h.currentCallback()({ site_uv: '<script>', site_pv: 2 });
  assert.equal(h.values[0].textContent, 'Unavailable');
  h.listeners.click({ target: { closest: () => true } });
  h.scripts.at(-1).onerror();
  assert.equal(h.values[0].textContent, 'Unavailable');
  assert.equal(h.retry.hidden, false);
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
