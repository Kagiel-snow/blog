'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../../source/js/music-source.js');
const source = fs.readFileSync(require.resolve('../../source/js/music-source.js'), 'utf8');
const permalinkUrl = 'https://soundcloud.com/example-artist/coffee';
const row = { id: 'soundcloud:123456', provider: 'soundcloud', permalinkUrl, name: 'Coffee', artist: 'Artist',
  durationMs: 120000, fullDurationMs: 120000, cover: 'https://i1.sndcdn.com/artwork.jpg', availability: 'public_full' };
const oEmbed = html => ({ title: 'Coffee <img onerror=evil()>', author_name: 'Artist & Friend',
  thumbnail_url: 'https://i1.sndcdn.com/artwork.jpg', html: html || '<iframe src="https://w.soundcloud.com/player/?url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F123456&amp;auto_play=false"></iframe>' });
function harness(fetchImpl, location) {
  const requests = [], timers = new Map(); let count = 0;
  const context = { URL, AbortController, location,
    setTimeout: (fn, ms) => { timers.set(++count, { fn, ms }); return count; }, clearTimeout: id => timers.delete(id),
    fetch: (url, options) => { requests.push({ url, options }); return fetchImpl(url, options); } };
  vm.runInNewContext(source, context);
  return { api: context.SiteMusicSource, requests, timers, context };
}

test('public audio links canonicalize only public SoundCloud track pages and block private or system paths', () => {
  assert.equal(api.parseSoundCloudUrl(permalinkUrl), permalinkUrl);
  assert.equal(api.parseSoundCloudUrl(' https://www.soundcloud.com/example-artist/coffee/ '), permalinkUrl);
  assert.equal(api.parseSoundCloudUrl(permalinkUrl + '?si=share-id&utm_source=clipboard&utm_medium=text&utm_campaign=social'), permalinkUrl);
  for (const link of [null, '', 'javascript:evil()', 'http://soundcloud.com/artist/song', 'https://soundcloud.com.evil.test/artist/song',
    'https://user:secret@soundcloud.com/artist/song', 'https://soundcloud.com:8443/artist/song', 'https://soundcloud.com/artist/song?secret_token=s-123',
    'https://soundcloud.com/artist/song?utm_source=copy&secret_token=s-private', 'https://soundcloud.com/artist/song?unknown=value', 'https://soundcloud.com/artist/song#private', 'https://soundcloud.com/artist/song/s-secret',
    'https://soundcloud.com/artist/sets/album', 'https://soundcloud.com/artist/sets', 'https://soundcloud.com/search/sounds',
    'https://soundcloud.com/you/library', 'https://soundcloud.com/artist', 'https://soundcloud.com/artist/%73ong',
    'https://soundcloud.com/artist/song/extra', 'https://soundcloud.com/artist/foo/../song', 'https://soundcloud.com/artist/song?',
    'https://soundcloud.com/artist\\song', 'https://soundcloud.com/artist/likes']) {
    assert.throws(() => api.parseSoundCloudUrl(link), error => error.code === 'INVALID_OPEN_AUDIO', String(link));
  }
});

test('official audio embeds are fixed-host, visible and never autoplay or expose media URLs', () => {
  const url = new URL(api.soundCloudEmbedUrl(permalinkUrl));
  assert.equal(url.origin, 'https://w.soundcloud.com'); assert.equal(url.pathname, '/player/');
  assert.equal(url.searchParams.get('url'), permalinkUrl); assert.equal(url.searchParams.get('auto_play'), 'false');
  assert.equal(url.searchParams.get('show_user'), 'true'); assert.equal(url.searchParams.get('show_artwork'), 'true');
  assert.equal(url.searchParams.get('show_comments'), 'false');
  const search = new URL(api.soundCloudSearchUrl('Coffee & beabadoobee'));
  assert.equal(search.href, 'https://soundcloud.com/search/sounds?q=Coffee+%26+beabadoobee');
  for (const query of ['', 'x'.repeat(101), 'a\nb']) assert.throws(() => api.soundCloudSearchUrl(query));
});

