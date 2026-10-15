'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../source/js/music-source.js'), 'utf8');
const { normalizeTracks, parsePlaylistId, escapeHtml } = require('../../source/js/music-source.js');
const row = (id = '123', extra = {}) => ({
  title: '歌曲 <名字>', author: '歌手 & 伙伴',
  url: 'https://api.i-meto.com/meting/api?server=netease&type=url&id=' + id,
  pic: 'https://p1.music.126.net/cover.jpg', ...extra
});

function harness(fetchResponse) {
  const timers = new Map(), requests = [];
  let timerId = 0;
  const context = {
    URL, AbortController,
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; },
    clearTimeout: id => timers.delete(id),
    fetch: (url, options) => {
      requests.push({ url, options });
      return fetchResponse ? fetchResponse(url, options) : new Promise(resolve => { requests.at(-1).resolve = resolve; });
    }
  };
  vm.runInNewContext(source, context);
  return { api: context.SiteMusicSource, timers, requests };
}

test('playlist input accepts numeric IDs and only intended HTTPS NetEase playlist links', () => {
  for (const [input, expected] of [
    [' 123 ', '123'], [123, '123'], ['000123', '123'],
    ['https://music.163.com/playlist?id=123&userid=456', '123'],
    ['https://music.163.com/#/playlist?id=123', '123']
  ]) assert.equal(parsePlaylistId(input), expected);
  for (const input of [
    null, {}, -1, Number.MAX_SAFE_INTEGER + 1, '1e4', '123&server=qq',
    'https://music.163.com.evil.example/playlist?id=123',
    'https://evil.example/?url=https://music.163.com/playlist?id=123',
    'http://music.163.com/playlist?id=123',
    'https://user:pass@music.163.com/playlist?id=123',
    'https://music.163.com/song?id=123', 'https://music.163.com/#/song?id=123',
    'https://music.163.com/playlist?id=123&id=456',
    'https://music.163.com/playlist?id=123%27)',
    'https://music.163.com/playlist?id=' + '1'.repeat(21)
  ]) assert.throws(() => parsePlaylistId(input), /歌单/);
});

test('tracks retain plain metadata, deduplicate by song ID and cap the usable queue', () => {
  const tracks = normalizeTracks([row(), row('000123'), row('456')]);
  assert.equal(tracks.length, 2);
  assert.deepEqual(tracks[0], {
    id: 'netease:123', songId: '123', name: '歌曲 <名字>', artist: '歌手 & 伙伴',
    url: row().url, cover: row().pic, sourceUrl: 'https://music.163.com/#/song?id=123'
  });
  assert.equal(escapeHtml(tracks[0].name), '歌曲 &lt;名字&gt;');
  assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(normalizeTracks(Array.from({ length: 250 }, (_, index) => row(String(index + 1)))).length, 200);
  assert.deepEqual(normalizeTracks([]), []);
  assert.throws(() => normalizeTracks({ code: 200, songs: [] }), /格式/);
});

test('unsafe audio URLs are skipped and unusable covers fall back to local artwork', () => {
  const unsafe = [
    'http://audio.example/song?id=123', 'javascript:alert(1)',
    'https://user:pass@audio.example/song?id=123',
    'https://audio.example/a\'b?id=123', 'https://audio.example/a"b?id=123',
    'https://audio.example/a(b)?id=123', 'https://audio.example/a\\b?id=123',
    'https://audio.example/a\nb?id=123', 'https://audio.example/song?id=x',
    'https://audio.example/song?id=123&id=456', 'https://audio.example/song'
  ];
  for (const url of unsafe) assert.deepEqual(normalizeTracks([row('123', { url })]), [], url);
  const tracks = normalizeTracks([null, [], row('123', { title: '' }), row('456', { pic: 'javascript:alert(1)' })], '/img/fallback.jpg');
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].cover, '/img/fallback.jpg');
  assert.equal(normalizeTracks([row('123', { pic: '//audio.example/cover.jpg' })], 'https://elsewhere.example/cover.jpg')[0].cover, '/img/sky-window.jpg');
});

test('requests encode queries and clear timeout/listeners on successful completion', async () => {
  const h = harness(async () => ({ ok: true, json: async () => [row()] }));
  const external = new AbortController();
  let added = 0, removed = 0;
  const originalAdd = external.signal.addEventListener.bind(external.signal);
  const originalRemove = external.signal.removeEventListener.bind(external.signal);
  external.signal.addEventListener = (...args) => { added++; originalAdd(...args); };
  external.signal.removeEventListener = (...args) => { removed++; originalRemove(...args); };
  const result = await h.api.createClient().request('search', '歌曲 & server=qq', { signal: external.signal });
  const url = new URL(h.requests[0].url);
  assert.equal(url.searchParams.get('server'), 'netease');
  assert.equal(url.searchParams.get('type'), 'search');
  assert.equal(url.searchParams.get('id'), '歌曲 & server=qq');
  assert.equal(result[0].id, 'netease:123');
  assert.equal(h.requests[0].options.credentials, 'omit');
  assert.equal(h.timers.size, 0);
  assert.equal(added, removed);
});

