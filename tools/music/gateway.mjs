// Public metadata only. Playback stays in each platform's official player.
import { createOpenAudioService, OpenAudioError } from './open-audio.mjs';
const ROUTE = '/api/music/videos';
const VIDEO_ROUTE = '/api/music/video';
const SEARCH_API = 'https://api.bilibili.com/x/web-interface/search/type';
const VIDEO_API = 'https://api.bilibili.com/x/web-interface/view';
const BV_ID = /^BV[0-9A-Za-z]{10}$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

class GatewayError extends Error {
  constructor(status, code, message, retryAfter = 0) {
    super(message);
    Object.assign(this, { status, code, retryAfter });
  }
}

function plainText(value, maxLength = 200) {
  if (typeof value !== 'string') return '';
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, entity) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()] || all;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code) : '';
  }).replace(/<[^>]*>/g, '').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function coverUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value.startsWith('//') ? 'https:' + value : value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
    if (!['hdslb.com', 'bilibili.com'].some(host => url.hostname === host || url.hostname.endsWith('.' + host))) return '';
    return url.href;
  } catch { return ''; }
}

function durationText(value) {
  if (typeof value !== 'string' || !/^\d{1,5}:\d{1,2}(?::\d{1,2})?$/.test(value)) return '';
  const parts = value.split(':').map(Number);
  if (parts.at(-1) >= 60 || (parts.length === 3 && parts[1] >= 60)) return '';
  const seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  if (seconds > 86400) return '';
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

function paidFlag(value) {
  return value !== undefined && value !== null && value !== false && value !== 0 && value !== '0' && value !== 'false' && value !== '';
}

function restrictedVideo(item) {
  const flags = ['is_pay', 'is_charge_video', 'pay', 'ugc_pay', 'ugc_pay_preview', 'arc_pay', 'no_share',
    'is_upower_exclusive', 'is_upower_play', 'is_upower_preview'];
  return [item, item?.rights].some(value => value && typeof value === 'object'
    && flags.some(flag => paidFlag(value[flag])));
}

function normalizeResults(payload, page) {
  if (!payload || payload.code !== 0 || !payload.data || !Array.isArray(payload.data.result)) {
    throw new GatewayError(502, 'UPSTREAM_INVALID_RESPONSE', '视频搜索暂时不可用，请稍后重试。');
  }
  const tracks = [], seen = new Set();
  for (const item of payload.data.result.slice(0, 50)) {
    if (!item || typeof item !== 'object' || !BV_ID.test(item.bvid) || seen.has(item.bvid)) continue;
    if (item.type && item.type !== 'video') continue;
    if (restrictedVideo(item)) continue;
    const name = plainText(item.title), artist = plainText(item.author, 100);
    if (!name) continue;
    seen.add(item.bvid);
    tracks.push({ id: 'bilibili:' + item.bvid, videoId: item.bvid, name, artist,
      duration: durationText(item.duration), cover: coverUrl(item.pic),
      sourceUrl: 'https://www.bilibili.com/video/' + item.bvid });
  }
  const total = Number.isSafeInteger(payload.data.numResults) && payload.data.numResults >= 0 ? payload.data.numResults : tracks.length;
  return { tracks, total, page };
}

function normalizeVideo(payload, videoId, page) {
  if (!payload || typeof payload.code !== 'number') {
    throw new GatewayError(502, 'UPSTREAM_INVALID_RESPONSE', '视频信息返回的数据无效。');
  }
  if (payload.code !== 0) throw new GatewayError(404, 'VIDEO_UNAVAILABLE', '这个视频暂时不可用，请选择其他版本。');
  const data = payload.data;
  if (!data || data.bvid !== videoId || !Number.isInteger(data.state) || !Array.isArray(data.pages)) {
    throw new GatewayError(502, 'UPSTREAM_INVALID_RESPONSE', '视频信息返回的数据无效。');
  }
  if (data.state !== 0 || paidFlag(data.need_jump_bv) || data.redirect_url) {
    throw new GatewayError(404, 'VIDEO_UNAVAILABLE', '这个视频暂时不可用，请选择其他版本。');
  }
  if (restrictedVideo(data)) throw new GatewayError(403, 'VIDEO_RESTRICTED', '这个视频有播放或分享限制，请选择其他公开版本。');
  const selected = data.pages[page - 1];
  if (!selected || selected.page !== page) {
    throw new GatewayError(404, 'VIDEO_PAGE_UNAVAILABLE', '这个视频分集不存在，请检查链接或选择其他版本。');
  }
  const name = plainText(data.title), artist = plainText(data.owner?.name, 100) || '未知上传者';
  if (!name || !Number.isSafeInteger(selected.cid) || selected.cid <= 0) {
    throw new GatewayError(502, 'UPSTREAM_INVALID_RESPONSE', '视频信息返回的数据无效。');
  }
  const seconds = selected.duration;
  const duration = Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 86400
    ? Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') : '';
  return { videoId, page, cid: selected.cid, name, artist, duration, cover: coverUrl(data.pic),
    sourceUrl: 'https://www.bilibili.com/video/' + videoId + (page > 1 ? '?p=' + page : ''),
    availability: 'metadata_ok' };
}

async function boundedJson(response, maxBytes, signal) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) throw new GatewayError(502, 'UPSTREAM_INVALID_RESPONSE', '视频搜索返回的数据过大。');
  const type = response.headers.get('content-type') || '';
  if (!/^application\/(?:[\w.+-]*\+)?json\b/i.test(type)) throw new GatewayError(502, 'UPSTREAM_INVALID_RESPONSE', '视频搜索返回的数据无效。');
  if (!response.body) throw new GatewayError(502, 'UPSTREAM_INVALID_RESPONSE', '视频搜索返回的数据无效。');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  const stop = () => { void reader.cancel().catch(() => {}); };
  if (signal.aborted) stop();
  else signal.addEventListener('abort', stop, { once: true });
  let text = '', bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw new GatewayError(504, 'UPSTREAM_TIMEOUT', '视频搜索超时，请稍后重试。');
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new GatewayError(502, 'UPSTREAM_INVALID_RESPONSE', '视频搜索返回的数据过大。');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    signal.removeEventListener('abort', stop);
    reader.releaseLock();
  }
  try { return JSON.parse(text); }
  catch { throw new GatewayError(502, 'UPSTREAM_INVALID_RESPONSE', '视频搜索返回的数据无效。'); }
}

