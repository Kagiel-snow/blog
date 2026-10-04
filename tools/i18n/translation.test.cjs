'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../source/js/translation.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  const listeners = {}, timers = new Map(), requests = [];
  let timerId = 0;
  const storage = () => { const map = new Map(); return { getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value) }; };
  const node = (value, blocked = false) => ({ nodeType: 3, nodeValue: value, isConnected: true, parentElement: { closest: () => blocked ? {} : null } });
  const prose = node('今天学了以太网。'), code = node('const 中文 = 1;', true), comment = node('评论里的原文', true), input = node('还没发出的内容', true);
  const nodes = [prose, code, comment, input];
  const label = {}, retry = {}, original = {}, dismiss = { setAttribute() {} };
  const notice = { dataset: {}, setAttribute() {}, querySelector: selector => selector === 'span' ? label : selector.includes('retry') ? retry : selector.includes('dismiss') ? dismiss : original };
  const location = new URL('https://example.test/posts/note/');
  const context = {
    URL, URLSearchParams, AbortController, NodeFilter: { SHOW_TEXT: 4 }, location,
    localStorage: storage(), sessionStorage: storage(),
    history: { state: null, replaceState: (_, __, url) => { context.location = new URL(url, location); } },
    MutationObserver: class { constructor(fn) { this.callback = fn; } observe() {} },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options) {
      return new Promise((resolve, reject) => {
        const r = { url, options, resolve, reject }; requests.push(r);
        options.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    },
    document: {
      body: { append() {} }, documentElement: { lang: 'zh-CN' },
      createElement: () => notice, querySelectorAll: () => [], getElementById: () => null,
      addEventListener: (name, fn) => { listeners[name] = fn; },
      createTreeWalker: () => { let i = -1; return { nextNode() { this.currentNode = nodes[++i]; return !!this.currentNode; } }; }
    }
  };
  context.window = context;
  vm.runInNewContext(source, context);
  const choose = lang => listeners.click({ button: 0, preventDefault() {}, target: { closest: selector => selector.includes('.i18n-menu') ? { dataset: { locale: lang }, blur() {} } : null } });
  async function tick(delay = 180) {
    for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); }
    await settle();
  }
  const respond = (request, text) => request.resolve({ ok: true, json: async () => [{ translations: [{ text }] }] });
  return { context, listeners, nodes, prose, code, comment, input, label, notice, retry, requests, choose, tick, respond };
}

test('translation is opt-in, excludes private/technical text, caches by source and restores original', async () => {
  const h = harness(); await h.tick();
  assert.equal(h.requests.length, 0);
  h.choose('en'); await h.tick();
  assert.deepEqual(JSON.parse(h.requests[0].options.body), ['今天学了以太网。']);
  assert.equal(h.requests[0].options.credentials, 'omit');
  h.respond(h.requests[0], 'Today I learned Ethernet.'); await settle();
  assert.equal(h.prose.nodeValue, 'Today I learned Ethernet.');
  assert.equal(h.comment.nodeValue, '评论里的原文');
  assert.equal(h.code.nodeValue, 'const 中文 = 1;');
  assert.equal(h.input.nodeValue, '还没发出的内容');
  assert.equal(h.notice.dataset.state, 'done');
  h.choose('zh-CN'); await h.tick();
  assert.equal(h.prose.nodeValue, '今天学了以太网。');
  assert.equal(h.notice.hidden, true);
  h.choose('en'); await h.tick();
  assert.equal(h.requests.length, 1, 'the same source should reuse its cached translation');
  h.choose('zh-CN'); h.prose.nodeValue = '原文已经改了。';
  h.choose('en'); await h.tick();
  assert.deepEqual(JSON.parse(h.requests[1].options.body), ['原文已经改了。']);
  h.respond(h.requests[1], 'The source has changed.'); await settle();
  assert.equal(h.prose.nodeValue, 'The source has changed.');
});

test('switching languages or pages cancels old requests; failures stop and can retry', async () => {
  const h = harness(); h.choose('en'); await h.tick();
  const old = h.requests[0];
  h.choose('ja'); await settle(); await h.tick();
  assert.equal(old.options.signal.aborted, true);
  h.respond(old, 'STALE');
  h.respond(h.requests[1], '今日はイーサネットを学んだ。'); await settle();
  assert.equal(h.prose.nodeValue, '今日はイーサネットを学んだ。');
  h.choose('zh-TW'); await h.tick(); await h.tick(15000);
  assert.equal(h.notice.dataset.state, 'error');
  assert.equal(h.retry.hidden, false);
  assert.equal(h.prose.nodeValue, '今天学了以太网。');
  h.listeners.click({ target: { closest: selector => selector === '[data-translation-retry]' ? {} : null } });
  await h.tick();
  h.respond(h.requests.at(-1), '今天學了乙太網路。'); await settle();
  assert.equal(h.notice.dataset.state, 'done');
  h.choose('en'); await h.tick();
  const pending = h.requests.at(-1);
  h.listeners['pjax:send'](); await settle();
  assert.equal(pending.options.signal.aborted, true);
  h.prose.isConnected = false;
  h.respond(pending, 'LATE PAGE'); await settle();
  assert.notEqual(h.prose.nodeValue, 'LATE PAGE');
});

test('dismissing the notice preserves translation through completion and page navigation', async () => {
  const h = harness(); h.choose('en'); await h.tick();
  h.listeners.click({ target: { closest: selector => selector === '[data-translation-dismiss]' ? {} : null } });
  assert.equal(h.notice.hidden, true);
  assert.equal(h.requests[0].options.signal.aborted, false, 'dismissal must not cancel translation');
  h.respond(h.requests[0], 'Today I learned Ethernet.'); await settle();
  assert.equal(h.notice.hidden, true, 'completion must not reopen a dismissed notice');
  assert.equal(h.prose.nodeValue, 'Today I learned Ethernet.');
  assert.equal(h.context.document.documentElement.lang, 'en');
  assert.equal(h.context.location.search, '?lang=en');
  h.listeners['pjax:send'](); h.listeners['pjax:complete'](); await h.tick();
  assert.equal(h.notice.hidden, true);
  assert.equal(h.prose.nodeValue, 'Today I learned Ethernet.');
  h.choose('ja');
  assert.equal(h.notice.hidden, false, 'explicit language selection makes status and retry available again');
});