test('network, HTTP and malformed responses fail clearly and leave no timeout behind', async () => {
  for (const [response, code] of [
    [async () => { throw new TypeError('Failed to fetch'); }, 'NETWORK'],
    [async () => ({ ok: false, status: 503 }), 'HTTP'],
    [async () => ({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } }), 'INVALID_RESPONSE'],
    [async () => ({ ok: true, json: async () => ({ code: 200 }) }), 'INVALID_RESPONSE']
  ]) {
    const h = harness(response);
    await assert.rejects(h.api.createClient().request('song', '123'), error => error.code === code);
    assert.equal(h.timers.size, 0);
  }
});

test('timeouts and user cancellation reject even when fetch ignores abort, then clean up', async () => {
  const h = harness();
  const pending = h.api.createClient({ timeoutMs: 4321, endpoints: ['https://one.example/api'] }).request('playlist', '123');
  const assertion = assert.rejects(pending, error => error.code === 'TIMEOUT');
  assert.equal([...h.timers.values()][0].ms, 4321);
  [...h.timers.values()][0].fn();
  await assertion;
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.equal(h.timers.size, 0);
  h.requests[0].resolve({ ok: true, json: async () => [row()] });
  const external = new AbortController();
  const cancelled = h.api.createClient({ endpoints: ['https://one.example/api'] }).request('song', '456', { signal: external.signal });
  const cancelledAssertion = assert.rejects(cancelled, error => error.code === 'ABORTED');
  external.abort();
  await cancelledAssertion;
  assert.equal(h.requests[1].options.signal.aborted, true);
  assert.equal(h.timers.size, 0);
  await assert.rejects(h.api.createClient().request('song', '456', { signal: external.signal }), error => error.code === 'ABORTED');
  assert.equal(h.requests.length, 2, 'an already cancelled request must not reach the network');
});

test('invalid request/config inputs cannot launch a network request', async () => {
  const h = harness();
  const client = h.api.createClient();
  for (const [type, input] of [['url', '123'], ['song', '123&server=qq'], ['search', ''], ['search', 'a'.repeat(81)], ['search', 'abc\ndef']]) {
    await assert.rejects(client.request(type, input), error => error.code === 'INVALID_REQUEST');
  }
  assert.throws(() => h.api.createClient({ endpoint: 'http://insecure.example/api' }), /HTTPS/);
  assert.throws(() => h.api.createClient({ endpoints: ['https://ok.example/api', 'http://insecure.example/api'] }), /HTTPS/);
  assert.equal(h.requests.length, 0);
  assert.equal(h.timers.size, 0);
});

test('a failing mirror falls back to the next one, which is then preferred, and reads name/artist rows', async () => {
  const calls = [];
  const h = harness(async url => {
    calls.push(new URL(url).host);
    if (url.startsWith('https://down.example/')) throw new TypeError('Failed to fetch');
    return { ok: true, json: async () => [{ name: '镜像歌曲', artist: '镜像歌手', url: 'https://up.example/?type=url&id=7', pic: 'https://up.example/p.jpg' }] };
  });
  const client = h.api.createClient({ endpoints: ['https://down.example/api', 'https://up.example/meting/'] });
  const tracks = await client.request('playlist', '123');
  assert.deepEqual(calls, ['down.example', 'up.example']);
  assert.equal(tracks[0].name, '镜像歌曲');
  assert.equal(tracks[0].artist, '镜像歌手');
  await client.request('search', '再来一次');
  assert.deepEqual(calls, ['down.example', 'up.example', 'up.example']);
  assert.equal(h.timers.size, 0);
});

test('song checks treat redirects as playable, 4xx as locked, and errors as unknown', async () => {
  const replies = { 1: { type: 'opaqueredirect', status: 0 }, 2: { type: 'cors', status: 404, ok: false }, 3: { type: 'cors', status: 503, ok: false } };
  const seen = [];
  const h = harness(async (url, options) => {
    seen.push(options.method + ' ' + options.redirect);
    const id = new URL(url).searchParams.get('id');
    if (id === '4') throw new TypeError('Failed to fetch');
    return replies[id];
  });
  const client = h.api.createClient();
  const track = id => ({ url: 'https://api.example/meting?type=url&id=' + id });
  assert.equal(await client.check(track(1)), 'ok');
  assert.equal(await client.check(track(2)), 'unavailable');
  assert.equal(await client.check(track(3)), 'unknown');
  assert.equal(await client.check(track(4)), 'unknown');
  assert.equal(await client.check({ url: 'javascript:alert(1)' }), 'unavailable');
  assert.equal(await client.check(track(2)), 'unavailable');
  assert.equal(seen.length, 4, 'definite answers are cached');
  assert.ok(seen.every(item => item === 'GET manual'), 'redirects are not followed, so no audio is downloaded');
  assert.equal(h.timers.size, 0);
});
