'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createServer } = require('../i18n/serve.cjs');
const gatewayModule = import('./gateway.mjs');
const origin = 'https://blog.example';
const item = (fields = {}) => ({ type: 'video', bvid: 'BV1xx411c7mD', title: '<em class="keyword">Coffee</em> &amp; 音乐',
  author: '歌手 &quot;甲&quot;', duration: '03:09', pic: '//i0.hdslb.com/cover.jpg', ...fields });
const payload = (result = [item()], extra = {}) => ({ code: 0, data: { result, numResults: 30, ...extra } });
const response = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const request = (query = 'Coffee', extra = {}) => new Request('https://gateway.example/api/music/videos?q=' + encodeURIComponent(query),
  { headers: { Origin: origin }, ...extra });
const videoRequest = (search = '?bvid=BV1124y1x72L&p=1', extra = {}) => new Request('https://gateway.example/api/music/video' + search,
  { headers: { Origin: origin }, ...extra });
const videoPayload = (fields = {}) => ({ code: 0, data: {
  bvid: 'BV1124y1x72L', title: '<em>nop</em> &amp; 音乐', state: 0, owner: { name: '作者 &quot;甲&quot;' },
  pic: '//i0.hdslb.com/cover.jpg', rights: { pay: 0, ugc_pay: 0, ugc_pay_preview: 0, arc_pay: 0, no_share: 0 },
  is_upower_exclusive: false, is_upower_play: false, is_upower_preview: false,
  pages: [{ page: 1, cid: 1057559731, duration: 102 }, { page: 2, cid: 1057559732, duration: 189 }], ...fields
} });
const publicAudioLink = 'https://soundcloud.com/artist/song';
const audioRequest = (query = 'Coffee', extra = {}) => new Request('https://gateway.example/api/music/audio?q=' + encodeURIComponent(query),
  { headers: { Origin: origin }, ...extra });
const audioTrackRequest = (url = publicAudioLink, extra = {}) => new Request('https://gateway.example/api/music/audio/track?url=' + encodeURIComponent(url),
  { headers: { Origin: origin }, ...extra });
const audioSound = (fields = {}) => ({ id: 123456, title: 'Coffee', permalink_url: publicAudioLink,
  user: { username: 'artist', permalink_url: 'https://soundcloud.com/artist' }, duration: 189000, full_duration: 189000,
  artwork_url: 'https://i1.sndcdn.com/cover.jpg', sharing: 'public', embeddable_by: 'all', streamable: true, policy: 'ALLOW',
  media: { transcodings: [{ url: 'https://private-media.example/audio?token=not-for-response' }] },
  track_authorization: 'not-for-response', secret_token: 'not-for-response', ...fields });
const audioPage = fields => '<html><script>window.__sc_hydration = ' + JSON.stringify([
  { hydratable: 'apiClient', data: { id: 'not-for-response' } }, { hydratable: 'sound', data: audioSound(fields) }
]) + ';</script></html>';
const audioSearchPage = links => '<html><noscript><ul>' + links.map(link => '<li><h2><a href="' + link + '">Music</a></h2></li>').join('') + '</ul></noscript></html>';
const htmlResponse = (html, options = {}) => new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' }, ...options });
async function handler(fetchImpl, options = {}) {
  return (await gatewayModule).createMusicGateway({ fetchImpl, allowedOrigins: [origin], uniqueQueryIntervalMs: 0, ...options });
}
async function bodyOf(handle, req = request()) {
  const result = await handle(req);
  return { response: result, body: await result.json() };
}

