'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { escapeHtml, parsePlaylistId, officialAudioUrl, parseVideoId, parseVideoLink, videoEmbedUrl, videoSearchUrl,
  parseSoundCloudUrl, soundCloudEmbedUrl, soundCloudSearchUrl } = require('../../source/js/music-source.js');
const source = fs.readFileSync(path.join(__dirname, '../../source/js/music.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const song = (id, name = '歌曲 ' + id) => ({
  id: 'netease:' + id, songId: String(id), name, artist: '歌手 ' + id,
  url: 'https://audio.example/song?id=' + id, cover: 'https://images.example/' + id + '.jpg',
  sourceUrl: 'https://music.163.com/#/song?id=' + id
});
const video = (id = 'BV1124y1x72L', name = '公开视频') => ({
  id: 'bilibili:' + id, videoId: id, name, artist: '视频作者', duration: '1:42',
  cover: 'https://images.example/' + id + '.jpg', sourceUrl: 'https://www.bilibili.com/video/' + id
});
const openAudio = (trackId = '123456', name = '公开歌曲') => ({
  id: 'soundcloud:' + trackId, trackId, provider: 'soundcloud', name, artist: '原唱',
  permalinkUrl: 'https://soundcloud.com/artist/song-' + trackId, sourceUrl: 'https://soundcloud.com/artist/song-' + trackId,
  durationMs: 189000, fullDurationMs: 189000, cover: 'https://images.example/' + trackId + '.jpg', availability: 'public_full'
});
const dataName = name => name.slice(5).replace(/-([a-z])/g, (_, character) => character.toUpperCase());

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = new Map();
    this.textContent = ''; this.className = ''; this.hidden = false; this.value = ''; this.listeners = {};
    const classes = new Set();
    this.classList = {
      toggle: (name, enabled = !classes.has(name)) => { if (enabled) classes.add(name); else classes.delete(name); return enabled; },
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name)
    };
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name.startsWith('data-')) this.dataset[dataName(name)] = String(value); if (name === 'src' || name === 'href') this[name] = String(value); }
  hasAttribute(name) { return this.attributes.has(name) || (name.startsWith('data-') && Object.hasOwn(this.dataset, dataName(name))); }
  getAttribute(name) { return this.attributes.get(name); }
  removeAttribute(name) { this.attributes.delete(name); if (name.startsWith('data-')) delete this.dataset[dataName(name)]; if (name === 'src') this.src = ''; }
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

function harness(options = {}) {
  const listeners = {}, requests = [], videoRequests = [], videoInspections = [], audioRequests = [], widgets = [],
    timers = new Map(), instances = [], storage = new Map(Object.entries(options.storage || {})), checks = new Map();
  let timerId = 0, browser;
  const config = { playlistId: '123', playlistName: '默认歌单', pageSize: 20, timeoutMs: 12000, fallbackCover: '/img/cover.jpg',
    audioAlternatives: {}, ...options.config };
  const container = new Element(), data = new Element('script'), settings = new Element('script'), dock = new Element('details');
  dock.open = false; data.textContent = '[]'; settings.textContent = JSON.stringify(config);
  const playerStatus = new Element('p'), retryPlay = new Element('button'), currentSource = new Element('a');
  retryPlay.setAttribute('data-music-retry-play', '');
  const documentBody = new Element('body'), documentHead = new Element('head'), videoDock = new Element(), videoFrame = new Element();
  const videoTitle = new Element(), videoSource = new Element('a'), videoStatus = new Element(), findVideo = new Element('button'),
    findOpenAudio = new Element('button'), reloadExternal = new Element('button'), changeVersion = new Element('button');
  videoDock.hidden = true; videoFrame.src = '';
  for (const [name, element] of Object.entries({ dock: videoDock, frame: videoFrame, title: videoTitle, source: videoSource, status: videoStatus })) element.setAttribute('data-music-video-' + name, '');
  findVideo.setAttribute('data-music-find-video', '');
  findOpenAudio.setAttribute('data-music-find-open-audio', '');
  reloadExternal.setAttribute('data-music-reload-external', ''); changeVersion.setAttribute('data-music-change-version', '');
  videoDock.append(videoFrame, videoTitle, videoSource, videoStatus, reloadExternal, changeVersion);
  documentBody.append(videoDock, findVideo, findOpenAudio);
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
        remove: index => {
          this.emit('listremove', { index });
          if (!this.list.audios[index]) return;
          if (this.list.audios.length === 1) { this.list.clear(); return; }
          this.list.audios.splice(index, 1);
          if (index === this.list.index) this.list.switch(this.list.audios[index] ? index : index - 1);
          if (this.list.index > index) this.list.index--;
        },
        clear: () => {
          this.emit('listclear'); this.list.index = 0; this.pause(); this.list.audios = [];
          this.audio.src = ''; this.audio.currentTime = 0;
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
    body: documentBody, head: documentHead,
    activeElement: null,
    getElementById: id => ({ 'kagiel-player': container, 'site-music-data': data, 'site-music-config': settings })[id] || null,
    querySelector: selector => ({
      '[data-music-browser]': browser, '[data-music-player-status]': playerStatus,
      '[data-music-retry-play]': retryPlay, '[data-music-current-source]': currentSource, '.music-dock': dock,
      '[data-music-video-dock]': videoDock, '[data-music-video-frame]': videoFrame,
      '[data-music-video-title]': videoTitle, '[data-music-video-source]': videoSource,
      '[data-music-video-status]': videoStatus, '[data-music-find-video]': findVideo,
      '[data-music-find-open-audio]': findOpenAudio, '[data-music-reload-external]': reloadExternal, '[data-music-change-version]': changeVersion
    })[selector] || null,
    querySelectorAll: selector => browser?.querySelectorAll(selector) || [],
    createElement: tag => new Element(tag),
    addEventListener: (name, listener) => { (listeners[name] ||= []).push(listener); }
  };
  const context = {
    document, APlayer, AbortController, URL, queueMicrotask, setTimeout: setTimer, clearTimeout: clearTimer,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    SiteMusicSource: {
      escapeHtml,
      parsePlaylistId,
      officialAudioUrl: options.withoutOfficialFallback ? undefined : officialAudioUrl,
      parseVideoId, parseVideoLink, videoEmbedUrl, videoSearchUrl, parseSoundCloudUrl, soundCloudEmbedUrl, soundCloudSearchUrl,
      createClient: () => ({
        request: (type, id, options) => new Promise((resolve, reject) => { requests.push({ type, id, signal: options.signal, resolve, reject }); }),
        check: track => Promise.resolve(checks.get(track.id) || 'unknown')
      }),
      createVideoClient: () => ({
        request: (query, options) => new Promise((resolve, reject) => { videoRequests.push({ query, signal: options.signal, resolve, reject }); }),
        ...(options.videoInspect ? { inspect: (value, options) => new Promise((resolve, reject) => {
          videoInspections.push({ value, signal: options.signal, resolve, reject });
        }) } : {})
      }),
      createOpenAudioClient: () => ({
        search: (query, options) => new Promise((resolve, reject) => { audioRequests.push({ type: 'search', query, signal: options.signal, resolve, reject }); }),
        track: (value, options = {}) => new Promise((resolve, reject) => { audioRequests.push({ type: 'track', value, signal: options.signal, resolve, reject }); })
      })
    }
  };
  if (options.widget !== false) {
    const Widget = frame => {
      const bindings = new Map(), savedBindings = new Map();
      const widget = { frame, pauseCalls: 0, playCalls: 0,
        bind(event, listener) { bindings.set(event, listener); savedBindings.set(event, listener); },
        unbind(event) { bindings.delete(event); },
        pause() { this.pauseCalls++; }, play() { this.playCalls++; },
        isPaused(callback) { callback(true); },
        getDuration(callback) { callback(189000); },
        emit(event, value) { bindings.get(Widget.Events[event] || event)?.(value); },
        emitSaved(event, value) { savedBindings.get(Widget.Events[event] || event)?.(value); }
      };
      widgets.push(widget); return widget;
    };
    Widget.Events = { READY: 'ready', PLAY: 'play', PAUSE: 'pause', ERROR: 'error', FINISH: 'finish' };
    context.SC = { Widget };
  }
  context.window = context;
  const rerun = () => vm.runInNewContext(source, context);
  rerun();
  const mountBrowser = () => {
    browser = new Element(); browser.setAttribute('data-music-browser', '');
    for (const name of ['list-title', 'browser-status', 'retry-list', 'results', 'playlist-source', 'playlist-error', 'input-source', 'more',
      'video-tools', 'video-search-link', 'video-error', 'audio-tools', 'audio-search-link', 'audio-error']) {
      const element = new Element(name === 'retry-list' || name === 'more' ? 'button' : 'div');
      element.setAttribute('data-music-' + name, ''); controls[name] = element; browser.append(element);
    }
    for (const name of ['playlist', 'keyword', 'videoLink', 'audioLink']) {
      const input = new Element('input'); input.setAttribute('name', name); controls[name] = input;
      const form = new Element('form'); form.setAttribute(name === 'playlist' ? 'data-music-playlist-form' : name === 'videoLink'
        ? 'data-music-video-form' : name === 'audioLink' ? 'data-music-audio-form' : 'data-music-search-form', '');
      form.elements = { [name]: input }; form.append(input); browser.append(form); controls[name + '-form'] = form;
    }
    for (const view of ['playlist', 'search']) { const button = new Element('button'); button.setAttribute('data-music-view', view); browser.append(button); }
    for (const provider of ['netease', 'bilibili', 'soundcloud']) { const button = new Element('button'); button.setAttribute('data-music-provider', provider); browser.append(button); controls[provider] = button; }
    return browser;
  };
  const dispatch = (name, event = {}) => (listeners[name] || []).forEach(listener => listener(event));
  const click = target => dispatch('click', { target, preventDefault() {} });
  return { context, music: context.siteMusic, requests, checks, videoRequests, videoInspections, audioRequests, widgets, timers, instances, controls,
    listeners, dock, data, playerStatus, retryPlay, currentSource, videoDock, videoFrame, videoTitle, videoSource, videoStatus, findVideo,
    findOpenAudio, reloadExternal, changeVersion,
    documentBody, documentHead, mountBrowser, dispatch, click, rerun, storage, config };
}

