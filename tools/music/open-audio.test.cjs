'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('./open-audio.mjs');
const link = 'https://soundcloud.com/beabadoobee/coffee';
const sound = (fields = {}) => ({ id: 342790792, title: 'Coffee', permalink_url: link,
  user: { username: 'beabadoobee', permalink_url: 'https://soundcloud.com/beabadoobee' },
  duration: 127779, full_duration: 127801, artwork_url: 'https://i1.sndcdn.com/coffee.jpg',
  sharing: 'public', embeddable_by: 'all', streamable: true, policy: 'ALLOW', ...fields });
const page = data => '<html><script>window.__sc_hydration = ' + JSON.stringify([
  { hydratable: 'apiClient', data: { id: 'must-not-use-client' } }, { hydratable: 'sound', data }
]) + ';</script></html>';
const searchPage = links => '<html><noscript><ul><li><a href="/search">Search</a></li></ul><ul>' +
  links.map(value => '<li><h2><a href="' + value + '">Song</a></h2></li>').join('') + '</ul></noscript></html>';
const htmlResponse = (html, options = {}) => new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' }, ...options });
async function service(fetchImpl, options = {}) { return (await modulePromise).createOpenAudioService({ fetchImpl, ...options }); }
const isError = (status, code) => error => error.status === status && error.code === code && typeof error.message === 'string';

test('public track parser only returns verified full-track metadata without credentials or media URLs', async () => {
  const { parseSoundCloudTrack } = await modulePromise;
  const record = parseSoundCloudTrack(page(sound({ title: '<em>Coffee</em> &amp; &#x97f3;\u202e乐',
    user: { username: '<b>beabadoobee</b>', permalink_url: 'https://soundcloud.com/beabadoobee' },
    media: { transcodings: [{ url: 'https://private-media.example/stream?token=never-return' }] },
    track_authorization: 'never-return', secret_token: 'never-return' })), link);
  assert.deepEqual(record, { id: 'soundcloud:342790792', trackId: '342790792', provider: 'soundcloud',
    availability: 'public_full', permalinkUrl: link, title: 'Coffee & 音乐', name: 'Coffee & 音乐',
    artist: 'beabadoobee', artistUrl: 'https://soundcloud.com/beabadoobee', durationMs: 127779,
    fullDurationMs: 127801, cover: 'https://i1.sndcdn.com/coffee.jpg', sourceUrl: link });
  assert.ok(!JSON.stringify(record).includes('never-return'));
  assert.ok(!JSON.stringify(record).includes('must-not-use-client'));
});

test('restricted, private, nonembeddable and preview-only records do not become full playback choices', async () => {
  const { parseSoundCloudTrack } = await modulePromise;
  for (const fields of [{ sharing: 'private' }, { embeddable_by: 'me' }, { streamable: false },
    { policy: 'SNIP' }, { policy: 'BLOCK' }, { policy: undefined }, { duration: 30000 },
    { full_duration: 130780 }, { duration: '127779' }, { full_duration: 0 }, { duration: 86400001, full_duration: 86400001 }]) {
    assert.throws(() => parseSoundCloudTrack(page(sound(fields)), link), isError(422, 'AUDIO_UNAVAILABLE'));
  }
  assert.equal(parseSoundCloudTrack(page(sound({ duration: 124801 })), link).availability, 'public_full', 'inclusive three second encoding tolerance');
});

test('invalid hydration and mismatched identities remain typed upstream errors', async () => {
  const { parseSoundCloudTrack } = await modulePromise;
  for (const input of ['<html/>', '<script>window.__sc_hydration = [bad];</script>',
    '<script>window.__sc_hydration = [{"hydratable":"sound","data":null}];</script>',
    page(sound({ id: '342790792' })), page(sound({ title: '' })),
    page(sound({ permalink_url: 'https://soundcloud.com/attacker/other' })),
    page(sound({ user: { username: 'Wrong profile', permalink_url: 'https://soundcloud.com/attacker' } }))]) {
    assert.throws(() => parseSoundCloudTrack(input, link), isError(502, 'UPSTREAM_INVALID_RESPONSE'));
  }
});