test('gateway searches a fixed official metadata endpoint and returns clean public playback metadata', async () => {
  let seen;
  const handle = await handler(async (url, options) => { seen = { url: new URL(url), options }; return response(payload()); });
  const { response: result, body } = await bodyOf(handle, request('  Coffee   音乐  '));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(seen.url.origin + seen.url.pathname, 'https://api.bilibili.com/x/web-interface/search/type');
  assert.deepEqual(Object.fromEntries(seen.url.searchParams), { search_type: 'video', keyword: 'Coffee 音乐', page: '1' });
  assert.deepEqual(seen.options.headers, { Accept: 'application/json' });
  assert.equal(seen.options.credentials, 'omit');
  assert.equal(seen.options.redirect, 'error');
  assert.equal(seen.options.method, 'GET');
  assert.ok(seen.options.signal instanceof AbortSignal);
  assert.deepEqual(body, { tracks: [{ id: 'bilibili:BV1xx411c7mD', videoId: 'BV1xx411c7mD',
    name: 'Coffee & 音乐', artist: '歌手 "甲"', duration: '3:09', cover: 'https://i0.hdslb.com/cover.jpg',
    sourceUrl: 'https://www.bilibili.com/video/BV1xx411c7mD' }], total: 30, page: 1 });
  assert.ok(!JSON.stringify(body).includes('media.'));
});

test('paid, chargeable, malformed, duplicate and non-video results never become playback choices', async () => {
  const handle = await handler(async () => response(payload([
    item({ bvid: 'BV1xx411c7mA', is_pay: 1 }), item({ bvid: 'BV1xx411c7mB', is_charge_video: '1' }),
    item({ bvid: 'BV1xx411c7mC', type: 'live' }), item({ bvid: '../evil' }), item(), item(), null,
    item({ bvid: 'BV1xx411c7mE', is_pay: 0, is_charge_video: '0', title: '&#x4e2d;&#25991; &lt;em&gt;音乐&lt;/em&gt;',
      pic: 'https://user:password@i0.hdslb.com/a.jpg', duration: '1:02:03' }),
    item({ bvid: 'BV1xx411c7mF', pic: 'https://attacker.example/a.jpg', duration: '3:90' }),
    item({ bvid: 'BV1xx411c7mG', rights: { no_share: 1 } }), item({ bvid: 'BV1xx411c7mH', is_upower_exclusive: true })
  ])));
  const { body } = await bodyOf(handle);
  assert.deepEqual(body.tracks.map(track => track.videoId), ['BV1xx411c7mD', 'BV1xx411c7mE', 'BV1xx411c7mF']);
  assert.equal(body.tracks[1].name, '中文 音乐');
  assert.equal(body.tracks[1].cover, '');
  assert.equal(body.tracks[1].duration, '62:03');
  assert.equal(body.tracks[2].cover, '');
  assert.equal(body.tracks[2].duration, '');
});

test('valid empty results remain empty and carry the requested page', async () => {
  const handle = await handler(async () => response(payload([], { numResults: 0 })));
  const { body, response: result } = await bodyOf(handle, new Request('https://gateway.example/api/music/videos?q=NoSong&page=5', { headers: { Origin: origin } }));
  assert.equal(result.status, 200);
  assert.deepEqual(body, { tracks: [], total: 0, page: 5 });
});

test('invalid and duplicate inputs are rejected before fetching', async () => {
  let calls = 0;
  const handle = await handler(async () => { calls++; return response(payload()); });
  for (const search of ['', '?q=', '?q=%20%20', '?q=' + 'a'.repeat(101), '?q=bad%0Aword', '?q=bad%E2%80%AEword',
    '?q=song&q=other', '?q=song&page=1&page=2', '?q=song&page=', '?q=song&page=0', '?q=song&page=6', '?q=song&page=1.0',
    '?q=song&url=https://attacker.example']) {
    const { response: result } = await bodyOf(handle, new Request('https://gateway.example/api/music/videos' + search, { headers: { Origin: origin } }));
    assert.equal(result.status, 400, search);
  }
  assert.equal(calls, 0);
  const accepted = await handle(request(' ' + 'a'.repeat(100) + ' '));
  assert.equal(accepted.status, 200);
});

