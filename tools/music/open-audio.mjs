// Discover public audio metadata. Audio stays in SoundCloud's official widget.
const HOST = 'https://soundcloud.com';
const RESERVED = new Set(['search', 'sets', 'you', 'pages', 'settings', 'upload', 'discover',
  'charts', 'stream', 'tracks', 'playlists', 'groups', 'auth', 'activate', 'oauth', 'connect']);
const MAX_DURATION = 86400000;

export class OpenAudioError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'OpenAudioError';
    Object.assign(this, { status, code });
  }
}

function failure(status, code, message) { return new OpenAudioError(status, code, message); }
function timeoutError() { return failure(504, 'UPSTREAM_TIMEOUT', '公开音频搜索超时，请稍后重试。'); }
function invalidResponse() { return failure(502, 'UPSTREAM_INVALID_RESPONSE', '音频平台返回的数据无效。'); }
function abortError(signal) { return signal.reason instanceof OpenAudioError ? signal.reason : timeoutError(); }

function decodeEntities(value) {
  const names = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, entity) => {
    if (entity[0] !== '#') return names[entity.toLowerCase()] || all;
    const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return Number.isInteger(number) && number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
      ? String.fromCodePoint(number) : '';
  });
}

function plainText(value, limit = 200) {
  if (typeof value !== 'string') return '';
  return decodeEntities(value).replace(/<[^>]*>/g, '').replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ').trim().slice(0, limit);
}

function soundCloudUrl(value, segments) {
  if (typeof value !== 'string' || value.length > 300 || value.trim() !== value ||
    /[\s\\%\p{Cc}\p{Cf}]/u.test(value) || /\/\.{1,2}(?:\/|$)/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.origin !== HOST || url.username || url.password || url.port || url.search || url.hash) return null;
    const path = url.pathname.replace(/\/$/, '').split('/').slice(1);
    if (path.length !== segments || path.some(part => !/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(part))) return null;
    if (RESERVED.has(path[0].toLowerCase()) || (segments === 2 && path[1].toLowerCase() === 'sets')) return null;
    return HOST + '/' + path.join('/');
  } catch { return null; }
}

/** Only canonical public track pages, never arbitrary upstream or private links. */
export function normalizeSoundCloudPermalink(value) {
  const url = soundCloudUrl(value, 2);
  if (!url) throw failure(400, 'INVALID_TRACK_LINK', '请输入公开的 SoundCloud 歌曲链接。');
  return url;
}

function coverUrl(value) {
  if (typeof value !== 'string' || value.length > 1000 || /[\s\\\p{Cc}\p{Cf}]/u.test(value)) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return '';
    if (!(url.hostname === 'sndcdn.com' || url.hostname.endsWith('.sndcdn.com'))) return '';
    return url.href;
  } catch { return ''; }
}