test('public URLs reject SSRF targets, redirects, secret tokens and system or playlist paths before fetching', async () => {
  const { normalizeSoundCloudPermalink } = await modulePromise;
  let calls = 0;
  const instance = await service(async () => { calls++; return htmlResponse(page(sound())); });
  for (const url of ['http://soundcloud.com/beabadoobee/coffee', 'https://127.0.0.1/beabadoobee/coffee',
    'https://soundcloud.com.attacker.example/beabadoobee/coffee', 'https://soundcloud.com./beabadoobee/coffee',
    'https://user:pass@soundcloud.com/beabadoobee/coffee', 'https://soundcloud.com:8443/beabadoobee/coffee',
    'https://soundcloud.com/search/sounds', 'https://soundcloud.com/beabadoobee/sets',
    link + '?secret_token=private', link + '?anything=1', link + '#x',
    'https://soundcloud.com/beabadoobee/%63offee', 'https://soundcloud.com/beabadoobee/../coffee',
    'https://soundcloud.com/old/../beabadoobee/coffee',
    'https://soundcloud.com\\attacker.example/beabadoobee/coffee', link + '\n', null]) {
    assert.throws(() => instance.track(url), isError(400, 'INVALID_TRACK_LINK'), String(url));
  }
  assert.equal(calls, 0);
  assert.equal(normalizeSoundCloudPermalink(link + '/'), link);
});

test('cover metadata only permits HTTPS SoundCloud image hosts', async () => {
  const { parseSoundCloudTrack } = await modulePromise;
  for (const artwork_url of ['http://i1.sndcdn.com/a.jpg', 'https://i1.sndcdn.com.attacker.example/a.jpg',
    'https://user:pass@i1.sndcdn.com/a.jpg', 'https://i1.sndcdn.com:444/a.jpg', 'https://127.0.0.1/a.jpg', 'javascript:alert(1)']) {
    assert.equal(parseSoundCloudTrack(page(sound({ artwork_url })), link).cover, '');
  }
});

test('no-script search parses only canonical track links, deduplicates, and bounds discovery to six', async () => {
  const { parseSoundCloudSearch } = await modulePromise;
  const links = ['/search/sounds', '//attacker.example/x/y', '/beabadoobee/sets', '/u/song?secret_token=private',
    '/u/song#x', 'https://127.0.0.1/u/song', '/beabadoobee/coffee', link];
  links.push(...Array.from({ length: 10 }, (_, index) => '/artist/track-' + index));
  assert.deepEqual(parseSoundCloudSearch(searchPage(links)), [link, ...Array.from({ length: 5 }, (_, index) => 'https://soundcloud.com/artist/track-' + index)]);
  assert.deepEqual(parseSoundCloudSearch('<a href="/attacker/outside">Outside</a>' + searchPage([])), []);
  assert.throws(() => parseSoundCloudSearch('<html>Denied</html>'), isError(502, 'UPSTREAM_INVALID_RESPONSE'));
});

test('search requests fixed anonymous HTML endpoints and only returns public complete candidates', async () => {
  const seen = [];
  const instance = await service(async (url, options) => {
    seen.push({ url, options });
    if (new URL(url).pathname === '/search/sounds') return htmlResponse(searchPage(['/beabadoobee/coffee', '/artist/preview', '/artist/deleted']));
    if (url.endsWith('/deleted')) return htmlResponse('missing', { status: 404 });
    if (url.endsWith('/preview')) return htmlResponse(page(sound({ id: 2, permalink_url: url, duration: 30000,
      user: { username: 'artist', permalink_url: 'https://soundcloud.com/artist' } })));
    return htmlResponse(page(sound()));
  });
  const result = await instance.search('  Coffee   beabadoobee  ');
  assert.equal(result.query, 'Coffee beabadoobee');
  assert.equal(result.tracks.length, 1);
  assert.equal(result.tracks[0].availability, 'public_full');
  assert.equal(seen.length, 4);
  const search = new URL(seen[0].url);
  assert.equal(search.origin + search.pathname, 'https://soundcloud.com/search/sounds');
  assert.deepEqual([...search.searchParams], [['q', 'Coffee beabadoobee']]);
  for (const { url, options } of seen) {
    assert.equal(new URL(url).origin, 'https://soundcloud.com');
    assert.deepEqual(options.headers, { Accept: 'text/html' });
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'GET'); assert.ok(options.signal instanceof AbortSignal);
  }
});