test('production origin configuration fails closed while localhost is an explicit preview setting', async () => {
  let calls = 0;
  const handle = await handler(async () => { calls++; return response(payload()); });
  for (const headers of [{}, { Origin: 'null' }, { Origin: 'https://blog.example.attacker.example' },
    { Origin: origin + '/' }, { Origin: 'http://localhost:4000' }]) {
    const { response: result } = await bodyOf(handle, new Request('https://gateway.example/api/music/videos?q=song', { headers }));
    assert.equal(result.status, 403);
    assert.equal(result.headers.get('Access-Control-Allow-Origin'), null);
  }
  assert.equal(calls, 0);
  const { createMusicGateway } = await gatewayModule;
  const failClosed = createMusicGateway({ fetchImpl: () => { throw new Error('must not fetch'); } });
  assert.equal((await failClosed(request())).status, 403);
  assert.equal((await (await gatewayModule).default.fetch(request(), {})).status, 403, 'undeclared Worker origins fail closed');
  const local = await handler(async () => response(payload()), { allowLocalhost: true });
  assert.equal((await local(new Request('http://localhost:4000/api/music/videos?q=song'))).status, 200);
  assert.equal((await local(request('song', { headers: { Origin: 'http://127.0.0.1:4000' } }))).status, 200);
  assert.equal((await local(new Request('http://attacker.example/api/music/videos?q=song'))).status, 403);
});

test('route and method constraints permit a configured GET preflight without network work', async () => {
  const handle = await handler(() => { throw new Error('must not fetch'); });
  const options = await handle(request('', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } }));
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
  for (const method of ['POST', 'HEAD', 'PUT', 'DELETE']) {
    const result = await handle(request('song', { method }));
    assert.equal(result.status, 405);
    assert.equal(result.headers.get('Allow'), 'GET, OPTIONS');
  }
  assert.equal((await handle(new Request('https://gateway.example/other?q=song', { headers: { Origin: origin } }))).status, 404);
  assert.equal((await handle(request('', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } }))).status, 405);
});

test('a platform 412 stays a failure and adds a cooldown rather than trying headers or alternate targets', async () => {
  let calls = 0;
  const handle = await handler(async () => { calls++; return new Response('blocked', { status: 412 }); });
  const denied = await bodyOf(handle);
  assert.equal(denied.response.status, 502);
  assert.equal(denied.body.code, 'UPSTREAM_BLOCKED');
  const subsequent = await bodyOf(handle, request('other'));
  assert.equal(subsequent.response.status, 429);
  assert.ok(Number(subsequent.response.headers.get('Retry-After')) > 0);
  assert.equal(calls, 1);
});

test('network errors, non-200 responses, API errors and malformed bodies never become successful results', async () => {
  const inputs = [async () => { throw new Error('private diagnostic'); }, async () => new Response('{}', { status: 201 }),
    async () => new Response('redirect', { status: 302 }), async () => response({ code: -400, message: 'private diagnostic' }),
    async () => response({ code: 0, data: { result: {} } }), async () => new Response('<html/>', { headers: { 'Content-Type': 'text/html' } }),
    async () => new Response('{bad', { headers: { 'Content-Type': 'application/json' } })];
  for (const fetchImpl of inputs) {
    const { response: result, body } = await bodyOf(await handler(fetchImpl));
    assert.equal(result.status, 502);
    assert.ok(body.code.startsWith('UPSTREAM_'));
    assert.ok(!JSON.stringify(body).includes('private diagnostic'));
  }
});

test('response byte limits apply both to declared length and streamed bodies', async () => {
  const declared = await handler(async () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '1000' } }), { maxResponseBytes: 256 });
  assert.equal((await declared(request())).status, 502);
  const streamed = await handler(async () => response(payload([item({ title: 'a'.repeat(2000) })])), { maxResponseBytes: 256 });
  const result = await bodyOf(streamed);
  assert.equal(result.response.status, 502);
  assert.equal(result.body.code, 'UPSTREAM_INVALID_RESPONSE');
});

