'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../../source/js/music-audius.js');
const source = fs.readFileSync(require.resolve('../../source/js/music-audius.js'), 'utf8');
const row = { id: 'GEG9ZWx', title: 'Original Song', permalink: '/Artist/original-song', duration: 210,
  user: { name: 'Artist', handle: 'Artist', is_verified: true }, artwork: { '480x480': 'https://creator.audius.co/cover.jpg' },
  is_streamable: true, is_stream_gated: false, is_unlisted: false, is_delete: false, is_available: true,
  stream_conditions: null, access_authorities: null, allowed_api_keys: null };
const response = (body, extra = {}) => ({ ok: true, status: 200, text: async () => JSON.stringify(body), ...extra });
function harness(fetchImpl) {
  const requests = [], timers = new Map(); let timerId = 0;
  const context = { URL, AbortController, TextDecoder, Uint8Array, Date,
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id),
    fetch: (url, options) => { requests.push({ url, options }); return fetchImpl(url, options); } };
  vm.runInNewContext(source, context);
  return { api: context.SiteMusicAudius, requests, timers };
}

test('Audius normalization retains only full public metadata, never credentials or caller audio URLs', () => {
  const rows = api.normalizeTracks([{ ...row, url: 'https://other.test/paid.mp3', cookie: 'private', user_signature: 'private', stream: 'private' }, row,
    { ...row, id: 'Other123', title: '<img onerror=evil()>', artwork: { '480x480': 'javascript:evil()' }, permalink: '//evil.test/song' }]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { id: 'audius:GEG9ZWx', trackId: 'GEG9ZWx', provider: 'audius', name: 'Original Song', artist: 'Artist',
    url: 'https://api.audius.co/v1/tracks/GEG9ZWx/stream?app_name=KagielBlog', cover: 'https://creator.audius.co/cover.jpg',
    durationMs: 210000, sourceUrl: 'https://audius.co/Artist/original-song', availability: 'public_full', artistVerified: true });
  assert.equal(rows[1].name, '<img onerror=evil()>'); assert.equal(rows[1].cover, '/img/sky-window.jpg');
  assert.equal(rows[1].sourceUrl, 'https://audius.co/tracks/Other123');
  assert.equal(Object.hasOwn(rows[0], 'cookie'), false); assert.equal(Object.hasOwn(rows[0], 'stream'), false);
});

test('gated, paid, private, deleted and personalized access cannot be promoted to public playback', () => {
  for (const patch of [
    { is_streamable: false }, { is_streamable: undefined }, { is_stream_gated: true }, { is_stream_gated: undefined },
    { is_unlisted: true }, { is_unlisted: undefined }, { is_delete: true }, { is_delete: undefined },
    { is_available: false }, { is_purchaseable: true }, { is_purchaseable: 'false' },
    { stream_conditions: {} }, { stream_conditions: { usdc_purchase: { price: 1 } } },
    { access_authorities: ['wallet'] }, { allowed_api_keys: ['someone-elses-key'] }, { access_authorities: 'wallet' },
    { has_current_user_access: true }, { is_owned_by_user: true }
  ]) assert.equal(api.normalizeTracks([{ ...row, ...patch }]).length, 0, JSON.stringify(patch));
  assert.equal(api.normalizeTracks([{ ...row, is_purchaseable: false, has_current_user_access: false,
    is_owned_by_user: false, access_authorities: [], allowed_api_keys: [], is_downloadable: false }]).length, 1);
});

test('normalization bounds results and rejects invalid identities, duration and text', () => {
  assert.equal(api.normalizeTracks(Array.from({ length: 30 }, (_, i) => ({ ...row, id: 'Song' + i }))).length, 20);
  for (const patch of [{ id: '../secret' }, { id: 123 }, { title: '' }, { title: 'x'.repeat(1001) }, { title: 'a\nb' },
    { user: {} }, { duration: 0 }, { duration: Infinity }, { duration: '210' }, { duration: 86401 }]) {
    assert.equal(api.normalizeTracks([{ ...row, ...patch }]).length, 0);
  }
  assert.equal(api.normalizeTracks([{ ...row, user: { name: '', handle: 'Artist' } }])[0].artist, 'Artist');
  assert.throws(() => api.normalizeTracks({ data: [row] }), error => error.code === 'INVALID_RESPONSE');
});

test('stream URLs stay on the official endpoint and accept only public app keys', () => {
  const url = new URL(api.streamUrl('audius:GEG9ZWx', 'my-public-key'));
  assert.equal(url.origin, 'https://api.audius.co'); assert.equal(url.pathname, '/v1/tracks/GEG9ZWx/stream');
  assert.equal(url.searchParams.get('app_name'), 'KagielBlog'); assert.equal(url.searchParams.get('api_key'), 'my-public-key');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['api_key', 'app_name']);
  for (const id of ['../private', 'x/y', '', 'abc?secret=1', 'x'.repeat(33), 'https://other.test/abc']) assert.throws(() => api.streamUrl(id));
  for (const config of [{ endpoint: 'https://other.test' }, { audiusEndpoint: 'https://api.audius.co/v1/' }, { bearerToken: 'secret' },
    { apiSecret: 'secret' }, { cookie: 'secret' }, { apiKey: 'borrowed key\n' }]) assert.throws(() => api.createClient(config), error => error.code === 'INVALID_CONFIG');
});

