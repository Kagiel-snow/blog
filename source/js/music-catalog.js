'use strict';
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteMusicCatalog = api;
})(typeof globalThis === 'object' ? globalThis : this, function (root) {
  const Matcher = typeof module === 'object' && module.exports ? require('./music-match.js') : root.SiteMusicMatch;
  const recordingName = value => Matcher?.recordingName(value) || '';
  const primaryArtist = value => Matcher?.primaryArtist(value) || '';
  const sameRecording = (song, track) => Matcher?.sameRecording(song, track) === true;
  function init(options) {
    const { container, config, data, Source, Audius, APlayer } = options;
    const win = options.window || root, doc = options.document || win.document, clock = options.clock || win;
    if (win.siteMusic) return win.siteMusic;
    if (!Source?.createClient || !Audius?.createClient || !Matcher?.sameRecording || typeof APlayer !== 'function') {
      const target = doc.querySelector('[data-music-player-status]'); if (target) target.textContent = '播放器资源尚未加载成功，请重试或刷新页面。';
      const retry = doc.querySelector('[data-music-retry-play]'); if (retry) {
        retry.hidden = false; retry.addEventListener('click', () => init({ ...options,
          Source: win.SiteMusicSource || Source, Audius: win.SiteMusicAudius || Audius, APlayer: win.APlayer || APlayer }), { once: true });
      }
      return;
    }
    const source = Source.createClient({ ...config, catalogOnly: true });
    const audio = Source.createOpenAudioClient(config), video = Source.createVideoClient(config);
    const audius = Audius.createClient({ audiusApiKey: config.audiusApiKey, audiusAppName: config.audiusAppName });
    const layout = win.SiteMusicLayout?.create({ window: win, document: doc });
    const element = selector => doc.querySelector(selector);
    const node = (tag, text, className) => {
      const item = doc.createElement(tag); if (text !== undefined) item.textContent = text;
      if (className) item.className = className; return item;
    };
    const states = {
      playlist: { tracks: [], id: config.playlistId, status: '', loaded: false },
      audius: { tracks: [], query: '', status: '输入歌名或歌手搜索公开音频。' },
      openAudio: { tracks: [], query: '', status: '输入歌名或歌手搜索 SoundCloud 音频。' },
      video: { tracks: [], query: '', status: '搜索并选择视频版本。' }
    };
    try {
      const saved = JSON.parse(win.localStorage?.getItem('site-music-playlist-v2') || 'null');
      if (saved?.defaultId === config.playlistId) states.playlist.id = Source.parsePlaylistId(saved.id, config.playlistAliases);
    } catch {}
    let queue = [], view = 'playlist', provider = 'audius', shown = config.pageSize || 20;
    let selectedCatalogId, activeCatalogId, activeTrack, activePlaying = false, currentKind;
    let pendingCatalogId, resolverController, resolverGeneration = 0, resolverBackground = false, externalController, externalGeneration = 0;
    let selectedAudio, selectedVideo, widget, widgetPromise, widgetReady = false, widgetValidated = false, widgetTimer, mediaFailed = false, mediaTimer;
    let playlistInput = states.playlist.id, playlistError = '', playlistInputSource = '', audioInput = '', audioError = '', videoInput = '', videoError = '';
    let keywordDraft = '', keywordDirty = false;
    const unavailableVideos = new Set(), candidates = new Map();
    container.hidden = true;
    const player = new APlayer({ container, autoplay: false, preload: 'none', audio: [], loop: 'none', order: 'list',
      fixed: false, mini: false, theme: '#426f98', volume: 0.7, mutex: true, listFolded: true });
    const catalog = id => queue.find(song => song.id === id);
    const current = () => catalog(selectedCatalogId) || catalog(activeCatalogId);
    const searchKey = () => ({ audius: 'audius', soundcloud: 'openAudio', bilibili: 'video' })[provider] || 'audius';
    const activeState = () => states[view === 'playlist' ? 'playlist' : searchKey()];
    const nativeKind = () => currentKind === 'audius' || currentKind === 'netease';
    const persistentBrowser = () => Boolean(element('[data-music-browser]')?.closest('[data-music-inline-player]'));
    const playlistVisible = () => {
      const shell = element('[data-music-inline-player]');
      return shell ? Boolean(element('[data-music-player-slot]')) || shell.dataset.musicPopupOpen === 'true'
        : Boolean(element('[data-music-browser]')) || Boolean(element('.music-dock')?.open);
    };
    function status(text, failed = false) {
      const target = element('[data-music-player-status]'); if (target) target.textContent = text;
      const retry = element('[data-music-retry-play]'); if (retry) retry.hidden = !failed;
      layout?.sync();
    }
    function selectionFailed(text) {
      status(activePlaying && activeTrack ? text + `《${activeTrack.name}》继续播放。` : text, true);
    }
    function sync() {
      doc.querySelectorAll('[data-track-id],[data-open-audio-id]').forEach(button => {
        const id = button.dataset.trackId || button.dataset.openAudioId;
        const playing = activePlaying && (activeCatalogId === id || activeTrack?.id === id);
        button.closest('.track-card')?.classList.toggle('is-playing', playing);
        const label = button.querySelector('span'); if (label) label.textContent = playing ? '暂停' : '播放';
      });
      const song = current();
      doc.querySelectorAll('[data-music-catalog-controls]').forEach(control => { control.hidden = !song; });
      doc.querySelectorAll('[data-music-catalog-title]').forEach(title => { title.textContent = song ? song.name + ' · ' + song.artist : ''; });
      const index = queue.findIndex(item => item.id === song?.id);
      doc.querySelectorAll('[data-music-catalog-prev]').forEach(prev => { prev.disabled = index <= 0; });
      doc.querySelectorAll('[data-music-catalog-next]').forEach(next => { next.disabled = index < 0 || index >= queue.length - 1; });
      const link = element('[data-music-current-source]'); if (link) {
        link.hidden = !activeTrack; if (activeTrack) { link.href = activeTrack.sourceUrl || activeTrack.permalinkUrl; link.textContent = '打开当前音源 ↗'; }
      }
      for (const selector of ['[data-music-find-open-audio]', '[data-music-find-video]']) { const control = element(selector); if (control) control.hidden = !song; }
      const compact = element('[data-music-video-dock]')?.classList.contains('is-compact');
      doc.querySelectorAll('[data-music-toggle-external-tools]').forEach(button => button.setAttribute('aria-expanded', String(!compact)));
      doc.querySelectorAll('[data-music-active-title]').forEach(title => {
        title.textContent = activeTrack ? activeTrack.name + ' · ' + activeTrack.artist : '选择一首歌开始听';
      });
      doc.querySelectorAll('[data-music-toggle-play]').forEach(button => {
        const usable = nativeKind() && activeTrack || currentKind === 'soundcloud' && widget && widgetReady && widgetValidated
          || currentKind === 'bilibili' && selectedVideo;
        button.disabled = !usable && !song;
        if (currentKind === 'soundcloud' && (!widgetReady || !widgetValidated) && !mediaFailed) button.disabled = true;
        button.textContent = currentKind === 'bilibili' ? '停止视频' : ((nativeKind() && !player.paused) || (currentKind === 'soundcloud' && activePlaying)) ? '暂停' : '播放';
        button.setAttribute('aria-label', button.textContent);
      });
      layout?.sync();
    }
    function cancelResolver(clearContext = false) {
      ++resolverGeneration; resolverController?.abort(); resolverController = undefined; resolverBackground = false;
      if (clearContext) pendingCatalogId = undefined;
    }
    function cancelExternal() { ++externalGeneration; externalController?.abort(); externalController = undefined; }
    function cancelSearches(clear = false) {
      for (const state of [states.audius, states.openAudio, states.video]) {
        state.generation = (state.generation || 0) + 1; state.controller?.abort(); state.loading = false;
        if (clear) { state.tracks = []; state.forSongId = undefined; }
      }
    }
    function clearExternal(cancel = true) {
      if (cancel) cancelExternal();
      if (widget && win.SC?.Widget?.Events) Object.values(win.SC.Widget.Events).forEach(event => widget.unbind?.(event));
      clock.clearTimeout(widgetTimer); widget = undefined; widgetReady = false; widgetValidated = false; selectedAudio = undefined; selectedVideo = undefined;
      element('[data-music-video-frame]')?.replaceChildren();
      const dock = element('[data-music-video-dock]'); if (dock) { dock.hidden = true; dock.classList.toggle('is-audio', false); dock.classList.toggle('is-compact', false); }
      doc.body?.classList.toggle('music-video-open', false);
      layout?.sync();
    }
    function closeVideo() {
      cancelResolver(true); clearExternal();
      if (!nativeKind()) { currentKind = undefined; activeTrack = undefined; activePlaying = false; status('播放器已关闭，选择一首继续听。'); }
      render();
    }
    async function deadline(operation, controller) {
      let timeout, onAbort;
      const interrupted = new Promise((_, reject) => {
        onAbort = () => reject(Object.assign(new Error('已取消'), { code: 'ABORTED' }));
        controller.signal.addEventListener('abort', onAbort, { once: true });
        timeout = clock.setTimeout(() => { reject(Object.assign(new Error('查询超时'), { code: 'TIMEOUT' })); controller.abort(); }, 8000);
      });
      try { return await Promise.race([operation, interrupted]); }
      finally { clock.clearTimeout(timeout); controller.signal.removeEventListener('abort', onAbort); }
    }
    function widgetAPI() {
      if (win.SC?.Widget) return Promise.resolve(win.SC.Widget);
      if (!widgetPromise) widgetPromise = new Promise((resolve, reject) => {
        const script = node('script'); script.src = '/vendor/soundcloud-widget-api.js';
        script.addEventListener('load', () => win.SC?.Widget ? resolve(win.SC.Widget) : reject(new Error('widget unavailable')), { once: true });
        script.addEventListener('error', () => reject(new Error('widget unavailable')), { once: true }); doc.head.append(script);
      }).catch(error => { widgetPromise = undefined; throw error; });
      return widgetPromise;
    }
    function activate(track, forSongId, kind) {
      activeTrack = track; activeCatalogId = catalog(forSongId)?.id; selectedCatalogId = activeCatalogId;
      currentKind = kind; activePlaying = false; mediaFailed = false; clock.clearTimeout(mediaTimer); sync();
    }
    function externalChrome(track, kind) {
      const dock = element('[data-music-video-dock]'); if (dock) { dock.hidden = false; dock.classList.toggle('is-audio', kind === 'soundcloud'); dock.classList.toggle('is-compact', kind === 'soundcloud'); }
      doc.body?.classList.toggle('music-video-open', true); container.hidden = true;
      const title = element('[data-music-video-title]'); if (title) title.textContent = track.name + ' · ' + track.artist;
      const link = element('[data-music-video-source]'); if (link) { link.href = track.sourceUrl || track.permalinkUrl; link.textContent = kind === 'soundcloud' ? '在 SoundCloud 打开 ↗' : '在 B 站打开 ↗'; link.hidden = false; }
    }
    function registeredRecording(song, registered, track) {
      if (!song || !registered || track?.provider !== 'soundcloud') return false;
      let permalink;
      try { permalink = Source.parseSoundCloudUrl(registered.url); } catch { return false; }
      const expectedArtist = recordingName(primaryArtist(song.artist));
      if (!expectedArtist || expectedArtist !== recordingName(registered.artist) || expectedArtist !== recordingName(track.artist)
        || !recordingName(registered.name) || recordingName(registered.name) !== recordingName(track.name)
        || !/^[1-9]\d*$/.test(String(registered.trackId || '')) || String(registered.trackId) !== String(track.trackId)
        || track.permalinkUrl !== permalink || track.id !== 'soundcloud:' + registered.trackId
        || !Number.isSafeInteger(registered.durationMs) || registered.durationMs < 1000 || registered.durationMs > 86400000) return false;
      if (track.availability === 'unchecked') return true;
      return track.availability === 'public_full' && Number.isSafeInteger(track.durationMs) && Number.isSafeInteger(track.fullDurationMs)
        && track.durationMs >= 1000 && track.fullDurationMs >= 1000
        && Math.abs(track.durationMs - registered.durationMs) <= 3000 && Math.abs(track.durationMs - track.fullDurationMs) <= 3000;
    }
    function sameSelectedTrack(candidate, track) {
      return candidate?.id === track?.id && candidate?.permalinkUrl === track?.permalinkUrl
        && recordingName(candidate.name) === recordingName(track.name) && recordingName(candidate.artist) === recordingName(track.artist);
    }
    function mountAudio(track, forSongId, settings = {}) {
      const host = element('[data-music-video-frame]'); if (!host) return false;
      player.pause(); doc.querySelectorAll('video').forEach(item => item.pause());
      const preserve = !settings.force && !mediaFailed && selectedAudio?.id === track.id && host.children.length;
      if (preserve) { activeCatalogId = catalog(forSongId)?.id; selectedCatalogId = activeCatalogId; sync(); if (widgetValidated) togglePlayback(); return true; }
      clearExternal(false); const frame = node('iframe'); frame.id = 'site-soundcloud-player';
      frame.src = Source.soundCloudEmbedUrl(track.permalinkUrl); frame.title = track.name + ' · SoundCloud 音频播放器';
      frame.allow = 'autoplay'; frame.setAttribute('scrolling', 'no'); host.replaceChildren(frame);
      selectedAudio = track; activate(track, forSongId, 'soundcloud'); externalChrome(track, 'soundcloud');
      const message = text => { const target = element('[data-music-video-status]'); if (target) target.textContent = text; status(text); };
      message('正在确认音频版本并准备播放…'); audioError = ''; render();
      const active = () => selectedAudio?.id === track.id && host.children[0] === frame;
      const stop = text => {
        if (!active()) return;
        clock.clearTimeout(widgetTimer); widgetValidated = false; mediaFailed = true; activePlaying = false; widget?.pause?.();
        if (!win.SC?.Widget) widgetPromise = undefined;
        message(text); status(text, true); sync();
      };
      // This deadline includes loading the SDK, READY, and its duration reply.
      widgetTimer = clock.setTimeout(() => stop('音频暂时未能准备好，可重试或选择其他版本。'), 8000);
      widgetAPI().then(Widget => {
        if (!active() || mediaFailed) return; const instance = Widget(frame); widget = instance;
        const expectedDuration = settings.registered?.durationMs || (track.availability === 'public_full' ? track.durationMs : undefined);
        const ready = () => {
          if (!active() || mediaFailed) return;
          clock.clearTimeout(widgetTimer); widgetValidated = true;
          message('音频播放器已就绪，可以播放。'); sync();
          // A public metadata match or a pinned recording with a verified SDK
          // duration may start. READY itself is never evidence of playback.
          if (track.availability === 'public_full' || settings.registered) instance.play();
        };
        instance.bind(Widget.Events.READY, () => {
          if (!active() || mediaFailed || widgetReady) return;
          widgetReady = true;
          if (!expectedDuration) { ready(); return; }
          message('正在确认音频时长…'); sync();
          if (typeof instance.getDuration !== 'function') { stop('暂时无法确认这个音频版本，请重试或选择其他版本。'); return; }
          try {
            instance.getDuration(duration => {
              if (!active() || mediaFailed) return;
              if (!Number.isFinite(duration) || duration < 1000 || Math.abs(duration - expectedDuration) > 3000) {
                stop('这个音频的时长与所选版本不符，已停止播放，请选择其他版本。'); return;
              }
              ready();
            });
          } catch { stop('暂时无法确认这个音频版本，请重试或选择其他版本。'); }
        });
        instance.bind(Widget.Events.PLAY, () => {
          if (!active()) return;
          if (!widgetValidated || mediaFailed) { instance.pause?.(); activePlaying = false; sync(); return; }
          activePlaying = true; message(`正在播放《${track.name}》（SoundCloud）`); sync();
        });
        instance.bind(Widget.Events.PAUSE, () => { if (active()) { activePlaying = false; if (!mediaFailed) message(`已暂停《${track.name}》。`); sync(); } });
        instance.bind(Widget.Events.ERROR, () => stop('这个音频版本暂时无法播放，可重试或选择其他版本。'));
        instance.bind(Widget.Events.FINISH, () => {
          if (!active() || mediaFailed) return;
          activePlaying = false; message(`《${track.name}》播放结束。`); sync();
          if (activeCatalogId && !resolverController && !externalController) advance(1, activeCatalogId, { background: true });
        });
      }).catch(() => stop('播放器暂时未能准备好，可重试或选择其他版本。'));
      return true;
    }
    function mountNative(track, forSongId, kind = 'audius') {
      const url = kind === 'netease' ? Source.officialAudioUrl(track) : Audius.streamUrl(track.trackId, config.audiusApiKey);
      if (!url) return false;
      clearExternal(); player.pause(); doc.querySelectorAll('video').forEach(item => item.pause());
      player.list.clear();
      // Audius is independently checked; the optional NetEase fallback is only
      // the fixed official public endpoint derived from an imported song ID.
      activate({ ...track, url }, forSongId, kind);
      player.list.add([{ ...track, url, name: Source.escapeHtml(track.name), artist: Source.escapeHtml(track.artist) }]);
      container.hidden = false; status(`正在连接《${track.name}》…`); player.play();
      if (!element('[data-music-inline-player]')) { const dock = element('.music-dock'); if (dock) dock.open = true; }
      render(); return true;
    }
    function publicNeteaseFallback(song) {
      if (config.allowPublicNeteaseFallback !== true || catalog(song?.id) !== song || !Source.officialAudioUrl(song)) return false;
      pendingCatalogId = undefined;
      return mountNative({ ...song, provider: 'netease', availability: 'official_public_unchecked' }, song.id, 'netease');
    }
    function togglePlayback() {
      cancelResolver(true); cancelExternal();
      if (mediaFailed) {
        if (activeCatalogId) return playTrack(activeCatalogId);
        if (currentKind === 'audius' && activeTrack) return openAudius(activeTrack);
        if (selectedAudio || selectedVideo) return reloadExternalPlayer();
      }
      if (nativeKind() && activeTrack) {
        selectedCatalogId = activeCatalogId;
        if (player.paused) player.play(); else player.pause(); sync(); return true;
      }
      if (currentKind === 'soundcloud' && widget && widgetReady && widgetValidated) {
        selectedCatalogId = activeCatalogId;
        if (activePlaying) widget.pause?.(); else widget.play(); sync(); return true;
      }
      if (currentKind === 'bilibili') { closeVideo(); return true; }
      const song = current(); return song ? playTrack(song.id) : false;
    }
    async function openAudius(value, settings = {}) {
      cancelResolver(); cancelExternal(); const generation = externalGeneration, controller = new AbortController(); externalController = controller;
      try {
        const track = await deadline(audius.track(typeof value === 'object' ? value.trackId : value, { signal: controller.signal }), controller);
        if (generation !== externalGeneration || controller.signal.aborted) return false;
        if (track.provider !== 'audius' || track.availability !== 'public_full') throw new Error('not public');
        pendingCatalogId = undefined; return mountNative(track, settings.forSongId);
      } catch (error) {
        if (generation !== externalGeneration || error.code === 'ABORTED') return false;
        selectionFailed('这个公开音频版本暂时不可用，可重试或选择其他版本。'); return false;
      } finally { if (externalController === controller) externalController = undefined; }
    }
    async function openAudio(value, settings = {}) {
      cancelResolver(); cancelExternal(); const generation = externalGeneration, controller = new AbortController(); externalController = controller;
      try {
        const candidate = typeof value === 'object' ? value : candidates.get(value) || states.openAudio.tracks.find(item => item.id === value);
        const url = Source.parseSoundCloudUrl(candidate?.permalinkUrl || value);
        status('正在确认所选音频版本…');
        const track = await deadline(audio.track(url, { signal: controller.signal, refresh: true }), controller);
        if (generation !== externalGeneration || controller.signal.aborted) return false;
        if (candidate && (!sameSelectedTrack(candidate, track) || candidate.availability === 'public_full' && track.availability !== 'public_full')) throw new Error('recording changed');
        const song = catalog(settings.forSongId), registered = song && config.audioAlternatives?.[song.id];
        const pinned = registered && Source.parseSoundCloudUrl(registered.url) === url ? registered : undefined;
        if (pinned && !registeredRecording(song, pinned, track)) throw new Error('registered recording changed');
        pendingCatalogId = undefined; return mountAudio(track, settings.forSongId, { force: settings.force, registered: pinned });
      } catch (error) {
        if (generation !== externalGeneration || error.code === 'ABORTED') return false;
        audioError = '这个音频版本暂时不可用，可换个版本或打开 SoundCloud 搜索。'; selectionFailed(audioError); render(); return false;
      } finally { if (externalController === controller) externalController = undefined; }
    }
    async function openVideo(value, settings = {}) {
      cancelResolver(); cancelExternal(); const generation = externalGeneration, controller = new AbortController(); externalController = controller;
      try {
        const input = typeof value === 'string' ? value.replace(/^bilibili:/, '') : value;
        const selection = Source.parseVideoLink(input); let track, unchecked = false;
        try { track = await deadline(video.inspect('https://www.bilibili.com/video/' + selection.videoId + '?p=' + selection.page, { signal: controller.signal }), controller); }
        catch (error) {
          if (['VIDEO_RESTRICTED', 'VIDEO_UNAVAILABLE', 'VIDEO_PAGE_UNAVAILABLE'].includes(error.code)) {
            if (error.code !== 'VIDEO_PAGE_UNAVAILABLE') unavailableVideos.add(selection.videoId);
            throw error;
          }
          if (controller.signal.aborted) throw error;
          unchecked = true; track = states.video.tracks.find(item => item.videoId === selection.videoId) || { name: selection.videoId, artist: 'B 站视频' };
        }
        if (generation !== externalGeneration || controller.signal.aborted) return false;
        const host = element('[data-music-video-frame]'); if (!host) return false;
        const preserve = !settings.force && selectedVideo?.videoId === selection.videoId && selectedVideo.page === selection.page && host.children.length;
        player.pause(); doc.querySelectorAll('video').forEach(item => item.pause());
        if (!preserve) {
          clearExternal(false); const frame = node('iframe'); frame.src = Source.videoEmbedUrl(selection.videoId, { page: selection.page, cid: track.cid });
          frame.title = track.name + ' · B 站播放器'; frame.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
          frame.setAttribute('allowfullscreen', ''); frame.referrerPolicy = 'strict-origin-when-cross-origin';
          frame.addEventListener('error', () => { if (host.children[0] === frame) { const target = element('[data-music-video-status]'); if (target) target.textContent = '播放器未能加载，可重新加载或选择其他版本。'; } });
          host.replaceChildren(frame);
        }
        selectedVideo = { ...selection, track }; pendingCatalogId = undefined;
        const sourceUrl = 'https://www.bilibili.com/video/' + selection.videoId + (selection.page > 1 ? '?p=' + selection.page : '');
        activate({ ...track, sourceUrl }, settings.forSongId, 'bilibili'); externalChrome({ ...track, sourceUrl }, 'bilibili');
        const target = element('[data-music-video-status]'); if (target) target.textContent = unchecked ? '未能检查状态，已打开官方播放器；失败时可重新加载或换个版本。' : '已打开视频播放器，请点击其中的播放按钮。';
        status('已打开视频版本，请点击播放器播放。'); videoError = ''; render(); return true;
      } catch (error) {
        if (generation !== externalGeneration || error.code === 'ABORTED') return false;
        videoError = '这个视频或分集不可用，请选择其他版本。'; render(); return false;
      } finally { if (externalController === controller) externalController = undefined; }
    }
    function populateCandidates(song, rows, failures) {
      candidates.clear(); rows.forEach(track => candidates.set(track.id, track));
      states.audius.tracks = rows.filter(track => track.provider === 'audius');
      states.openAudio.tracks = rows.filter(track => track.provider === 'soundcloud');
      const query = (song.name + ' ' + primaryArtist(song.artist)).slice(0, 100);
      if (!keywordDirty) keywordDraft = query;
      for (const state of [states.audius, states.openAudio]) {
        state.forSongId = song.id;
        state.query = query; state.failed = !rows.length && failures; state.loading = false;
        state.status = rows.length ? '未能确定唯一的同曲录音，请核对歌名、歌手及版本后选择；可切换音频平台查看候选。' : '没有找到可确认的同曲音频，可重试、换平台或选择视频版本。';
      }
      provider = states.audius.tracks.length ? 'audius' : 'soundcloud'; view = 'search'; render();
    }
    async function playTrack(id, settings = {}) {
      if (String(id).startsWith('audius:')) {
        if (activeTrack?.id === id && currentKind === 'audius' && !mediaFailed) return togglePlayback();
        return openAudius(id, { forSongId: states.audius.tracks.some(track => track.id === id) ? states.audius.forSongId : undefined });
      }
      if (String(id).startsWith('soundcloud:')) return openAudio(id, { forSongId: states.openAudio.tracks.some(track => track.id === id) ? states.openAudio.forSongId : undefined });
      const song = catalog(id); if (!song) return false;
      if (activeCatalogId === id && !mediaFailed && nativeKind()) {
        return togglePlayback();
      }
      if (activeCatalogId === id && !mediaFailed && currentKind === 'soundcloud' && widget && widgetReady && widgetValidated) {
        return togglePlayback();
      }
      selectedCatalogId = song.id; pendingCatalogId = settings.background ? undefined : song.id; cancelResolver(); cancelExternal();
      if (!settings.background) cancelSearches(true);
      const controller = new AbortController(), generation = resolverGeneration; resolverController = controller; resolverBackground = Boolean(settings.background);
      status(`正在确认《${song.name}》的音频版本…`); if (settings.background) sync(); else render();
      const registered = config.audioAlternatives?.[song.id];
      let registeredRejected = false;
      try {
        if (registered) {
          try {
            const track = await deadline(audio.track(Source.parseSoundCloudUrl(registered.url), { signal: controller.signal, refresh: true }), controller);
            if (generation !== resolverGeneration || controller.signal.aborted) return false;
            if (!registeredRecording(song, registered, track)) throw new Error('registered recording changed');
            pendingCatalogId = undefined; return mountAudio(track, song.id, { registered });
          } catch (error) {
            if (generation !== resolverGeneration || controller.signal.aborted || error.code === 'ABORTED') throw error;
            // Try the other public source once. A rejected registration is not
            // requested again through its platform's search in this attempt.
            registeredRejected = true;
          }
        }
        const query = (song.name + ' ' + primaryArtist(song.artist)).replace(/\s+/g, ' ').trim().slice(0, 100);
        const lookup = async client => {
          const child = new AbortController(), cancel = () => child.abort();
          controller.signal.addEventListener('abort', cancel, { once: true });
          try { return await deadline(client.search(query, { signal: child.signal }), child); }
          finally { controller.signal.removeEventListener('abort', cancel); }
        };
        // Each source has its own deadline, so a stalled source cannot discard
        // a public candidate already returned by the other platform.
        const results = await Promise.allSettled([lookup(audius), registeredRejected ? Promise.resolve([]) : lookup(audio)]);
        if (generation !== resolverGeneration || controller.signal.aborted) return false;
        const rows = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
        const unique = [...new Map(rows.map(track => [track.id, track])).values()];
        const matches = unique.filter(track => sameRecording(song, track)
          && (!Number.isSafeInteger(registered?.durationMs) || Math.abs(track.durationMs - registered.durationMs) <= 3000));
        if (matches.length === 1) {
          let track = matches[0];
          if (track.provider === 'audius') {
            track = await deadline(audius.track(track.trackId, { signal: controller.signal }), controller);
            if (generation !== resolverGeneration || controller.signal.aborted) return false;
            if (!sameRecording(song, track) || Number.isSafeInteger(registered?.durationMs) && Math.abs(track.durationMs - registered.durationMs) > 3000) throw new Error('recording changed');
          } else {
            const selected = track;
            track = await deadline(audio.track(selected.permalinkUrl, { signal: controller.signal, refresh: true }), controller);
            if (generation !== resolverGeneration || controller.signal.aborted) return false;
            if (!sameSelectedTrack(selected, track) || !sameRecording(song, track)) throw new Error('recording changed');
          }
          pendingCatalogId = undefined;
          return track.provider === 'audius' ? mountNative(track, song.id) : mountAudio(track, song.id);
        }
        if (publicNeteaseFallback(song)) return true;
        if (settings.background) { status(`《${song.name}》暂时没有可确认的音频，请找其他版本或重试。`, true); sync(); }
        else { populateCandidates(song, unique, results.some(result => result.status === 'rejected')); status('请从搜索结果选择想听的版本。', !unique.length); }
        return false;
      } catch (error) {
        if (generation !== resolverGeneration || error.code === 'ABORTED') return false;
        if (publicNeteaseFallback(song)) return true;
        selectionFailed('同曲音频暂时未找到，可重试或选择其他版本。');
        if (!settings.background) populateCandidates(song, [], true); else sync(); return false;
      } finally { if (resolverController === controller) { resolverController = undefined; resolverBackground = false; } }
    }
    function advance(direction, fromId = selectedCatalogId || activeCatalogId, settings = {}) {
      const index = queue.findIndex(song => song.id === fromId), next = queue[index + direction];
      if (index < 0 || !next) { activePlaying = false; status('歌单已播放结束，可选择其他歌曲。'); sync(); return false; }
      return playTrack(next.id, settings);
    }
    async function load(type, value, settings = {}) {
      const state = states[type]; if (!state) return;
      if (type === 'playlist') { cancelResolver(true); cancelExternal(); cancelSearches(true); }
      else if (!settings.forSongId) { if (!resolverBackground) cancelResolver(true); else pendingCatalogId = undefined; cancelExternal(); }
      else if (settings.forSongId) { cancelResolver(); pendingCatalogId = settings.forSongId; }
      state.controller?.abort(); const controller = new AbortController(), generation = (state.generation || 0) + 1;
      state.controller = controller; state.generation = generation; state.tracks = []; state.loading = true; state.failed = false;
      if (type !== 'playlist') state.forSongId = settings.forSongId;
      if (type !== 'playlist') { keywordDraft = value; keywordDirty = false; }
      state[type === 'playlist' ? 'id' : 'query'] = value; state.status = type === 'playlist' ? '正在导入网易云歌单目录…' : '正在搜索公开版本…';
      view = type === 'playlist' ? 'playlist' : 'search'; if (type !== 'playlist') provider = { audius: 'audius', openAudio: 'soundcloud', video: 'bilibili' }[type];
      shown = config.pageSize || 20; render();
      try {
        const request = type === 'playlist' ? source.request('playlist', value, { signal: controller.signal })
          : type === 'audius' ? audius.search(value, { signal: controller.signal })
            : type === 'openAudio' ? audio.search(value, { signal: controller.signal }) : video.request(value, { signal: controller.signal });
        const tracks = await deadline(request, controller);
        if (state.generation !== generation || controller.signal.aborted) return;
        state.tracks = tracks; state.loaded = true; state.status = type === 'playlist' ? `已导入 ${tracks.length} 首歌；播放时优先查找第三方音频${config.allowPublicNeteaseFallback === true ? '，未匹配时尝试网易云公开原曲' : ''}。`
          : tracks.length ? `找到 ${tracks.length} 个公开版本，请核对歌名、歌手和版本后选择。` : '没有找到可用版本，可换关键词或平台。';
        if (type === 'playlist') {
          const playingSong = catalog(activeCatalogId);
          queue = tracks.map(track => { const { url, ...metadata } = track; return metadata; });
          if (playingSong && currentKind && !queue.some(track => track.id === playingSong.id)) queue.unshift(playingSong);
          if (!queue.some(track => track.id === selectedCatalogId)) selectedCatalogId = undefined;
          data.textContent = JSON.stringify(queue);
          try { win.localStorage?.setItem('site-music-playlist-v2', JSON.stringify({ id: value, defaultId: config.playlistId })); } catch {}
          if (!currentKind) status(tracks.length ? '歌单目录已导入，选择一首开始播放。' : '歌单没有歌曲，可更换歌单。');
        }
      } catch (error) {
        if (state.generation !== generation || error.code === 'ABORTED') return;
        state.failed = true; state.status = type === 'playlist' ? '歌单目录暂时未能导入，请重试。'
          : type === 'openAudio' ? 'SoundCloud 搜索暂时不可用，可打开平台搜索或粘贴公开单曲链接。' : '搜索暂时不可用，请重试或换一个平台。';
      } finally { if (state.generation === generation) { state.loading = false; render(); } }
    }
    function ensurePlaylist() { const state = states.playlist; if (!state.loaded && !state.loading && !state.failed) return load('playlist', state.id); }
    function findAudio(song) { return song ? load('audius', (song.name + ' ' + primaryArtist(song.artist)).slice(0, 100), { forSongId: song.id }) : undefined; }
    function findVideo(song) { return song ? load('video', (song.name + ' ' + primaryArtist(song.artist)).slice(0, 100), { forSongId: song.id }) : undefined; }
    function reloadExternalPlayer() {
      if (selectedAudio) return openAudio(selectedAudio, { force: true, forSongId: activeCatalogId });
      if (selectedVideo) return openVideo('https://www.bilibili.com/video/' + selectedVideo.videoId + '?p=' + selectedVideo.page, { force: true, forSongId: activeCatalogId });
    }
    function changeExternalVersion() {
      const song = catalog(activeCatalogId), track = activeTrack, kind = currentKind;
      closeVideo(); if (song) return kind === 'bilibili' ? findVideo(song) : findAudio(song);
      if (track) return load(kind === 'bilibili' ? 'video' : 'audius', (track.name + ' ' + track.artist).slice(0, 100));
    }
    function render() {
      const browser = element('[data-music-browser]'); sync(); if (!browser) return;
      const state = activeState(), key = view === 'playlist' ? 'playlist' : searchKey();
      browser.querySelectorAll('[data-music-provider]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.musicProvider === provider)));
      browser.querySelectorAll('[data-music-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.musicView === view)));
      const set = (selector, text) => { const item = browser.querySelector(selector); if (item) item.textContent = text; };
      set('[data-music-list-title]', view === 'playlist' ? states.playlist.id === config.playlistId ? config.playlistName : '网易云歌单 · ' + states.playlist.id : state.query ? '“' + state.query + '”的公开版本' : '搜索结果');
      set('[data-music-browser-status]', state.status); set('[data-music-playlist-error]', playlistError); set('[data-music-audio-error]', audioError); set('[data-music-video-error]', videoError);
      const retry = browser.querySelector('[data-music-retry-list]'); if (retry) retry.hidden = !state.failed;
      const more = browser.querySelector('[data-music-more]'); if (more) more.hidden = state.loading || state.tracks.length <= shown;
      const link = browser.querySelector('[data-music-playlist-source]'); if (link) link.href = 'https://music.163.com/#/playlist?id=' + states.playlist.id;
      const inputSource = browser.querySelector('[data-music-input-source]'); if (inputSource) { inputSource.hidden = !playlistInputSource; if (playlistInputSource) inputSource.href = playlistInputSource; }
      for (const [name, value] of [['playlist', playlistInput], ['keyword', keywordDraft], ['audioLink', audioInput], ['videoLink', videoInput]]) {
        const input = browser.querySelector('[name="' + name + '"]'); if (input && doc.activeElement !== input) input.value = value || '';
      }
      for (const [type, active] of [['audio', provider === 'soundcloud'], ['video', provider === 'bilibili']]) { const tools = browser.querySelector('[data-music-' + type + '-tools]'); if (tools) tools.hidden = !active; }
      const query = state.query || (current() ? current().name + ' ' + current().artist : '音乐');
      const audioLink = browser.querySelector('[data-music-audio-search-link]'); if (audioLink) audioLink.href = Source.soundCloudSearchUrl(query.slice(0, 100));
      const videoLink = browser.querySelector('[data-music-video-search-link]'); if (videoLink) videoLink.href = Source.videoSearchUrl(query.slice(0, 100));
      const grid = browser.querySelector('[data-music-results]'); if (!grid) return;
      grid.replaceChildren(); grid.setAttribute('aria-busy', String(Boolean(state.loading)));
      state.tracks.slice(0, shown).forEach((track, index) => {
        const card = node('article', undefined, 'track-card'); card.setAttribute('translate', 'no');
        const cover = node('img'); cover.src = track.cover || config.fallbackCover; cover.alt = ''; cover.loading = 'lazy'; cover.decoding = 'async';
        cover.addEventListener('error', () => { cover.src = config.fallbackCover; }, { once: true });
        const body = node('div', undefined, 'track-body');
        const duration = track.durationMs ? Math.floor(track.durationMs / 60000) + ':' + String(Math.floor(track.durationMs / 1000) % 60).padStart(2, '0') : track.duration;
        body.append(node('span', String(index + 1).padStart(2, '0') + ' / ' + (key === 'playlist' ? '歌单目录' : provider.toUpperCase()), 'track-number'), node('h2', track.name), node('p', track.artist + (duration ? ' · ' + duration : '')));
        const play = node('button', undefined, 'track-play section-action'); play.type = 'button';
        if (key === 'video') { play.dataset.videoId = track.videoId; play.disabled = unavailableVideos.has(track.videoId); }
        else if (key === 'openAudio') play.dataset.openAudioId = track.id;
        else play.dataset.trackId = track.id;
        play.append(node('span', play.disabled ? '此版本不可用' : '播放')); body.append(play);
        if (key === 'playlist') {
          const other = node('button', '找其他音频', 'track-source track-video'); other.type = 'button'; other.dataset.trackOpenAudio = track.id; body.append(other);
          const movie = node('button', '找视频版本', 'track-source track-video'); movie.type = 'button'; movie.dataset.trackVideo = track.id; body.append(movie);
        }
        const origin = node('a', key === 'playlist' ? '原歌曲目录 ↗' : '原平台 ↗', 'track-source'); origin.href = track.sourceUrl || track.permalinkUrl; origin.target = '_blank'; origin.rel = 'noopener noreferrer';
        body.append(node('br'), origin); card.append(cover, body); grid.append(card);
      }); sync();
    }
    function failedNative() {
      clock.clearTimeout(mediaTimer); if (!nativeKind()) return;
      mediaFailed = true; player.pause(); activePlaying = false;
      status(currentKind === 'netease' ? '网易云公开原曲暂时无法播放，可打开原歌曲、重试或找其他版本。' : '这个第三方音频暂时无法播放，可重试或选择其他版本。', true); sync();
    }
    player.on('play', () => { if (nativeKind()) { cancelResolver(true); clearExternal(); activePlaying = false; mediaFailed = false; clock.clearTimeout(mediaTimer); mediaTimer = clock.setTimeout(failedNative, 8000); status(`正在连接《${activeTrack.name}》${currentKind === 'netease' ? '（网易云公开音频）' : ''}…`); sync(); } });
    player.on('playing', () => { if (nativeKind() && !mediaFailed) { clock.clearTimeout(mediaTimer); activePlaying = true; status(`正在播放《${activeTrack.name}》（${currentKind === 'netease' ? '网易云公开音频' : 'Audius'}）`); sync(); } });
    player.on('canplay', () => { if (currentKind !== 'netease') clock.clearTimeout(mediaTimer); });
    player.on('pause', () => { if (nativeKind()) { clock.clearTimeout(mediaTimer); activePlaying = false; if (!mediaFailed && activeTrack) status(`已暂停《${activeTrack.name}》。`); sync(); } });
    player.on('waiting', () => { if (nativeKind() && !player.paused) { clock.clearTimeout(mediaTimer); mediaTimer = clock.setTimeout(failedNative, 8000); } });
    player.on('error', failedNative);
    player.on('ended', () => { if (nativeKind() && !mediaFailed) { activePlaying = false; if (activeCatalogId && !resolverController && !externalController) advance(1, activeCatalogId, { background: true }); else if (!externalController && !resolverController) status('播放结束。'); sync(); } });
    doc.addEventListener('submit', event => {
      if (event.target.matches('[data-music-search-form]')) { event.preventDefault(); const query = event.target.elements.keyword.value.trim(); if (query) load(searchKey(), query); }
      else if (event.target.matches('[data-music-playlist-form]')) {
        event.preventDefault(); playlistInput = event.target.elements.playlist.value; playlistError = ''; playlistInputSource = '';
        try { load('playlist', Source.parsePlaylistId(playlistInput, config.playlistAliases)); }
        catch (error) { playlistError = error.message; playlistInputSource = error.url || ''; render(); }
      } else if (event.target.matches('[data-music-audio-form]')) { event.preventDefault(); audioInput = event.target.elements.audioLink.value; pendingCatalogId = undefined; void openAudio(audioInput); }
      else if (event.target.matches('[data-music-video-form]')) { event.preventDefault(); videoInput = event.target.elements.videoLink.value; pendingCatalogId = undefined; void openVideo(videoInput); }
    });
    doc.addEventListener('input', event => {
      if (event.target.matches('[name="playlist"]')) playlistInput = event.target.value;
      if (event.target.matches('[name="keyword"]')) { keywordDraft = event.target.value; keywordDirty = true; }
      if (event.target.matches('[name="audioLink"]')) audioInput = event.target.value;
      if (event.target.matches('[name="videoLink"]')) videoInput = event.target.value;
    });
    doc.addEventListener('click', event => {
      const target = event.target.closest('[data-track-id],[data-video-id],[data-open-audio-id],[data-track-open-audio],[data-track-video],[data-music-provider],[data-music-find-video],[data-music-find-open-audio],[data-music-reload-external],[data-music-change-version],[data-music-close-video],[data-music-view],[data-music-more],[data-music-retry-list],[data-music-retry-play],[data-music-catalog-prev],[data-music-catalog-next],[data-music-toggle-external-tools],[data-music-toggle-play]');
      if (!target) return;
      if (target.dataset.trackId) { event.preventDefault(); void playTrack(target.dataset.trackId); }
      else if (target.dataset.openAudioId) { event.preventDefault(); void openAudio(target.dataset.openAudioId, { forSongId: states.openAudio.forSongId }); }
      else if (target.dataset.videoId) { event.preventDefault(); void openVideo(target.dataset.videoId, { forSongId: states.video.forSongId }); }
      else if (target.dataset.trackOpenAudio) { event.preventDefault(); findAudio(catalog(target.dataset.trackOpenAudio)); }
      else if (target.dataset.trackVideo) { event.preventDefault(); findVideo(catalog(target.dataset.trackVideo)); }
      else if (target.hasAttribute('data-music-find-open-audio')) { if (element('[data-music-browser]')) event.preventDefault(); findAudio(current()); }
      else if (target.hasAttribute('data-music-find-video')) { if (element('[data-music-browser]')) event.preventDefault(); findVideo(current()); }
      else if (target.hasAttribute('data-music-close-video')) closeVideo();
      else if (target.hasAttribute('data-music-reload-external')) reloadExternalPlayer();
      else if (target.hasAttribute('data-music-change-version')) changeExternalVersion();
      else if (target.hasAttribute('data-music-toggle-play')) { event.preventDefault(); togglePlayback(); }
      else if (target.hasAttribute('data-music-catalog-prev')) advance(-1);
      else if (target.hasAttribute('data-music-catalog-next')) advance(1);
      else if (target.hasAttribute('data-music-toggle-external-tools')) { const dock = element('[data-music-video-dock]'); dock?.classList.toggle('is-compact', !dock.classList.contains('is-compact')); sync(); }
      else if (target.dataset.musicProvider) {
        const query = element('[name="keyword"]')?.value.trim(), forSongId = keywordDirty ? undefined : states[searchKey()].forSongId;
        provider = target.dataset.musicProvider; view = 'search'; shown = config.pageSize || 20;
        if (query && states[searchKey()].query !== query) load(searchKey(), query, forSongId ? { forSongId } : {}); else render();
      } else if (target.dataset.musicView) { view = target.dataset.musicView; shown = config.pageSize || 20; render(); if (view === 'playlist') ensurePlaylist(); }
      else if (target.hasAttribute('data-music-more')) { shown += config.pageSize || 20; render(); }
      else if (target.hasAttribute('data-music-retry-list')) load(view === 'playlist' ? 'playlist' : searchKey(), activeState()[view === 'playlist' ? 'id' : 'query'], activeState().forSongId ? { forSongId: activeState().forSongId } : {});
      else if (target.hasAttribute('data-music-retry-play')) {
        if (current()) playTrack(current().id); else if (activeTrack?.provider === 'audius') openAudius(activeTrack); else reloadExternalPlayer();
      }
    });
    element('.music-dock')?.addEventListener('toggle', event => {
      if (event.target.open && playlistVisible()) ensurePlaylist();
    });
    doc.addEventListener('pjax:send', () => {
      for (const state of [states.audius, states.openAudio, states.video]) if (state.loading && element('[data-music-browser]') && !persistentBrowser()) {
        ++state.generation; state.controller?.abort(); state.loading = false; state.failed = true; state.status = '搜索已停止，可重新搜索。';
      }
    });
    doc.addEventListener('pjax:complete', () => { render(); if (playlistVisible()) ensurePlaylist(); });
    doc.addEventListener('site:music-popup-open', () => { render(); ensurePlaylist(); });
    doc.addEventListener('play', event => { if (event.target.tagName === 'VIDEO') { player.pause(); closeVideo(); } }, true);
    win.siteMusic = { player, loadPlaylist: value => { const id = Source.parsePlaylistId(value, config.playlistAliases); playlistInput = String(value); playlistError = ''; return load('playlist', id); },
      search: query => load('audius', query), searchOpenAudio: query => load('openAudio', query), searchVideos: query => load('video', query),
      playTrack, openAudio, openVideo, closeVideo, reloadExternalPlayer, changeExternalVersion, togglePlay: togglePlayback,
      next: () => advance(1), previous: () => advance(-1) };
    render(); if (playlistVisible()) ensurePlaylist(); return win.siteMusic;
  }
  return { init, recordingName, primaryArtist, sameRecording };
});
