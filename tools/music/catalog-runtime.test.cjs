'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Catalog = require('../../source/js/music-catalog.js');
const Source = require('../../source/js/music-source.js');
const Audius = require('../../source/js/music-audius.js');
const settle = () => new Promise(resolve => setImmediate(resolve));
const song = (id, name = 'Song ' + id, artist = 'Artist ' + id) => ({ id: 'netease:' + id, songId: id, name, artist,
  cover: '/img/cover.jpg', sourceUrl: 'https://music.163.com/#/song?id=' + id });
const native = (id = 'A1', name = 'Song 1', artist = 'Artist 1') => ({ id: 'audius:' + id, trackId: id, provider: 'audius',
  name, artist, url: Audius.streamUrl(id), cover: '/img/cover.jpg', sourceUrl: 'https://audius.co/artist/song-' + id,
  durationMs: 100000, availability: 'public_full' });
const cloud = (id = '123', name = 'Song 1', artist = 'Artist 1') => ({ id: 'soundcloud:' + id, trackId: id, provider: 'soundcloud',
  name, artist, permalinkUrl: 'https://soundcloud.com/artist/song-' + id, sourceUrl: 'https://soundcloud.com/artist/song-' + id,
  cover: '/img/cover.jpg', durationMs: 100000, fullDurationMs: 100000, availability: 'public_full' });