test('valid empty search and unavailable matching recordings stay empty, while invalid detail bodies report failure', async () => {
  const empty = await service(async () => htmlResponse(searchPage([])));
  assert.deepEqual(await empty.search('Absent'), { tracks: [], query: 'Absent' });
  const restricted = await service(async url => htmlResponse(new URL(url).pathname === '/search/sounds' ?
    searchPage(['/beabadoobee/coffee']) : page(sound({ policy: 'BLOCK' }))));
  assert.deepEqual(await restricted.search('Coffee'), { tracks: [], query: 'Coffee' });
  const invalid = await service(async url => htmlResponse(new URL(url).pathname === '/search/sounds' ? searchPage(['/beabadoobee/coffee']) : '<html>Gateway failure</html>'));
  await assert.rejects(invalid.search('Coffee'), isError(502, 'UPSTREAM_INVALID_RESPONSE'));
});

test('invalid queries never request the platform', async () => {
  let calls = 0;
  const instance = await service(async () => { calls++; return htmlResponse(searchPage([])); });
  for (const query of ['', '  ', 'a'.repeat(101), 'bad\nword', 'bad\u202eword', null]) {
    assert.throws(() => instance.search(query), isError(400, 'INVALID_QUERY'));
  }
  assert.equal(calls, 0);
});

test('detail discovery runs at most three simultaneous requests and consumes at most seven pages', async () => {
  let active = 0, peak = 0, calls = 0;
  const instance = await service(async url => {
    calls++;
    if (new URL(url).pathname === '/search/sounds') return htmlResponse(searchPage(Array.from({ length: 10 }, (_, i) => '/artist/track-' + i)));
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
    const index = Number(url.split('-').at(-1));
    return htmlResponse(page(sound({ id: index + 1, permalink_url: url,
      user: { username: 'artist', permalink_url: 'https://soundcloud.com/artist' } })));
  });
  assert.equal((await instance.search('music')).tracks.length, 6);
  assert.equal(peak, 3); assert.equal(calls, 7);
});

test('platform denials stop discovery without alternate headers, targets or additional candidates', async () => {
  for (const status of [403, 412, 429]) {
    const seen = [], signals = [];
    const instance = await service(async (url, options) => {
      seen.push(url); signals.push(options.signal);
      if (new URL(url).pathname === '/search/sounds') return htmlResponse(searchPage(Array.from({ length: 6 }, (_, i) => '/artist/track-' + i)));
      return htmlResponse('denied', { status });
    });
    await assert.rejects(instance.search('music'), isError(502, 'UPSTREAM_BLOCKED'));
    assert.ok(seen.length <= 4, 'only the initial fanout may have started');
    assert.ok(signals.every(signal => signal.aborted));
    assert.ok(seen.every(url => new URL(url).origin === 'https://soundcloud.com'));
  }
});

test('concurrent searches share the three-detail limit and timed-out queued work never starts', async () => {
  let active = 0, peak = 0, detailCalls = 0;
  const instance = await service(async url => {
    const parsed = new URL(url);
    if (parsed.pathname === '/search/sounds') return htmlResponse(searchPage(Array.from({ length: 6 }, (_, i) => '/artist/' + parsed.searchParams.get('q') + '-' + i)));
    active++; peak = Math.max(peak, active); detailCalls++;
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
    return htmlResponse(page(sound({ id: detailCalls, permalink_url: url,
      user: { username: 'artist', permalink_url: 'https://soundcloud.com/artist' } })));
  });
  await Promise.all([instance.search('first'), instance.search('second')]);
  assert.equal(peak, 3); assert.equal(detailCalls, 12);

  let stalledCalls = 0;
  const stalled = await service(async url => {
    if (new URL(url).pathname === '/search/sounds') return htmlResponse(searchPage(Array.from({ length: 6 }, (_, i) => '/artist/track-' + i)));
    stalledCalls++; return new Promise(() => {});
  }, { timeoutMs: 15 });
  const failures = await Promise.allSettled([stalled.search('first'), stalled.search('second')]);
  assert.ok(failures.every(result => result.status === 'rejected' && result.reason.code === 'UPSTREAM_TIMEOUT'));
  assert.equal(stalledCalls, 3);
});

