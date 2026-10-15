'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../../source/js/music-source.js');
const source = fs.readFileSync(require.resolve('../../source/js/music-source.js'), 'utf8');
const video = { videoId: 'BV1124y1x72L', name: '《nop》', artist: '上传者', duration: '1:42', cover: 'https://i0.hdslb.com/cover.jpg' };
function harness(fetchImpl, location) {
  const requests = [], timers = new Map(); let count = 0;
  const context = { URL, AbortController, location,
    setTimeout: (fn, ms) => { timers.set(++count, { fn, ms }); return count; }, clearTimeout: id => timers.delete(id),
    fetch: (url, options) => { requests.push({ url, options }); return fetchImpl(url, options); } };
  vm.runInNewContext(source, context);
  return { api: context.SiteMusicSource, requests, timers };
}
test('video links accept only canonical BV IDs and intended HTTPS video pages', () => {
  for (const value of ['BV1124y1x72L', 'https://www.bilibili.com/video/BV1124y1x72L/?p=2', '分享： https://m.bilibili.com/video/BV1124y1x72L']) {
    assert.equal(api.parseVideoId(value), video.videoId);
    const url = new URL(api.videoEmbedUrl(value));
    assert.equal(url.origin, 'https://player.bilibili.com');
    assert.equal(url.pathname, '/player.html');
    assert.equal(url.searchParams.get('bvid'), video.videoId);
    assert.equal(url.searchParams.get('autoplay'), '0');
  }
  for (const value of ['javascript:alert(1)', 'http://www.bilibili.com/video/BV1124y1x72L',
    'https://www.bilibili.com.evil.test/video/BV1124y1x72L', 'https://user:secret@www.bilibili.com/video/BV1124y1x72L',
    'https://www.bilibili.com:443/video/BV1124y1x72L', 'https://www.bilibili.com/video/BV1124y1x72L/extra',
    'https://b23.tv/short', 'https://player.bilibili.com/player.html?bvid=BV1124y1x72L', 'BV1124y1x72L https://evil.test/', 'BV123']) {
    if (value.includes(':443/')) continue; // URL canonicalization removes the default port.
    assert.throws(() => api.parseVideoId(value), error => error.code === 'INVALID_VIDEO');
  }
});
test('video search links encode a query once and reject empty, oversized, or control input', () => {
  const url = new URL(api.videoSearchUrl('Coffee & beabadoobee #音乐'));
  assert.equal(url.origin, 'https://search.bilibili.com');
  assert.equal(url.searchParams.get('keyword'), 'Coffee & beabadoobee #音乐');
  for (const value of ['', 'x'.repeat(101), '歌\n曲', null]) assert.throws(() => api.videoSearchUrl(value));
});