const dataName = name => name.slice(5).replace(/-([a-z])/g, (_, value) => value.toUpperCase());
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attrs = new Map(); this.hidden = false;
    this.listeners = {}; this.textContent = ''; this.className = ''; this.value = ''; const classes = new Set();
    this.classList = { toggle(name, active) { if (active) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) };
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); if (name.startsWith('data-')) this.dataset[dataName(name)] = String(value); }
  hasAttribute(name) { return this.attrs.has(name) || (name.startsWith('data-') && Object.hasOwn(this.dataset, dataName(name))); }
  getAttribute(name) { return this.attrs.get(name); }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  append(...items) { for (const item of items) { item.parentElement = this; this.children.push(item); } }
  replaceChildren(...items) { this.children.forEach(item => { item.parentElement = undefined; }); this.children = []; this.append(...items); }
  matches(selectors) { return selectors.split(',').some(selector => {
    selector = selector.trim(); if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    const match = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
    return match ? this.hasAttribute(match[1]) && (match[2] === undefined || this.getAttribute(match[1]) === match[2]) : this.tagName.toLowerCase() === selector.toLowerCase();
  }); }
  querySelectorAll(selector) { return this.children.flatMap(item => [...(item.matches(selector) ? [item] : []), ...item.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]; }
  closest(selector) { for (let item = this; item; item = item.parentElement) if (item.matches(selector)) return item; }
}
function harness(options = {}) {
  const events = {}, requests = { playlist: [], audius: [], soundcloud: [], video: [] }, timers = new Map(), widgets = [];
  let timerId = 0; const controls = {}, body = new Element('body'), head = new Element('head'), browser = new Element();
  browser.setAttribute('data-music-browser', ''); if (options.page !== false) body.append(browser);
  function control(name, tag = 'div', parent = body) { const item = new Element(tag); item.setAttribute('data-music-' + name, ''); controls[name] = item; parent.append(item); return item; }
  for (const name of ['list-title', 'browser-status', 'retry-list', 'results', 'playlist-source', 'playlist-error', 'input-source', 'more',
    'audio-tools', 'audio-search-link', 'audio-error', 'video-tools', 'video-search-link', 'video-error']) control(name, 'div', browser);
  for (const name of ['player-status', 'retry-play', 'current-source', 'catalog-controls', 'catalog-title', 'catalog-prev', 'catalog-next', 'find-open-audio', 'find-video', 'toggle-play', 'active-title']) control(name);
  const dock = control('video-dock'), frame = control('video-frame', 'div', dock);
  const secondControls = {};
  for (const name of ['catalog-controls', 'catalog-title', 'catalog-prev', 'catalog-next']) {
    const item = new Element(); item.setAttribute('data-music-' + name, ''); secondControls[name] = item; dock.append(item);
  }
  for (const name of ['video-title', 'video-source', 'video-status', 'close-video', 'reload-external', 'change-version', 'toggle-external-tools']) control(name, 'div', dock);
  for (const name of ['playlist', 'keyword', 'audioLink', 'videoLink']) {
    const input = new Element('input'); input.setAttribute('name', name); controls[name] = input;
    const form = new Element('form'); form.setAttribute('data-music-' + ({ playlist: 'playlist', keyword: 'search', audioLink: 'audio', videoLink: 'video' }[name]) + '-form', '');
    form.elements = { [name]: input }; form.append(input); browser.append(form); controls[name + '-form'] = form;
  }
  for (const provider of ['audius', 'soundcloud', 'bilibili']) { const item = new Element('button'); item.setAttribute('data-music-provider', provider); controls[provider] = item; browser.append(item); }
  const panel = new Element('details'); panel.className = 'music-dock'; body.append(panel);
  if (options.inline) {
    const shell = control('inline-player'); panel.open = true;
    if (options.popupOpen) shell.dataset.musicPopupOpen = 'true';
    if (options.page !== false) control('player-slot');
    if (options.persistentBrowser) { body.children = body.children.filter(item => item !== browser); shell.append(browser); }
  }
  const document = { body, head, activeElement: null, createElement: tag => new Element(tag),
    querySelector: selector => body.querySelector(selector), querySelectorAll: selector => body.querySelectorAll(selector),
    addEventListener(name, callback) { (events[name] ||= []).push(callback); } };
  const clock = { setTimeout(fn, ms) { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout(id) { timers.delete(id); } };
  const request = (kind, type, value, settings = {}) => new Promise((resolve, reject) => requests[kind].push({ type, value, signal: settings.signal, refresh: settings.refresh, resolve, reject }));
  class Player {
    constructor(settings) {
      this.options = settings; this.handlers = {}; this.paused = true; this.audio = { src: '', paused: true, currentTime: 0 }; this.playCalls = 0;
      this.list = { audios: [], index: 0, clear: () => { this.pause(); this.list.audios = []; this.audio.src = ''; this.audio.currentTime = 0; },
        add: rows => { this.list.audios.push(...rows); this.audio.src = rows[0]?.url || ''; } };
    }
    on(name, callback) { (this.handlers[name] ||= []).push(callback); }
    emit(name) { for (const callback of this.handlers[name] || []) callback(); }
    pause() { this.paused = true; this.audio.paused = true; this.emit('pause'); }
    play() { this.playCalls++; this.paused = false; this.audio.paused = false; this.emit('play'); }
  }
  const Widget = iframe => {
    const callbacks = new Map(), saved = new Map();
    const widget = { iframe, plays: 0, pauses: 0, durationCallbacks: [], bind(event, callback) { callbacks.set(event, callback); saved.set(event, callback); }, unbind(event) { callbacks.delete(event); },
      play() { this.plays++; }, pause() { this.pauses++; }, getDuration(callback) { this.durationCallbacks.push(callback); if (!options.deferWidgetDuration) callback(options.widgetDuration ?? 100000); },
      emit(event) { callbacks.get(event)?.(); }, emitSaved(event) { saved.get(event)?.(); } };
    widgets.push(widget); return widget;
  };
  Widget.Events = { READY: 'READY', PLAY: 'PLAY', PAUSE: 'PAUSE', ERROR: 'ERROR', FINISH: 'FINISH' };
  let layoutSyncs = 0;
  const window = { document, ...clock, SC: options.loadSDK === false ? undefined : { Widget }, SiteMusicLayout: { create: () => ({ sync: () => { layoutSyncs++; } }) },
    localStorage: { getItem: () => null, setItem() {} } };
  const officialUrls = [];
  const source = { ...Source, officialAudioUrl(value) {
    if (options.config?.allowPublicNeteaseFallback !== true) throw new Error('NetEase media must never be requested');
    const url = Source.officialAudioUrl(value); officialUrls.push({ value, url }); return url;
  },
    createClient(config) { assert.equal(config.catalogOnly, true); return { request: (type, value, settings) => { assert.equal(type, 'playlist'); return request('playlist', type, value, settings); } }; },
    createOpenAudioClient: () => ({ search: (value, settings) => request('soundcloud', 'search', value, settings), track: (value, settings) => request('soundcloud', 'track', value, settings) }),
    createVideoClient: () => ({ request: (value, settings) => request('video', 'search', value, settings), inspect: (value, settings) => request('video', 'inspect', value, settings) }) };
  const audius = { ...Audius, createClient(config) { assert.ok(!config.endpoint); return { search: (value, settings) => request('audius', 'search', value, settings), track: (value, settings) => request('audius', 'track', value, settings) }; } };
  const container = new Element(), data = new Element('script');
  const music = Catalog.init({ container, data, Source: source, Audius: audius, APlayer: Player, window, document, clock,
    config: { catalogOnly: true, playlistId: '123', playlistName: 'Default', pageSize: 20, fallbackCover: '/img/cover.jpg', audioAlternatives: {}, ...options.config } });
  const dispatch = (name, event = {}) => { for (const callback of events[name] || []) callback(event); };
  return { music, player: music.player, requests, controls, secondControls, container, data, frame, dock, panel, document, body, window, widgets, timers,
    dispatch, click: target => dispatch('click', { target, preventDefault() {} }), source, audius, clock, Widget, officialUrls, layoutSyncs: () => layoutSyncs };
}
async function loaded(h, rows = [song('1'), song('2'), song('3')]) { h.requests.playlist[0].resolve(rows); await settle(); }
async function resolveNative(h, id = '1', nativeId = 'A' + id) {
  const pending = h.music.playTrack('netease:' + id);
  h.requests.audius.at(-1).resolve([native(nativeId, 'Song ' + id, 'Artist ' + id)]); h.requests.soundcloud.at(-1).resolve([]);
  await settle(); h.requests.audius.at(-1).resolve(native(nativeId, 'Song ' + id, 'Artist ' + id)); await pending; await settle();
}
async function resolveCloud(h, id = '1', trackId = '123') {
  const pending = h.music.playTrack('netease:' + id);
  h.requests.audius.at(-1).resolve([]); h.requests.soundcloud.at(-1).resolve([cloud(trackId, 'Song ' + id, 'Artist ' + id)]);
  await settle(); h.requests.soundcloud.at(-1).resolve(cloud(trackId, 'Song ' + id, 'Artist ' + id));
  await pending; await settle();
}
const registration = (track = cloud(), durationMs = 100000) => ({ url: track.permalinkUrl, trackId: track.trackId, name: track.name, artist: track.artist, durationMs });

test('catalog imports only metadata and never sends NetEase items or URLs into APlayer', async () => {
  const h = harness(); await loaded(h, [{ ...song('1'), url: 'https://music.163.com/song/media/outer/url?id=1.mp3' }]);
  assert.deepEqual(h.player.list.audios, []); assert.equal(h.player.audio.src, ''); assert.equal(h.container.hidden, true);
  assert.ok(!h.data.textContent.includes('outer/url')); assert.equal(h.requests.playlist.length, 1);
});
test('strict matching keeps version and author distinctions and supports only harmless normalization', () => {
  assert.ok(Catalog.sameRecording(song('1', 'Ｃｏｆｆｅｅ！', 'Beabadoobee'), native('A1', 'coffee', 'beabadoobee')));
  assert.ok(Catalog.sameRecording(song('1', 'Time Machine (feat. Bob)', 'Artist/Bob'), native('A1', 'time machine (ft Bob)', 'artist')));
  for (const track of [native('A1', 'Coffee', 'Wrong Artist'), native('A1', 'Coffee LIVE', 'beabadoobee'), native('A1', 'Coffee remix', 'beabadoobee'),
    native('A1', 'Coffee cover', 'beabadoobee'), { ...native('A1', 'Coffee', 'beabadoobee'), availability: 'unchecked' }]) {
    assert.equal(Catalog.sameRecording(song('1', 'Coffee', 'beabadoobee'), track), false);
  }
  assert.equal(Catalog.sameRecording(song('1', 'Coffee', '未知歌手'), native('A1', 'Coffee', '未知歌手')), false);
  assert.equal(Catalog.sameRecording(song('1', 'Coffee', '用户已注销'), native('A1', 'Coffee', '用户已注销')), false);
});
test('a unique strict public match validates selected metadata before native playback', async () => {
  const h = harness(); await loaded(h); await resolveNative(h);
  assert.equal(h.player.list.audios.length, 1); assert.equal(h.player.list.audios[0].id, 'audius:A1');
  assert.equal(h.player.audio.src, Audius.streamUrl('A1')); assert.equal(h.player.options.loop, 'none');
  h.player.emit('playing'); assert.match(h.controls['player-status'].textContent, /正在播放/);
});
test('wrong artist and ambiguous same-song matches remain explicit candidates and never autoplay', async () => {
  for (const rows of [[native('A1', 'Song 1', 'Wrong')], [native(), native('A2')]]) {
    const h = harness(); await loaded(h); const pending = h.music.playTrack('netease:1');
    h.requests.audius[0].resolve(rows); h.requests.soundcloud[0].resolve([]); await pending;
    assert.equal(h.player.playCalls, 0); assert.match(h.controls['browser-status'].textContent, /核对/);
    const selected = h.controls.results.querySelector('[data-track-id]'); h.click(selected);
    h.requests.audius.at(-1).resolve(rows[0]); await settle(); h.player.emit('ended'); await settle();
    assert.equal(h.requests.audius.at(-1).value, 'Song 2 Artist 2', 'an explicitly chosen version retains the catalog queue association');
  }
});
test('a newer catalog click cancels both previous lookups and ignores late results', async () => {
  const h = harness(); await loaded(h); const old = h.music.playTrack('netease:1'), latest = h.music.playTrack('netease:2');
  assert.equal(h.requests.audius[0].signal.aborted, true); assert.equal(h.requests.soundcloud[0].signal.aborted, true);
  h.requests.audius[1].resolve([]); h.requests.soundcloud[1].resolve([cloud('222', 'Song 2', 'Artist 2')]);
  await settle(); h.requests.soundcloud.at(-1).resolve(cloud('222', 'Song 2', 'Artist 2')); await latest; await settle();
  const frame = h.frame.children[0]; h.requests.audius[0].resolve([native()]); h.requests.soundcloud[0].resolve([]); await old; await settle();
  assert.equal(h.frame.children[0], frame); assert.match(frame.src, /song-222/); assert.equal(h.player.list.audios.length, 0);
});
test('manual external selection cancels a pending catalog resolver without late playback takeover', async () => {
  const h = harness(); await loaded(h); const old = h.music.playTrack('netease:1'); const manual = h.music.openAudio(cloud('444', 'Manual', 'User'));
  h.requests.soundcloud.at(-1).resolve(cloud('444', 'Manual', 'User')); await manual; await settle();
  const frame = h.frame.children[0]; h.requests.audius[0].resolve([native()]); h.requests.soundcloud[0].resolve([]); await old; await settle();
  assert.equal(h.frame.children[0], frame); assert.equal(h.player.playCalls, 0);
});
test('generic Audius search defaults to third-party requests and clears catalog candidate association', async () => {
  const h = harness(); await loaded(h); const pending = h.music.playTrack('netease:1');
  h.requests.audius[0].resolve([native('A1', 'Other', 'Wrong')]); h.requests.soundcloud[0].resolve([]); await pending;
  const searching = h.music.search('Manual query'); h.requests.audius.at(-1).resolve([native('M1', 'Manual query', 'User')]); await searching;
  const opening = h.music.playTrack('audius:M1'); h.requests.audius.at(-1).resolve(native('M1', 'Manual query', 'User')); await opening;
  h.player.emit('ended'); assert.equal(h.requests.playlist.length, 1); assert.equal(h.requests.audius.at(-1).type, 'track');
});
test('search response generations prevent stale search rows appearing under a newer query', async () => {
  const h = harness(); await loaded(h); const old = h.music.search('Old'), latest = h.music.search('New');
  h.requests.audius[1].resolve([native('N1', 'New', 'New Artist')]); await latest;
  h.requests.audius[0].resolve([native('O1', 'Old', 'Old Artist')]); await old;
  assert.equal(h.controls.results.querySelector('h2').textContent, 'New'); assert.match(h.controls['list-title'].textContent, /New/);
});
test('SoundCloud READY never claims playback, actual events control the associated catalog card', async () => {
  const h = harness(); await loaded(h); await resolveCloud(h); const instance = h.widgets[0];
  instance.emit('READY'); assert.match(h.controls['player-status'].textContent, /就绪/);
  const card = h.controls.results.querySelector('.track-card'); assert.equal(card.classList.contains('is-playing'), false);
  instance.emit('PLAY'); assert.equal(card.classList.contains('is-playing'), true); instance.emit('PAUSE'); assert.equal(card.classList.contains('is-playing'), false);
  instance.emit('ERROR'); assert.equal(h.controls['retry-play'].hidden, false);
});
test('SoundCloud FINISH and native ended advance the independent catalog in FIFO order', async () => {
  for (const kind of ['soundcloud', 'audius']) {
    const h = harness(); await loaded(h); if (kind === 'soundcloud') { await resolveCloud(h); h.widgets[0].emit('FINISH'); }
    else { await resolveNative(h); h.player.emit('ended'); }
    assert.equal(h.requests.audius.at(-1).value, 'Song 2 Artist 2'); assert.equal(h.requests.soundcloud.at(-1).value, 'Song 2 Artist 2');
  }
});
test('PJAX preserves widget identity and a selected song resolver while aborting page searches', async () => {
  const h = harness(); await loaded(h); await resolveCloud(h); const frame = h.frame.children[0];
  h.dispatch('pjax:send'); h.dispatch('pjax:complete'); assert.equal(h.frame.children[0], frame); assert.equal(h.widgets.length, 1);
  const selecting = h.music.playTrack('netease:2'); h.dispatch('pjax:send'); assert.equal(h.requests.audius.at(-1).signal.aborted, false);
  h.requests.audius.at(-1).resolve([]); h.requests.soundcloud.at(-1).resolve([cloud('222', 'Song 2', 'Artist 2')]);
  await settle(); h.requests.soundcloud.at(-1).resolve(cloud('222', 'Song 2', 'Artist 2')); await selecting;
  const searching = h.music.search('Pending'); h.dispatch('pjax:send'); assert.equal(h.requests.audius.at(-1).signal.aborted, true); await searching;
});
test('replacing a playlist preserves current native position and external widget while updating upcoming songs', async () => {
  for (const kind of ['soundcloud', 'audius']) {
    const h = harness(); await loaded(h); if (kind === 'soundcloud') await resolveCloud(h); else await resolveNative(h);
    const frame = h.frame.children[0], src = h.player.audio.src; h.player.audio.currentTime = 42;
    const changing = h.music.loadPlaylist('456'); h.requests.playlist.at(-1).resolve([song('9'), song('10')]); await changing;
    assert.equal(h.frame.children[0], frame); assert.equal(h.player.audio.src, src); assert.equal(h.player.audio.currentTime, 42);
    h.music.next(); assert.equal(h.requests.audius.at(-1).value, 'Song 9 Artist 9');
  }
});
test('resolver timeout aborts both sources, exposes retry, and never skips the requested song', async () => {
  const h = harness(); await loaded(h); const pending = h.music.playTrack('netease:1');
  for (const [timerId, timer] of [...h.timers]) { h.timers.delete(timerId); timer.fn(); } await pending;
  assert.equal(h.requests.audius[0].signal.aborted, true); assert.equal(h.requests.soundcloud[0].signal.aborted, true);
  assert.equal(h.controls['retry-play'].hidden, false); assert.equal(h.player.playCalls, 0); assert.equal(h.requests.audius.length, 1);
});
test('registered metadata failure preserves current playback and queries the other platform once', async () => {
  const h = harness({ config: { audioAlternatives: { 'netease:2': registration(cloud('222', 'Song 2', 'Artist 2')) } } });
  await loaded(h); await resolveNative(h); const src = h.player.audio.src;
  const pending = h.music.playTrack('netease:2'); assert.equal(h.requests.soundcloud.at(-1).type, 'track');
  h.requests.soundcloud.at(-1).reject(new Error('Unavailable')); await settle();
  assert.equal(h.requests.audius.at(-1).type, 'search'); h.requests.audius.at(-1).resolve([]); await pending;
  assert.equal(h.player.audio.src, src); assert.equal(h.player.paused, false);
});
test('video validation retains selected page and cid, restriction never interrupts existing audio', async () => {
  const h = harness(); await loaded(h); await resolveNative(h); const src = h.player.audio.src;
  const rejected = h.music.openVideo('https://www.bilibili.com/video/BV1124y1x72L?p=2');
  h.requests.video[0].reject(Object.assign(new Error('Restricted'), { code: 'VIDEO_RESTRICTED' })); await rejected;
  assert.equal(h.player.audio.src, src); assert.equal(h.player.paused, false);
  const pending = h.music.openVideo('https://www.bilibili.com/video/BV1124y1x72L?p=2');
  h.requests.video[1].resolve({ videoId: 'BV1124y1x72L', page: 2, cid: 999, name: 'Video', artist: 'Creator' }); await pending;
  assert.match(h.frame.children[0].src, /p=2/); assert.match(h.frame.children[0].src, /cid=999/); assert.equal(h.player.paused, true);
  assert.match(h.controls['video-status'].textContent, /点击/);
});

test('independent playback clears both catalog control bars and retry never returns to the former catalog song', async () => {
  const h = harness(); await loaded(h); await resolveNative(h);
  assert.equal(h.secondControls['catalog-controls'].hidden, false);
  assert.equal(h.secondControls['catalog-prev'].disabled, true); assert.equal(h.secondControls['catalog-next'].disabled, false);
  const searching = h.music.search('Independent'); h.requests.audius.at(-1).resolve([native('B1', 'Independent', 'User')]); await searching;
  const selected = h.music.playTrack('audius:B1'); h.requests.audius.at(-1).resolve(native('B1', 'Independent', 'User')); await selected;
  assert.equal(h.controls['catalog-controls'].hidden, true); assert.equal(h.secondControls['catalog-controls'].hidden, true);
  h.player.emit('error'); h.click(h.controls['retry-play']);
  assert.equal(h.requests.audius.at(-1).type, 'track'); assert.equal(h.requests.audius.at(-1).value, 'B1');
});
test('reselecting usable native audio preserves progress and pause reports the real state', async () => {
  const h = harness(); await loaded(h); await resolveNative(h); h.player.emit('playing'); h.player.audio.currentTime = 42;
  const count = h.requests.audius.length; await h.music.playTrack('netease:1');
  assert.equal(h.player.audio.currentTime, 42); assert.equal(h.requests.audius.length, count);
  assert.equal(h.player.paused, true); assert.match(h.controls['player-status'].textContent, /已暂停/);
  await h.music.playTrack('netease:1'); assert.equal(h.player.audio.currentTime, 42); assert.equal(h.player.paused, false);
  assert.ok([...h.timers.values()].some(timer => timer.ms === 8000));
});
test('a new playlist cancels obsolete catalog resolution while retaining current audio and valid next controls', async () => {
  const h = harness(); await loaded(h); await resolveNative(h); const src = h.player.audio.src;
  const old = h.music.playTrack('netease:2'), changed = h.music.loadPlaylist('456');
  const obsoleteAudius = h.requests.audius.at(-1), obsoleteCloud = h.requests.soundcloud.at(-1);
  assert.equal(obsoleteAudius.signal.aborted, true); assert.equal(obsoleteCloud.signal.aborted, true);
  h.requests.playlist.at(-1).resolve([song('9')]); await changed;
  obsoleteAudius.resolve([native('A2', 'Song 2', 'Artist 2')]); obsoleteCloud.resolve([]); await old;
  assert.equal(h.player.audio.src, src); assert.match(h.controls['catalog-title'].textContent, /Song 1/);
  assert.equal(h.secondControls['catalog-next'].disabled, false); h.music.next();
  assert.equal(h.requests.audius.at(-1).value, 'Song 9 Artist 9');
});
test('selecting another catalog song removes obsolete candidates so they cannot be rebound to the new song', async () => {
  const h = harness(); await loaded(h); const first = h.music.playTrack('netease:1');
  h.requests.audius[0].resolve([native('X1', 'Wrong', 'Wrong')]); h.requests.soundcloud[0].resolve([]); await first;
  assert.equal(h.controls.results.querySelectorAll('[data-track-id]').length, 1);
  h.music.playTrack('netease:2'); assert.equal(h.controls.results.querySelectorAll('[data-track-id]').length, 0);
  const direct = h.music.playTrack('audius:X1'); h.requests.audius.at(-1).resolve(native('X1', 'Wrong', 'Wrong')); await direct;
  assert.equal(h.controls['catalog-controls'].hidden, true);
});
test('a timed-out source cannot discard completed candidates from another platform', async () => {
  const h = harness(); await loaded(h); const pending = h.music.playTrack('netease:1');
  h.requests.audius[0].resolve([native('X1', 'Other Version', 'Different Artist')]); await settle();
  for (const [id, timer] of [...h.timers]) { h.timers.delete(id); timer.fn(); }
  await pending; assert.equal(h.controls.results.querySelector('h2').textContent, 'Other Version');
  assert.equal(h.requests.soundcloud[0].signal.aborted, true); assert.equal(h.player.playCalls, 0);
});

test('automatic SoundCloud and native advance preserve a generic search in progress and its results', async () => {
  for (const kind of ['soundcloud', 'audius']) {
    const h = harness(); await loaded(h); if (kind === 'soundcloud') await resolveCloud(h); else await resolveNative(h);
    const search = h.music.search('USER QUERY'), userRequest = h.requests.audius.at(-1);
    if (kind === 'soundcloud') h.widgets[0].emit('FINISH'); else h.player.emit('ended');
    const nextRequest = h.requests.audius.at(-1), nextCloud = h.requests.soundcloud.at(-1);
    assert.equal(nextRequest.value, 'Song 2 Artist 2'); assert.equal(userRequest.signal.aborted, false);
    assert.equal(h.controls.keyword.value, 'USER QUERY'); assert.match(h.controls['list-title'].textContent, /USER QUERY/);
    nextRequest.resolve([native('W2', 'Song 2 live', 'Artist 2')]); nextCloud.resolve([]); await settle();
    assert.equal(userRequest.signal.aborted, false); assert.match(h.controls['list-title'].textContent, /USER QUERY/);
    assert.equal(h.controls.results.getAttribute('aria-busy'), 'true'); assert.match(h.controls['player-status'].textContent, /其他版本/);
    userRequest.resolve([native('U1', 'USER QUERY', 'User Artist')]); await search;
    assert.equal(h.controls.results.querySelector('h2').textContent, 'USER QUERY'); assert.equal(h.controls.keyword.value, 'USER QUERY');
  }
});

test('unsubmitted keyword drafts survive automatic advance, background success, and unrelated renders', async () => {
  for (const kind of ['soundcloud', 'audius']) {
    const h = harness(); await loaded(h); if (kind === 'soundcloud') await resolveCloud(h); else await resolveNative(h);
    h.controls.keyword.value = 'ROWSFRED'; h.dispatch('input', { target: h.controls.keyword });
    h.document.activeElement = null;
    if (kind === 'soundcloud') h.widgets[0].emit('FINISH'); else h.player.emit('ended');
    h.requests.audius.at(-1).resolve([native('A2', 'Song 2', 'Artist 2')]); h.requests.soundcloud.at(-1).resolve([]); await settle();
    h.requests.audius.at(-1).resolve(native('A2', 'Song 2', 'Artist 2')); await settle();
    assert.equal(h.controls.keyword.value, 'ROWSFRED'); assert.equal(h.controls['list-title'].textContent, 'Default');
    h.dispatch('pjax:complete'); assert.equal(h.controls.keyword.value, 'ROWSFRED');
    h.dispatch('submit', { target: h.controls['keyword-form'], preventDefault() {} });
    assert.equal(h.requests.audius.at(-1).value, 'ROWSFRED'); assert.equal(h.requests.audius.at(-1).type, 'search');
  }
});

test('a generic submit during automatic resolution does not cancel next-song lookup or inherit its directory context', async () => {
  const h = harness(); await loaded(h); await resolveCloud(h); h.widgets[0].emit('FINISH');
  const nextRequest = h.requests.audius.at(-1), nextCloud = h.requests.soundcloud.at(-1);
  const search = h.music.search('Independent'), userRequest = h.requests.audius.at(-1);
  assert.equal(nextRequest.signal.aborted, false); assert.equal(nextCloud.signal.aborted, false);
  nextRequest.resolve([]); nextCloud.resolve([]); await settle();
  assert.match(h.controls['list-title'].textContent, /Independent/); assert.equal(h.controls.keyword.value, 'Independent');
  userRequest.resolve([native('I1', 'Independent', 'User')]); await search;
  const opening = h.music.playTrack('audius:I1'); h.requests.audius.at(-1).resolve(native('I1', 'Independent', 'User')); await opening;
  assert.equal(h.controls['catalog-controls'].hidden, true); assert.equal(h.secondControls['catalog-controls'].hidden, true);
});

test('explicit next remains a candidate action while provider changes use an unsubmitted draft', async () => {
  const h = harness(); await loaded(h); await resolveCloud(h); h.music.next();
  h.requests.audius.at(-1).resolve([native('W2', 'Song 2 live', 'Artist 2')]); h.requests.soundcloud.at(-1).resolve([]); await settle();
  assert.match(h.controls['list-title'].textContent, /Song 2 Artist 2/);
  h.controls.keyword.value = 'MY DRAFT'; h.dispatch('input', { target: h.controls.keyword }); h.click(h.controls.soundcloud);
  assert.equal(h.requests.soundcloud.at(-1).value, 'MY DRAFT'); assert.equal(h.controls.keyword.value, 'MY DRAFT');
});

test('SoundCloud starts compact and options toggle preserves the official player', async () => {
  const h = harness(); await loaded(h); await resolveCloud(h); const frame = h.frame.children[0];
  assert.equal(h.dock.classList.contains('is-compact'), true); assert.equal(h.controls['toggle-external-tools'].getAttribute('aria-expanded'), 'false');
  h.click(h.controls['toggle-external-tools']); assert.equal(h.dock.classList.contains('is-compact'), false);
  assert.equal(h.controls['toggle-external-tools'].getAttribute('aria-expanded'), 'true'); assert.equal(h.frame.children[0], frame);
  h.click(h.controls['toggle-external-tools']); assert.equal(h.dock.classList.contains('is-compact'), true); assert.equal(h.frame.children[0], frame);
});

test('old-player completion never cancels metadata checks for an explicitly selected new version', async () => {
  for (const kind of ['soundcloud', 'audius']) {
    const h = harness(); await loaded(h); if (kind === 'soundcloud') await resolveCloud(h); else await resolveNative(h);
    const pending = h.music.openAudio('https://soundcloud.com/artist/manual-selection'), request = h.requests.soundcloud.at(-1);
    const count = h.requests.audius.length;
    if (kind === 'soundcloud') h.widgets[0].emit('FINISH'); else h.player.emit('ended');
    assert.equal(request.signal.aborted, false); assert.equal(h.requests.audius.length, count);
    request.resolve({ ...cloud('999', 'Manual selection', 'User'), permalinkUrl: 'https://soundcloud.com/artist/manual-selection' });
    await pending; assert.match(h.frame.children[0].src, /manual-selection/); assert.equal(h.controls['catalog-controls'].hidden, true);
  }
});

test('pinned recording metadata rejects changed identity, author, version or duration before any playback', async () => {
  for (const changed of [
    { trackId: '999', id: 'soundcloud:999' }, { name: 'Song 1 (live)' }, { artist: 'Other' },
    { permalinkUrl: 'https://soundcloud.com/other/song' }, { durationMs: 130000, fullDurationMs: 130000 },
    { durationMs: 100000, fullDurationMs: 140000 }, { availability: 'restricted' }
  ]) {
    const h = harness({ config: { audioAlternatives: { 'netease:1': registration() } } }); await loaded(h);
    const pending = h.music.playTrack('netease:1');
    assert.equal(h.requests.soundcloud[0].refresh, true); h.requests.soundcloud[0].resolve({ ...cloud(), ...changed }); await settle();
    assert.equal(h.requests.audius.length, 1); h.requests.audius[0].resolve([]); await pending;
    assert.equal(h.frame.children.length, 0); assert.equal(h.player.playCalls, 0); assert.equal(h.requests.soundcloud.length, 1);
  }
});

test('a rejected pinned source may resolve the same catalog recording once from the other platform', async () => {
  const h = harness({ config: { audioAlternatives: { 'netease:1': registration() } } }); await loaded(h);
  const pending = h.music.playTrack('netease:1'); h.requests.soundcloud[0].reject(Object.assign(new Error('Blocked'), { code: 'UPSTREAM_BLOCKED', status: 429 }));
  await settle(); h.requests.audius[0].resolve([native()]); await settle(); h.requests.audius.at(-1).resolve(native()); await pending;
  assert.equal(h.requests.soundcloud.length, 1); assert.equal(h.player.audio.src, Audius.streamUrl('A1'));
});

test('unchecked pinned oEmbed enters the visible widget but waits for SDK duration and actual PLAY', async () => {
  const h = harness({ deferWidgetDuration: true, config: { audioAlternatives: { 'netease:1': registration() } } }); await loaded(h);
  const pending = h.music.playTrack('netease:1'); h.requests.soundcloud[0].resolve({ ...cloud(), availability: 'unchecked', durationMs: 0, fullDurationMs: 0 });
  await pending; await settle(); const widget = h.widgets[0]; assert.equal(widget.plays, 0);
  widget.emit('READY'); assert.equal(widget.plays, 0); assert.equal(h.controls['toggle-play'].disabled, true);
  widget.durationCallbacks[0](100050); assert.equal(widget.plays, 1); assert.doesNotMatch(h.controls['player-status'].textContent, /正在播放/);
  widget.emit('PLAY'); assert.match(h.controls['player-status'].textContent, /正在播放/); assert.equal(h.controls['toggle-play'].textContent, '暂停');
});

test('SDK duration mismatch stops pinned playback and ignores late success without retry loops', async () => {
  const h = harness({ deferWidgetDuration: true, config: { audioAlternatives: { 'netease:1': registration() } } }); await loaded(h);
  const pending = h.music.playTrack('netease:1'); h.requests.soundcloud[0].resolve({ ...cloud(), availability: 'unchecked', durationMs: 0, fullDurationMs: 0 });
  await pending; await settle(); const widget = h.widgets[0]; widget.emit('READY'); widget.durationCallbacks[0](30000);
  assert.equal(widget.plays, 0); assert.equal(widget.pauses, 1); assert.match(h.controls['player-status'].textContent, /时长.*不符/);
  widget.durationCallbacks[0](100000); widget.emit('PLAY'); assert.equal(widget.plays, 0);
  assert.doesNotMatch(h.controls['player-status'].textContent, /正在播放/); assert.equal(h.requests.soundcloud.length, 1);
});

test('missing SDK duration terminates within its deadline and an unregistered unchecked link never autoplays', async () => {
  const h = harness({ deferWidgetDuration: true, config: { audioAlternatives: { 'netease:1': registration() } } }); await loaded(h);
  const pending = h.music.playTrack('netease:1'); h.requests.soundcloud[0].resolve({ ...cloud(), availability: 'unchecked', durationMs: 0, fullDurationMs: 0 });
  await pending; await settle(); const widget = h.widgets[0]; widget.emit('READY');
  for (const [id, timer] of [...h.timers]) { h.timers.delete(id); timer.fn(); }
  assert.equal(widget.plays, 0); assert.match(h.controls['player-status'].textContent, /未能准备好/);
  const manual = h.music.openAudio('https://soundcloud.com/artist/manual');
  h.requests.soundcloud.at(-1).resolve({ ...cloud('999', 'Manual', 'User'), availability: 'unchecked', durationMs: 0, fullDurationMs: 0,
    permalinkUrl: 'https://soundcloud.com/artist/manual' }); await manual; await settle();
  h.widgets[1].emit('READY'); assert.equal(h.widgets[1].plays, 0); assert.equal(h.controls['toggle-play'].disabled, false);
  h.click(h.controls['toggle-play']); assert.equal(h.widgets[1].plays, 1); assert.doesNotMatch(h.controls['player-status'].textContent, /正在播放/);
});

test('public search selections and reload always recheck details and a changed result preserves the old player', async () => {
  const h = harness(); await loaded(h); await resolveCloud(h); const frame = h.frame.children[0], instance = h.widgets[0];
  instance.emit('READY'); instance.emit('PLAY');
  const reloading = h.music.reloadExternalPlayer(); assert.equal(h.requests.soundcloud.at(-1).type, 'track'); assert.equal(h.requests.soundcloud.at(-1).refresh, true);
  h.requests.soundcloud.at(-1).resolve({ ...cloud(), name: 'Song 1 remix' }); assert.equal(await reloading, false);
  assert.equal(h.frame.children[0], frame); assert.equal(h.widgets.length, 1); assert.match(h.controls['active-title'].textContent, /Song 1/);
  assert.match(h.controls['player-status'].textContent, /继续播放/);
  const direct = h.music.openAudio(cloud('777', 'Selected', 'User'));
  assert.equal(h.requests.soundcloud.at(-1).refresh, true); h.requests.soundcloud.at(-1).reject(new Error('Deleted')); await direct;
  assert.equal(h.frame.children[0], frame); assert.equal(h.controls['toggle-play'].textContent, '暂停');
});

test('a unique SoundCloud search match is independently checked and cannot switch to renamed audio', async () => {
  const h = harness(); await loaded(h); const pending = h.music.playTrack('netease:1');
  h.requests.audius[0].resolve([]); h.requests.soundcloud[0].resolve([cloud()]); await settle();
  assert.equal(h.requests.soundcloud[1].type, 'track'); assert.equal(h.requests.soundcloud[1].refresh, true);
  h.requests.soundcloud[1].resolve({ ...cloud(), name: 'Song 1 (remix)' }); await pending;
  assert.equal(h.frame.children.length, 0); assert.equal(h.player.playCalls, 0);
});

test('inline native controls toggle the same audio without resetting progress and pending titles stay actual', async () => {
  const h = harness({ inline: true }); await loaded(h); await resolveNative(h); h.player.emit('playing'); h.player.audio.currentTime = 42;
  assert.equal(h.panel.open, true); assert.equal(h.controls['toggle-play'].textContent, '暂停');
  const count = h.requests.audius.length; h.click(h.controls['toggle-play']); assert.equal(h.player.paused, true);
  assert.equal(h.controls['toggle-play'].textContent, '播放'); h.click(h.controls['toggle-play']); assert.equal(h.player.paused, false);
  assert.equal(h.player.audio.currentTime, 42); assert.equal(h.requests.audius.length, count);
  h.player.emit('playing'); const pending = h.music.playTrack('netease:2');
  assert.match(h.controls['active-title'].textContent, /Song 1/); assert.doesNotMatch(h.controls['active-title'].textContent, /Song 2/);
  h.requests.audius.at(-1).resolve([]); h.requests.soundcloud.at(-1).resolve([]); await pending;
  assert.match(h.controls['active-title'].textContent, /Song 1/); assert.equal(h.player.audio.currentTime, 42); assert.ok(h.layoutSyncs() > 0);
});

test('inline SoundCloud controls and repeated catalog clicks use real pause events without rebuilding its iframe', async () => {
  const h = harness({ inline: true }); await loaded(h); await resolveCloud(h); const frame = h.frame.children[0], widget = h.widgets[0];
  widget.emit('READY'); widget.emit('PLAY'); const count = h.requests.soundcloud.length;
  await h.music.playTrack('netease:1'); assert.equal(widget.pauses, 1); assert.equal(h.controls['toggle-play'].textContent, '暂停');
  widget.emit('PAUSE'); assert.equal(h.controls['toggle-play'].textContent, '播放'); h.click(h.controls['toggle-play']); assert.equal(widget.plays, 2);
  widget.emit('PLAY'); assert.equal(h.controls['toggle-play'].textContent, '暂停'); assert.equal(h.frame.children[0], frame);
  assert.equal(h.widgets.length, 1); assert.equal(h.requests.soundcloud.length, count);
});

test('inline controls stop video honestly and the permanent open shell does not import playlists on unrelated pages', async () => {
  const home = harness({ inline: true, page: false }); assert.equal(home.requests.playlist.length, 0);
  for (const callback of home.panel.listeners.toggle || []) callback({ target: home.panel });
  assert.equal(home.requests.playlist.length, 0); assert.equal(home.controls['toggle-play'].disabled, true);
  const h = harness({ inline: true }); await loaded(h);
  const pending = h.music.openVideo('BV1124y1x72L'); h.requests.video[0].resolve({ videoId: 'BV1124y1x72L', page: 1, cid: 111, name: 'Video', artist: 'Creator' }); await pending;
  assert.equal(h.controls['toggle-play'].textContent, '停止视频'); h.click(h.controls['toggle-play']);
  assert.equal(h.frame.children.length, 0); assert.equal(h.controls['active-title'].textContent, '选择一首歌开始听');
});

test('an SDK script timeout stops without retrying and a manual reload can recover the SDK', async () => {
  const h = harness({ loadSDK: false }); await loaded(h); await resolveCloud(h);
  assert.equal(h.document.head.children.length, 1); assert.equal(h.widgets.length, 0);
  for (const [id, timer] of [...h.timers]) { h.timers.delete(id); timer.fn(); }
  assert.match(h.controls['player-status'].textContent, /未能准备好/); assert.equal(h.controls['retry-play'].hidden, false);
  h.dispatch('pjax:complete'); assert.equal(h.document.head.children.length, 1); assert.equal(h.requests.soundcloud.length, 2);
  const retry = h.music.reloadExternalPlayer();
  assert.equal(h.requests.soundcloud.at(-1).refresh, true); h.requests.soundcloud.at(-1).resolve(cloud()); await retry; await settle();
  assert.equal(h.document.head.children.length, 2, 'only a manual reload requests the SDK again');
  h.window.SC = { Widget: h.Widget };
  for (const callback of h.document.head.children[1].listeners.load || []) callback(); await settle();
  assert.equal(h.widgets.length, 1); h.widgets[0].emit('READY'); assert.equal(h.widgets[0].plays, 1);
  assert.doesNotMatch(h.controls['player-status'].textContent, /正在播放/); h.widgets[0].emit('PLAY');
  assert.match(h.controls['player-status'].textContent, /正在播放/); assert.equal(h.controls['toggle-play'].textContent, '暂停');
});

test('SoundCloud search cards reflect real playback and their repeated selection checks metadata without recreating the iframe', async () => {
  const h = harness(); await loaded(h); const search = h.music.searchOpenAudio('Song 1'); h.requests.soundcloud[0].resolve([cloud()]); await search;
  const opening = h.music.openAudio('soundcloud:123'); h.requests.soundcloud[1].resolve(cloud()); await opening; await settle();
  const frame = h.frame.children[0], widget = h.widgets[0], card = h.controls.results.querySelector('[data-open-audio-id]');
  widget.emit('READY'); widget.emit('PLAY'); assert.equal(card.querySelector('span').textContent, '暂停');
  const repeat = h.music.openAudio('soundcloud:123'); assert.equal(h.requests.soundcloud[2].refresh, true); h.requests.soundcloud[2].resolve(cloud()); await repeat;
  assert.equal(widget.pauses, 1); widget.emit('PAUSE'); assert.equal(card.querySelector('span').textContent, '播放'); assert.equal(h.frame.children[0], frame);
});

test('a persistent playlist browser remains lazy on other pages until the music popup opens', async () => {
  const h = harness({ inline: true, page: false, persistentBrowser: true });
  assert.ok(h.document.querySelector('[data-music-browser]')); assert.equal(h.requests.playlist.length, 0);
  h.dispatch('pjax:complete'); assert.equal(h.requests.playlist.length, 0);
  for (const callback of h.panel.listeners.toggle || []) callback({ target: h.panel });
  assert.equal(h.requests.playlist.length, 0);
  h.controls['inline-player'].dataset.musicPopupOpen = 'true'; h.dispatch('site:music-popup-open');
  assert.equal(h.requests.playlist.length, 1); await loaded(h);
  h.controls['inline-player'].dataset.musicPopupOpen = 'false'; h.dispatch('pjax:complete');
  h.dispatch('site:music-popup-open'); assert.equal(h.requests.playlist.length, 1);
  assert.equal(h.controls.results.querySelectorAll('.track-card').length, 3);
});

test('persistent browser search survives PJAX and popup reopen without losing draft, results or active media', async () => {
  const h = harness({ inline: true, persistentBrowser: true }); await loaded(h); await resolveCloud(h);
  const frame = h.frame.children[0], widget = h.widgets[0]; widget.emit('READY'); widget.emit('PLAY');
  const search = h.music.search('Pending query'), request = h.requests.audius.at(-1);
  h.controls.keyword.value = 'Next draft'; h.dispatch('input', { target: h.controls.keyword });
  h.dispatch('pjax:send'); assert.equal(request.signal.aborted, false);
  request.resolve([native('Other', 'Pending result', 'Another artist')]); await search;
  h.dispatch('pjax:complete'); h.dispatch('site:music-popup-open');
  assert.equal(h.controls.keyword.value, 'Next draft'); assert.match(h.controls.results.querySelector('h2').textContent, /Pending result/);
  assert.equal(h.frame.children[0], frame); assert.equal(h.widgets[0], widget); assert.equal(h.widgets.length, 1);
  assert.equal(h.controls['toggle-play'].textContent, '暂停'); assert.equal(h.requests.playlist.length, 1);
});

test('an optional official public fallback uses only the imported NetEase ID and keeps unknown authors unchanged', async () => {
  for (const track of [song('1'), song('1', 'i miss you', '账号已注销')]) {
    const h = harness({ config: { allowPublicNeteaseFallback: true } });
    await loaded(h, [{ ...track, url: 'https://untrusted.invalid/file.mp3' }]);
    const pending = h.music.playTrack('netease:1');
    h.requests.audius[0].resolve([]); h.requests.soundcloud[0].resolve([]); assert.equal(await pending, true);
    assert.equal(h.player.audio.src, 'https://music.163.com/song/media/outer/url?id=1.mp3');
    assert.equal(h.player.list.audios[0].provider, 'netease'); assert.equal(h.player.list.audios[0].artist, track.artist);
    assert.ok(h.officialUrls.every(call => call.value.id === 'netease:1' && call.url === h.player.audio.src));
    assert.match(h.controls['player-status'].textContent, /连接.*网易云公开音频/);
    assert.doesNotMatch(h.controls['player-status'].textContent, /正在播放|第三方|Audius/);
    h.player.emit('playing'); assert.match(h.controls['player-status'].textContent, /正在播放.*网易云公开音频/);
    assert.equal(h.controls['current-source'].href, track.sourceUrl);
  }
});

test('strict third-party matches still win and disabled fallback never requests NetEase playback', async () => {
  const thirdParty = harness({ config: { allowPublicNeteaseFallback: true } }); await loaded(thirdParty); await resolveNative(thirdParty);
  assert.equal(thirdParty.player.audio.src, Audius.streamUrl('A1')); assert.equal(thirdParty.officialUrls.length, 0);
  const disabled = harness({ config: { allowPublicNeteaseFallback: false } }); await loaded(disabled);
  const pending = disabled.music.playTrack('netease:1'); disabled.requests.audius[0].resolve([]); disabled.requests.soundcloud[0].resolve([]); await pending;
  assert.equal(disabled.player.playCalls, 0); assert.equal(disabled.officialUrls.length, 0);
});

test('official fallback follows empty, failed, timed-out and ambiguous source searches without relaxing matching', async () => {
  for (const failure of ['error', 'timeout', 'ambiguous']) {
    const h = harness({ config: { allowPublicNeteaseFallback: true } }); await loaded(h);
    const pending = h.music.playTrack('netease:1');
    if (failure === 'error') { h.requests.audius[0].reject(new Error('Unavailable')); h.requests.soundcloud[0].reject(new Error('Unavailable')); }
    else if (failure === 'timeout') { for (const [id, timer] of [...h.timers]) { h.timers.delete(id); timer.fn(); } }
    else { h.requests.audius[0].resolve([native(), native('Second')]); h.requests.soundcloud[0].resolve([]); }
    await pending; assert.equal(h.player.audio.src, Source.officialAudioUrl(song('1'))); assert.equal(h.player.playCalls, 1);
    assert.equal(h.requests.audius.length, 1); assert.equal(h.requests.soundcloud.length, 1);
  }
});

test('official public playback has bounded failure, explicit retry and no error-driven song advance', async () => {
  for (const failure of ['error', 'timeout']) {
    const h = harness({ config: { allowPublicNeteaseFallback: true } }); await loaded(h);
    const pending = h.music.playTrack('netease:1'); h.requests.audius[0].resolve([]); h.requests.soundcloud[0].resolve([]); await pending;
    if (failure === 'error') h.player.emit('error');
    else {
      h.player.emit('canplay'); assert.equal(h.timers.size, 1, 'metadata readiness must not cancel the actual playback deadline');
      for (const [id, timer] of [...h.timers]) { assert.equal(timer.ms, 8000); h.timers.delete(id); timer.fn(); }
    }
    assert.equal(h.player.paused, true); assert.equal(h.timers.size, 0); assert.equal(h.controls['retry-play'].hidden, false);
    assert.match(h.controls['player-status'].textContent, /网易云公开原曲暂时无法播放/);
    assert.equal(h.controls['current-source'].href, song('1').sourceUrl);
    h.player.emit('ended'); h.player.emit('playing'); h.dispatch('pjax:complete');
    assert.equal(h.player.playCalls, 1); assert.equal(h.requests.audius.length, 1); assert.equal(h.requests.soundcloud.length, 1);
    assert.match(h.controls['player-status'].textContent, /无法播放/);
  }
});

test('official public audio shares pause, resume, waiting and successful queue completion controls', async () => {
  const h = harness({ inline: true, persistentBrowser: true, config: { allowPublicNeteaseFallback: true } }); await loaded(h);
  const pending = h.music.playTrack('netease:1'); h.requests.audius[0].resolve([]); h.requests.soundcloud[0].resolve([]); await pending;
  h.player.emit('playing'); h.player.audio.currentTime = 42; assert.equal(h.controls['toggle-play'].textContent, '暂停');
  h.click(h.controls['toggle-play']); assert.equal(h.player.paused, true); assert.equal(h.controls['toggle-play'].textContent, '播放');
  await h.music.playTrack('netease:1'); assert.equal(h.player.paused, false); assert.equal(h.player.audio.currentTime, 42);
  assert.equal(h.requests.audius.length, 1); assert.equal(h.requests.soundcloud.length, 1);
  h.player.emit('playing'); h.player.emit('waiting'); assert.equal(h.timers.size, 1); h.player.emit('playing'); assert.equal(h.timers.size, 0);
  h.dispatch('pjax:send'); h.dispatch('pjax:complete'); h.dispatch('site:music-popup-open');
  assert.equal(h.player.audio.currentTime, 42); assert.equal(h.player.audio.src, Source.officialAudioUrl(song('1')));
  h.player.emit('ended'); assert.equal(h.requests.audius.at(-1).value, 'Song 2 Artist 2');
});

test('newer song selections prevent stale NetEase fallback and old media runs until a new source is mounted', async () => {
  const h = harness({ config: { allowPublicNeteaseFallback: true } }); await loaded(h); await resolveCloud(h);
  const frame = h.frame.children[0], widget = h.widgets[0]; widget.emit('READY'); widget.emit('PLAY');
  const old = h.music.playTrack('netease:2'), oldAudio = h.requests.audius.at(-1), oldCloud = h.requests.soundcloud.at(-1);
  assert.equal(h.frame.children[0], frame); assert.equal(widget.pauses, 0);
  const latest = h.music.playTrack('netease:3'); h.requests.audius.at(-1).resolve([]); h.requests.soundcloud.at(-1).resolve([]); await latest;
  assert.equal(h.player.audio.src, Source.officialAudioUrl(song('3'))); assert.equal(h.frame.children.length, 0);
  oldAudio.resolve([]); oldCloud.resolve([]); await old;
  assert.equal(h.player.audio.src, Source.officialAudioUrl(song('3'))); assert.equal(h.player.playCalls, 1);
  assert.ok(h.officialUrls.every(call => call.value.id === 'netease:3'));
});
