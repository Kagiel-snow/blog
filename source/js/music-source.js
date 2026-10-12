'use strict';
(() => {
  const DEFAULT_ENDPOINT = 'https://api.i-meto.com/meting/api';
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
      const name = typeof row.title === 'string' ? row.title.trim() : '';
      if (!url || songId === null || !name || name.length > 1000 || seen.has(songId)) continue;
      const artist = typeof row.author === 'string' && row.author.trim() ? row.author.trim() : '未知歌手';
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

  function createClient(config = {}) {
    const endpoint = httpsUrl(config.endpoint || DEFAULT_ENDPOINT);
    if (!endpoint) throw fail('音乐服务地址必须是有效的 HTTPS 地址。', 'INVALID_CONFIG');
    const timeoutMs = Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 12000;
    const fetchRequest = globalThis.fetch;
    if (typeof fetchRequest !== 'function') throw fail('当前浏览器不支持音乐请求。', 'UNSUPPORTED');

    async function request(type, value, options = {}) {
      if (!['playlist', 'search', 'song'].includes(type)) throw fail('不支持这个音乐请求类型。', 'INVALID_REQUEST');
      const id = type === 'playlist' ? parsePlaylistId(value) : type === 'song' ? numericId(value) : typeof value === 'string' ? value.trim() : null;
      if (id === null || !id || (type === 'search' && (id.length > 80 || /[\u0000-\u001f\u007f]/.test(id)))) {
        throw fail('请输入有效的歌曲 ID 或 1 至 80 个字的搜索词。', 'INVALID_REQUEST');
      }
      const external = options.signal;
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
      const url = new URL(endpoint.href);
      url.searchParams.set('server', 'netease');
      url.searchParams.set('type', type);
      url.searchParams.set('id', id);
      try {
        const result = (async () => {
          let response;
          try {
            response = await fetchRequest(url.href, {
              method: 'GET', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal
            });
          } catch {
            if (controller.signal.aborted) throw controller.signal.reason;
            throw fail('音乐服务暂时无法连接，请稍后重试。', 'NETWORK');
          }
          if (!response?.ok) throw fail('音乐服务暂时不可用，请稍后重试。', 'HTTP');
          let rows;
          try { rows = await response.json(); }
          catch { throw fail('音乐服务返回的数据格式不正确，请稍后重试。', 'INVALID_RESPONSE'); }
          return normalizeTracks(rows, config.fallbackCover);
        })();
        return await Promise.race([result, abortPromise]);
      } finally {
        clearTimeout(timer);
        external?.removeEventListener('abort', cancelled);
        controller.signal.removeEventListener('abort', aborted);
      }
    }
    return { request };
  }

  const api = { createClient, normalizeTracks, parsePlaylistId, escapeHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.SiteMusicSource = api;
})();