test('deadline applies even when fetch ignores abort and a later request can retry', async () => {
  let calls = 0, signal;
  const handle = await handler(async (_url, options) => {
    calls++; signal = options.signal;
    if (calls === 1) return new Promise(() => {});
    return response(payload());
  }, { timeoutMs: 15 });
  const result = await bodyOf(handle);
  assert.equal(result.response.status, 504);
  assert.equal(result.body.code, 'UPSTREAM_TIMEOUT');
  assert.equal(signal.aborted, true);
  assert.equal((await handle(request())).status, 200);
  assert.equal(calls, 2);
});

test('deadline covers a stalled JSON body after the HTTP headers arrive', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; } });
  const handle = await handler(async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }), { timeoutMs: 15 });
  const result = await bodyOf(handle);
  assert.equal(result.response.status, 504);
  assert.equal(result.body.code, 'UPSTREAM_TIMEOUT');
  assert.equal(cancelled, true);
});

test('singleflight shares one upstream call and completed results are cached for ten minutes', async () => {
  let calls = 0, release, clock = 1000;
  const handle = await handler(async () => {
    calls++;
    if (calls === 1) await new Promise(resolve => { release = resolve; });
    return response(payload());
  }, { now: () => clock });
  const first = handle(request()), duplicate = handle(request());
  release();
  assert.deepEqual(await (await first).json(), await (await duplicate).json());
  assert.equal(calls, 1);
  clock += 599999;
  assert.equal((await handle(request())).status, 200);
  assert.equal(calls, 1);
  clock += 1;
  assert.equal((await handle(request())).status, 200);
  assert.equal(calls, 2);
});

test('cache size is bounded and a unique-query throttle leaves cached requests usable', async () => {
  let calls = 0, clock = 1000;
  const handle = await handler(async () => { calls++; return response(payload()); },
    { now: () => clock, maxCacheEntries: 2, uniqueQueryIntervalMs: 1500 });
  assert.equal((await handle(request('one'))).status, 200);
  assert.equal((await handle(request('two'))).status, 429);
  assert.equal((await handle(request('one'))).status, 200);
  clock += 1500;
  assert.equal((await handle(request('two'))).status, 200);
  clock += 1500;
  assert.equal((await handle(request('three'))).status, 200);
  clock += 1500;
  assert.equal((await handle(request('one'))).status, 200, 'oldest cache entry was evicted');
  assert.equal(calls, 4);
});

test('selected video validation uses only anonymous fixed view metadata and returns the matching public P', async () => {
  let seen;
  const handle = await handler(async (url, options) => { seen = { url: new URL(url), options }; return response(videoPayload()); });
  const { response: result, body } = await bodyOf(handle, videoRequest('?bvid=BV1124y1x72L&p=2'));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(seen.url.origin + seen.url.pathname, 'https://api.bilibili.com/x/web-interface/view');
  assert.deepEqual(Object.fromEntries(seen.url.searchParams), { bvid: 'BV1124y1x72L' });
  assert.deepEqual(seen.options.headers, { Accept: 'application/json' });
  assert.equal(seen.options.method, 'GET');
  assert.equal(seen.options.credentials, 'omit');
  assert.equal(seen.options.redirect, 'error');
  assert.ok(seen.options.signal instanceof AbortSignal);
  assert.deepEqual(body, { videoId: 'BV1124y1x72L', page: 2, cid: 1057559732, name: 'nop & 音乐', artist: '作者 "甲"',
    duration: '3:09', cover: 'https://i0.hdslb.com/cover.jpg', sourceUrl: 'https://www.bilibili.com/video/BV1124y1x72L?p=2',
    availability: 'metadata_ok' });
  assert.equal(body.url, undefined);
  assert.equal(body.playable, undefined, 'public metadata is not proof that the external player will play');
  const first = await bodyOf(handle, videoRequest('?bvid=BV1124y1x72L'));
  assert.equal(first.body.page, 1);
  assert.equal(first.body.cid, 1057559731);
});

