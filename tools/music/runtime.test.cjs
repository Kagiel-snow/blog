'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { escapeHtml } = require('../../source/js/music-source.js');
const source = fs.readFileSync(path.join(__dirname, '../../source/js/music.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const song = (id, name = '歌曲 ' + id) => ({
  id: 'netease:' + id, songId: String(id), name, artist: '歌手 ' + id,
  url: 'https://audio.example/song?id=' + id, cover: 'https://images.example/' + id + '.jpg',
  sourceUrl: 'https://music.163.com/#/song?id=' + id
});
const dataName = name => name.slice(5).replace(/-([a-z])/g, (_, character) => character.toUpperCase());

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = new Map();
    this.textContent = ''; this.className = ''; this.hidden = false; this.value = ''; this.listeners = {};
    const classes = new Set();
    this.classList = { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name), contains: name => classes.has(name) };
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name.startsWith('data-')) this.dataset[dataName(name)] = String(value); }
  hasAttribute(name) { return this.attributes.has(name) || (name.startsWith('data-') && Object.hasOwn(this.dataset, dataName(name))); }
  getAttribute(name) { return this.attributes.get(name); }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  append(...elements) { elements.forEach(element => { element.parentElement = this; this.children.push(element); }); }
  replaceChildren(...elements) { this.children.forEach(element => { element.parentElement = null; }); this.children = []; this.append(...elements); }
  matches(selector) {
    return selector.split(',').some(item => {
      item = item.trim();
      if (item.startsWith('.')) return this.className.split(/\s+/).includes(item.slice(1));
      const attribute = item.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
      if (attribute) return this.hasAttribute(attribute[1]) && (attribute[2] === undefined || this.getAttribute(attribute[1]) === attribute[2]);
      return this.tagName.toLowerCase() === item.toLowerCase();
    });
  }
  closest(selector) { for (let element = this; element; element = element.parentElement) if (element.matches(selector)) return element; return null; }
  querySelectorAll(selector) {
    return this.children.flatMap(element => [...(element.matches(selector) ? [element] : []), ...element.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function harness() {
  const listeners = {}, requests = [], timers = new Map(), instances = [], storage = new Map();
  let timerId = 0, browser;
  const config = { playlistId: '123', playlistName: '默认歌单', pageSize: 20, timeoutMs: 12000, fallbackCover: '/img/cover.jpg' };
  const container = new Element(), data = new Element('script'), settings = new Element('script'), dock = new Element('details');
  dock.open = false; data.textContent = '[]'; settings.textContent = JSON.stringify(config);
  const playerStatus = new Element('p'), retryPlay = new Element('button'), currentSource = new Element('a');
  retryPlay.setAttribute('data-music-retry-play', '');
  const controls = {};
  const setTimer = (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; };
  const clearTimer = id => timers.delete(id);

  class APlayer {
    constructor(options) {
      instances.push(this); this.options = options; this.handlers = {}; this.paused = true; this.playCalls = 0; this.switches = [];
      this.audio = { paused: true, error: null, readyState: 0, currentTime: 0, src: '' };
      let autoSkipTimer;
      // The vendor's internal listeners are installed before site listeners.
      this.on('error', () => {
        if (this.list.audios.length > 1) autoSkipTimer = setTimer(() => { this.skipForward(); if (!this.paused) this.play(); }, 2000);
      });
      this.on('listswitch', () => { if (autoSkipTimer) { clearTimer(autoSkipTimer); autoSkipTimer = undefined; } });
      this.list = {
        audios: [...options.audio], index: 0,
        add: tracks => {
          const wasEmpty = !this.list.audios.length;
          this.list.audios = this.list.audios.concat(tracks);
          if (wasEmpty && tracks.length) this.list.switch(0);
        },
        switch: index => {
          const oldIndex = this.list.index;
          this.emit('listswitch', { index });
          if (!this.list.audios[index]) return;
          this.list.index = index;
          this.audio.src = this.list.audios[index].url;
          this.audio.currentTime = 0; this.audio.error = null;
          this.switches.push({ oldIndex, index, url: this.audio.src });
          if (!this.paused) this.play();
        }
      };
      if (this.list.audios.length) this.list.switch(0);
    }
    on(name, listener) { (this.handlers[name] ||= []).push(listener); }
    emit(name, event = {}) { if (name === 'error') this.audio.error = { code: 4 }; (this.handlers[name] || []).forEach(listener => listener(event)); }
    play() { this.playCalls++; this.paused = false; this.audio.paused = false; this.emit('play'); }
    pause() { this.paused = true; this.audio.paused = true; this.emit('pause'); }
    skipForward() { this.list.switch((this.list.index + 1) % this.list.audios.length); }
  }

  const document = {
    activeElement: null,
    getElementById: id => ({ 'kagiel-player': container, 'site-music-data': data, 'site-music-config': settings })[id] || null,
    querySelector: selector => ({
      '[data-music-browser]': browser, '[data-music-player-status]': playerStatus,
      '[data-music-retry-play]': retryPlay, '[data-music-current-source]': currentSource, '.music-dock': dock
    })[selector] || null,
    querySelectorAll: selector => selector === '[data-track-id]' ? browser?.querySelectorAll(selector) || [] : [],
    createElement: tag => new Element(tag),
    addEventListener: (name, listener) => { (listeners[name] ||= []).push(listener); }
  };
  const context = {
    document, APlayer, AbortController, queueMicrotask, setTimeout: setTimer, clearTimeout: clearTimer,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    SiteMusicSource: {
      escapeHtml,
      parsePlaylistId: value => { if (!/^\d+$/.test(String(value))) throw new Error('invalid playlist'); return String(value); },
      createClient: () => ({ request: (type, id, options) => new Promise((resolve, reject) => { requests.push({ type, id, signal: options.signal, resolve, reject }); }) })
    }
  };
  context.window = context;
  const rerun = () => vm.runInNewContext(source, context);
  rerun();
  const mountBrowser = () => {
    browser = new Element(); browser.setAttribute('data-music-browser', '');
    for (const name of ['list-title', 'browser-status', 'retry-list', 'results', 'playlist-source', 'more']) {
      const element = new Element(name === 'retry-list' || name === 'more' ? 'button' : 'div');
      element.setAttribute('data-music-' + name, ''); controls[name] = element; browser.append(element);
    }
    for (const name of ['playlist', 'keyword']) { const input = new Element('input'); input.setAttribute('name', name); controls[name] = input; browser.append(input); }
    for (const view of ['playlist', 'search']) { const button = new Element('button'); button.setAttribute('data-music-view', view); browser.append(button); }
    return browser;
  };
  const dispatch = (name, event = {}) => (listeners[name] || []).forEach(listener => listener(event));
  const click = target => dispatch('click', { target, preventDefault() {} });
  return { context, music: context.siteMusic, requests, timers, instances, controls, listeners, dock, data, playerStatus, retryPlay, currentSource, mountBrowser, dispatch, click, rerun };
}

async function load(h, tracks = [song('1'), song('2')], id = '123') {
  const pending = h.music.loadPlaylist(id);
  h.requests.at(-1).resolve(tracks);
  await pending; await settle();
}

test('a newer search wins even when the aborted earlier request resolves afterward', async () => {
  const h = harness(); h.mountBrowser();
  const old = h.music.search('旧关键词'), latest = h.music.search('新关键词');
  assert.equal(h.requests[0].signal.aborted, true);
  h.requests[1].resolve([song('2', '新搜索结果')]); await latest;
  assert.equal(h.controls['list-title'].textContent, '“新关键词”的搜索结果');
  assert.equal(h.controls.results.querySelector('h2').textContent, '新搜索结果');
  h.requests[0].resolve([song('1', '过期搜索结果')]); await old; await settle();
  assert.equal(h.controls.results.querySelector('h2').textContent, '新搜索结果');
  h.music.playTrack('netease:1');
  assert.equal(h.music.player.list.audios.length, 0, 'stale songs must not become playable search results');
  h.music.playTrack('netease:2');
  assert.equal(h.music.player.audio.src, song('2').url);
});

test('playlist failures expose retry and a successful retry initializes a paused queue', async () => {
  const h = harness(); h.mountBrowser();
  const pending = h.music.loadPlaylist('123'); h.requests[0].reject(new TypeError('Failed to fetch')); await pending;
  assert.equal(h.controls['retry-list'].hidden, false);
  assert.match(h.controls['browser-status'].textContent, /没有加载成功/);
  h.click(h.controls['retry-list']);
  assert.equal(h.requests.length, 2);
  assert.equal(h.controls.results.getAttribute('aria-busy'), 'true');
  h.requests[1].resolve([song('1'), song('2')]); await settle();
  assert.equal(h.controls['retry-list'].hidden, true);
  assert.equal(h.controls.results.getAttribute('aria-busy'), 'false');
  assert.equal(h.music.player.list.audios.length, 2);
  assert.equal(h.music.player.audio.paused, true);
  assert.equal(h.music.player.playCalls, 0);
});

test('PJAX and repeated script execution retain one player, playback time and handler set', async () => {
  const h = harness(); await load(h); h.music.playTrack('netease:1');
  const player = h.music.player; player.audio.currentTime = 47;
  const counts = Object.fromEntries(Object.entries(h.listeners).map(([name, handlers]) => [name, handlers.length]));
  h.rerun(); h.dispatch('pjax:send'); h.mountBrowser(); h.dispatch('pjax:complete'); await settle();
  assert.equal(h.context.siteMusic.player, player);
  assert.equal(h.instances.length, 1);
  assert.equal(player.audio.currentTime, 47);
  assert.equal(player.audio.paused, false);
  assert.equal(h.requests.length, 1);
  assert.deepEqual(Object.fromEntries(Object.entries(h.listeners).map(([name, handlers]) => [name, handlers.length])), counts);
  assert.equal(h.controls.results.querySelectorAll('h2').length, 2);
});

test('media failure pauses and reselects the same song to cancel the vendor auto skip', async () => {
  const h = harness(); await load(h); h.music.playTrack('netease:1');
  const player = h.music.player, selected = player.list.index, priorSwitches = player.switches.length;
  player.emit('error'); await settle();
  assert.equal(player.paused, true);
  assert.equal(player.audio.paused, true);
  assert.equal(player.list.index, selected);
  assert.equal(player.switches.length, priorSwitches + 1);
  assert.equal(player.switches.at(-1).url, song('1').url);
  assert.equal(h.retryPlay.hidden, false);
  assert.match(h.playerStatus.textContent, /暂时无法播放/);
  assert.equal(h.timers.size, 0, 'both the timeout and the vendor 2-second skip must be cancelled');
  assert.equal(h.requests.length, 1, 'failure must not load more metadata automatically');
  h.click(h.retryPlay); await settle();
  assert.equal(player.audio.paused, false);
  assert.equal(player.list.index, selected);
  assert.equal(player.audio.src, song('1').url);
  assert.equal(h.retryPlay.hidden, true);
  assert.equal([...h.timers.values()].some(timer => timer.ms === 2000), false);
});

test('next and direct list switches select the right source despite the early listswitch event', async () => {
  const h = harness(); await load(h); h.music.playTrack('netease:1');
  h.music.player.skipForward(); await settle();
  assert.equal(h.music.player.list.index, 1);
  assert.equal(h.music.player.audio.src, song('2').url);
  assert.equal(h.currentSource.href, song('2').sourceUrl);
  assert.match(h.playerStatus.textContent, /歌曲 2/);
  assert.deepEqual(h.music.player.switches.at(-1), { oldIndex: 0, index: 1, url: song('2').url });
  h.music.player.pause(); h.music.player.list.switch(0); await settle();
  assert.equal(h.currentSource.href, song('1').sourceUrl);
  assert.match(h.playerStatus.textContent, /歌曲 1/);
  assert.equal(h.music.player.audio.paused, true);
});

test('pausing during a slow initial metadata load prevents autoplay when it completes', async () => {
  const h = harness();
  const pending = h.music.loadPlaylist('123');
  h.music.player.pause(); h.requests[0].resolve([song('1')]); await pending; await settle();
  assert.equal(h.music.player.list.audios.length, 1);
  assert.equal(h.music.player.audio.paused, true);
  assert.equal(h.music.player.playCalls, 0);
  assert.equal(h.timers.size, 0);
});

test('changing the displayed playlist preserves the queue and current playback until a song is chosen', async () => {
  const h = harness(); h.mountBrowser(); await load(h); h.music.playTrack('netease:1');
  const player = h.music.player; player.audio.currentTime = 61;
  await load(h, [song('3'), song('4')], '456');
  assert.deepEqual(Array.from(player.list.audios, item => item.id), ['netease:1', 'netease:2']);
  assert.deepEqual(JSON.parse(h.data.textContent).map(item => item.id), ['netease:1', 'netease:2']);
  assert.equal(player.audio.src, song('1').url);
  assert.equal(player.audio.currentTime, 61);
  assert.equal(player.audio.paused, false);
  assert.deepEqual(h.controls.results.querySelectorAll('h2').map(element => element.textContent), ['歌曲 3', '歌曲 4']);
  h.music.playTrack('netease:3'); await settle();
  assert.equal(player.audio.src, song('3').url);
  assert.deepEqual(Array.from(player.list.audios, item => item.id), ['netease:1', 'netease:2', 'netease:3']);
});

test('PJAX aborts a pending search and ignores its late response', async () => {
  const h = harness(); h.mountBrowser();
  const pending = h.music.search('即将离开的搜索');
  h.dispatch('pjax:send');
  assert.equal(h.requests[0].signal.aborted, true);
  h.requests[0].resolve([song('9')]); await pending;
  const next = h.music.search('下一次搜索');
  assert.equal(h.controls.results.querySelectorAll('h2').length, 0);
  assert.equal(h.music.player.list.audios.length, 0);
  h.requests[1].resolve([song('8')]); await next;
  assert.equal(h.controls.results.querySelector('h2').textContent, '歌曲 8');
});

test('a failed new search or playlist cannot display the previous results under its new title', async () => {
  for (const type of ['search', 'playlist']) {
    const h = harness(); h.mountBrowser(); await load(h); h.music.playTrack('netease:1');
    const player = h.music.player; player.audio.currentTime = 73;
    const first = type === 'search' ? h.music.search('第一次搜索') : h.music.loadPlaylist('456');
    h.requests.at(-1).resolve([song('9', '上一次的歌曲')]); await first;
    assert.equal(h.controls.results.querySelector('h2').textContent, '上一次的歌曲');
    const second = type === 'search' ? h.music.search('第二次搜索') : h.music.loadPlaylist('789');
    assert.equal(h.controls.results.querySelectorAll('h2').length, 0, 'old rows must disappear as soon as the request changes');
    assert.match(h.controls['list-title'].textContent, type === 'search' ? /第二次搜索/ : /789/);
    h.requests.at(-1).reject(new TypeError('Failed to fetch')); await second;
    assert.equal(h.controls.results.querySelectorAll('h2').length, 0, 'a failed replacement request must not restore mismatched old rows');
    assert.equal(h.controls['retry-list'].hidden, false);
    assert.equal(h.controls.results.getAttribute('aria-busy'), 'false');
    h.music.playTrack('netease:9');
    assert.deepEqual(Array.from(player.list.audios, item => item.id), ['netease:1', 'netease:2']);
    assert.equal(player.audio.src, song('1').url);
    assert.equal(player.audio.currentTime, 73);
    assert.equal(player.audio.paused, false);
  }
});

test('a successfully empty playlist remains loaded across PJAX and repeated dock openings', async () => {
  const h = harness(); h.mountBrowser(); await load(h, []);
  assert.equal(h.requests.length, 1);
  assert.match(h.controls['browser-status'].textContent, /没有可显示的歌曲/);
  assert.equal(h.controls['retry-list'].hidden, true);
  assert.equal(h.music.player.list.audios.length, 0);
  for (let index = 0; index < 3; index++) {
    h.dispatch('pjax:send'); h.dispatch('pjax:complete');
    h.dock.open = true;
    (h.dock.listeners.toggle || []).forEach(listener => listener({ target: h.dock }));
    h.dock.open = false;
    (h.dock.listeners.toggle || []).forEach(listener => listener({ target: h.dock }));
  }
  await settle();
  assert.equal(h.requests.length, 1, 'an empty success must not be mistaken for an unloaded playlist');
  assert.equal(h.controls.results.querySelectorAll('h2').length, 0);
  assert.equal(h.music.player.playCalls, 0);
});
