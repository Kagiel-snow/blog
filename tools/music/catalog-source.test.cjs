'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../source/js/music-source.js'), 'utf8');
const { normalizeCatalogTracks, normalizeTracks } = require('../../source/js/music-source.js');
const meting = (id = '123', extra = {}) => ({ title: 'Coffee', author: 'beabadoobee',
  url: 'https://api.i-meto.com/meting/api?server=netease&type=url&id=' + id,
  pic: 'https://p1.music.126.net/cover.jpg', ...extra });

function harness(response) {
  const requests = [], timers = new Map(); let timerId = 0;
  const context = { URL, AbortController,
    setTimeout(fn, ms) { timers.set(++timerId, { fn, ms }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options) {
      const request = { url, options }; requests.push(request);
      return response ? response(url, options) : new Promise(resolve => { request.resolve = resolve; });
    } };
  vm.runInNewContext(source, context);
  return { api: context.SiteMusicSource, requests, timers };
}

test('catalog accepts metadata with an explicit NetEase ID and no playable media address', () => {
  const tracks = normalizeCatalogTracks([
    { songId: '000123', name: ' Coffee ', artist: ' beabadoobee ', cover: 'https://images.example/coffee.jpg' },
    { id: 'netease:456', title: '同名歌曲', author: '另一位歌手' },
    { id: 789, title: '另一首歌曲', author: '原作者' }
  ], '/img/fallback.jpg');
  assert.deepEqual(tracks[0], { id: 'netease:123', songId: '123', name: 'Coffee', artist: 'beabadoobee',
    cover: 'https://images.example/coffee.jpg', sourceUrl: 'https://music.163.com/#/song?id=123' });
  assert.deepEqual(tracks.map(track => track.songId), ['123', '456', '789']);
  assert.equal(tracks[1].cover, '/img/fallback.jpg');
  assert.ok(tracks.every(track => !Object.hasOwn(track, 'url')));
});

test('catalog extracts Meting identifiers, preserves song and artist metadata, and discards every media field', () => {
  const [track] = normalizeCatalogTracks([meting('1309995372', { title: '歌曲 <名字>', author: '歌手 & 伙伴',
    lrc: 'https://lyrics.example/?token=secret', streamUrl: 'https://audio.example/never-play.mp3', token: 'secret' })]);
  assert.deepEqual(track, { id: 'netease:1309995372', songId: '1309995372', name: '歌曲 <名字>', artist: '歌手 & 伙伴',
    cover: 'https://p1.music.126.net/cover.jpg', sourceUrl: 'https://music.163.com/#/song?id=1309995372' });
  assert.ok(!JSON.stringify(track).includes('type=url'));
  assert.ok(!JSON.stringify(track).includes('secret'));
  assert.ok(!JSON.stringify(track).includes('never-play'));
});

test('unsafe supplied addresses never become catalog output or an alternate identifier source', () => {
  for (const url of ['javascript:alert(1)', 'http://audio.example/?id=123', 'https://user:pass@audio.example/?id=123',
    'https://audio.example/a\\b?id=123', 'https://audio.example/a\nb?id=123']) {
    assert.deepEqual(normalizeCatalogTracks([meting('123', { url })]), [], url);
    const [track] = normalizeCatalogTracks([meting('123', { id: '123', url, pic: url })]);
    assert.equal(track.songId, '123');
    assert.equal(track.cover, '/img/sky-window.jpg');
    assert.ok(!Object.hasOwn(track, 'url'));
  }
  assert.deepEqual(normalizeCatalogTracks([meting('123', { url: 'https://audio.example/?id=123&id=456' })]), []);
  assert.deepEqual(normalizeCatalogTracks([meting('123', { id: 'qq:123' })]), []);
});

test('catalog identity distinguishes different songs with the same title and never uses a title as the queue key', () => {
  const tracks = normalizeCatalogTracks([meting('1'), meting('2', { author: 'another artist' }), meting('0001'),
    meting('3', { title: '' }), null, []]);
  assert.deepEqual(tracks.map(track => [track.id, track.name, track.artist]), [
    ['netease:1', 'Coffee', 'beabadoobee'], ['netease:2', 'Coffee', 'another artist']
  ]);
  assert.equal(normalizeCatalogTracks(Array.from({ length: 1001 }, (_, index) => meting(String(index + 1)))).length, 1000);
  assert.throws(() => normalizeCatalogTracks({ songs: [] }), error => error.code === 'INVALID_RESPONSE');
});

test('catalog-only client permits a single playlist metadata request and never requests media', async () => {
  const h = harness(async () => ({ ok: true, json: async () => [meting(), { id: '456', name: '第二首歌', artist: '原唱' }] }));
  const tracks = await h.api.createClient({ catalogOnly: true }).request('playlist', '123');
  assert.equal(h.requests.length, 1);
  const url = new URL(h.requests[0].url);
  assert.equal(url.searchParams.get('type'), 'playlist');
  assert.equal(url.searchParams.get('server'), 'netease');
  assert.equal(url.searchParams.get('id'), '123');
  assert.equal(tracks.length, 2);
  assert.ok(tracks.every(track => !Object.hasOwn(track, 'url')));
  assert.equal(h.requests[0].options.credentials, 'omit');
  assert.equal(h.timers.size, 0);
});

test('catalog-only search and song requests reject before creating any timeout or network request', async () => {
  const h = harness(), client = h.api.createClient({ catalogOnly: true });
  for (const [type, value] of [['search', 'Coffee beabadoobee'], ['song', '123']]) {
    await assert.rejects(client.request(type, value), error => error.code === 'CATALOG_ONLY');
  }
  assert.equal(h.requests.length, 0); assert.equal(h.timers.size, 0);
});

test('catalog-only playlist cancellation and timeout retain the original cleanup and late-response guards', async () => {
  const h = harness(), client = h.api.createClient({ catalogOnly: true, timeoutMs: 4321, endpoints: ['https://api.i-meto.com/meting/api'] });
  const pending = client.request('playlist', '123');
  const timedOut = assert.rejects(pending, error => error.code === 'TIMEOUT');
  [...h.timers.values()][0].fn(); await timedOut;
  assert.equal(h.requests[0].options.signal.aborted, true); assert.equal(h.timers.size, 0);
  h.requests[0].resolve({ ok: true, json: async () => [meting()] });
  const controller = new AbortController(), cancelled = client.request('playlist', '456', { signal: controller.signal });
  const assertion = assert.rejects(cancelled, error => error.code === 'ABORTED'); controller.abort(); await assertion;
  assert.equal(h.requests[1].options.signal.aborted, true); assert.equal(h.timers.size, 0);
  await assert.rejects(client.request('playlist', '456', { signal: controller.signal }), error => error.code === 'ABORTED');
  assert.equal(h.requests.length, 2);
});

test('non-catalog clients keep existing searchable and playable normalization', async () => {
  const h = harness(async () => ({ ok: true, json: async () => [meting()] }));
  const result = await h.api.createClient({ catalogOnly: false }).request('search', 'Coffee beabadoobee');
  assert.equal(result[0].url, normalizeTracks([meting()])[0].url);
  assert.equal(new URL(h.requests[0].url).searchParams.get('type'), 'search');
});