test('video validation rejects invalid, duplicate and arbitrary upstream inputs before fetching', async () => {
  let calls = 0;
  const handle = await handler(async () => { calls++; return response(videoPayload()); });
  for (const query of ['', '?bvid=', '?bvid=../bad', '?bvid=BV1124y1x72L&bvid=BV1124y1x72L',
    '?bvid=BV1124y1x72L&p=1&p=2', '?bvid=BV1124y1x72L&p=', '?bvid=BV1124y1x72L&p=0',
    '?bvid=BV1124y1x72L&p=1001', '?bvid=BV1124y1x72L&p=01', '?bvid=BV1124y1x72L&p=1.0',
    '?bvid=BV1124y1x72L&p=-1', '?bvid=BV1124y1x72L&q=music', '?bvid=BV1124y1x72L&url=https://attacker.example']) {
    assert.equal((await handle(videoRequest(query))).status, 400, query);
  }
  assert.equal(calls, 0);
});

test('deleted or nonpublic videos and missing P are unavailable without leaking platform messages', async () => {
  for (const data of [{ code: -404, message: 'private diagnostic' }, videoPayload({ state: -2 }),
    videoPayload({ state: 1 }), videoPayload({ need_jump_bv: true }), videoPayload({ redirect_url: 'https://www.bilibili.com/other' })]) {
    const { response: result, body } = await bodyOf(await handler(async () => response(data)), videoRequest());
    assert.equal(result.status, 404);
    assert.equal(body.code, 'VIDEO_UNAVAILABLE');
    assert.ok(!JSON.stringify(body).includes('private diagnostic'));
  }
  for (const pages of [[], [{ page: 2, cid: 123 }]]) {
    const { response: result, body } = await bodyOf(await handler(async () => response(videoPayload({ pages }))), videoRequest());
    assert.equal(result.status, 404);
    assert.equal(body.code, 'VIDEO_PAGE_UNAVAILABLE');
  }
});

test('paid, preview, exclusive and no-share flags in video data or rights prevent selection', async () => {
  const flags = ['is_pay', 'is_charge_video', 'pay', 'ugc_pay', 'ugc_pay_preview', 'arc_pay', 'no_share',
    'is_upower_exclusive', 'is_upower_play', 'is_upower_preview'];
  for (const flag of flags) {
    for (const fields of [{ [flag]: true }, { rights: { [flag]: '1' } }]) {
      const { response: result, body } = await bodyOf(await handler(async () => response(videoPayload(fields))), videoRequest());
      assert.equal(result.status, 403, flag);
      assert.equal(body.code, 'VIDEO_RESTRICTED', flag);
    }
  }
  const fields = Object.fromEntries(flags.map((key, index) => [key, [false, 0, '0', 'false', '', null][index % 6]]));
  assert.equal((await (await handler(async () => response(videoPayload(fields))))(videoRequest())).status, 200);
});

test('malformed video metadata, mismatched BV and unsafe cid cannot become successful validation', async () => {
  const invalid = [{}, { code: 0, data: null }, videoPayload({ bvid: 'BV1xx411c7mD' }),
    videoPayload({ state: '0' }), videoPayload({ pages: null }), videoPayload({ title: '' }),
    ...[0, -1, '1057559731', 1.5, Number.MAX_SAFE_INTEGER + 1].map(cid => videoPayload({ pages: [{ page: 1, cid, duration: 1 }] }))];
  for (const data of invalid) {
    const { response: result, body } = await bodyOf(await handler(async () => response(data)), videoRequest());
    assert.equal(result.status, 502);
    assert.equal(body.code, 'UPSTREAM_INVALID_RESPONSE');
  }
});