test('open audio normalization retains text, safe identity and canonical source without caller media URLs', () => {
  const tracks = api.normalizeOpenAudioTracks([row, row, { ...row, id: 'soundcloud:789', name: '<script>evil()</script>',
    permalinkUrl: 'https://soundcloud.com/another-artist/song', sourceUrl: 'javascript:evil()', url: 'https://media.test/paid.mp3', cover: 'http://insecure.test/a', availability: 'playable' },
    { ...row, id: 'qq:321' }, { ...row, id: Number.MAX_SAFE_INTEGER + 1 }, { ...row, id: 0 }, { ...row, provider: 'netease' },
    { ...row, id: 456, permalinkUrl: permalinkUrl + '?secret_token=s-private' }]);
  assert.equal(tracks.length, 2); assert.equal(tracks[0].trackId, '123456'); assert.equal(tracks[0].availability, 'public_full');
  assert.equal(tracks[1].name, '<script>evil()</script>'); assert.equal(tracks[1].sourceUrl, tracks[1].permalinkUrl);
  assert.equal(tracks[1].cover, '/img/sky-window.jpg'); assert.equal(tracks[1].availability, 'unchecked'); assert.equal(tracks[1].url, undefined);
  assert.equal(api.normalizeOpenAudioTracks(Array.from({ length: 30 }, (_, i) => ({ ...row, id: i + 1 }))).length, 20);
  assert.throws(() => api.normalizeOpenAudioTracks({ tracks: [row] }), error => error.code === 'INVALID_RESPONSE');
});

test('open audio search and track use the configured HTTPS gateway and isolate cached results', async () => {
  const h = harness(async url => ({ ok: true, json: async () => new URL(url).pathname.endsWith('/track') ? { track: row } : { tracks: [row] } }));
  const client = h.api.createOpenAudioClient({ openAudioEndpoint: 'https://music.example/api/music/audio' });
  const tracks = await client.search('Coffee & Artist'); tracks[0].name = 'changed';
  assert.equal((await client.search('Coffee & Artist'))[0].name, row.name);
  const track = await client.track(permalinkUrl); track.name = 'changed';
  assert.equal((await client.track(permalinkUrl)).name, row.name); assert.equal(h.requests.length, 2);
  const searchUrl = new URL(h.requests[0].url), trackUrl = new URL(h.requests[1].url);
  assert.equal(searchUrl.searchParams.get('q'), 'Coffee & Artist'); assert.equal(trackUrl.pathname, '/api/music/audio/track');
  assert.equal(trackUrl.searchParams.get('url'), permalinkUrl); assert.equal(h.requests[0].options.credentials, 'omit');
  assert.equal(h.timers.size, 0);
});

test('explicit metadata refresh bypasses both local track cache and browser cache and discards stale success on failure', async () => {
  let current = row;
  const h = harness(async () => current ? { ok: true, json: async () => ({ track: current }) }
    : { ok: false, status: 404, json: async () => ({ code: 'AUDIO_UNAVAILABLE' }) });
  const client = h.api.createOpenAudioClient({ openAudioEndpoint: 'https://music.example/api/music/audio' });
  await client.track(permalinkUrl); current = { ...row, name: 'Renamed' };
  assert.equal((await client.track(permalinkUrl)).name, 'Coffee');
  assert.equal((await client.track(permalinkUrl, { refresh: true })).name, 'Renamed');
  assert.equal(h.requests.length, 2); assert.equal(h.requests[1].options.cache, 'no-cache');
  current = undefined;
  await assert.rejects(client.track(permalinkUrl, { refresh: true }), error => error.code === 'AUDIO_UNAVAILABLE');
  await assert.rejects(client.track(permalinkUrl), error => error.code === 'AUDIO_UNAVAILABLE');
  assert.equal(h.requests.length, 4, 'failed refresh must not leave the older success available');
});