/** Read only the site's public, no-script search results. No client credentials. */
export function parseSoundCloudSearch(html) {
  if (typeof html !== 'string') throw invalidResponse();
  const sections = [...html.matchAll(/<noscript\b[^>]*>([\s\S]*?)<\/noscript\s*>/gi)];
  if (!sections.length) throw invalidResponse();
  const links = [], seen = new Set();
  for (const section of sections) {
    for (const item of section[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi)) {
      const heading = /<h2\b[^>]*>([\s\S]*?)<\/h2\s*>/i.exec(item[1]);
      if (!heading) continue;
      const anchor = /<a\b[^>]*\bhref\s*=\s*(["'])([^"']*)\1[^>]*>/i.exec(heading[1]);
      if (!anchor) continue;
      const href = decodeEntities(anchor[2]);
      // Relative links cannot change the host or contain query/fragment secrets.
      const candidate = href.startsWith('/') && !href.startsWith('//') ? HOST + href : href;
      const permalink = soundCloudUrl(candidate, 2);
      if (!permalink || seen.has(permalink)) continue;
      seen.add(permalink);
      links.push(permalink);
      if (links.length === 6) return links;
    }
  }
  return links;
}

/** Parse JSON as data, then return only public metadata needed by the widget. */
export function parseSoundCloudTrack(html, permalink) {
  const requested = normalizeSoundCloudPermalink(permalink);
  if (typeof html !== 'string') throw invalidResponse();
  const match = /window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);\s*<\/script\s*>/i.exec(html);
  if (!match) throw invalidResponse();
  let items;
  try { items = JSON.parse(match[1]); } catch { throw invalidResponse(); }
  if (!Array.isArray(items)) throw invalidResponse();
  const data = items.find(item => item && item.hydratable === 'sound')?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalidResponse();
  if (data.sharing !== 'public' || data.embeddable_by !== 'all' || data.streamable !== true || data.policy !== 'ALLOW') {
    throw failure(422, 'AUDIO_UNAVAILABLE', '这首歌没有可公开嵌入的完整音频。');
  }
  const durationMs = data.duration, fullDurationMs = data.full_duration;
  if (!Number.isSafeInteger(durationMs) || !Number.isSafeInteger(fullDurationMs) ||
    durationMs < 1000 || fullDurationMs < 1000 || durationMs > MAX_DURATION || fullDurationMs > MAX_DURATION ||
    Math.abs(durationMs - fullDurationMs) > 3000) {
    throw failure(422, 'AUDIO_UNAVAILABLE', '这首歌仅提供试听或无法确认完整播放。');
  }
  const publicUrl = soundCloudUrl(data.permalink_url, 2);
  const artistUrl = soundCloudUrl(data.user?.permalink_url, 1);
  const title = plainText(data.title), artist = plainText(data.user?.username, 120);
  if (!Number.isSafeInteger(data.id) || data.id <= 0 || publicUrl !== requested || !artistUrl ||
    artistUrl !== requested.slice(0, requested.lastIndexOf('/')) || !title || !artist) throw invalidResponse();
  return { id: 'soundcloud:' + data.id, trackId: String(data.id), provider: 'soundcloud', availability: 'public_full', permalinkUrl: publicUrl,
    title, name: title, artist, artistUrl, durationMs, fullDurationMs,
    cover: coverUrl(data.artwork_url), sourceUrl: publicUrl };
}

function clamp(value, fallback, min, max) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
}