test('video validation coalesces and caches per BV and P while a search does not throttle its selection', async () => {
  let calls = 0, release, clock = 1000;
  const handle = await handler(async url => {
    calls++;
    if (new URL(url).pathname.endsWith('/search/type')) return response(payload());
    if (calls === 2) await new Promise(resolve => { release = resolve; });
    return response(videoPayload());
  }, { now: () => clock, uniqueQueryIntervalMs: 1500 });
  assert.equal((await handle(request())).status, 200);
  const first = handle(videoRequest()), duplicate = handle(videoRequest());
  release();
  assert.deepEqual(await (await first).json(), await (await duplicate).json());
  assert.equal(calls, 2);
  assert.equal((await handle(videoRequest())).status, 200);
  assert.equal(calls, 2);
  assert.equal((await handle(videoRequest('?bvid=BV1124y1x72L&p=2'))).status, 429);
  clock += 1500;
  assert.equal((await handle(videoRequest('?bvid=BV1124y1x72L&p=2'))).status, 200);
  assert.equal(calls, 3, 'search does not validate all returned candidates');
  clock += 600000;
  assert.equal((await handle(videoRequest())).status, 200);
  assert.equal(calls, 4);
});

test('video validation failures are not cached and platform rejection cools both metadata routes', async () => {
  let calls = 0;
  const handle = await handler(async () => { calls++; return response(calls === 1 ? { code: -404 } : videoPayload()); });
  assert.equal((await handle(videoRequest())).status, 404);
  assert.equal((await handle(videoRequest())).status, 200);
  assert.equal(calls, 2);
  const denied = await handler(async () => new Response('blocked', { status: 412 }));
  const { body, response: result } = await bodyOf(denied, videoRequest());
  assert.equal(result.status, 502);
  assert.equal(body.code, 'UPSTREAM_BLOCKED');
  assert.equal((await denied(request('other'))).status, 429);
});

test('video validation uses the same origin, preflight, deadline and body limits as search', async () => {
  const handle = await handler(async () => response(videoPayload()));
  assert.equal((await handle(videoRequest('', { headers: { Origin: 'https://attacker.example' } }))).status, 403);
  assert.equal((await handle(videoRequest('', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } }))).status, 204);
  assert.equal((await handle(videoRequest(undefined, { method: 'POST' }))).status, 405);
  const timeout = await handler(() => new Promise(() => {}), { timeoutMs: 15 });
  const failure = await bodyOf(timeout, videoRequest());
  assert.equal(failure.response.status, 504);
  assert.equal(failure.body.code, 'UPSTREAM_TIMEOUT');
  const oversized = await handler(async () => response(videoPayload()), { maxResponseBytes: 128 });
  assert.equal((await oversized(videoRequest())).status, 502);
});