test('public_full metadata requires a complete positive duration instead of trusting a supplied flag', () => {
  for (const values of [{ durationMs: 0 }, { fullDurationMs: 0 }, { fullDurationMs: undefined }, { durationMs: 120000, fullDurationMs: 180000 },
    { durationMs: 86400001, fullDurationMs: 86400001 }]) {
    assert.equal(api.normalizeOpenAudioTracks([{ ...row, ...values }])[0].availability, 'unchecked');
  }
});

test('local audio preview uses its route while production requires configuration for general search', async () => {
  const local = harness(async () => ({ ok: true, json: async () => ({ tracks: [row] }) }), { hostname: 'localhost', origin: 'http://localhost:4000' });
  await local.api.createOpenAudioClient().search('Coffee'); assert.match(local.requests[0].url, /^http:\/\/localhost:4000\/api\/music\/audio\?/);
  const production = harness(async () => { throw new Error('unexpected'); }, { hostname: 'kagiel.top', origin: 'https://kagiel.top' });
  await assert.rejects(production.api.createOpenAudioClient().search('Coffee'), error => error.code === 'CONFIG_REQUIRED');
  assert.equal(production.requests.length, 0);
  assert.throws(() => production.api.createOpenAudioClient({ openAudioEndpoint: 'http://insecure.test/api' }), error => error.code === 'INVALID_CONFIG');
});

test('audio caches expire after ten minutes and keep at most fifty successful entries', async () => {
  let clock = 1000;
  const h = harness(async () => ({ ok: true, json: async () => ({ tracks: [row] }) }));
  h.context.Date = { now: () => clock };
  const client = h.api.createOpenAudioClient({ openAudioEndpoint: 'https://music.example/api/music/audio' });
  await client.search('old'); await client.search('old'); assert.equal(h.requests.length, 1);
  clock += 600000; await client.search('old'); assert.equal(h.requests.length, 2);
  for (let i = 0; i < 50; i++) await client.search('song ' + i);
  await client.search('old'); assert.equal(h.requests.length, 53, 'oldest result is removed once fifty newer entries fill the cache');
  await client.search('song 49'); assert.equal(h.requests.length, 53, 'newest result remains cached');
});

test('production known-track oEmbed parses only a trusted numeric iframe identity and never returns supplied HTML', async () => {
  const h = harness(async () => ({ ok: true, json: async () => oEmbed() }), { hostname: 'kagiel.top', origin: 'https://kagiel.top' });
  const track = await h.api.createOpenAudioClient().track(permalinkUrl);
  const requested = new URL(h.requests[0].url);
  assert.equal(requested.origin, 'https://soundcloud.com'); assert.equal(requested.pathname, '/oembed');
  assert.equal(requested.searchParams.get('format'), 'json'); assert.equal(requested.searchParams.get('url'), permalinkUrl);
  assert.equal(track.trackId, '123456'); assert.equal(track.name, 'Coffee <img onerror=evil()>');
  assert.equal(track.artist, 'Artist & Friend'); assert.equal(track.availability, 'unchecked'); assert.equal(track.html, undefined);
  assert.equal(track.url, undefined); assert.equal(track.sourceUrl, permalinkUrl);
});

test('oEmbed removes only the exact final author attribution and preserves version text and other authors', async () => {
  for (const [title, author, expected] of [
    ['Coffee by Artist', 'Artist', 'Coffee'], ['Coffee (Live) by Artist', 'Artist', 'Coffee (Live)'],
    ['Coffee by Other Artist', 'Artist', 'Coffee by Other Artist'], ['Coffee by ARTIST', 'Artist', 'Coffee by ARTIST'],
    ['Coffee by Artist remix', 'Artist', 'Coffee by Artist remix'], ['Coffee by Artist by Artist', 'Artist', 'Coffee by Artist']
  ]) {
    const h = harness(async () => ({ ok: true, json: async () => ({ ...oEmbed(), title, author_name: author }) }));
    const result = await h.api.createOpenAudioClient().track(permalinkUrl);
    assert.equal(result.name, expected); assert.equal(result.availability, 'unchecked');
  }
});

