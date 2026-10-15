'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteMusicAudius = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const API = 'https://api.audius.co/v1';
  const APP_NAME = 'KagielBlog';
  const MAX_BYTES = 1024 * 1024;
  const TIMEOUT_MS = 8000;
  const DEFAULT_COVER = '/img/sky-window.jpg';
  const unsafeUrl = /[\s\\'"`()<>{}\u0000-\u001f\u007f]/;
  const fail = (message, code, status) => Object.assign(new Error(message), { code, ...(status ? { status } : {}) });
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  function trackId(value) {
    if (typeof value !== 'string') throw fail('请输入有效的 Audius 歌曲 ID。', 'INVALID_TRACK');
    const id = value.trim().replace(/^audius:/, '');
    if (!/^[A-Za-z0-9]{1,32}$/.test(id)) throw fail('请输入有效的 Audius 歌曲 ID。', 'INVALID_TRACK');
    return id;
  }

  function apiKey(value) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(value)) {
      throw fail('Audius API Key 格式不正确，请使用自己申请的公开 Key。', 'INVALID_CONFIG');
    }
    return value;
  }

  function streamUrl(value, key) {
    const url = new URL(API + '/tracks/' + trackId(value) + '/stream');
    url.searchParams.set('app_name', APP_NAME);
    const publicKey = apiKey(key);
    if (publicKey) url.searchParams.set('api_key', publicKey);
    return url.href;
  }

  function text(value, max = 1000) {
    return typeof value === 'string' && value.trim() && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : '';
  }

  function httpsUrl(value) {
    if (typeof value !== 'string' || !value || value.length > 3000 || unsafeUrl.test(value)) return '';
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }

  function publicSource(value, id) {
    if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !unsafeUrl.test(value) && !/[?#%]/.test(value)) {
      const parts = value.split('/');
      if (parts.length === 3 && parts.slice(1).every(part => part && part !== '.' && part !== '..')) {
        return new URL(value, 'https://audius.co').href;
      }
    }
    return 'https://audius.co/tracks/' + id;
  }

  function isPublic(row) {
    if (row.is_streamable !== true || row.is_stream_gated !== false || row.is_unlisted !== false || row.is_delete !== false) return false;
    if (has(row, 'is_available') && row.is_available !== true) return false;
    if (has(row, 'is_purchaseable') && row.is_purchaseable !== false) return false;
    if (row.stream_conditions !== undefined && row.stream_conditions !== null) return false;
    for (const key of ['access_authorities', 'allowed_api_keys']) {
      if (row[key] !== undefined && row[key] !== null && (!Array.isArray(row[key]) || row[key].length)) return false;
    }
    // Personalized access does not establish that a track is public to visitors.
    for (const key of ['has_current_user_access', 'is_owned_by_user']) {
      if (has(row, key) && row[key] !== false) return false;
    }
    return true;
  }

  function normalizeTracks(rows, options = {}) {
    if (!Array.isArray(rows)) throw fail('Audius 返回的数据格式不正确，请稍后重试。', 'INVALID_RESPONSE');
    const key = apiKey(options.apiKey), output = [], seen = new Set();
    for (const row of rows) {
      if (output.length >= 20) break;
      if (!row || typeof row !== 'object' || Array.isArray(row) || !isPublic(row)) continue;
      let id;
      try { id = trackId(row.id); } catch { continue; }
      const name = text(row.title), artist = text(row.user?.name) || text(row.user?.handle);
      const duration = row.duration;
      if (!name || !artist || seen.has(id) || typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > 86400) continue;
      const cover = httpsUrl(row.artwork?.['480x480']) || httpsUrl(row.artwork?.['150x150']) || httpsUrl(row.artwork?.['1000x1000']) || DEFAULT_COVER;
      seen.add(id);
      output.push({
        id: 'audius:' + id, trackId: id, provider: 'audius', name, artist,
        url: streamUrl(id, key), cover, durationMs: Math.round(duration * 1000),
        sourceUrl: publicSource(row.permalink, id), availability: 'public_full',
        artistVerified: row.user?.is_verified === true
      });
    }
    return output;
  }

  function query(value) {
    const normalized = text(value, 100);
    if (!normalized) throw fail('请输入 1 至 100 字的歌名或歌手。', 'INVALID_QUERY');
    return normalized;
  }

  function utf8Bytes(value) {
    let bytes = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      if (char < 0x80) bytes++;
      else if (char < 0x800) bytes += 2;
      else if (char >= 0xd800 && char <= 0xdbff && i + 1 < value.length && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
      else bytes += 3;
      if (bytes > MAX_BYTES) break;
    }
    return bytes;
  }

  async function readJson(response, signal) {
    const length = response.headers?.get?.('content-length');
    if (length && /^\d+$/.test(length) && Number(length) > MAX_BYTES) throw fail('Audius 返回的数据过大。', 'TOO_LARGE');
    let body;
    if (response.body?.getReader && typeof TextDecoder === 'function') {
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try {
        while (true) {
          if (signal.aborted) throw fail('请求已取消。', 'ABORTED');
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) { await reader.cancel().catch(() => {}); throw fail('Audius 返回的数据过大。', 'TOO_LARGE'); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      body = new TextDecoder().decode(bytes);
    } else {
      body = await response.text();
      if (utf8Bytes(body) > MAX_BYTES) throw fail('Audius 返回的数据过大。', 'TOO_LARGE');
    }
    try { return JSON.parse(body); } catch { throw fail('Audius 返回的数据格式不正确，请稍后重试。', 'INVALID_RESPONSE'); }
  }

  function createClient(config = {}) {
    for (const key of ['endpoint', 'audiusEndpoint']) {
      if (config[key] !== undefined && config[key] !== API) throw fail('Audius 只允许使用官方公开接口。', 'INVALID_CONFIG');
    }
    for (const key of ['bearerToken', 'apiSecret', 'cookie', 'authorization']) {
      if (config[key]) throw fail('公开播放器不接受账户凭据或私密 Token。', 'INVALID_CONFIG');
    }
    if (config.audiusAppName !== undefined && config.audiusAppName !== APP_NAME) throw fail('本站 Audius 应用名称必须为 KagielBlog。', 'INVALID_CONFIG');
    const key = apiKey(config.apiKey ?? config.audiusApiKey ?? config.audius?.apiKey), cache = new Map();
    const clone = value => Array.isArray(value) ? value.map(item => ({ ...item })) : { ...value };

    async function request(url, normalize, signal) {
      if (signal?.aborted) throw fail('请求已取消。', 'ABORTED');
      const cached = cache.get(url);
      if (cached && Date.now() - cached.at < 600000) return clone(cached.value);
      const controller = new AbortController();
      let timeout, cancel;
      const interrupted = new Promise((_, reject) => {
        timeout = setTimeout(() => { controller.abort(); reject(fail('Audius 请求超时，请稍后重试。', 'TIMEOUT')); }, TIMEOUT_MS);
        cancel = () => { controller.abort(); reject(fail('请求已取消。', 'ABORTED')); };
        signal?.addEventListener('abort', cancel, { once: true });
      });
      const operation = (async () => {
        const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) {
          const code = response.status === 401 ? 'API_KEY_REQUIRED' : [403, 412, 429].includes(response.status) ? 'UPSTREAM_BLOCKED' : 'HTTP_ERROR';
          throw fail(response.status === 401 ? 'Audius 需要本站自己的公开 API Key。' : 'Audius 暂时无法响应，请稍后重试。', code, response.status);
        }
        return normalize(await readJson(response, controller.signal));
      })();
      let value;
      try { value = await Promise.race([operation, interrupted]); }
      catch (error) {
        controller.abort();
        if (error?.code) throw error;
        if (signal?.aborted) throw fail('请求已取消。', 'ABORTED');
        throw fail('暂时无法连接 Audius，请稍后重试。', 'NETWORK_ERROR');
      } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
      cache.delete(url);
      cache.set(url, { at: Date.now(), value });
      while (cache.size > 50) cache.delete(cache.keys().next().value);
      return clone(value);
    }

    function url(path) {
      const result = new URL(API + path);
      result.searchParams.set('app_name', APP_NAME);
      if (key) result.searchParams.set('api_key', key);
      return result;
    }

    return {
      search(value, options = {}) {
        let result;
        try { result = url('/tracks/search'); result.searchParams.set('query', query(value)); result.searchParams.set('limit', '20'); }
        catch (error) { return Promise.reject(error); }
        return request(result.href, body => normalizeTracks(body?.data, { apiKey: key }), options.signal);
      },
      track(value, options = {}) {
        let id, result;
        try { id = trackId(value); result = url('/tracks/' + id); }
        catch (error) { return Promise.reject(error); }
        return request(result.href, body => {
          const tracks = normalizeTracks([body?.data], { apiKey: key });
          if (tracks.length !== 1 || tracks[0].trackId !== id) throw fail('这个版本没有公开的完整音频，请选择其他版本。', 'NOT_PUBLIC');
          return tracks[0];
        }, options.signal);
      }
    };
  }

  return { createClient, createAudiusClient: createClient, normalizeTracks, streamUrl, trackId };
});