test('preview serves the same gateway contract and preserves normal files, HEAD and audio ranges', async t => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(tempRoot, 'music-gateway-preview-'));
  fs.writeFileSync(path.join(directory, 'i18n-routes.json'), '{}');
  fs.writeFileSync(path.join(directory, 'index.html'), '<h1>preview</h1>');
  fs.writeFileSync(path.join(directory, '404.html'), '<h1>missing</h1>');
  fs.writeFileSync(path.join(directory, 'test.mp3'), '0123456789');
  let calls = 0;
  const server = createServer(directory, { musicFetchImpl: async url => {
    calls++; return response(new URL(url).pathname.endsWith('/view') ? videoPayload() : payload());
  } });
  t.after(() => {
    server.close();
    assert.equal(path.dirname(fs.realpathSync(directory)), tempRoot);
    assert.ok(path.basename(directory).startsWith('music-gateway-preview-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const search = await fetch(base + '/api/music/videos?q=song');
  assert.equal(search.status, 200);
  assert.equal((await search.json()).tracks[0].videoId, 'BV1xx411c7mD');
  assert.equal(calls, 1);
  const selectedVideo = await fetch(base + '/api/music/video?bvid=BV1124y1x72L&p=2');
  assert.equal(selectedVideo.status, 200);
  assert.equal((await selectedVideo.json()).cid, 1057559732);
  assert.equal(calls, 2);
  const denied = await fetch(base + '/api/music/videos?q=song', { headers: { Origin: 'https://attacker.example' } });
  assert.equal(denied.status, 403);
  const options = await fetch(base + '/api/music/videos', { method: 'OPTIONS', headers: { Origin: base, 'Access-Control-Request-Method': 'GET' } });
  assert.equal(options.status, 204);
  assert.equal((await fetch(base + '/api/music/videos?q=song', { method: 'POST' })).status, 405);
  const normal = await fetch(base + '/');
  assert.equal(await normal.text(), '<h1>preview</h1>');
  const head = await fetch(base + '/test.mp3', { method: 'HEAD' });
  assert.equal(head.headers.get('Content-Length'), '10');
  assert.equal(await head.text(), '');
  const range = await fetch(base + '/test.mp3', { headers: { Range: 'bytes=2-4' } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('Content-Range'), 'bytes 2-4/10');
  assert.equal(await range.text(), '234');
});

test('public audio track route returns only public metadata with CORS and accepts configured same-origin requests', async () => {
  const seen = [];
  const handle = await handler(async (url, options) => { seen.push({ url, options }); return htmlResponse(audioPage()); });
  const { response: result, body } = await bodyOf(handle, audioTrackRequest());
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(body.track.availability, 'public_full');
  assert.equal(body.track.id, 'soundcloud:123456');
  assert.equal(body.track.sourceUrl, publicAudioLink);
  assert.equal(body.track.durationMs, 189000);
  assert.equal(body.track.url, undefined);
  assert.ok(!JSON.stringify(body).includes('not-for-response'));
  assert.equal(seen[0].url, publicAudioLink);
  assert.deepEqual(seen[0].options.headers, { Accept: 'text/html' });
  assert.equal(seen[0].options.credentials, 'omit');
  assert.equal(seen[0].options.redirect, 'error');
  const sameOrigin = new Request(origin + '/api/music/audio/track?url=' + encodeURIComponent(publicAudioLink));
  assert.equal((await handle(sameOrigin)).status, 200);
  assert.equal(seen.length, 1, 'the validated public track remains cached');
  assert.equal((await handle(audioTrackRequest(publicAudioLink, { headers: { Origin: 'https://attacker.example' } }))).status, 403);
  const preflight = await handle(audioTrackRequest(publicAudioLink, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
});

test('audio route duplicate, private-link and arbitrary upstream inputs fail before network work', async () => {
  let calls = 0;
  const handle = await handler(async () => { calls++; return htmlResponse(audioPage()); });
  for (const url of ['https://attacker.example/artist/song', 'http://soundcloud.com/artist/song',
    'https://soundcloud.com/artist/song/s-private', publicAudioLink + '?secret_token=private',
    'https://soundcloud.com/search/sounds', 'https://soundcloud.com/artist/sets']) {
    const { response: result, body } = await bodyOf(handle, audioTrackRequest(url));
    assert.equal(result.status, 400, url);
    assert.equal(body.code, 'INVALID_TRACK_LINK');
  }
  for (const path of ['/api/music/audio/track', '/api/music/audio/track?url=&url=',
    '/api/music/audio/track?url=' + encodeURIComponent(publicAudioLink) + '&target=https://attacker.example',
    '/api/music/audio', '/api/music/audio?q=song&q=other', '/api/music/audio?q=song&url=https://attacker.example',
    '/api/music/audio?q=bad%0Aword', '/api/music/audio?q=']) {
    assert.equal((await handle(new Request('https://gateway.example' + path, { headers: { Origin: origin } }))).status, 400, path);
  }
  assert.equal((await handle(audioTrackRequest(publicAudioLink, { method: 'POST' }))).status, 405);
  assert.equal(calls, 0);
});

test('audio search route checks at most six public candidates and returns only full freely embeddable records', async () => {
  const seen = [];
  const handle = await handler(async url => {
    seen.push(url);
    if (new URL(url).pathname === '/search/sounds') return htmlResponse(audioSearchPage(Array.from({ length: 8 }, (_, index) => '/artist/song-' + index)));
    const index = Number(url.split('-').at(-1));
    if (index === 3) return htmlResponse('missing', { status: 404 });
    return htmlResponse(audioPage({ id: index + 1, permalink_url: url,
      ...(index === 1 ? { policy: 'SNIP', duration: 30000 } : {}), ...(index === 2 ? { sharing: 'private' } : {}) }));
  });
  const { response: result, body } = await bodyOf(handle, audioRequest('  Coffee   artist  '));
  assert.equal(result.status, 200);
  assert.equal(body.query, 'Coffee artist');
  assert.deepEqual(body.tracks.map(track => track.trackId), ['1', '5', '6']);
  assert.ok(body.tracks.every(track => track.availability === 'public_full'));
  assert.equal(seen.length, 7);
  const search = new URL(seen[0]);
  assert.equal(search.origin + search.pathname, 'https://soundcloud.com/search/sounds');
  assert.equal(search.searchParams.get('q'), 'Coffee artist');
  assert.ok(seen.every(url => new URL(url).origin === 'https://soundcloud.com'));
  assert.ok(!JSON.stringify(body).includes('not-for-response'));
  assert.ok(body.tracks.every(track => track.url === undefined));
});

test('audio service business and upstream errors retain their status and code through the gateway', async () => {
  for (const [fetchImpl, status, code] of [
    [async () => htmlResponse(audioPage({ policy: 'BLOCK' })), 422, 'AUDIO_UNAVAILABLE'],
    [async () => htmlResponse('missing', { status: 404 }), 404, 'AUDIO_NOT_FOUND'],
    [async () => htmlResponse('blocked', { status: 412 }), 502, 'UPSTREAM_BLOCKED'],
    [async () => htmlResponse('<html>malformed hydration</html>'), 502, 'UPSTREAM_INVALID_RESPONSE']
  ]) {
    const { response: result, body } = await bodyOf(await handler(fetchImpl), audioTrackRequest());
    assert.equal(result.status, status);
    assert.equal(body.code, code);
    assert.equal(result.headers.get('Access-Control-Allow-Origin'), origin);
  }
  const blockedSearch = await handler(async () => htmlResponse('blocked', { status: 403 }));
  const first = await bodyOf(blockedSearch, audioRequest());
  assert.equal(first.response.status, 502);
  assert.equal(first.body.code, 'UPSTREAM_BLOCKED');
  assert.equal((await blockedSearch(audioRequest('other'))).status, 429);
});

test('concurrent and cached audio searches share discovery without being rejected by the query throttle', async () => {
  let calls = 0, release;
  const handle = await handler(async url => {
    calls++;
    if (new URL(url).pathname === '/search/sounds') {
      await new Promise(resolve => { release = resolve; });
      return htmlResponse(audioSearchPage(['/artist/song']));
    }
    return htmlResponse(audioPage());
  }, { uniqueQueryIntervalMs: 1500 });
  const first = handle(audioRequest('Coffee')), duplicate = handle(audioRequest('Coffee'));
  await new Promise(resolve => setImmediate(resolve));
  release();
  const results = await Promise.all([first, duplicate]);
  assert.ok(results.every(result => result.status === 200));
  assert.deepEqual(await results[0].json(), await results[1].json());
  assert.equal(calls, 2);
  assert.equal((await handle(audioRequest('Coffee'))).status, 200);
  assert.equal(calls, 2);
  assert.equal((await handle(audioRequest('Different'))).status, 429);
});
