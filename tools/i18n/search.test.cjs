'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { enhanceSearch } = require('./navigation.cjs');
const { ROOT } = require('./lib.cjs');
const fixture = path.join(ROOT, 'work/tests/search-' + process.pid);
const file = path.join(fixture, 'js/search/local-search.js');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'node_modules/hexo-theme-butterfly/source/js/search/local-search.js'), file);
enhanceSearch(fixture);
const source = fs.readFileSync(file, 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  const listeners = {}, windowListeners = {}, timers = new Map(), requests = [];
  let timerId = 0;
  const element = () => ({
    textContent: '', innerHTML: '', value: '', hidden: false, style: { setProperty() {} }, events: {},
    addEventListener(name, fn) { this.events[name] = fn; },
    append(child) { this.child = child; }, remove() { this.removed = true; }, focus() {}
  });
  const names = ['input', 'stats', 'loading', 'mask', 'dialog', 'results', 'pagination', 'pages', 'database', 'status', 'close', 'inputParent'];
  const nodes = Object.fromEntries(names.map(name => [name, element()]));
  const selectors = {
    '.local-search-input input': nodes.input, '.local-search-input': nodes.inputParent,
    '#local-search .search-dialog': nodes.dialog, '#local-search .search-close-button': nodes.close,
    '#local-search-pagination .ais-Pagination-list': nodes.pages, '[data-search-status]': nodes.status
  };
  const ids = {
    'local-search-stats': nodes.stats, 'loading-status': nodes.loading, 'search-mask': nodes.mask,
    'local-search-results': nodes.results, 'local-search-pagination': nodes.pagination, 'loading-database': nodes.database
  };
  const register = (list, name, fn) => { (list[name] ||= []).push(fn); };
  const context = {
    URL, Event, AbortController, location: new URL('https://kagiel.top/'), innerWidth: 1000,
    GLOBAL_CONFIG: { localSearch: { path: '/search.json', pagination: { enable: true, hitsPerPage: 8 }, languages: { hits_stats: '共找到 ${hits} 篇文章', hits_empty: '没有找到 ${query}' } } },
    btf: { overflowPaddingR: { add() {}, remove() {} }, animateIn: el => { el.visible = true; }, animateOut: el => { el.visible = false; }, isHidden: el => !el.visible },
    document: {
      querySelector: selector => selectors[selector], getElementById: id => ids[id]?.removed ? null : ids[id],
      createElement: element,
      addEventListener: (name, fn) => register(listeners, name, fn), removeEventListener() {}
    },
    addEventListener: (name, fn) => register(windowListeners, name, fn), removeEventListener() {},
    dispatchEvent: event => (windowListeners[event.type] || []).forEach(fn => fn(event)),
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    fetch: (url, options) => new Promise((resolve, reject) => {
      requests.push({ url, options, resolve, reject });
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    })
  };
  context.window = context;
  vm.runInNewContext(source, context);
  const open = () => listeners.click.forEach(fn => fn({ target: { closest: () => true } }));
  const type = async value => {
    nodes.input.value = value; nodes.input.events.input();
    for (const [id, timer] of [...timers]) if (timer.delay === 200) { timers.delete(id); timer.fn(); }
    await settle();
  };
  const respond = () => requests.at(-1).resolve({ ok: true, text: async () => JSON.stringify([
    { title: 'Network 笔记：LAN', content: '以太网 CSMA/CD PoE ' + 'x'.repeat(150), url: '/posts/network/' },
    { title: 'SQL 笔记', content: 'SQL 注入与参数化查询', url: '/posts/sql/' }
  ]) });
  return { context, nodes, requests, timers, windowListeners, open, type, respond };
}

test('search works before window.load and reruns a query typed before the index arrives', async () => {
  const h = harness();
  assert.equal(h.windowListeners.load, undefined);
  h.open(); h.open();
  assert.equal(h.requests.length, 1, 'opening twice reuses the pending index request');
  await h.type('LAN');
  assert.equal(h.nodes.results.innerHTML, '');
  h.respond(); await settle();
  assert.match(h.nodes.results.innerHTML, /Network/);
  assert.match(h.nodes.stats.innerHTML, /1 篇文章/);
  assert.equal(h.nodes.status.textContent, '');
  h.context.dispatchEvent(new Event('pjax:complete'));
  h.open(); await h.type('SQL');
  assert.match(h.nodes.results.innerHTML, /SQL/);
  assert.doesNotMatch(h.nodes.results.innerHTML, /Network/);
  assert.equal(h.requests.length, 1, 'page navigation keeps the loaded index');
  await h.type('不存在的内容');
  // This minimal DOM stores the stats child as outerHTML; verify no old result.
  assert.equal(h.nodes.results.textContent, '');
  await h.type('x'.repeat(130));
  assert.match(h.nodes.results.innerHTML, /Network/, 'long terms must consume matches, not hang the search loop');
});

test('failed or timed-out search indexes stay retryable and keep the query', async () => {
  const h = harness(); h.open(); await h.type('PoE');
  [...h.timers.values()].find(timer => timer.delay === 10000).fn(); await settle();
  assert.match(h.nodes.status.textContent, /没有加载成功/);
  h.nodes.status.child.events.click();
  assert.equal(h.requests.length, 2);
  assert.equal(h.nodes.input.value, 'PoE');
  h.respond(); await settle();
  assert.match(h.nodes.results.innerHTML, /PoE/);
  assert.equal(h.nodes.status.textContent, '');
});