test('search is anonymous, fixed-host and cached with isolated returned objects', async () => {
  const h = harness(async () => response({ data: [row] })); const client = h.api.createClient();
  const first = await client.search('Original & Artist'); first[0].name = 'changed';
  assert.equal((await client.search('Original & Artist'))[0].name, row.title); assert.equal(h.requests.length, 1);
  const url = new URL(h.requests[0].url);
  assert.equal(url.origin, 'https://api.audius.co'); assert.equal(url.pathname, '/v1/tracks/search');
  assert.equal(url.searchParams.get('query'), 'Original & Artist'); assert.equal(url.searchParams.get('limit'), '20');
  assert.equal(url.searchParams.get('app_name'), 'KagielBlog'); assert.equal(url.searchParams.has('api_key'), false);
  assert.equal(h.requests[0].options.credentials, 'omit'); assert.equal(h.requests[0].options.redirect, 'error');
  assert.equal(Object.keys(h.requests[0].options.headers).join(), 'Accept'); assert.equal(h.timers.size, 0);
});

test('details revalidate the selected public track and retain only the configured app key', async () => {
  const h = harness(async () => response({ data: row })); const client = h.api.createClient({ apiKey: 'my-public-key' });
  const track = await client.track('audius:GEG9ZWx'); track.artist = 'changed';
  assert.equal((await client.track('GEG9ZWx')).artist, row.user.name); assert.equal(h.requests.length, 1);
  const url = new URL(h.requests[0].url);
  assert.equal(url.pathname, '/v1/tracks/GEG9ZWx'); assert.equal(url.searchParams.get('api_key'), 'my-public-key');
  assert.equal(new URL(track.url).searchParams.get('api_key'), 'my-public-key');
  for (const bad of [{ ...row, id: 'Other123' }, { ...row, is_stream_gated: true }]) {
    const blocked = harness(async () => response({ data: bad }));
    await assert.rejects(blocked.api.createClient().track('GEG9ZWx'), error => error.code === 'NOT_PUBLIC');
  }
});

test('invalid query and cancelled signal never make a network request, including cached requests', async () => {
  const h = harness(async () => response({ data: [row] })); const client = h.api.createClient();
  for (const query of ['', ' ', 'x'.repeat(101), 'artist\nsong', null]) await assert.rejects(client.search(query), error => error.code === 'INVALID_QUERY');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.search('Song', { signal: controller.signal }), error => error.code === 'ABORTED');
  assert.equal(h.requests.length, 0);
  await client.search('Song');
  await assert.rejects(client.search('Song', { signal: controller.signal }), error => error.code === 'ABORTED');
  assert.equal(h.requests.length, 1);
});

test('request timeout includes response body and aborts the network operation', async () => {
  const h = harness(async () => response(null, { text: () => new Promise(() => {}) }));
  const promise = h.api.createClient().search('Song');
  await Promise.resolve(); await Promise.resolve();
  assert.equal([...h.timers.values()][0].ms, 8000); [...h.timers.values()][0].fn();
  await assert.rejects(promise, error => error.code === 'TIMEOUT');
  assert.equal(h.requests[0].options.signal.aborted, true); assert.equal(h.timers.size, 0);
});

test('selection cancellation also interrupts body reading and does not cache late results', async () => {
  let release; const h = harness(async () => response(null, { text: () => new Promise(resolve => { release = resolve; }) }));
  const controller = new AbortController(), client = h.api.createClient();
  const pending = client.search('Song', { signal: controller.signal }); await new Promise(resolve => setImmediate(resolve));
  controller.abort(); await assert.rejects(pending, error => error.code === 'ABORTED');
  release(JSON.stringify({ data: [row] })); await new Promise(resolve => setImmediate(resolve));
  const second = client.search('Song'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests.length, 2); release(JSON.stringify({ data: [row] })); await second;
  assert.equal(h.timers.size, 0);
});

test('response size is enforced for headers, text bytes and streaming chunks', async () => {
  const tooLargeHeader = harness(async () => response({ data: [row] }, { headers: { get: () => '1048577' } }));
  await assert.rejects(tooLargeHeader.api.createClient().search('Song'), error => error.code === 'TOO_LARGE');
  assert.equal(tooLargeHeader.requests[0].options.signal.aborted, true);
  const tooLargeText = harness(async () => response(null, { text: async () => '中'.repeat(350000) }));
  await assert.rejects(tooLargeText.api.createClient().search('Song'), error => error.code === 'TOO_LARGE');
  let cancelled = false, unlocked = false;
  const chunked = harness(async () => response(null, { body: { getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array(1048577) }),
    cancel: async () => { cancelled = true; }, releaseLock: () => { unlocked = true; } }) } }));
  await assert.rejects(chunked.api.createClient().search('Song'), error => error.code === 'TOO_LARGE');
  assert.equal(cancelled, true); assert.equal(unlocked, true);
});

test('error responses and malformed payloads stay failures with no alternate endpoint retry', async () => {
  for (const [status, code] of [[401, 'API_KEY_REQUIRED'], [403, 'UPSTREAM_BLOCKED'], [412, 'UPSTREAM_BLOCKED'], [429, 'UPSTREAM_BLOCKED'], [500, 'HTTP_ERROR']]) {
    const h = harness(async () => response(null, { ok: false, status }));
    await assert.rejects(h.api.createClient().search('Song'), error => error.code === code && error.status === status);
    assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
    assert.equal(h.requests[0].options.signal.aborted, true);
  }
  for (const bad of [response(null), response({ data: {} }), response(null, { text: async () => '<html>blocked</html>' })]) {
    const h = harness(async () => bad);
    await assert.rejects(h.api.createClient().search('Song'), error => error.code === 'INVALID_RESPONSE');
  }
});

test('search cache evicts older queries after the fixed 50 entry cap', async () => {
  const h = harness(async () => response({ data: [row] })); const client = h.api.createClient();
  for (let i = 0; i < 51; i++) await client.search('Song ' + i);
  await client.search('Song 50'); assert.equal(h.requests.length, 51);
  await client.search('Song 0'); assert.equal(h.requests.length, 52);
});