test('oEmbed cannot inject an unrelated iframe, private token, nonnumeric identity or ambiguous URL', async () => {
  for (const html of [
    '<iframe src="https://evil.test/player/?url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F123"></iframe>',
    '<iframe src="https://w.soundcloud.com/player/?url=https%3A%2F%2Fevil.test%2Ftracks%2F123"></iframe>',
    '<iframe src="https://w.soundcloud.com/player/?url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F123%3Fsecret_token%3Ds-private"></iframe>',
    '<iframe src="https://w.soundcloud.com/player/?url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F123&amp;url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F456"></iframe>',
    '<iframe src="https://w.soundcloud.com/player/?url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F9007199254740992"></iframe>',
    '<iframe src="javascript:evil()"></iframe>', oEmbed().html + oEmbed().html, '<script>evil()</script>'
  ]) {
    const h = harness(async () => ({ ok: true, json: async () => oEmbed(html) }));
    await assert.rejects(h.api.createOpenAudioClient().track(permalinkUrl), error => error.code === 'INVALID_RESPONSE');
  }
});

test('explicit audio-service restriction never falls back to oEmbed or caches failures', async () => {
  const h = harness(async () => ({ ok: false, status: 403, json: async () => ({ code: 'AUDIO_RESTRICTED', message: '这个版本暂不公开。' }) }));
  const client = h.api.createOpenAudioClient({ openAudioEndpoint: 'https://music.example/api/music/audio' });
  await assert.rejects(client.track(permalinkUrl), error => error.code === 'AUDIO_RESTRICTED');
  await assert.rejects(client.track(permalinkUrl), error => error.code === 'AUDIO_RESTRICTED');
  assert.equal(h.requests.length, 2); assert.equal(h.requests.every(request => new URL(request.url).hostname === 'music.example'), true);
  assert.equal(h.timers.size, 0);
});

test('open audio failures, cancellation and timeout terminate without caching or leaking timers', async () => {
  for (const [fetchImpl, code] of [
    [async () => { throw new TypeError('network'); }, 'NETWORK'], [async () => ({ ok: false, status: 503 }), 'HTTP'],
    [async () => ({ ok: true, json: async () => ({ tracks: {} }) }), 'INVALID_RESPONSE']]) {
    const h = harness(fetchImpl), client = h.api.createOpenAudioClient({ openAudioEndpoint: 'https://music.example/api/music/audio' });
    await assert.rejects(client.search('Coffee'), error => error.code === code);
    await assert.rejects(client.search('Coffee'), error => error.code === code);
    assert.equal(h.requests.length, 2); assert.equal(h.timers.size, 0);
  }
  const h = harness(() => new Promise(() => {})), control = new AbortController();
  const client = h.api.createOpenAudioClient({ openAudioEndpoint: 'https://music.example/api/music/audio', timeoutMs: 1234 });
  const pending = client.search('Coffee', { signal: control.signal }), check = assert.rejects(pending, error => error.code === 'ABORTED');
  control.abort(); await check; assert.equal(h.requests[0].options.signal.aborted, true); assert.equal(h.timers.size, 0);
  const timed = client.track(permalinkUrl), timedCheck = assert.rejects(timed, error => error.code === 'TIMEOUT');
  [...h.timers.values()][0].fn(); await timedCheck; assert.equal(h.requests[1].options.signal.aborted, true); assert.equal(h.timers.size, 0);
  await assert.rejects(client.search('Coffee', { signal: control.signal }), error => error.code === 'ABORTED');
  assert.equal(h.requests.length, 2);
});