function abortable(work, signal) {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const stop = () => reject(abortError(signal));
    signal.addEventListener('abort', stop, { once: true });
    Promise.resolve().then(work).then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

async function boundedHtml(response, maxBytes, signal) {
  const size = Number(response.headers.get('content-length'));
  if (Number.isFinite(size) && size > maxBytes) throw invalidResponse();
  if (!/^text\/html\b/i.test(response.headers.get('content-type') || '') || !response.body) throw invalidResponse();
  const reader = response.body.getReader(), decoder = new TextDecoder();
  const stop = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', stop, { once: true });
  let html = '', bytes = 0;
  try {
    while (true) {
      const { done, value } = await abortable(() => reader.read(), signal);
      if (signal.aborted) throw abortError(signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { void reader.cancel().catch(() => {}); throw invalidResponse(); }
      html += decoder.decode(value, { stream: true });
    }
    return html + decoder.decode();
  } finally {
    signal.removeEventListener('abort', stop);
    reader.releaseLock();
  }
}

export function createOpenAudioService({ fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 8000,
  cacheTtlMs = 600000, maxCacheEntries = 100, maxResponseBytes = 1048576 } = {}) {
  const timeout = clamp(timeoutMs, 8000, 1, 8000), ttl = clamp(cacheTtlMs, 600000, 0, 600000);
  const cacheLimit = clamp(maxCacheEntries, 100, 1, 100), responseLimit = clamp(maxResponseBytes, 1048576, 128, 1048576);
  const cache = new Map(), inflight = new Map(), waiting = [];
  let activeDetails = 0;

  function cached(key) {
    const time = now();
    for (const [entry, value] of cache) if (value.expires <= time) cache.delete(entry);
    const value = cache.get(key);
    if (!value) return undefined;
    cache.delete(key); cache.set(key, value);
    return structuredClone(value.data);
  }
  function remember(key, data) {
    if (!ttl) return;
    cache.delete(key);
    while (cache.size >= cacheLimit) cache.delete(cache.keys().next().value);
    cache.set(key, { data: structuredClone(data), expires: now() + ttl });
  }
  async function singleflight(key, work) {
    const hit = cached(key);
    if (hit !== undefined) return hit;
    if (inflight.has(key)) return structuredClone(await inflight.get(key));
    if (inflight.size >= 100) throw failure(429, 'RATE_LIMITED', '音频搜索请求过多，请稍后重试。');
    const promise = Promise.resolve().then(work);
    inflight.set(key, promise);
    try { const data = await promise; remember(key, data); return structuredClone(data); }
    finally { if (inflight.get(key) === promise) inflight.delete(key); }
  }
  async function deadline(work) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(timeoutError()), timeout);
    try { return await abortable(() => work(controller.signal, error => controller.abort(error)), controller.signal); }
    finally { clearTimeout(timer); }
  }
  async function fetchHtml(url, signal) {
    try {
      const response = await abortable(() => fetchImpl(url, { method: 'GET', headers: { Accept: 'text/html' },
        credentials: 'omit', redirect: 'error', signal }), signal);
      if ([403, 412, 429].includes(response.status)) {
        throw failure(502, 'UPSTREAM_BLOCKED', '音频平台暂时拒绝请求，请稍后重试或打开平台链接。');
      }
      if (response.status === 404) throw failure(404, 'AUDIO_NOT_FOUND', '这首公开音频已下架或不存在。');
      if (response.status !== 200) throw failure(502, 'UPSTREAM_ERROR', '公开音频暂时不可用，请稍后重试。');
      return await boundedHtml(response, responseLimit, signal);
    } catch (error) {
      if (signal.aborted) throw abortError(signal);
      if (error instanceof OpenAudioError) throw error;
      throw failure(502, 'UPSTREAM_ERROR', '公开音频暂时不可用，请稍后重试。');
    }
  }
  function acquire(signal) {
    if (signal.aborted) return Promise.reject(abortError(signal));
    if (activeDetails < 3) { activeDetails++; return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const entry = { resolve, signal, stop: () => {
        const index = waiting.indexOf(entry);
        if (index >= 0) waiting.splice(index, 1);
        reject(abortError(signal));
      } };
      signal.addEventListener('abort', entry.stop, { once: true });
      waiting.push(entry);
    });
  }
  function release() {
    activeDetails--;
    while (waiting.length && activeDetails < 3) {
      const entry = waiting.shift();
      entry.signal.removeEventListener('abort', entry.stop);
      if (entry.signal.aborted) continue;
      activeDetails++; entry.resolve();
    }
  }
  async function loadTrack(permalink, signal) {
    return singleflight('track:' + permalink, async () => {
      await acquire(signal);
      try { return parseSoundCloudTrack(await fetchHtml(permalink, signal), permalink); }
      finally { release(); }
    });
  }
  function track(permalink) {
    const url = normalizeSoundCloudPermalink(permalink);
    return deadline(signal => loadTrack(url, signal));
  }
  function search(value) {
    if (typeof value !== 'string' || value.length > 300 || /[\p{Cc}\p{Cf}]/u.test(value)) {
      throw failure(400, 'INVALID_QUERY', '请输入 1 至 100 个字符的搜索词。');
    }
    const query = value.trim().replace(/\s+/g, ' ');
    if (!query || query.length > 100) throw failure(400, 'INVALID_QUERY', '请输入 1 至 100 个字符的搜索词。');
    return singleflight('search:' + query, () => deadline(async (signal, abort) => {
      const url = new URL(HOST + '/search/sounds'); url.searchParams.set('q', query);
      const links = parseSoundCloudSearch(await fetchHtml(url.href, signal));
      const results = new Array(links.length), errors = [];
      let cursor = 0;
      async function next() {
        while (!signal.aborted && cursor < links.length) {
          const index = cursor++;
          try { results[index] = await loadTrack(links[index], signal); }
          catch (error) {
            if (!(error instanceof OpenAudioError) || error.code === 'UPSTREAM_BLOCKED' || error.code === 'UPSTREAM_TIMEOUT') {
              abort(error); throw error;
            }
            errors.push(error);
          }
        }
      }
      const settled = await Promise.allSettled(Array.from({ length: Math.min(3, links.length) }, next));
      const fatal = settled.find(result => result.status === 'rejected');
      if (fatal) throw fatal.reason;
      const tracks = results.filter(Boolean), seen = new Set();
      const upstreamError = errors.find(error => error.status >= 500);
      if (!tracks.length && upstreamError) throw upstreamError;
      return { tracks: tracks.filter(item => !seen.has(item.id) && seen.add(item.id)), query };
    }));
  }
  return { search, track };
}
