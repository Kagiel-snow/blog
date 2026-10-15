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

  function parsePlaylistId(value, aliases = {}) {
    const direct = numericId(value);
    if (direct !== null) return direct;
    const links = typeof value === 'string' && value.length <= 1000 ? value.trim().match(/https:\/\/[^\s<>"'()，。]+/g) || [] : [];
    const url = links.length === 1 ? httpsUrl(links[0].replace(/[;,；\]]+$/, '')) : null;
    if (url?.hostname === '163cn.tv' && !url.port) {
      const shortUrl = url.origin + url.pathname;
      const id = Object.hasOwn(aliases, shortUrl) ? numericId(aliases[shortUrl]) : null;
      if (id !== null) return id;
      const error = fail('请先打开这个分享链接，再复制网易云页面中的完整歌单链接或数字 ID。', 'SHORT_LINK');
      error.url = shortUrl;
      throw error;
    }
    if (!url || url.hostname !== 'music.163.com' || url.port) {
      throw fail('请输入网易云歌单 ID 或 HTTPS 歌单链接。', 'INVALID_PLAYLIST');
    }
    let page = url;
    if (url.pathname === '/' && url.hash.startsWith('#/playlist?')) {
      page = new URL(url.hash.slice(1), 'https://music.163.com');
    }
    const ids = page.searchParams.getAll('id');
    const id = ids.length === 1 ? numericId(ids[0]) : null;
    if (!/^\/(?:m\/)?playlist\/?$/.test(page.pathname) || id === null) {
      throw fail('这个链接没有有效的网易云歌单 ID。', 'INVALID_PLAYLIST');
    }
    return id;
  }

  function normalizeTracks(rows, fallbackCover = DEFAULT_COVER) {
    if (!Array.isArray(rows)) throw fail('音乐服务返回的数据格式不正确，请稍后重试。', 'INVALID_RESPONSE');
    const fallback = localCover(fallbackCover), tracks = [], seen = new Set();
    for (const row of rows) {
      if (tracks.length >= 1000) break;
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

  function normalizeCatalogTracks(rows, fallbackCover = DEFAULT_COVER) {
    if (!Array.isArray(rows)) throw fail('音乐服务返回的数据格式不正确，请稍后重试。', 'INVALID_RESPONSE');
    const fallback = localCover(fallbackCover), tracks = [], seen = new Set();
    for (const row of rows) {
      if (tracks.length >= 1000) break;
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      let rawId = row.songId ?? row.id;
      if (typeof rawId === 'string' && rawId.startsWith('netease:')) rawId = rawId.slice(8);
      let songId = numericId(rawId);
      if (rawId === undefined || rawId === null) {
        // Meting includes the song ID in a URL. Read that identifier only;
        // the catalog never retains or requests the supplied media address.
        const url = httpsUrl(row.url), ids = url?.searchParams.getAll('id') || [];
        songId = ids.length === 1 ? numericId(ids[0]) : null;
      }
      const rawName = row.title ?? row.name, rawArtist = row.author ?? row.artist;
      const name = typeof rawName === 'string' ? rawName.trim() : '';
      const artist = typeof rawArtist === 'string' && rawArtist.trim() ? rawArtist.trim() : '未知歌手';
      if (songId === null || !name || name.length > 1000 || artist.length > 1000 || seen.has(songId)) continue;
      seen.add(songId);
      tracks.push({ id: 'netease:' + songId, songId, name, artist,
        cover: httpsUrl(row.pic ?? row.cover)?.href || fallback,
        sourceUrl: 'https://music.163.com/#/song?id=' + songId });
    }
    return tracks;
  }

  function officialAudioUrl(song) {
    if (!song || typeof song !== 'object' || Array.isArray(song)) return null;
    const songId = numericId(song.songId);
    if (songId === null || song.songId !== songId || song.id !== 'netease:' + songId) return null;
    const url = new URL('https://music.163.com/song/media/outer/url');
    url.searchParams.set('id', songId + '.mp3');
    return url.href;
  }

  const videoIdPattern = /^BV[A-Za-z0-9]{10}$/;
  function positiveInteger(value, max = Number.MAX_SAFE_INTEGER) {
    const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
    if (typeof text !== 'string' || !/^[1-9]\d*$/.test(text)) return null;
    const number = Number(text);
    return Number.isSafeInteger(number) && number <= max ? number : null;
  }

  function parseVideoLink(value) {
    if (typeof value !== 'string' || value.length > 1000) throw fail('请输入 B 站视频的完整 HTTPS 链接或 BV 号。', 'INVALID_VIDEO');
    const text = value.trim();
    if (videoIdPattern.test(text)) return { videoId: text, page: 1 };
    const links = text.match(/https:\/\/[^\s<>"'()，。]+/g) || [];
    const url = links.length === 1 ? httpsUrl(links[0].replace(/[;,；\]]+$/, '')) : null;
    const match = url && !url.port && ['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(url.hostname)
      ? /^\/video\/(BV[A-Za-z0-9]{10})\/?$/.exec(url.pathname) : null;
    if (!match) throw fail('请输入 B 站视频完整链接或 BV 号；分享短链接请先打开，再复制完整链接。', 'INVALID_VIDEO');
    const pages = url.searchParams.getAll('p');
    const page = pages.length === 0 ? 1 : pages.length === 1 ? positiveInteger(pages[0], 1000) : null;
    if (page === null) throw fail('视频分 P 参数必须是 1 至 1000 的整数，且只能出现一次。', 'INVALID_VIDEO');
    return { videoId: match[1], page };
  }

  function parseVideoId(value) { return parseVideoLink(value).videoId; }

  function videoEmbedUrl(value, details = {}) {
    const parsed = parseVideoLink(value);
    const page = details.page === undefined ? parsed.page : positiveInteger(details.page, 1000);
    const cid = details.cid === undefined || details.cid === null ? null : positiveInteger(details.cid);
    if (page === null || (details.cid !== undefined && details.cid !== null && cid === null)) {
      throw fail('视频分 P 或播放信息不正确。', 'INVALID_VIDEO');
    }
    const url = new URL('https://player.bilibili.com/player.html');
    url.searchParams.set('bvid', parsed.videoId);
    if (page > 1) url.searchParams.set('p', String(page));
    if (cid !== null) url.searchParams.set('cid', String(cid));
    url.searchParams.set('autoplay', '0');
    url.searchParams.set('danmaku', '0');
    return url.href;
  }

  function videoSearchUrl(value) {
    const query = typeof value === 'string' ? value.trim() : '';
    if (!query || query.length > 100 || /[\u0000-\u001f\u007f]/.test(query)) throw fail('请输入 1 至 100 个字的搜索词。', 'INVALID_REQUEST');
    const url = new URL('https://search.bilibili.com/all');
    url.searchParams.set('keyword', query);
    return url.href;
  }

  function normalizeVideos(rows, fallbackCover = DEFAULT_COVER) {
    if (!Array.isArray(rows)) throw fail('视频搜索返回的数据格式不正确。', 'INVALID_RESPONSE');
    const tracks = [], seen = new Set(), fallback = localCover(fallbackCover);
    for (const row of rows) {
      if (tracks.length >= 20) break;
      if (!row || typeof row !== 'object' || !videoIdPattern.test(row.videoId) || seen.has(row.videoId)) continue;
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      const artist = typeof row.artist === 'string' && row.artist.trim() ? row.artist.trim() : '未知上传者';
      if (!name || name.length > 1000 || artist.length > 1000) continue;
      seen.add(row.videoId);
      tracks.push({ id: 'bilibili:' + row.videoId, videoId: row.videoId, name, artist,
        duration: typeof row.duration === 'string' && /^\d{1,3}:[0-5]\d(?::[0-5]\d)?$/.test(row.duration) ? row.duration : '',
        cover: httpsUrl(row.cover)?.href || fallback,
        sourceUrl: 'https://www.bilibili.com/video/' + row.videoId });
    }
    return tracks;
  }

  function serviceEndpoint(configured, localPath, label) {
    if (configured) {
      const endpoint = httpsUrl(configured);
      if (!endpoint) throw fail(label + '地址必须是有效的 HTTPS 地址。', 'INVALID_CONFIG');
      return endpoint;
    }
    const location = globalThis.location;
    return location && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
      ? new URL(localPath, location.origin) : null;
  }

  function requestTimeout(config) { return Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 12000; }

  async function requestJSON(url, options, timeoutMs, label, errorCodes = []) {
    if (options.signal?.aborted) throw fail('已取消' + label + '。', 'ABORTED');
    const controller = new AbortController();
    let rejectAbort;
    const abortPromise = new Promise((_, reject) => { rejectAbort = reject; });
    const aborted = () => rejectAbort(controller.signal.reason || fail('已取消' + label + '。', 'ABORTED'));
    const cancel = () => controller.abort(fail('已取消' + label + '。', 'ABORTED'));
    controller.signal.addEventListener('abort', aborted, { once: true });
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => controller.abort(fail(label + '响应超时。', 'TIMEOUT')), timeoutMs);
    try {
      const result = (async () => {
        let response;
        try { response = await globalThis.fetch(url.href, { method: 'GET', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal,
          ...(options.refresh === true ? { cache: 'no-cache' } : {}) }); }
        catch { throw controller.signal.aborted ? controller.signal.reason : fail(label + '暂时无法连接。', 'NETWORK'); }
        let body;
        try { body = await response?.json(); }
        catch { if (response?.ok) throw fail(label + '返回的数据格式不正确。', 'INVALID_RESPONSE'); }
        if (!response?.ok) {
          const code = errorCodes.includes(body?.code) ? body.code : 'HTTP';
          const message = typeof body?.message === 'string' && body.message.length <= 500 && !/[\u0000-\u001f\u007f]/.test(body.message)
            ? body.message : label + '暂时不可用。';
          throw Object.assign(fail(message, code), { status: response?.status });
        }
        return body;
      })();
      return await Promise.race([result, abortPromise]);
    } finally {
      clearTimeout(timer); options.signal?.removeEventListener('abort', cancel);
      controller.signal.removeEventListener('abort', aborted);
    }
  }

  function cached(cache, key) {
    const hit = cache.get(key);
    if (!hit || Date.now() - hit.time >= 600000) return null;
    return Array.isArray(hit.value) ? hit.value.map(item => ({ ...item })) : { ...hit.value };
  }

  function remember(cache, key, value) {
    if (cache.size >= 50 && !cache.has(key)) cache.delete(cache.keys().next().value);
    cache.set(key, { time: Date.now(), value });
    return Array.isArray(value) ? value.map(item => ({ ...item })) : { ...value };
  }

  function createVideoClient(config = {}) {
    const endpoint = serviceEndpoint(config.videoEndpoint, '/api/music/videos', '视频搜索服务');
    const cache = new Map(), timeoutMs = requestTimeout(config);
    const errorCodes = ['VIDEO_RESTRICTED', 'VIDEO_UNAVAILABLE', 'VIDEO_PAGE_UNAVAILABLE'];
    async function request(value, options = {}) {
      const query = new URL(videoSearchUrl(value)).searchParams.get('keyword');
      if (options.signal?.aborted) throw fail('已取消视频搜索。', 'ABORTED');
      if (!endpoint) throw fail('视频搜索暂时不可用，可在 B 站查找后粘贴视频链接。', 'CONFIG_REQUIRED');
      const key = 'search:' + query, hit = cached(cache, key);
      if (hit) return hit;
      const url = new URL(endpoint.href); url.searchParams.set('q', query); url.searchParams.set('page', '1');
      const body = await requestJSON(url, options, timeoutMs, '视频搜索', errorCodes);
      return remember(cache, key, normalizeVideos(body?.tracks, config.fallbackCover));
    }
    async function inspect(value, options = {}) {
      const parsed = parseVideoLink(value);
      if (options.signal?.aborted) throw fail('已取消视频检查。', 'ABORTED');
      if (!endpoint) throw fail('视频检查暂时不可用，请先配置视频服务。', 'CONFIG_REQUIRED');
      const key = 'inspect:' + parsed.videoId + ':' + parsed.page, hit = cached(cache, key);
      if (hit) return hit;
      const url = new URL(endpoint.href);
      url.pathname = /\/videos\/?$/.test(url.pathname) ? url.pathname.replace(/\/videos\/?$/, '/video') : url.pathname.replace(/\/[^/]*\/?$/, '/video');
      url.searchParams.delete('q'); url.searchParams.delete('page');
      url.searchParams.set('bvid', parsed.videoId); url.searchParams.set('p', String(parsed.page));
      const body = await requestJSON(url, options, timeoutMs, '视频检查', errorCodes);
      const row = body?.video || body;
      const cid = positiveInteger(row?.cid), page = positiveInteger(row?.page, 1000);
      const name = typeof row?.name === 'string' ? row.name.trim() : '';
      const artist = typeof row?.artist === 'string' && row.artist.trim() ? row.artist.trim() : '未知上传者';
      if (row?.videoId !== parsed.videoId || page !== parsed.page || cid === null || !name || name.length > 1000 || artist.length > 1000) {
        throw fail('视频检查返回的数据格式不正确。', 'INVALID_RESPONSE');
      }
      const sourceUrl = new URL('https://www.bilibili.com/video/' + parsed.videoId);
      if (page > 1) sourceUrl.searchParams.set('p', String(page));
      return remember(cache, key, { videoId: parsed.videoId, page, cid, name, artist,
        duration: Number.isSafeInteger(row.duration) && row.duration >= 0 ? row.duration
          : typeof row.duration === 'string' && /^\d{1,3}:[0-5]\d(?::[0-5]\d)?$/.test(row.duration) ? row.duration : '',
        cover: httpsUrl(row.cover)?.href || localCover(config.fallbackCover),
        sourceUrl: sourceUrl.href, availability: 'metadata_ok' });
    }
    return { request, inspect };
  }

  const soundCloudReserved = new Set(['search', 'discover', 'stream', 'you', 'stations', 'charts', 'popular', 'upload',
    'settings', 'messages', 'notifications', 'terms-of-use', 'pages', 'people', 'groups', 'sets', 'tracks', 'users', 'premium', 'pro']);
  function parseSoundCloudUrl(value) {
    const text = typeof value === 'string' && value.length <= 2000 ? value.trim() : '';
    const url = /^https:\/\/(?:www\.)?soundcloud\.com(?::443)?\/[a-z0-9_-]+\/[a-z0-9_-]+\/?(?:\?[^#]+)?$/.test(text) ? httpsUrl(text) : null;
    const segments = url?.pathname.replace(/\/$/, '').split('/').slice(1) || [];
    const tracking = new Set(['si', 'utm_source', 'utm_medium', 'utm_campaign']);
    const unsafeQuery = url && [...url.searchParams].some(([key, value]) => !tracking.has(key) || value.length > 500 || /[\u0000-\u001f\u007f]/.test(value));
    if (!url || !['soundcloud.com', 'www.soundcloud.com'].includes(url.hostname) || url.port || unsafeQuery || url.hash
      || segments.length !== 2 || segments.some(segment => !/^[a-z0-9_-]+$/.test(segment))
      || soundCloudReserved.has(segments[0]) || ['sets', 'tracks', 'likes', 'reposts', 'albums', 'popular-tracks', 'comments', 'following', 'followers'].includes(segments[1])) {
      throw fail('请输入公开的 SoundCloud 单曲 HTTPS 链接；私密链接、歌单和搜索页不可导入。', 'INVALID_OPEN_AUDIO');
    }
    return 'https://soundcloud.com/' + segments.join('/');
  }

  function soundCloudEmbedUrl(value) {
    const url = new URL('https://w.soundcloud.com/player/');
    url.searchParams.set('url', parseSoundCloudUrl(value));
    url.searchParams.set('auto_play', 'false'); url.searchParams.set('show_user', 'true'); url.searchParams.set('show_artwork', 'true');
    url.searchParams.set('show_comments', 'false');
    return url.href;
  }

  function soundCloudSearchUrl(value) {
    const query = typeof value === 'string' ? value.trim() : '';
    if (!query || query.length > 100 || /[\u0000-\u001f\u007f]/.test(query)) throw fail('请输入 1 至 100 个字的搜索词。', 'INVALID_REQUEST');
    const url = new URL('https://soundcloud.com/search/sounds'); url.searchParams.set('q', query); return url.href;
  }

  function normalizeOpenAudioTracks(rows, fallbackCover = DEFAULT_COVER) {
    if (!Array.isArray(rows)) throw fail('公开音频返回的数据格式不正确。', 'INVALID_RESPONSE');
    const tracks = [], seen = new Set(), fallback = localCover(fallbackCover);
    for (const row of rows) {
      if (tracks.length >= 20) break;
      if (!row || typeof row !== 'object' || Array.isArray(row) || (row.provider && row.provider !== 'soundcloud')) continue;
      const rawId = row.trackId ?? (typeof row.id === 'string' ? row.id.replace(/^soundcloud:/, '') : row.id);
      const number = positiveInteger(rawId);
      let permalinkUrl;
      try { permalinkUrl = parseSoundCloudUrl(row.permalinkUrl); } catch { continue; }
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      const artist = typeof row.artist === 'string' && row.artist.trim() ? row.artist.trim() : '未知上传者';
      if (number === null || !name || name.length > 1000 || artist.length > 1000 || seen.has(String(number))) continue;
      seen.add(String(number));
      tracks.push({ id: 'soundcloud:' + number, trackId: String(number), provider: 'soundcloud', permalinkUrl, name, artist,
        durationMs: Number.isSafeInteger(row.durationMs) && row.durationMs >= 0 ? row.durationMs : 0,
        fullDurationMs: Number.isSafeInteger(row.fullDurationMs) && row.fullDurationMs >= 0 ? row.fullDurationMs : 0,
        cover: httpsUrl(row.cover)?.href || fallback, sourceUrl: permalinkUrl,
        availability: row.availability === 'public_full' && Number.isSafeInteger(row.durationMs) && row.durationMs >= 1000 && row.durationMs <= 86400000
          && Number.isSafeInteger(row.fullDurationMs) && row.fullDurationMs >= 1000 && row.fullDurationMs <= 86400000
          && Math.abs(row.durationMs - row.fullDurationMs) <= 3000 ? 'public_full' : 'unchecked' });
    }
    return tracks;
  }

  function oEmbedTrackId(html) {
    if (typeof html !== 'string' || html.length > 100000) return null;
    const frames = [...html.matchAll(/<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi)];
    if (frames.length !== 1) return null;
    const decoded = frames[0][2].replace(/&(?:amp|#0*38|#x0*26);/gi, '&').replace(/&(?:quot|#0*34|#x0*22);/gi, '"').replace(/&(?:apos|#0*39|#x0*27);/gi, "'");
    const player = httpsUrl(decoded);
    if (!player || player.hostname !== 'w.soundcloud.com' || player.port || !/^\/player\/?$/.test(player.pathname) || player.searchParams.has('secret_token')) return null;
    const urls = player.searchParams.getAll('url'), track = urls.length === 1 ? httpsUrl(urls[0]) : null;
    const match = track && track.hostname === 'api.soundcloud.com' && !track.port && !track.search && !track.hash
      ? /^\/tracks\/([1-9]\d*)\/?$/.exec(track.pathname) : null;
    return match ? positiveInteger(match[1]) : null;
  }

  function createOpenAudioClient(config = {}) {
    const endpoint = serviceEndpoint(config.openAudioEndpoint, '/api/music/audio', '公开音频服务');
    const timeoutMs = requestTimeout(config), cache = new Map();
    const errorCodes = ['AUDIO_RESTRICTED', 'AUDIO_UNAVAILABLE', 'OPEN_AUDIO_RESTRICTED', 'OPEN_AUDIO_UNAVAILABLE', 'INVALID_OPEN_AUDIO'];
    async function search(value, options = {}) {
      const query = new URL(soundCloudSearchUrl(value)).searchParams.get('q');
      if (options.signal?.aborted) throw fail('已取消公开音频搜索。', 'ABORTED');
      if (!endpoint) throw fail('公开音频搜索暂时不可用，可打开 SoundCloud 搜索或粘贴单曲链接。', 'CONFIG_REQUIRED');
      const key = 'search:' + query, hit = cached(cache, key); if (hit) return hit;
      const url = new URL(endpoint.href); url.searchParams.set('q', query);
      const body = await requestJSON(url, options, timeoutMs, '公开音频搜索', errorCodes);
      return remember(cache, key, normalizeOpenAudioTracks(body?.tracks, config.fallbackCover));
    }
    async function track(value, options = {}) {
      const permalinkUrl = parseSoundCloudUrl(value);
      if (options.signal?.aborted) throw fail('已取消公开音频检查。', 'ABORTED');
      const key = 'track:' + permalinkUrl;
      if (options.refresh === true) cache.delete(key);
      const hit = cached(cache, key); if (hit) return hit;
      let row;
      if (endpoint) {
        const url = new URL(endpoint.href); url.pathname = url.pathname.replace(/\/$/, '') + '/track'; url.searchParams.set('url', permalinkUrl);
        const body = await requestJSON(url, options, timeoutMs, '公开音频检查', errorCodes);
        row = body?.track || body;
      } else {
        const url = new URL('https://soundcloud.com/oembed'); url.searchParams.set('format', 'json'); url.searchParams.set('url', permalinkUrl);
        const body = await requestJSON(url, options, timeoutMs, '公开音频检查', errorCodes);
        const id = oEmbedTrackId(body?.html);
        if (id === null) throw fail('公开音频检查返回的数据格式不正确。', 'INVALID_RESPONSE');
        // SoundCloud's official oEmbed appends this exact author attribution.
        // Other suffixes remain part of the recording's identity.
        const suffix = typeof body.author_name === 'string' && body.author_name ? ' by ' + body.author_name : '';
        const name = typeof body.title === 'string' && suffix && body.title.endsWith(suffix)
          ? body.title.slice(0, -suffix.length) : body.title;
        row = { id, permalinkUrl, name, artist: body.author_name, cover: body.thumbnail_url, availability: 'unchecked' };
      }
      const tracks = normalizeOpenAudioTracks([row], config.fallbackCover);
      if (tracks.length !== 1 || tracks[0].permalinkUrl !== permalinkUrl) throw fail('公开音频检查返回的数据格式不正确。', 'INVALID_RESPONSE');
      return remember(cache, key, tracks[0]);
    }
    return { search, track };
  }

  function createClient(config = {}) {
    const endpoint = httpsUrl(config.endpoint || DEFAULT_ENDPOINT);
    if (!endpoint) throw fail('音乐服务地址必须是有效的 HTTPS 地址。', 'INVALID_CONFIG');
    const timeoutMs = Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 12000;
    const fetchRequest = globalThis.fetch;
    if (typeof fetchRequest !== 'function') throw fail('当前浏览器不支持音乐请求。', 'UNSUPPORTED');

    async function request(type, value, options = {}) {
      if (!['playlist', 'search', 'song'].includes(type)) throw fail('不支持这个音乐请求类型。', 'INVALID_REQUEST');
      if (config.catalogOnly === true && type !== 'playlist') throw fail('网易云仅用于导入歌单，请通过第三方音频搜索或播放歌曲。', 'CATALOG_ONLY');
      const id = type === 'playlist' ? parsePlaylistId(value, config.playlistAliases) : type === 'song' ? numericId(value) : typeof value === 'string' ? value.trim() : null;
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
          return config.catalogOnly === true ? normalizeCatalogTracks(rows, config.fallbackCover) : normalizeTracks(rows, config.fallbackCover);
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

  const api = { createClient, normalizeTracks, normalizeCatalogTracks, officialAudioUrl, parsePlaylistId, escapeHtml,
    parseVideoId, parseVideoLink, videoEmbedUrl, videoSearchUrl, normalizeVideos, createVideoClient,
    parseSoundCloudUrl, soundCloudEmbedUrl, soundCloudSearchUrl, normalizeOpenAudioTracks, createOpenAudioClient };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.SiteMusicSource = api;
})();