async function load(h, tracks = [song('1'), song('2')], id = '123') {
  const pending = h.music.loadPlaylist(id);
  h.requests.at(-1).resolve(tracks);
  await pending; await settle();
}

function fireTimer(h, ms) {
  const pending = [...h.timers].find(([, timer]) => timer.ms === ms);
  assert.ok(pending, `expected a pending ${ms} ms timer`);
  h.timers.delete(pending[0]);
  pending[1].fn();
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

test('a media failure marks the song locked and skips to the next one without the vendor timer', async () => {
  const h = harness({ withoutOfficialFallback: true }); await load(h); h.music.playTrack('netease:1');
  const player = h.music.player;
  player.emit('error'); await settle();
  assert.equal(player.list.index, 1);
  assert.equal(player.audio.src, song('2').url);
  assert.equal(player.audio.paused, false);
  assert.match(h.playerStatus.textContent, /暂无音源.*歌曲 2/);
  assert.equal([...h.timers.values()].some(timer => timer.ms === 2000), false, 'the vendor 2-second skip must be cancelled');
  assert.equal(h.requests.length, 1, 'failure must not load more metadata automatically');
  h.music.playTrack('netease:1');
  assert.equal(player.list.index, 1, 'a locked song is not played again');
  assert.match(h.playerStatus.textContent, /会员或暂无版权/);
});

test('when every song is locked the player stops and offers a retry that clears the locks', async () => {
  const h = harness({ withoutOfficialFallback: true }); await load(h); h.music.playTrack('netease:1');
  const player = h.music.player;
  player.emit('error'); await settle();
  player.emit('error'); await settle();
  assert.equal(player.audio.paused, true);
  assert.equal(h.retryPlay.hidden, false);
  assert.match(h.playerStatus.textContent, /暂时无法播放/);
  assert.equal(h.timers.size, 0, 'both the timeout and the vendor 2-second skip must be cancelled');
  h.click(h.retryPlay); await settle();
  assert.equal(player.audio.paused, false);
  assert.equal(h.retryPlay.hidden, true);
});

test('a song that already played reconnects once from the same position before it is skipped', async () => {
  const h = harness({ withoutOfficialFallback: true }); await load(h); h.music.playTrack('netease:1');
  const player = h.music.player;
  player.emit('playing'); player.audio.currentTime = 95;
  player.emit('error'); await settle();
  assert.equal(player.list.index, 0);
  assert.equal(player.audio.currentTime, 95);
  assert.equal(player.audio.paused, false);
  assert.match(h.playerStatus.textContent, /重新连接/);
  player.emit('error'); await settle();
  assert.equal(player.list.index, 1);
});

test('automatic switches skip songs the mirror reports as locked before they stall', async () => {
  const h = harness({ withoutOfficialFallback: true }); await load(h, [song('1'), song('2'), song('3')]);
  h.checks.set('netease:2', 'unavailable');
  h.music.playTrack('netease:1');
  h.music.player.skipForward(); await settle(); await settle();
  assert.equal(h.music.player.list.index, 2);
  assert.equal(h.music.player.audio.src, song('3').url);
  assert.equal(h.music.player.audio.paused, false);
});

test('the first media failure tries the official public source for the same song and cancels vendor auto skip', async () => {
  const h = harness(); await load(h); h.music.playTrack('netease:1');
  const player = h.music.player, selected = player.list.index, priorSwitches = player.switches.length;
  player.emit('error'); await settle();
  assert.equal(player.paused, false);
  assert.equal(player.audio.paused, false);
  assert.equal(player.list.index, selected);
  assert.equal(player.switches.length, priorSwitches + 1);
  assert.equal(player.switches.at(-1).url, song('1').url);
  assert.equal(player.audio.src, officialAudioUrl(song('1')));
  assert.equal(h.currentSource.href, song('1').sourceUrl);
  assert.equal(h.retryPlay.hidden, true);
  assert.equal([...h.timers.values()].some(timer => timer.ms === 2000), false, 'the vendor skip must be cancelled before fallback playback');
  assert.equal([...h.timers.values()].filter(timer => timer.ms === h.config.timeoutMs).length, 1, 'fallback playback must have one bounded load timeout');
  assert.equal(h.requests.length, 1, 'fallback must not reload song metadata');
});

test('successful public fallback clears its load timeout and survives PJAX', async () => {
  const h = harness(); await load(h); h.music.playTrack('netease:1');
  const player = h.music.player;
  player.emit('error'); await settle();
  player.audio.readyState = 4; player.emit('playing');
  assert.equal(h.timers.size, 0);
  player.audio.currentTime = 47;
  h.rerun(); h.dispatch('pjax:send'); h.mountBrowser(); h.dispatch('pjax:complete'); await settle();
  assert.equal(h.context.siteMusic.player, player);
  assert.equal(h.instances.length, 1);
  assert.equal(player.audio.src, officialAudioUrl(song('1')));
  assert.equal(player.audio.currentTime, 47);
  assert.equal(player.audio.paused, false);
  assert.equal(h.requests.length, 1);
  assert.equal(h.retryPlay.hidden, true);
});

test('clicking the same song resumes a successful fallback at its existing position', async () => {
  const h = harness(); await load(h, [song('1')]); h.music.playTrack('netease:1');
  const player = h.music.player;
  player.emit('error'); await settle();
  player.audio.readyState = 4; player.emit('playing');
  player.audio.currentTime = 47; player.pause();
  const previousSwitches = player.switches.length;
  h.music.playTrack('netease:1'); await settle();
  assert.equal(player.audio.src, officialAudioUrl(song('1')));
  assert.equal(player.audio.currentTime, 47);
  assert.equal(player.switches.length, previousSwitches);
  assert.equal(player.audio.paused, false);
  player.emit('error'); await settle();
  assert.equal(player.audio.paused, true, 'resuming the same fallback must not grant another automatic fallback');
  assert.equal(h.retryPlay.hidden, false);
  assert.equal(h.timers.size, 0);
});

test('a second media failure stops on the same song and exposes retry and the official page', async () => {
  const h = harness(); await load(h, [song('1')]); h.music.playTrack('netease:1');
  const player = h.music.player, selected = player.list.index;
  player.emit('error'); await settle();
  assert.equal(player.audio.src, officialAudioUrl(song('1')));
  player.emit('error'); await settle();
  assert.equal(player.paused, true);
  assert.equal(player.audio.paused, true);
  assert.equal(player.list.index, selected);
  assert.equal(h.retryPlay.hidden, false);
  assert.match(h.playerStatus.textContent, /暂时无法播放/);
  assert.equal(h.currentSource.href, song('1').sourceUrl);
  assert.equal(h.timers.size, 0, 'both the timeout and the vendor 2-second skip must be cancelled');
  assert.equal(h.requests.length, 1, 'failure must not load more metadata automatically');
});

test('a public source load timeout stops instead of repeatedly falling back', async () => {
  const h = harness(); await load(h, [song('1')]); h.music.playTrack('netease:1');
  const player = h.music.player;
  player.emit('error'); await settle();
  const previousPlays = player.playCalls;
  fireTimer(h, h.config.timeoutMs); await settle();
  assert.equal(player.audio.paused, true);
  assert.equal(player.list.index, 0);
  assert.equal(player.playCalls, previousPlays);
  assert.equal(h.retryPlay.hidden, false);
  assert.equal(h.currentSource.href, song('1').sourceUrl);
  assert.equal(h.timers.size, 0);
});

test('late repeated source errors remain stopped and never schedule another fallback or vendor skip', async () => {
  const h = harness(); await load(h, [song('1')]); h.music.playTrack('netease:1');
  const player = h.music.player;
  player.emit('error'); await settle();
  player.emit('error'); await settle();
  const previousPlays = player.playCalls;
  for (let index = 0; index < 3; index++) { player.emit('error'); await settle(); }
  assert.equal(player.playCalls, previousPlays);
  assert.equal(player.audio.paused, true);
  assert.equal(player.list.index, 0);
  assert.equal(h.retryPlay.hidden, false);
  assert.equal(h.timers.size, 0);
});

test('an explicit retry restarts the original source and permits one public fallback again', async () => {
  const h = harness(); await load(h, [song('1')]); h.music.playTrack('netease:1');
  const player = h.music.player, selected = player.list.index;
  player.emit('error'); await settle(); player.emit('error'); await settle();
  h.click(h.retryPlay); await settle();
  assert.equal(player.audio.paused, false);
  assert.equal(player.list.index, selected);
  assert.equal(player.audio.src, song('1').url);
  assert.equal(h.retryPlay.hidden, true);
  assert.equal([...h.timers.values()].some(timer => timer.ms === 2000), false);
  player.emit('error'); await settle();
  assert.equal(player.audio.src, officialAudioUrl(song('1')));
  assert.equal(player.audio.paused, false);
  player.emit('error'); await settle();
  assert.equal(player.audio.paused, true);
  assert.equal(h.retryPlay.hidden, false);
  assert.equal(h.timers.size, 0);
});

test('selecting another song gives that song its own bounded fallback attempt', async () => {
  const h = harness(); await load(h); h.music.playTrack('netease:1');
  const player = h.music.player;
  player.emit('error'); await settle(); player.emit('error'); await settle();
  h.music.playTrack('netease:2'); await settle();
  assert.equal(player.audio.src, song('2').url);
  player.emit('error'); await settle();
  assert.equal(player.list.index, 1);
  assert.equal(player.audio.src, officialAudioUrl(song('2')));
  assert.equal(player.audio.paused, false);
  assert.equal(h.currentSource.href, song('2').sourceUrl);
  player.emit('error'); await settle();
  assert.equal(player.audio.paused, true);
  assert.equal(h.timers.size, 0);
});

test('resuming from a terminal error retries the original source and resets the bounded fallback', async () => {
  const h = harness(); await load(h, [song('1')]); h.music.playTrack('netease:1');
  const player = h.music.player;
  player.emit('error'); await settle(); player.emit('error'); await settle();
  player.play(); await settle();
  assert.equal(player.audio.src, song('1').url);
  assert.equal(player.audio.paused, false);
  assert.equal(h.retryPlay.hidden, true);
  player.emit('error'); await settle();
  assert.equal(player.audio.src, officialAudioUrl(song('1')));
  player.emit('error'); await settle();
  assert.equal(player.audio.paused, true);
  assert.equal(h.timers.size, 0);
});

test('a missing optional fallback helper retains the bounded error and explicit retry behavior', async () => {
  const h = harness({ withoutOfficialFallback: true }); await load(h, [song('1')]); h.music.playTrack('netease:1');
  const player = h.music.player;
  player.emit('error'); await settle();
  assert.equal(player.audio.paused, true);
  assert.equal(player.list.index, 0);
  assert.equal(player.audio.src, song('1').url);
  assert.equal(h.retryPlay.hidden, false);
  assert.equal(h.timers.size, 0);
  h.click(h.retryPlay); await settle();
  assert.equal(player.audio.paused, false);
  assert.equal(player.audio.src, song('1').url);
  assert.equal(h.retryPlay.hidden, true);
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

test('changing playlists replaces upcoming songs while preserving the current source and position', async () => {
  const h = harness(); h.mountBrowser(); await load(h); h.music.playTrack('netease:1');
  const player = h.music.player; player.audio.currentTime = 61;
  await load(h, [song('3'), song('4')], '456');
  assert.deepEqual(Array.from(player.list.audios, item => item.id), ['netease:1', 'netease:3', 'netease:4']);
  assert.deepEqual(JSON.parse(h.data.textContent).map(item => item.id), ['netease:1', 'netease:3', 'netease:4']);
  assert.equal(player.audio.src, song('1').url);
  assert.equal(player.audio.currentTime, 61);
  assert.equal(player.audio.paused, false);
  assert.deepEqual(h.controls.results.querySelectorAll('h2').map(element => element.textContent), ['歌曲 3', '歌曲 4']);
  h.music.playTrack('netease:3'); await settle();
  assert.equal(player.audio.src, song('3').url);
  assert.deepEqual(Array.from(player.list.audios, item => item.id), ['netease:1', 'netease:3', 'netease:4']);
});

test('replacing a playlist removes rows before the selected song without reloading that song', async () => {
  const h = harness(); h.mountBrowser(); await load(h); h.music.playTrack('netease:2');
  const player = h.music.player; player.audio.currentTime = 88;
  const previousSwitches = player.switches.length, previousPlays = player.playCalls;
  await load(h, [song('2'), song('3'), song('4')], '456');
  assert.deepEqual(Array.from(player.list.audios, item => item.id), ['netease:2', 'netease:3', 'netease:4']);
  assert.equal(player.list.index, 0);
  assert.equal(player.audio.src, song('2').url);
  assert.equal(player.audio.currentTime, 88);
  assert.equal(player.audio.paused, false);
  assert.equal(player.switches.length, previousSwitches, 'removing preceding rows must not reselect the current song');
  assert.equal(player.playCalls, previousPlays);
  player.skipForward(); await settle();
  assert.equal(player.audio.src, song('3').url, 'the next song must belong to the newly loaded playlist');
  assert.equal(h.currentSource.href, song('3').sourceUrl);
});

test('changing a paused playlist replaces the full old queue without starting playback', async () => {
  const h = harness(); h.mountBrowser(); await load(h);
  h.music.player.list.switch(1); h.music.player.audio.currentTime = 47;
  const previousPlays = h.music.player.playCalls;
  await load(h, [song('3'), song('4')], '456');
  assert.deepEqual(Array.from(h.music.player.list.audios, item => item.id), ['netease:3', 'netease:4']);
  assert.deepEqual(JSON.parse(h.data.textContent).map(item => item.id), ['netease:3', 'netease:4']);
  assert.equal(h.music.player.audio.src, song('3').url);
  assert.equal(h.music.player.audio.paused, true);
  assert.equal(h.music.player.playCalls, previousPlays);
  assert.equal(h.timers.size, 0);
});

test('legacy saved defaults and selections from a different default cannot override the new site playlist', () => {
  for (const storage of [
    { 'site-music-playlist': '3778678' },
    { 'site-music-playlist-v2': JSON.stringify({ id: '456', defaultId: '3778678' }) },
    { 'site-music-playlist-v2': '{broken' },
    { 'site-music-playlist-v2': JSON.stringify({ id: 'not an ID', defaultId: '13512426282' }) }
  ]) {
    const h = harness({ storage, config: { playlistId: '13512426282', playlistName: '記憶' } });
    h.mountBrowser(); h.dispatch('pjax:complete');
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].id, '13512426282');
    assert.equal(h.controls['list-title'].textContent, '記憶');
  }
});

test('a successfully selected playlist persists across reloads within the same default', async () => {
  const h = harness(); await load(h, [song('3')], '456');
  assert.deepEqual(JSON.parse(h.storage.get('site-music-playlist-v2')), { id: '456', defaultId: '123' });
  const restored = harness({ storage: Object.fromEntries(h.storage) });
  restored.mountBrowser(); restored.dispatch('pjax:complete');
  assert.equal(restored.requests[0].id, '456');
  const failed = h.music.loadPlaylist('789'); h.requests.at(-1).reject(new TypeError('Failed to fetch')); await failed;
  assert.equal(JSON.parse(h.storage.get('site-music-playlist-v2')).id, '456', 'a failed load must not replace the saved working selection');
});

test('invalid playlist submissions retain the pasted text and expose a useful correction', async () => {
  const h = harness(); h.mountBrowser(); await load(h);
  const draft = '分享歌单: 另一份 https://163cn.tv/unknown (@网易云音乐)';
  h.controls.playlist.value = draft; h.dispatch('input', { target: h.controls.playlist });
  h.context.document.activeElement = null;
  h.dispatch('submit', { target: h.controls['playlist-form'], preventDefault() {} });
  assert.equal(h.requests.length, 1, 'invalid input must not start a provider request');
  assert.equal(h.controls.playlist.value, draft);
  assert.match(h.controls['playlist-error'].textContent, /打开.*分享链接.*完整歌单链接/);
  assert.equal(h.controls['input-source'].hidden, false);
  assert.equal(h.controls['input-source'].href, 'https://163cn.tv/unknown');
  h.dispatch('pjax:send'); h.mountBrowser(); h.dispatch('pjax:complete');
  assert.equal(h.controls.playlist.value, draft, 'the correction draft must also survive a PJAX page remount');
});

test('an in-flight response cannot erase a blurred playlist input draft', async () => {
  const h = harness(); h.mountBrowser();
  const pending = h.music.loadPlaylist('123');
  h.controls.playlist.value = 'https://music.163.com/m/playlist?id=456&sharedId=789';
  h.dispatch('input', { target: h.controls.playlist }); h.context.document.activeElement = null;
  h.requests[0].resolve([song('1')]); await pending;
  assert.equal(h.controls.playlist.value, 'https://music.163.com/m/playlist?id=456&sharedId=789');
});

test('a shared short-link form submission sends the numeric ID and updates the queue only after success', async () => {
  const h = harness({ config: { playlistAliases: { 'https://163cn.tv/birPYWIu': '13512426282' } } });
  h.mountBrowser(); await load(h); h.music.playTrack('netease:2'); h.music.player.audio.currentTime = 32;
  h.controls.playlist.value = '分享共享歌单: 記憶 https://163cn.tv/birPYWIu (@网易云音乐)';
  h.dispatch('input', { target: h.controls.playlist });
  h.dispatch('submit', { target: h.controls['playlist-form'], preventDefault() {} });
  assert.equal(h.requests.at(-1).id, '13512426282');
  assert.deepEqual(Array.from(h.music.player.list.audios, item => item.id), ['netease:1', 'netease:2']);
  h.requests.at(-1).resolve([song('3'), song('4')]); await settle();
  assert.deepEqual(Array.from(h.music.player.list.audios, item => item.id), ['netease:2', 'netease:3', 'netease:4']);
  assert.equal(h.music.player.audio.currentTime, 32);
  assert.equal(h.music.player.audio.paused, false);
  assert.equal(JSON.parse(h.storage.get('site-music-playlist-v2')).id, '13512426282');
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
    h.music.playTrack(type === 'search' ? 'netease:9' : 'netease:999');
    assert.deepEqual(Array.from(player.list.audios, item => item.id), type === 'search' ? ['netease:1', 'netease:2'] : ['netease:1', 'netease:9']);
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

test('a newer video search wins after an aborted older request resolves late', async () => {
  const h = harness(); h.mountBrowser();
  const older = h.music.searchVideos('旧视频'), newer = h.music.searchVideos('新视频');
  assert.equal(h.videoRequests.length, 2);
  assert.equal(h.videoRequests[0].signal.aborted, true);
  h.videoRequests[1].resolve([video('BV1124y1x72L', '新视频结果')]); await newer;
  assert.equal(h.controls.results.querySelector('h2').textContent, '新视频结果');
  h.videoRequests[0].resolve([video('BV1xx411c7mD', '旧视频结果')]); await older;
  assert.equal(h.controls.results.querySelector('h2').textContent, '新视频结果');
  assert.equal(h.videoFrame.querySelector('iframe'), null, 'search results must not select or play a video automatically');
  assert.equal(h.videoDock.hidden, true);
  assert.equal(h.music.player.list.audios.length, 0);
  assert.equal(h.requests.length, 0, 'video search must use its independent client');
});

test('video and music searches retain independent results and request cancellation', async () => {
  const h = harness(); h.mountBrowser();
  const musicSearch = h.music.search('音频关键词');
  const videoSearch = h.music.searchVideos('视频关键词');
  assert.equal(h.requests[0].signal.aborted, false);
  assert.equal(h.videoRequests[0].signal.aborted, false);
  h.requests[0].resolve([song('7', '音频搜索结果')]); await musicSearch;
  h.videoRequests[0].resolve([video('BV1124y1x72L', '视频搜索结果')]); await videoSearch;
  assert.equal(h.controls.results.querySelector('h2').textContent, '视频搜索结果');
  h.click(h.controls.netease);
  assert.equal(h.controls.results.querySelector('h2').textContent, '音频搜索结果');
  assert.equal(h.controls.keyword.value, '音频关键词');
  h.click(h.controls.bilibili);
  assert.equal(h.controls.results.querySelector('h2').textContent, '视频搜索结果');
  assert.equal(h.controls.keyword.value, '视频关键词');
  assert.equal(h.music.player.playCalls, 0);
});

test('video search failure clears previous results and leaves official search and manual input available', async () => {
  const h = harness(); h.mountBrowser();
  const first = h.music.searchVideos('已有视频');
  h.videoRequests[0].resolve([video()]); await first;
  const second = h.music.searchVideos('无法连接');
  assert.equal(h.controls.results.querySelectorAll('h2').length, 0);
  h.videoRequests[1].reject(new TypeError('Failed to fetch')); await second; await settle();
  assert.equal(h.controls.results.querySelectorAll('h2').length, 0);
  assert.match(h.controls['browser-status'].textContent, /搜索|哔哩哔哩|不可用/);
  assert.equal(h.controls['video-search-link'].href, videoSearchUrl('无法连接'));
  assert.equal(h.controls['video-tools'].hidden, false);
  assert.equal(h.controls['retry-list'].hidden, false);
  assert.equal(h.controls.results.getAttribute('aria-busy'), 'false');
  assert.equal(h.videoRequests.length, 2, 'failure must not start retries or video playback automatically');
  assert.equal(h.videoFrame.querySelector('iframe'), null);
  h.click(h.controls['retry-list']);
  assert.equal(h.videoRequests.length, 3, 'an explicit retry uses only the video provider');
  assert.equal(h.requests.length, 0);
  assert.equal(h.videoRequests[2].query, '无法连接');
  h.videoRequests[2].resolve([]); await settle();
});

test('opening an official video pauses audio, clears its timeout and does not replace the song queue', async () => {
  const h = harness(); h.mountBrowser(); await load(h); h.music.playTrack('netease:1');
  const player = h.music.player, priorQueue = Array.from(player.list.audios, item => item.id);
  player.audio.currentTime = 47;
  assert.equal([...h.timers.values()].filter(timer => timer.ms === h.config.timeoutMs).length, 1);
  assert.equal(h.music.openVideo('https://www.bilibili.com/video/BV1124y1x72L'), true);
  const frame = h.videoFrame.querySelector('iframe');
  assert.ok(frame);
  assert.equal(frame.src, videoEmbedUrl('BV1124y1x72L'));
  assert.equal(player.audio.paused, true);
  assert.equal(player.audio.currentTime, 47);
  assert.equal(h.timers.size, 0);
  assert.deepEqual(Array.from(player.list.audios, item => item.id), priorQueue);
  assert.equal(h.videoSource.href, 'https://www.bilibili.com/video/BV1124y1x72L');
  assert.equal(h.videoDock.hidden, false);
  assert.equal(h.documentBody.classList.contains('music-video-open'), true);
  assert.equal(h.videoRequests.length, 0, 'a validated direct link requires no search');
  const previousPlays = player.playCalls;
  h.music.closeVideo();
  assert.equal(h.videoFrame.querySelector('iframe'), null);
  assert.equal(h.videoDock.hidden, true);
  assert.equal(h.documentBody.classList.contains('music-video-open'), false);
  assert.equal(player.audio.paused, true, 'closing a video must not resume audio unexpectedly');
  assert.equal(player.playCalls, previousPlays);
});

test('invalid video values cannot create arbitrary iframes or interrupt audio', async () => {
  const h = harness(); h.mountBrowser(); await load(h); h.music.playTrack('netease:1');
  const player = h.music.player;
  for (const value of ['javascript:alert(1)', 'https://example.com/video/BV1124y1x72L', '<iframe src="https://example.com">', 'https://www.bilibili.com.evil.example/video/BV1124y1x72L']) {
    assert.equal(h.music.openVideo(value), false);
    assert.equal(h.videoFrame.querySelector('iframe'), null);
    assert.equal(h.videoDock.hidden, true);
    assert.equal(player.audio.paused, false);
    assert.equal(player.audio.src, song('1').url);
  }
  assert.equal(h.videoRequests.length, 0);
  assert.equal(h.requests.length, 1);
  assert.ok(h.controls['video-error'].textContent, 'invalid values must expose a correction beside the input');
});

test('native audio play closes an active video before its audio timeout starts', async () => {
  const h = harness(); await load(h); h.music.openVideo('BV1124y1x72L');
  assert.ok(h.videoFrame.querySelector('iframe'));
  h.music.player.play(); await settle();
  assert.equal(h.videoFrame.querySelector('iframe'), null);
  assert.equal(h.videoDock.hidden, true);
  assert.equal(h.documentBody.classList.contains('music-video-open'), false);
  assert.equal(h.music.player.audio.paused, false);
  assert.equal([...h.timers.values()].filter(timer => timer.ms === h.config.timeoutMs).length, 1);
});

test('an active iframe keeps its identity through PJAX and repeated script execution', async () => {
  const h = harness(); await load(h); h.music.openVideo('BV1124y1x72L');
  const player = h.music.player, frame = h.videoFrame.querySelector('iframe');
  const counts = Object.fromEntries(Object.entries(h.listeners).map(([name, handlers]) => [name, handlers.length]));
  h.rerun(); h.dispatch('pjax:send'); h.mountBrowser(); h.dispatch('pjax:complete'); await settle();
  assert.equal(h.music.player, player);
  assert.equal(h.instances.length, 1);
  assert.equal(h.videoFrame.querySelector('iframe'), frame);
  assert.equal(frame.src, videoEmbedUrl('BV1124y1x72L'));
  assert.equal(h.videoDock.hidden, false);
  assert.equal(h.music.player.audio.paused, true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.videoRequests.length, 0);
  assert.deepEqual(Object.fromEntries(Object.entries(h.listeners).map(([name, handlers]) => [name, handlers.length])), counts);
});

test('PJAX aborts pending video search and ignores a late result without closing the active iframe', async () => {
  const h = harness(); h.mountBrowser(); await load(h); h.music.openVideo('BV1124y1x72L');
  const frame = h.videoFrame.querySelector('iframe');
  const pending = h.music.searchVideos('离开的搜索');
  h.dispatch('pjax:send');
  assert.equal(h.videoRequests[0].signal.aborted, true);
  h.videoRequests[0].resolve([video('BV1xx411c7mD', '过期结果')]); await pending;
  h.mountBrowser(); h.dispatch('pjax:complete'); await settle();
  assert.equal(h.videoFrame.querySelector('iframe'), frame);
  assert.equal(h.controls.results.querySelectorAll('h2').length, 0);
  assert.equal(h.videoRequests.length, 1);
  const next = h.music.searchVideos('重新搜索');
  h.videoRequests[1].resolve([video('BV1xx411c7mD', '新结果')]); await next;
  assert.equal(h.controls.results.querySelector('h2').textContent, '新结果');
  assert.equal(h.videoFrame.querySelector('iframe'), frame, 'searching must not switch the currently selected video');
});

test('provider form submission searches videos and a result opens only after explicit selection', async () => {
  const h = harness(); h.mountBrowser(); await load(h);
  h.click(h.controls.bilibili);
  h.controls.keyword.value = '公开视频';
  h.dispatch('submit', { target: h.controls['keyword-form'], preventDefault() {} });
  assert.equal(h.videoRequests.length, 1);
  assert.equal(h.videoRequests[0].query, '公开视频');
  h.videoRequests[0].resolve([video('BV1124y1x72L', '明确选择的视频')]); await settle();
  assert.equal(h.videoFrame.querySelector('iframe'), null);
  const play = h.controls.results.querySelector('[data-video-id]');
  assert.ok(play);
  h.click(play);
  assert.equal(h.videoFrame.querySelector('iframe').src, videoEmbedUrl('BV1124y1x72L'));
  assert.match(h.videoTitle.textContent, /明确选择的视频/);
  assert.deepEqual(Array.from(h.music.player.list.audios, item => item.id), ['netease:1', 'netease:2']);
  assert.equal(h.music.player.playCalls, 0);
});

test('a song video-search action uses its title and artist while audio continues until selection', async () => {
  const h = harness(); h.mountBrowser(); await load(h); h.music.playTrack('netease:1');
  const frameAction = h.controls.results.querySelector('[data-track-video]');
  assert.ok(frameAction);
  h.click(frameAction);
  assert.equal(h.videoRequests.length, 1);
  assert.equal(h.videoRequests[0].query, song('1').name + ' ' + song('1').artist);
  assert.equal(h.music.player.audio.paused, false);
  assert.equal(h.videoFrame.querySelector('iframe'), null);
  h.videoRequests[0].resolve([video()]); await settle();
  assert.equal(h.music.player.audio.paused, false);
  assert.equal(h.videoFrame.querySelector('iframe'), null);
});

test('manual video form rejects unrelated links and accepts a full official BV link', async () => {
  const h = harness(); h.mountBrowser();
  h.controls.videoLink.value = 'https://example.com/video/BV1124y1x72L';
  h.dispatch('submit', { target: h.controls['videoLink-form'], preventDefault() {} });
  assert.equal(h.videoFrame.querySelector('iframe'), null);
  assert.ok(h.controls['video-error'].textContent);
  assert.equal(h.videoRequests.length, 0);
  h.controls.videoLink.value = 'https://www.bilibili.com/video/BV1124y1x72L';
  h.dispatch('submit', { target: h.controls['videoLink-form'], preventDefault() {} });
  assert.equal(h.videoFrame.querySelector('iframe').src, videoEmbedUrl('BV1124y1x72L'));
  assert.equal(h.controls['video-error'].textContent, '');
  assert.equal(h.videoRequests.length, 0, 'manual selection must not trigger song searches');
});

test('iframe loading failure retains the official page link without auto retries or audio restart', async () => {
  const h = harness(); h.mountBrowser(); await load(h); h.music.playTrack('netease:1');
  h.music.openVideo('BV1124y1x72L');
  const frame = h.videoFrame.querySelector('iframe'), previousPlays = h.music.player.playCalls;
  assert.ok((frame.listeners.error || []).length, 'iframe load failures must have a visitor-facing fallback');
  for (let index = 0; index < 3; index++) (frame.listeners.error || []).forEach(listener => listener({ target: frame }));
  await settle();
  assert.equal(h.videoSource.href, 'https://www.bilibili.com/video/BV1124y1x72L');
  assert.match(h.videoStatus.textContent, /哔哩哔哩|播放|页面/);
  assert.equal(h.videoRequests.length, 0);
  assert.equal(h.requests.length, 1);
  assert.equal(h.music.player.audio.paused, true);
  assert.equal(h.music.player.playCalls, previousPlays);
  assert.equal(h.timers.size, 0);
});

test('a dock video search started outside the music page survives navigation to its results', async () => {
  const h = harness(); await load(h); h.music.playTrack('netease:1');
  h.click(h.findVideo);
  assert.equal(h.videoRequests.length, 1);
  assert.equal(h.videoRequests[0].query, song('1').name + ' ' + song('1').artist);
  h.dispatch('pjax:send');
  assert.equal(h.videoRequests[0].signal.aborted, false, 'entering the music page must retain the dock request initiated by the visitor');
  h.mountBrowser(); h.dispatch('pjax:complete');
  h.videoRequests[0].resolve([video('BV1124y1x72L', '从悬浮播放器找到的视频')]); await settle();
  assert.equal(h.controls.results.querySelector('h2').textContent, '从悬浮播放器找到的视频');
  assert.equal(h.controls.keyword.value, song('1').name + ' ' + song('1').artist);
  assert.equal(h.music.player.audio.paused, false);
  assert.equal(h.videoFrame.querySelector('iframe'), null);
  assert.equal(h.requests.length, 1);
});

test('opening the selected video again preserves its iframe instead of restarting it', async () => {
  const h = harness(); h.music.openVideo('BV1124y1x72L');
  const frame = h.videoFrame.querySelector('iframe');
  h.music.openVideo('https://www.bilibili.com/video/BV1124y1x72L');
  assert.equal(h.videoFrame.querySelector('iframe'), frame);
  assert.equal(h.videoRequests.length, 0);
  assert.equal(h.requests.length, 0);
});

async function importOpenAudio(h, track = openAudio()) {
  const pending = h.music.openAudio(track.permalinkUrl);
  const metadata = h.audioRequests.at(-1);
  assert.equal(metadata.type, 'track');
  assert.equal(metadata.value, track.permalinkUrl);
  metadata.resolve(track);
  await pending; await settle();
  return h.videoFrame.querySelector('iframe');
}

test('a newer public audio search wins without selecting stale or current results automatically', async () => {
  const h = harness(); h.mountBrowser(); await load(h);
  const before = Array.from(h.music.player.list.audios, item => item.id);
  const older = h.music.searchOpenAudio('旧公开歌曲'), newer = h.music.searchOpenAudio('新公开歌曲');
  assert.equal(h.audioRequests.length, 2);
  assert.equal(h.audioRequests[0].signal.aborted, true);
  h.audioRequests[1].resolve([openAudio('123456', '最新公开结果')]); await newer;
  assert.equal(h.controls.results.querySelector('h2').textContent, '最新公开结果');
  h.audioRequests[0].resolve([openAudio('654321', '过期公开结果')]); await older; await settle();
  assert.equal(h.controls.results.querySelector('h2').textContent, '最新公开结果');
  assert.deepEqual(Array.from(h.music.player.list.audios, item => item.id), before);
  assert.equal(h.videoFrame.querySelector('iframe'), null);
  assert.equal(h.music.player.playCalls, 0);
});

test('public audio metadata validation preserves native playback until the requested track is accepted', async () => {
  const h = harness(); h.mountBrowser(); await load(h); h.music.playTrack('netease:1');
  const priorQueue = Array.from(h.music.player.list.audios, item => item.id), track = openAudio();
  const pending = h.music.openAudio(track.permalinkUrl);
  assert.equal(h.audioRequests.length, 1);
  assert.equal(h.audioRequests[0].type, 'track');
  assert.equal(h.music.player.audio.paused, false);
  assert.equal(h.videoFrame.querySelector('iframe'), null);
  h.audioRequests[0].resolve(track); await pending; await settle();
  const frame = h.videoFrame.querySelector('iframe');
  assert.ok(frame);
  assert.equal(frame.src, soundCloudEmbedUrl(track.permalinkUrl));
  assert.equal(new URL(frame.src).searchParams.get('auto_play'), 'false');
  assert.equal(h.videoDock.classList.contains('is-audio'), true);
  assert.equal(h.music.player.audio.paused, true);
  assert.deepEqual(Array.from(h.music.player.list.audios, item => item.id), priorQueue);
  assert.equal(h.videoSource.href, track.permalinkUrl);
  assert.ok(!h.videoStatus.textContent.includes('正在播放'), 'opening a widget must not claim playback');
});

test('failed public audio selection leaves native audio running and does not create an iframe', async () => {
  const h = harness(); h.mountBrowser(); await load(h); h.music.playTrack('netease:1');
  const pending = h.music.openAudio(openAudio().permalinkUrl);
  h.audioRequests[0].reject(Object.assign(new Error('没有公开完整版'), { code: 'AUDIO_UNAVAILABLE' }));
  await pending; await settle();
  assert.equal(h.videoFrame.querySelector('iframe'), null);
  assert.equal(h.music.player.audio.paused, false);
  assert.equal(h.music.player.audio.src, song('1').url);
});

test('public audio Widget events distinguish loading and playback, and ignore callbacks after switching away', async () => {
  const h = harness(); h.mountBrowser(); await load(h);
  await importOpenAudio(h);
  assert.equal(h.widgets.length, 1);
  const widget = h.widgets[0];
  widget.emit('READY');
  assert.ok(!h.videoStatus.textContent.includes('正在播放'));
  widget.emit('PLAY');
  assert.match(h.videoStatus.textContent, /正在播放/);
  widget.emit('PAUSE');
  assert.match(h.videoStatus.textContent, /暂停/);
  widget.emit('FINISH');
  assert.match(h.videoStatus.textContent, /结束/);
  assert.equal(h.music.player.audio.paused, true, 'a separately selected public track must not start the native queue at its end');
  widget.emit('ERROR');
  assert.match(h.videoStatus.textContent, /失败|无法|未能|不可用/);
  h.music.openVideo('BV1124y1x72L');
  const frame = h.videoFrame.querySelector('iframe'), status = h.videoStatus.textContent;
  widget.emitSaved('PLAY'); widget.emitSaved('ERROR');
  assert.equal(h.videoFrame.querySelector('iframe'), frame);
  assert.equal(h.videoStatus.textContent, status, 'a stale widget must not overwrite the selected video status');
});

test('native audio resumes by closing the public widget and PJAX preserves the widget until that selection', async () => {
  const h = harness(); h.mountBrowser(); await load(h);
  const frame = await importOpenAudio(h), nativePlayer = h.music.player;
  h.dispatch('pjax:send'); h.mountBrowser(); h.dispatch('pjax:complete'); await settle();
  assert.equal(h.videoFrame.querySelector('iframe'), frame);
  assert.equal(h.music.player, nativePlayer);
  assert.equal(h.audioRequests.length, 1);
  h.music.playTrack('netease:1'); await settle();
  assert.equal(h.videoFrame.querySelector('iframe'), null);
  assert.equal(h.videoDock.hidden, true);
  assert.equal(h.music.player.audio.paused, false);
  assert.equal(h.music.player.audio.src, song('1').url);
});

test('explicit external player reload replaces a failed iframe without claiming it is playing', async () => {
  const h = harness(); h.mountBrowser(); await load(h);
  const first = await importOpenAudio(h);
  await h.music.reloadExternalPlayer(); await settle();
  const second = h.videoFrame.querySelector('iframe');
  assert.ok(second);
  assert.notEqual(second, first);
  assert.equal(second.src, first.src);
  assert.equal(h.music.player.audio.paused, true);
  assert.ok(!h.videoStatus.textContent.includes('正在播放'));
});

test('video checks reject restricted or removed choices without interrupting the current audio', async () => {
  for (const code of ['VIDEO_RESTRICTED', 'VIDEO_UNAVAILABLE', 'VIDEO_PAGE_UNAVAILABLE']) {
    const h = harness({ videoInspect: true }); h.mountBrowser(); await load(h); h.music.playTrack('netease:1');
    const pending = h.music.openVideo('BV1124y1x72L');
    assert.equal(h.videoInspections.length, 1);
    assert.equal(h.music.player.audio.paused, false);
    h.videoInspections[0].reject(Object.assign(new Error('请换一个公开版本'), { code }));
    await pending; await settle();
    assert.equal(h.videoFrame.querySelector('iframe'), null, code);
    assert.equal(h.music.player.audio.paused, false, code);
    assert.ok(h.controls['video-error'].textContent, code);
  }
});

test('selected video metadata keeps the requested P and sends its matching cid to the official player', async () => {
  const h = harness({ videoInspect: true }); h.mountBrowser(); await load(h); h.music.playTrack('netease:1');
  const permalink = 'https://www.bilibili.com/video/BV1124y1x72L?p=2';
  const pending = h.music.openVideo(permalink);
  assert.equal(h.videoInspections.length, 1);
  h.videoInspections[0].resolve({ ...video(), page: 2, cid: 1057559732, availability: 'metadata_ok', sourceUrl: permalink });
  await pending; await settle();
  const frame = h.videoFrame.querySelector('iframe'), embedded = new URL(frame.src);
  assert.equal(embedded.origin, 'https://player.bilibili.com');
  assert.equal(embedded.searchParams.get('bvid'), 'BV1124y1x72L');
  assert.equal(embedded.searchParams.get('cid'), '1057559732');
  assert.equal(h.videoSource.href, permalink);
  assert.equal(h.music.player.audio.paused, true);
  assert.ok(!h.videoStatus.textContent.includes('正在播放'));
});

test('a temporary metadata-check failure leaves the user an explicitly unchecked official video player', async () => {
  const h = harness({ videoInspect: true }); h.mountBrowser(); await load(h);
  const pending = h.music.openVideo('BV1124y1x72L');
  h.videoInspections[0].reject(Object.assign(new Error('平台暂时拒绝检查'), { code: 'UPSTREAM_BLOCKED' }));
  await pending; await settle();
  const frame = h.videoFrame.querySelector('iframe');
  assert.ok(frame);
  assert.equal(new URL(frame.src).origin, 'https://player.bilibili.com');
  assert.match(h.videoStatus.textContent, /未核实|未检查|未能检查|无法检查|检查.*失败|未.*验证/);
  assert.ok(!h.videoStatus.textContent.includes('正在播放'));
});

test('a curated public version is attempted once after both native audio sources fail', async () => {
  const alternative = { url: openAudio().permalinkUrl, name: '公开歌曲', artist: '原唱' };
  const h = harness({ config: { audioAlternatives: { 'netease:1': alternative } } }); h.mountBrowser(); await load(h);
  h.music.playTrack('netease:1');
  const priorQueue = Array.from(h.music.player.list.audios, item => item.id);
  h.music.player.emit('error');
  assert.equal(h.audioRequests.length, 0, 'the first failure must retain the official public audio attempt');
  assert.equal(h.music.player.audio.src, officialAudioUrl(song('1')));
  h.music.player.emit('error'); await settle();
  assert.equal(h.audioRequests.length, 1);
  assert.equal(h.audioRequests[0].type, 'track');
  assert.equal(h.audioRequests[0].value, alternative.url);
  h.music.player.emit('error'); h.music.player.emit('error'); await settle();
  assert.equal(h.audioRequests.length, 1, 'late native errors must not multiply public-version lookups');
  h.audioRequests[0].resolve(openAudio()); await settle();
  assert.ok(h.videoFrame.querySelector('iframe'));
  assert.equal(h.widgets[0].playCalls, 0, 'opening the public player must not bypass the visitor play gesture');
  assert.ok(!h.videoStatus.textContent.includes('正在播放'));
  assert.deepEqual(Array.from(h.music.player.list.audios, item => item.id), priorQueue);
  assert.equal(h.music.player.audio.paused, true);
});

test('an unmapped native song stops after its bounded sources and never guesses a public match', async () => {
  const h = harness({ config: { audioAlternatives: { 'netease:999': { url: openAudio().permalinkUrl, name: '另一首歌', artist: '另一位歌手' } } } });
  h.mountBrowser(); await load(h, [song('1')]); h.music.playTrack('netease:1');
  h.music.player.emit('error'); h.music.player.emit('error'); await settle();
  assert.equal(h.audioRequests.length, 0);
  assert.equal(h.videoRequests.length, 0);
  assert.equal(h.videoFrame.querySelector('iframe'), null);
  assert.equal(h.music.player.audio.paused, true);
  assert.equal(h.retryPlay.hidden, false);
});

test('a curated public lookup failure stops without another lookup or an automatic fuzzy search', async () => {
  const h = harness({ config: { audioAlternatives: { 'netease:1': { url: openAudio().permalinkUrl, name: '公开歌曲', artist: '原唱' } } } });
  h.mountBrowser(); await load(h); h.music.playTrack('netease:1');
  h.music.player.emit('error'); h.music.player.emit('error'); await settle();
  h.audioRequests[0].reject(Object.assign(new Error('无法播放'), { code: 'AUDIO_UNAVAILABLE' })); await settle();
  h.music.player.emit('error'); await settle();
  assert.equal(h.audioRequests.length, 1);
  assert.equal(h.videoRequests.length, 0);
  assert.equal(h.videoFrame.querySelector('iframe'), null);
  assert.equal(h.music.player.audio.paused, true);
});

test('the public audio provider searches on submission and opens only the explicitly chosen result', async () => {
  const h = harness(); h.mountBrowser(); await load(h); h.click(h.controls.soundcloud);
  h.controls.keyword.value = '想听的歌';
  h.dispatch('submit', { target: h.controls['keyword-form'], preventDefault() {} });
  assert.equal(h.audioRequests.length, 1);
  assert.equal(h.audioRequests[0].type, 'search');
  assert.equal(h.audioRequests[0].query, '想听的歌');
  h.audioRequests[0].resolve([openAudio()]); await settle();
  assert.equal(h.videoFrame.querySelector('iframe'), null);
  const selected = h.controls.results.querySelector('[data-open-audio-id]');
  assert.ok(selected);
  h.click(selected); await settle();
  assert.equal(h.videoFrame.querySelector('iframe').src, soundCloudEmbedUrl(openAudio().permalinkUrl));
  assert.deepEqual(Array.from(h.music.player.list.audios, item => item.id), ['netease:1', 'netease:2']);
  assert.equal(h.music.player.playCalls, 0);
});

test('a newer selected video ignores an earlier metadata response that arrives late', async () => {
  const h = harness({ videoInspect: true }); h.mountBrowser(); await load(h);
  const old = h.music.openVideo('BV1124y1x72L'), current = h.music.openVideo('BV1xx411c7mD');
  assert.equal(h.videoInspections[0].signal.aborted, true);
  h.videoInspections[1].resolve({ ...video('BV1xx411c7mD'), page: 1, cid: 12345678, availability: 'metadata_ok' });
  await current; await settle();
  const frame = h.videoFrame.querySelector('iframe');
  h.videoInspections[0].resolve({ ...video(), page: 1, cid: 1057559731, availability: 'metadata_ok' });
  await old; await settle();
  assert.equal(h.videoFrame.querySelector('iframe'), frame);
  assert.equal(new URL(frame.src).searchParams.get('bvid'), 'BV1xx411c7mD');
});

test('an explicit native retry cancels an older automatic public audio check before its late result arrives', async () => {
  const h = harness({ config: { audioAlternatives: { 'netease:1': { url: openAudio().permalinkUrl, name: '公开歌曲', artist: '原唱' } } } });
  h.mountBrowser(); await load(h); h.music.playTrack('netease:1');
  h.music.player.emit('error'); h.music.player.emit('error'); await settle();
  assert.equal(h.audioRequests.length, 1);
  const older = h.audioRequests[0];
  h.music.playTrack('netease:1');
  assert.equal(older.signal.aborted, true, 'the explicit native choice supersedes the pending automatic source lookup');
  assert.equal(h.music.player.audio.paused, false);
  older.resolve(openAudio()); await settle();
  assert.equal(h.videoFrame.querySelector('iframe'), null);
  assert.equal(h.music.player.audio.paused, false);
  assert.equal(h.music.player.audio.src, song('1').url);
  assert.equal(h.widgets.length, 0);
});

test('changing playlists preserves the currently playing linked public version until another song is selected', async () => {
  const h = harness({ config: { audioAlternatives: { 'netease:1': { url: openAudio().permalinkUrl, name: '公开歌曲', artist: '原唱' } } } });
  h.mountBrowser(); await load(h); h.music.playTrack('netease:1');
  h.music.player.emit('error'); h.music.player.emit('error'); await settle();
  h.audioRequests[0].resolve(openAudio()); await settle();
  const frame = h.videoFrame.querySelector('iframe'), widget = h.widgets[0];
  widget.emit('READY'); widget.emit('PLAY');
  const status = h.playerStatus.textContent;
  assert.match(status, /正在播放/);
  const changed = h.music.loadPlaylist('456'); h.requests.at(-1).resolve([song('3'), song('4')]); await changed; await settle();
  assert.equal(h.videoFrame.querySelector('iframe'), frame);
  assert.equal(h.videoDock.hidden, false);
  assert.equal(h.playerStatus.textContent, status);
  assert.deepEqual(Array.from(h.music.player.list.audios, item => item.id), ['netease:1', 'netease:3', 'netease:4']);
  assert.equal(h.audioRequests.length, 1);
  h.music.playTrack('netease:3'); await settle();
  assert.equal(h.videoFrame.querySelector('iframe'), null);
  assert.equal(h.music.player.audio.paused, false);
  assert.equal(h.music.player.audio.src, song('3').url);
});

test('a song tries its official public source before it is marked locked and skipped', async () => {
  const h = harness(); await load(h); h.music.playTrack('netease:1');
  const player = h.music.player;
  player.emit('error'); await settle();
  assert.equal(player.list.index, 0);
  assert.equal(player.audio.src, officialAudioUrl(song('1')));
  player.emit('error'); await settle();
  assert.equal(player.list.index, 1);
  assert.equal(player.audio.src, song('2').url);
  assert.equal(player.audio.paused, false);
  assert.match(h.playerStatus.textContent, /暂无音源.*歌曲 2/);
  assert.equal(h.requests.length, 1);
});