function validOrigin(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value && !url.username && !url.password ? url : null;
  } catch { return null; }
}

/** No account cookies, media URLs, redirects, or caller-supplied upstream targets. */
export function createMusicGateway({ fetchImpl = globalThis.fetch, allowedOrigins = [], allowLocalhost = false,
  now = Date.now, timeoutMs = 8000, cacheTtlMs = 600000, maxCacheEntries = 100,
  uniqueQueryIntervalMs = 1500, maxResponseBytes = 1048576 } = {}) {
  const origins = new Set(allowedOrigins.filter(origin => {
    const url = validOrigin(origin);
    return url && (url.protocol === 'https:' || (allowLocalhost && LOCAL_HOSTS.has(url.hostname)));
  }));
  const cache = new Map(), inflight = new Map();
  const deadlineMs = Math.max(1, Math.min(8000, timeoutMs));
  const ttl = Math.max(0, Math.min(600000, cacheTtlMs));
  const cacheLimit = Math.max(1, Math.min(100, maxCacheEntries));
  const responseLimit = Math.max(128, Math.min(1048576, maxResponseBytes));
  const nextQueryAt = new Map();
  let blockedUntil = 0;
  const openAudio = createOpenAudioService({ fetchImpl, now, timeoutMs: deadlineMs });
  let nextAudioSearchAt = 0;
  const audioQueries = new Map(), audioInflight = new Map();

  async function metadata(type, value, page) {
    const key = JSON.stringify([type, value, page]), time = now();
    for (const [entry, value] of cache) if (value.expires <= time) cache.delete(entry);
    if (cache.has(key)) return cache.get(key).data;
    if (inflight.has(key)) return inflight.get(key);
    const next = Math.max(blockedUntil, nextQueryAt.get(type) || 0);
    if (time < next || inflight.size >= 8) {
      throw new GatewayError(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试。', Math.max(1, Math.ceil((next - time) / 1000)));
    }
    nextQueryAt.set(type, time + Math.max(0, uniqueQueryIntervalMs));
    const promise = (async () => {
      const controller = new AbortController();
      let timer;
      try {
        const upstream = new URL(type === 'video' ? VIDEO_API : SEARCH_API);
        if (type === 'video') upstream.searchParams.set('bvid', value);
        else {
          upstream.searchParams.set('search_type', 'video');
          upstream.searchParams.set('keyword', value);
          upstream.searchParams.set('page', String(page));
        }
        const work = (async () => {
          const response = await fetchImpl(upstream.href, { method: 'GET', headers: { Accept: 'application/json' },
            credentials: 'omit', redirect: 'error', signal: controller.signal });
          if (response.status === 412 || response.status === 403 || response.status === 429) {
            blockedUntil = Math.max(blockedUntil, now() + 30000);
            throw new GatewayError(502, 'UPSTREAM_BLOCKED', '视频平台暂时拒绝请求，可改用平台页面。');
          }
          if (response.status !== 200) throw new GatewayError(502, 'UPSTREAM_ERROR', '视频搜索暂时不可用，请稍后重试。');
          const payload = await boundedJson(response, responseLimit, controller.signal);
          return type === 'video' ? normalizeVideo(payload, value, page) : normalizeResults(payload, page);
        })();
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new GatewayError(504, 'UPSTREAM_TIMEOUT', '视频搜索超时，请稍后重试。'));
          }, deadlineMs);
        });
        const data = await Promise.race([work, deadline]);
        if (ttl > 0) {
          while (cache.size >= cacheLimit) cache.delete(cache.keys().next().value);
          cache.set(key, { data, expires: now() + ttl });
        }
        return data;
      } catch (error) {
        if (error instanceof GatewayError) throw error;
        throw new GatewayError(502, 'UPSTREAM_ERROR', '视频搜索暂时不可用，请稍后重试。');
      } finally { clearTimeout(timer); }
    })();
    inflight.set(key, promise);
    try { return await promise; }
    finally { inflight.delete(key); }
  }

  return async function handle(request) {
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', Vary: 'Origin' });
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    try {
      const url = new URL(request.url);
      if (![ROUTE, VIDEO_ROUTE, '/api/music/audio', '/api/music/audio/track'].includes(url.pathname)) throw new GatewayError(404, 'NOT_FOUND', '接口不存在。');
      const origin = request.headers.get('Origin'), parsed = origin ? validOrigin(origin) : null;
      const localOrigin = allowLocalhost && parsed && LOCAL_HOSTS.has(parsed.hostname);
      const localRequest = allowLocalhost && !origin && LOCAL_HOSTS.has(url.hostname);
      if (!(origins.has(origin) || localOrigin || localRequest || (!origin && origins.has(url.origin)))) throw new GatewayError(403, 'FORBIDDEN_ORIGIN', '此站点未配置音乐搜索权限。');
      if (origin) headers.set('Access-Control-Allow-Origin', origin);
      if (!['GET', 'OPTIONS'].includes(request.method)) {
        headers.set('Allow', 'GET, OPTIONS');
        throw new GatewayError(405, 'METHOD_NOT_ALLOWED', '仅支持 GET 请求。');
      }
      if (request.method === 'OPTIONS') {
        const method = request.headers.get('Access-Control-Request-Method');
        if (method && method !== 'GET') throw new GatewayError(405, 'METHOD_NOT_ALLOWED', '仅支持 GET 请求。');
        headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        headers.set('Access-Control-Allow-Headers', 'Accept');
        headers.set('Access-Control-Max-Age', '600');
        return new Response(null, { status: 204, headers });
      }
      if (url.pathname === '/api/music/audio/track') {
        if (url.searchParams.getAll('url').length !== 1 || [...url.searchParams.keys()].some(key => key !== 'url')) throw new GatewayError(400, 'INVALID_REQUEST', '音频参数无效。');
        return json({ track: await openAudio.track(url.searchParams.get('url')) });
      }
      if (url.pathname === '/api/music/audio') {
        if (url.searchParams.getAll('q').length !== 1 || [...url.searchParams.keys()].some(key => key !== 'q')) throw new GatewayError(400, 'INVALID_REQUEST', '音频搜索参数无效。');
        const query = url.searchParams.get('q');
        if (!query.trim() || query.trim().length > 100 || /[\p{Cc}\p{Cf}]/u.test(query)) throw new GatewayError(400, 'INVALID_QUERY', '请输入 1 至 100 个字符的搜索词。');
        const key = query.trim().replace(/\s+/g, ' '), hit = audioQueries.get(key);
        if (hit && hit.expires > now()) return json(hit.data);
        if (audioInflight.has(key)) return json(await audioInflight.get(key));
        if (now() < nextAudioSearchAt || audioInflight.size >= 4) throw new GatewayError(429, 'RATE_LIMITED', '搜索过于频繁，请稍后再试。', 2);
        nextAudioSearchAt = now() + Math.max(0, uniqueQueryIntervalMs);
        const pending = openAudio.search(key); audioInflight.set(key, pending);
        try {
          const data = await pending;
          while (audioQueries.size >= cacheLimit) audioQueries.delete(audioQueries.keys().next().value);
          audioQueries.set(key, { data, expires: now() + ttl });
          return json(data);
        } catch (error) { if (error?.code === 'UPSTREAM_BLOCKED') nextAudioSearchAt = now() + 30000; throw error; }
        finally { audioInflight.delete(key); }
      }
      if (url.pathname === VIDEO_ROUTE) {
        for (const key of url.searchParams.keys()) if (!['bvid', 'p'].includes(key)) throw new GatewayError(400, 'INVALID_REQUEST', '视频参数无效。');
        if (url.searchParams.getAll('bvid').length !== 1 || url.searchParams.getAll('p').length > 1) throw new GatewayError(400, 'INVALID_REQUEST', '视频参数无效。');
        const videoId = url.searchParams.get('bvid'), page = url.searchParams.has('p') ? url.searchParams.get('p') : '1';
        if (!BV_ID.test(videoId)) throw new GatewayError(400, 'INVALID_VIDEO', '请输入有效的 BV 号。');
        if (!/^[1-9]\d{0,3}$/.test(page) || Number(page) > 1000) throw new GatewayError(400, 'INVALID_PAGE', '视频分集须为 1 至 1000。');
        return json(await metadata('video', videoId, Number(page)));
      }
      for (const key of url.searchParams.keys()) if (!['q', 'page'].includes(key)) throw new GatewayError(400, 'INVALID_REQUEST', '搜索参数无效。');
      if (url.searchParams.getAll('q').length !== 1 || url.searchParams.getAll('page').length > 1) throw new GatewayError(400, 'INVALID_REQUEST', '搜索参数无效。');
      const raw = url.searchParams.get('q');
      if (raw.trim().length > 100 || /[\p{Cc}\p{Cf}]/u.test(raw)) throw new GatewayError(400, 'INVALID_QUERY', '请输入 1 至 100 个字符的搜索词。');
      const query = raw.trim().replace(/\s+/g, ' ');
      if (!query) throw new GatewayError(400, 'INVALID_QUERY', '请输入搜索词。');
      const page = url.searchParams.has('page') ? url.searchParams.get('page') : '1';
      if (!/^[1-5]$/.test(page)) throw new GatewayError(400, 'INVALID_PAGE', '页码须为 1 至 5。');
      return json(await metadata('search', query, Number(page)));
    } catch (error) {
      const failure = error instanceof GatewayError || error instanceof OpenAudioError ? error : new GatewayError(500, 'INTERNAL_ERROR', '音乐服务暂时不可用。');
      if (failure.retryAfter) headers.set('Retry-After', String(failure.retryAfter));
      return json({ error: failure.message, code: failure.code }, failure.status);
    }
  };
}

let workerHandler, workerOrigins;
export default {
  fetch(request, env = {}) {
    const origins = typeof env.ALLOWED_ORIGINS === 'string' ? env.ALLOWED_ORIGINS : '';
    if (!workerHandler || workerOrigins !== origins) {
      workerOrigins = origins;
      workerHandler = createMusicGateway({ allowedOrigins: origins.split(',').map(value => value.trim()).filter(Boolean) });
    }
    return workerHandler(request);
  }
};