test('streamed and declared byte limits reject large or non-HTML responses', async () => {
  for (const response of [htmlResponse('ok', { headers: { 'Content-Type': 'text/html', 'Content-Length': '2000' } }),
    htmlResponse('x'.repeat(1000)), new Response('{}', { headers: { 'Content-Type': 'application/json' } })]) {
    const instance = await service(async () => response, { maxResponseBytes: 256 });
    await assert.rejects(instance.track(link), isError(502, 'UPSTREAM_INVALID_RESPONSE'));
  }
});

test('logical deadline covers fetch ignoring abort, streamed bodies, and later retries', async () => {
  let calls = 0, signal;
  const instance = await service(async (_url, options) => {
    calls++; signal = options.signal;
    if (calls === 1) return new Promise(() => {});
    return htmlResponse(page(sound()));
  }, { timeoutMs: 15 });
  await assert.rejects(instance.track(link), isError(504, 'UPSTREAM_TIMEOUT'));
  assert.equal(signal.aborted, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await instance.track(link)).id, 'soundcloud:342790792');
  let cancelled = false;
  const streamed = await service(async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }),
    { headers: { 'Content-Type': 'text/html' } }), { timeoutMs: 15 });
  await assert.rejects(streamed.track(link), isError(504, 'UPSTREAM_TIMEOUT'));
  assert.equal(cancelled, true);
});

test('one search deadline covers delayed discovery plus details instead of restarting for each phase', async () => {
  let detailSignal;
  const instance = await service(async (url, options) => {
    if (new URL(url).pathname === '/search/sounds') {
      await new Promise(resolve => setTimeout(resolve, 15));
      return htmlResponse(searchPage(['/beabadoobee/coffee']));
    }
    detailSignal = options.signal;
    await new Promise(resolve => setTimeout(resolve, 20));
    return htmlResponse(page(sound()));
  }, { timeoutMs: 25 });
  await assert.rejects(instance.search('Coffee'), isError(504, 'UPSTREAM_TIMEOUT'));
  assert.equal(detailSignal.aborted, true);
});

test('metadata cache is bounded, expires, coalesces concurrent requests and isolates caller mutations', async () => {
  let calls = 0, time = 1000;
  const instance = await service(async url => {
    calls++; await new Promise(resolve => setTimeout(resolve, 3));
    if (new URL(url).pathname === '/search/sounds') return htmlResponse(searchPage(['/beabadoobee/coffee']));
    return htmlResponse(page(sound({ permalink_url: url })));
  }, { now: () => time, cacheTtlMs: 100, maxCacheEntries: 2 });
  const [first, second] = await Promise.all([instance.search('Coffee'), instance.search('Coffee')]);
  assert.equal(calls, 2); first.tracks[0].name = 'Changed by caller';
  assert.equal(second.tracks[0].name, 'Coffee');
  assert.equal((await instance.track(link)).name, 'Coffee'); assert.equal(calls, 2);
  await instance.track('https://soundcloud.com/beabadoobee/other');
  await instance.track('https://soundcloud.com/beabadoobee/third');
  await instance.track(link); assert.equal(calls, 5, 'evicted records are fetched again');
  time += 101;
  await instance.track(link); assert.equal(calls, 6, 'expired metadata is fetched again');
});

test('upstream redirect and network failures remain sanitized typed errors', async () => {
  for (const fetchImpl of [async () => htmlResponse('redirect', { status: 302 }),
    async () => { throw new Error('must-not-leak-private-diagnostic'); }]) {
    const instance = await service(fetchImpl);
    await assert.rejects(instance.track(link), error => isError(502, 'UPSTREAM_ERROR')(error) && !error.message.includes('must-not-leak'));
  }
});