test('video links retain a canonical page and embeds retain inspected cid without accepting injection', () => {
  assert.deepEqual(api.parseVideoLink(video.videoId), { videoId: video.videoId, page: 1 });
  const link = 'https://www.bilibili.com/video/' + video.videoId + '?p=12&share_source=copy';
  assert.deepEqual(api.parseVideoLink(link), { videoId: video.videoId, page: 12 });
  const embed = new URL(api.videoEmbedUrl(link, { cid: 456789 }));
  assert.equal(embed.searchParams.get('p'), '12'); assert.equal(embed.searchParams.get('cid'), '456789');
  assert.equal(embed.searchParams.get('autoplay'), '0'); assert.equal(embed.origin, 'https://player.bilibili.com');
  assert.equal(new URL(api.videoEmbedUrl(link, { page: 2, cid: '123' })).searchParams.get('p'), '2');
  for (const page of ['', '0', '-1', '01', '1.0', '1e2', '1001', '2&p=3', '2%20']) {
    assert.throws(() => api.parseVideoLink('https://www.bilibili.com/video/' + video.videoId + '?p=' + page), error => error.code === 'INVALID_VIDEO');
  }
  for (const details of [{ page: 0 }, { page: '01' }, { cid: -1 }, { cid: '1&autoplay=1' }, { cid: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => api.videoEmbedUrl(video.videoId, details), error => error.code === 'INVALID_VIDEO');
  }
});
test('video metadata never accepts caller media URLs or source URL injection', () => {
  const tracks = api.normalizeVideos([video, video, { ...video, videoId: 'unsafe' },
    { ...video, videoId: 'BV1fwpo6mEsh', name: '<img onerror=evil()>', sourceUrl: 'javascript:evil()', cover: 'http://insecure.test/a', duration: '1:99' }]);
  assert.equal(tracks.length, 2);
  assert.equal(tracks[1].sourceUrl, 'https://www.bilibili.com/video/BV1fwpo6mEsh');
  assert.equal(tracks[1].cover, '/img/sky-window.jpg');
  assert.equal(tracks[1].duration, '');
  assert.equal(tracks[1].name, '<img onerror=evil()>', 'metadata remains text and is rendered with textContent');
  assert.equal(tracks[1].url, undefined, 'videos never become APlayer audio URLs');
});
test('video gateway client uses own HTTPS service, encodes queries and caches successful results', async () => {
  const h = harness(async () => ({ ok: true, json: async () => ({ tracks: [video] }) }));
  const client = h.api.createVideoClient({ videoEndpoint: 'https://music.example/api/music/videos' });
  const first = await client.request('nop & 陈越龙');
  const second = await client.request('nop & 陈越龙');
  assert.equal(first[0].videoId, video.videoId); assert.notEqual(first, second);
  assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
  const url = new URL(h.requests[0].url);
  assert.equal(url.searchParams.get('q'), 'nop & 陈越龙');
  assert.equal(url.searchParams.get('page'), '1');
  assert.equal(h.requests[0].options.credentials, 'omit');
});
test('local preview chooses its own route; production without configuration makes no network request', async () => {
  const response = async () => ({ ok: true, json: async () => ({ tracks: [] }) });
  const h = harness(response, { hostname: '127.0.0.1', origin: 'http://127.0.0.1:4000' });
  await h.api.createVideoClient().request('nop');
  assert.match(h.requests[0].url, /^http:\/\/127\.0\.0\.1:4000\/api\/music\/videos\?/);
  const production = harness(response, { hostname: 'kagiel.top', origin: 'https://kagiel.top' });
  await assert.rejects(production.api.createVideoClient().request('nop'), error => error.code === 'CONFIG_REQUIRED');
  assert.equal(production.requests.length, 0);
  assert.throws(() => production.api.createVideoClient({ videoEndpoint: 'http://insecure.test/api' }));
});
test('failed or malformed video responses are not cached', async () => {
  for (const [reply, code] of [
    [() => ({ ok: false }), 'HTTP'], [() => ({ ok: true, json: async () => ({ tracks: {} }) }), 'INVALID_RESPONSE'],
    [() => { throw new TypeError('network'); }, 'NETWORK']]) {
    const h = harness(async () => reply());
    const client = h.api.createVideoClient({ videoEndpoint: 'https://music.example/api/music/videos' });
    await assert.rejects(client.request('nop'), error => error.code === code);
    await assert.rejects(client.request('nop'), error => error.code === code);
    assert.equal(h.requests.length, 2); assert.equal(h.timers.size, 0);
  }
});
test('video cancellation and timeouts reject even when transport ignores abort', async () => {
  const h = harness(() => new Promise(() => {}));
  const client = h.api.createVideoClient({ videoEndpoint: 'https://music.example/api/music/videos', timeoutMs: 1234 });
  const control = new AbortController(), cancelled = client.request('nop', { signal: control.signal });
  const cancelledCheck = assert.rejects(cancelled, error => error.code === 'ABORTED'); control.abort(); await cancelledCheck;
  assert.equal(h.requests[0].options.signal.aborted, true); assert.equal(h.timers.size, 0);
  const pending = client.request('Coffee'); const timeoutCheck = assert.rejects(pending, error => error.code === 'TIMEOUT');
  [...h.timers.values()][0].fn(); await timeoutCheck;
  assert.equal(h.requests[1].options.signal.aborted, true); assert.equal(h.timers.size, 0);
});

test('video inspection preserves page, generates official link and never promises successful playback', async () => {
  const h = harness(async () => ({ ok: true, json: async () => ({ ...video, page: 2, cid: 7654321, duration: 104,
    sourceUrl: 'https://evil.test/', availability: 'playable', url: 'https://media.test/paid.mp4' }) }));
  const client = h.api.createVideoClient({ videoEndpoint: 'https://music.example/api/music/videos' });
  const inspected = await client.inspect('https://www.bilibili.com/video/' + video.videoId + '?p=2');
  const url = new URL(h.requests[0].url);
  assert.equal(url.pathname, '/api/music/video'); assert.equal(url.searchParams.get('bvid'), video.videoId);
  assert.equal(url.searchParams.get('p'), '2'); assert.equal(inspected.cid, 7654321);
  assert.equal(inspected.page, 2); assert.equal(inspected.availability, 'metadata_ok');
  assert.equal(inspected.sourceUrl, 'https://www.bilibili.com/video/' + video.videoId + '?p=2');
  assert.equal(inspected.url, undefined); assert.equal(inspected.duration, 104);
  inspected.name = 'changed';
  assert.equal((await client.inspect(inspected.sourceUrl)).name, video.name, 'cached metadata cannot be changed by callers');
  assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
});

test('video inspection preserves restricted and missing-page failures and does not cache them', async () => {
  for (const code of ['VIDEO_RESTRICTED', 'VIDEO_UNAVAILABLE', 'VIDEO_PAGE_UNAVAILABLE']) {
    const h = harness(async () => ({ ok: false, status: code === 'VIDEO_RESTRICTED' ? 403 : 404,
      json: async () => ({ code, message: '当前视频不能播放。' }) }));
    const client = h.api.createVideoClient({ videoEndpoint: 'https://music.example/api/music/videos' });
    await assert.rejects(client.inspect(video.videoId), error => error.code === code);
    await assert.rejects(client.inspect(video.videoId), error => error.code === code);
    assert.equal(h.requests.length, 2); assert.equal(h.timers.size, 0);
  }
  const noService = harness(async () => { throw new Error('unexpected'); });
  await assert.rejects(noService.api.createVideoClient().inspect(video.videoId), error => error.code === 'CONFIG_REQUIRED');
  assert.equal(noService.requests.length, 0);
});

test('video inspection rejects mismatched metadata and cancellation even when transport ignores abort', async () => {
  for (const changed of [{ videoId: 'BV1fwpo6mEsh' }, { page: 2 }, { cid: '01' }, { name: '' }]) {
    const h = harness(async () => ({ ok: true, json: async () => ({ ...video, page: 1, cid: 123, ...changed }) }));
    await assert.rejects(h.api.createVideoClient({ videoEndpoint: 'https://music.example/api/music/videos' }).inspect(video.videoId), error => error.code === 'INVALID_RESPONSE');
  }
  const h = harness(() => new Promise(() => {})), control = new AbortController();
  const pending = h.api.createVideoClient({ videoEndpoint: 'https://music.example/api/music/videos' }).inspect(video.videoId, { signal: control.signal });
  const check = assert.rejects(pending, error => error.code === 'ABORTED'); control.abort(); await check;
  assert.equal(h.requests[0].options.signal.aborted, true); assert.equal(h.timers.size, 0);
});
