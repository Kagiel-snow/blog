'use strict';
(() => {
  // Public Meting mirrors, tried in order; a mirror that answers is preferred next time.
  const DEFAULT_ENDPOINTS = ['https://api.i-meto.com/meting/api', 'https://api.injahow.cn/meting/'];
  const DEFAULT_COVER = '/img/sky-window.jpg';
  const unsafeUrl = /[\s\\'"`()<>{}\u0000-\u001f\u007f]/;
  const fail = (message, code) => Object.assign(new Error(message), { code });

  function numericId(value) {
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) return null;
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const id = String(value).trim();
    return /^\d{1,20}$/.test(id) ? id.replace(/^0+(?=\d)/, '') : null;
  }

  function httpsUrl(value) {
    if (typeof value !== 'string' || !value || unsafeUrl.test(value)) return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url : null;
    } catch { return null; }
  }

  function localCover(value) {
    return typeof value === 'string' && /^\/(?!\/)/.test(value) && !unsafeUrl.test(value) ? value : DEFAULT_COVER;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function parsePlaylistId(value) {
    const direct = numericId(value);
    if (direct !== null) return direct;
    const url = httpsUrl(value);
    if (!url || url.hostname !== 'music.163.com' || url.port) {
      throw fail('请输入网易云歌单 ID 或 HTTPS 歌单链接。', 'INVALID_PLAYLIST');
    }
    let page = url;
    if (url.pathname === '/' && url.hash.startsWith('#/playlist?')) {
      page = new URL(url.hash.slice(1), 'https://music.163.com');
    }
    const ids = page.searchParams.getAll('id');
    const id = ids.length === 1 ? numericId(ids[0]) : null;
    if (!/^\/playlist\/?$/.test(page.pathname) || id === null) {
      throw fail('这个链接没有有效的网易云歌单 ID。', 'INVALID_PLAYLIST');
    }
    return id;
  }

  function normalizeTracks(rows, fallbackCover = DEFAULT_COVER) {
    if (!Array.isArray(rows)) throw fail('音乐服务返回的数据格式不正确，请稍后重试。', 'INVALID_RESPONSE');
    const fallback = localCover(fallbackCover), tracks = [], seen = new Set();
    for (const row of rows) {
      if (tracks.length >= 200) break;
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const url = httpsUrl(row.url);
      const ids = url?.searchParams.getAll('id') || [];
      const songId = ids.length === 1 ? numericId(ids[0]) : null;
      // Mirrors differ: i-meto returns title/author, injahow returns name/artist.
      const title = row.title ?? row.name, author = row.author ?? row.artist;
      const name = typeof title === 'string' ? title.trim() : '';
      if (!url || songId === null || !name || name.length > 1000 || seen.has(songId)) continue;
      const artist = typeof author === 'string' && author.trim() ? author.trim() : '未知歌手';
      if (artist.length > 1000) continue;
      seen.add(songId);
      tracks.push({
        id: 'netease:' + songId, songId, name, artist,
        url: url.href, cover: httpsUrl(row.pic)?.href || fallback,
        sourceUrl: 'https://music.163.com/#/song?id=' + songId
      });
    }
    return tracks;
  }

  function endpointList(config) {
    const list = Array.isArray(config.endpoints) && config.endpoints.length ? config.endpoints : [config.endpoint || DEFAULT_ENDPOINTS[0], ...DEFAULT_ENDPOINTS];
    const urls = [];
    for (const value of list) {
      const url = httpsUrl(value);
      if (!url) throw fail('音乐服务地址必须是有效的 HTTPS 地址。', 'INVALID_CONFIG');
      if (!urls.some(item => item.href === url.href)) urls.push(url);
    }
    return urls;
  }

  // Run one fetch with its own timeout, cancelled together with the caller's signal.
  async function guarded(timeoutMs, external, run) {
    if (external?.aborted) throw fail('已取消音乐请求。', 'ABORTED');
    const controller = new AbortController();
    const cancelled = () => controller.abort(fail('已取消音乐请求。', 'ABORTED'));
    const timedOut = () => controller.abort(fail('音乐服务响应超时，请重试。', 'TIMEOUT'));
    let rejectAbort;
    const abortPromise = new Promise((_, reject) => { rejectAbort = reject; });
    const aborted = () => rejectAbort(controller.signal.reason || fail('已取消音乐请求。', 'ABORTED'));
    controller.signal.addEventListener('abort', aborted, { once: true });
    external?.addEventListener('abort', cancelled, { once: true });
    const timer = setTimeout(timedOut, timeoutMs);
    try {
      return await Promise.race([run(controller.signal), abortPromise]);
    } finally {
      clearTimeout(timer);
      external?.removeEventListener('abort', cancelled);
      controller.signal.removeEventListener('abort', aborted);
    }
  }

  function createClient(config = {}) {
    const endpoints = endpointList(config);
    const timeoutMs = Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 12000;
    const fetchRequest = globalThis.fetch;
    if (typeof fetchRequest !== 'function') throw fail('当前浏览器不支持音乐请求。', 'UNSUPPORTED');
    let preferred = 0;
    const checked = new Map();

    function attempt(endpoint, type, id, signal) {
      const url = new URL(endpoint.href);
      url.searchParams.set('server', 'netease');
      url.searchParams.set('type', type);
      url.searchParams.set('id', id);
      return guarded(timeoutMs, signal, async inner => {
        let response;
        try {
          response = await fetchRequest(url.href, {
            method: 'GET', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: inner
          });
        } catch {
          if (inner.aborted) throw inner.reason;
          throw fail('音乐服务暂时无法连接，请稍后重试。', 'NETWORK');
        }
        if (!response?.ok) throw fail('音乐服务暂时不可用，请稍后重试。', 'HTTP');
        let rows;
        try { rows = await response.json(); }
        catch { throw fail('音乐服务返回的数据格式不正确，请稍后重试。', 'INVALID_RESPONSE'); }
        return normalizeTracks(rows, config.fallbackCover);
      });
    }

    async function request(type, value, options = {}) {
      if (!['playlist', 'search', 'song'].includes(type)) throw fail('不支持这个音乐请求类型。', 'INVALID_REQUEST');
      const id = type === 'playlist' ? parsePlaylistId(value) : type === 'song' ? numericId(value) : typeof value === 'string' ? value.trim() : null;
      if (id === null || !id || (type === 'search' && (id.length > 80 || /[\u0000-\u001f\u007f]/.test(id)))) {
        throw fail('请输入有效的歌曲 ID 或 1 至 80 个字的搜索词。', 'INVALID_REQUEST');
      }
      const external = options.signal;
      if (external?.aborted) throw fail('已取消音乐请求。', 'ABORTED');
      let lastError;
      for (let step = 0; step < endpoints.length; step++) {
        const index = (preferred + step) % endpoints.length;
        try {
          const tracks = await attempt(endpoints[index], type, id, external);
          preferred = index;
          return tracks;
        } catch (error) {
          if (error?.code === 'ABORTED' || external?.aborted) throw error;
          lastError = error;
        }
      }
      throw lastError;
    }

    // Ask the mirror whether a song has a source without downloading audio
    // (HEAD is answered 404 by some mirrors, so use GET and stop at the redirect).
    // A redirect means playable; 4xx means VIP/region locked; anything else is unknown.
    async function check(track, options = {}) {
      const url = httpsUrl(track?.url);
      if (!url) return 'unavailable';
      if (checked.has(url.href)) return checked.get(url.href);
      let result;
      try {
        result = await guarded(Math.min(timeoutMs, 8000), options.signal, async signal => {
          const response = await fetchRequest(url.href, {
            method: 'GET', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'manual', signal
          });
          if (response.type === 'opaqueredirect' || response.ok || (response.status >= 300 && response.status < 400)) return 'ok';
          return response.status >= 400 && response.status < 500 && response.status !== 429 ? 'unavailable' : 'unknown';
        });
      } catch (error) {
        if (error?.code === 'ABORTED') throw error;
        return 'unknown';
      }
      if (result !== 'unknown') checked.set(url.href, result);
      return result;
    }
    return { request, check };
  }

  const api = { createClient, normalizeTracks, parsePlaylistId, escapeHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.SiteMusicSource = api;
})();
