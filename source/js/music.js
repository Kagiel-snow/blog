'use strict';
(() => {
  if (window.siteMusic) return;
  const container = document.getElementById('kagiel-player');
  const data = document.getElementById('site-music-data');
  const settings = document.getElementById('site-music-config');
  if (!container || !data || !settings || !window.SiteMusicSource || typeof APlayer === 'undefined') return;
  const config = JSON.parse(settings.textContent);
  if (config.catalogOnly) {
    if (window.SiteMusicCatalog && window.SiteMusicAudius) {
      window.SiteMusicCatalog.init({ container, config, data, Source: window.SiteMusicSource,
        Audius: window.SiteMusicAudius, APlayer });
    } else {
      const status = document.querySelector('[data-music-player-status]');
      if (status) status.textContent = '音乐服务未能加载，请刷新页面后重试。';
    }
    return;
  }
  const { createClient, parsePlaylistId, escapeHtml, officialAudioUrl,
    createVideoClient, parseVideoId, parseVideoLink, videoEmbedUrl, videoSearchUrl,
    createOpenAudioClient, parseSoundCloudUrl, soundCloudEmbedUrl, soundCloudSearchUrl } = window.SiteMusicSource;
  const client = createClient(config);
  const videoClient = createVideoClient(config);
  const openAudioClient = typeof createOpenAudioClient === 'function' ? createOpenAudioClient(config) : null;
  const queue = new Map();
  let playlistId = config.playlistId;
  try {
    const saved = JSON.parse(localStorage.getItem('site-music-playlist-v2') || 'null');
    if (saved?.defaultId === config.playlistId) playlistId = parsePlaylistId(saved.id, config.playlistAliases);
  } catch {}
  let playlistInput = playlistId, playlistError = '', playlistInputSource = '';
  const states = {
    playlist: { tracks: [], id: playlistId, status: '', failed: false, loading: false, loaded: false, generation: 0 },
    search: { tracks: [], query: '', status: '输入歌曲或歌手名称开始搜索。', failed: false, loading: false, generation: 0 },
    video: { tracks: [], query: '', status: '搜索歌曲或歌手，选择想听的视频版本。', failed: false, loading: false, generation: 0 },
    openAudio: { tracks: [], query: '', status: '搜索歌曲或歌手，选择公开音频版本。', failed: false, loading: false, generation: 0 }
  };
  let view = 'playlist', shown = config.pageSize || 20, mediaTimer, currentId, mediaFailed = false, fallbackUsed = false;
  let searchProvider = 'netease', videoInput = '', videoError = '', selectedVideo;
  let audioInput = '', audioError = '', selectedAudio, selectedVideoPage = 1, selectedVideoTrack;
  let externalGeneration = 0, externalController, widget, widgetApiPromise, alternativeUsed = false, externalForSongId;
  const unavailableVideos = new Set();
  const player = new APlayer({ container, fixed: false, mini: false, autoplay: false,
    theme: '#426f98', loop: 'all', order: 'random', preload: 'none', volume: 0.7,
    mutex: true, listFolded: true, audio: [] });
  const element = selector => document.querySelector(selector);
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function playbackStatus(text, failed = false) {
    const status = element('[data-music-player-status]');
    if (status) status.textContent = text;
    const retry = element('[data-music-retry-play]');
    if (retry) retry.hidden = !failed;
  }
  const current = () => queue.get(player.list.audios[player.list.index]?.id);
  const searchStateKey = () => ({ bilibili: 'video', soundcloud: 'openAudio', netease: 'search' })[searchProvider] || 'search';
  const activeStateKey = () => view === 'search' ? searchStateKey() : view;
  function sync() {
    const song = current();
    document.querySelectorAll('[data-track-id]').forEach(button => {
      const active = !player.audio.paused && song?.id === button.dataset.trackId;
      button.closest('.track-card')?.classList.toggle('is-playing', active);
      const label = button.querySelector('span');
      if (label) label.textContent = active ? '正在播放' : '播放';
    });
    const link = element('[data-music-current-source]');
    if (link) { link.hidden = !song; if (song) link.href = song.sourceUrl; }
    const findVideo = element('[data-music-find-video]');
    if (findVideo) findVideo.hidden = !song;
    const findAudio = element('[data-music-find-open-audio]'); if (findAudio) findAudio.hidden = !song;
  }
  function clearExternal(cancel = true) {
    if (cancel) { ++externalGeneration; externalController?.abort(); }
    if (widget && window.SC?.Widget?.Events) Object.values(window.SC.Widget.Events).forEach(event => widget.unbind?.(event));
    widget = undefined;
    element('[data-music-video-frame]')?.replaceChildren();
    const dock = element('[data-music-video-dock]'); if (dock) dock.hidden = true;
    dock?.classList.toggle('is-audio', false);
    document.body?.classList.toggle('music-video-open', false);
    selectedVideo = undefined; selectedAudio = undefined; selectedVideoTrack = undefined; externalForSongId = undefined;
  }
  function closeVideo() {
    const wasOpen = Boolean(selectedVideo || selectedAudio);
    clearExternal();
    if (wasOpen) render();
  }
  function mountVideo(selection, info, force = false, unchecked = false) {
      const id = selection.videoId, page = selection.page;
      const dock = element('[data-music-video-dock]'), host = element('[data-music-video-frame]');
      if (!dock || !host) return false;
      const track = info || states.video.tracks.find(song => song.videoId === id);
      player.pause(); clearTimeout(mediaTimer);
      document.querySelectorAll('video').forEach(video => video.pause());
      if (force || selectedAudio || selectedVideo !== id || selectedVideoPage !== page || !host.children.length) {
        clearExternal(false);
        const frame = node('iframe'); frame.src = videoEmbedUrl(id, { page, cid: info?.cid });
        frame.title = (track?.name || id) + ' · B 站播放器';
        frame.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
        frame.setAttribute('allowfullscreen', ''); frame.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.addEventListener('error', () => {
          if (selectedVideo !== id || host.children[0] !== frame) return;
          const status = element('[data-music-video-status]');
          if (status) status.textContent = '视频播放器暂时未能加载，可使用下方链接在 B 站打开。';
        });
        host.replaceChildren(frame);
      }
      selectedVideo = id; selectedVideoPage = page; selectedVideoTrack = track; dock.hidden = false;
      playbackStatus('音频已暂停，已打开视频播放器。');
      document.body?.classList.toggle('music-video-open', true);
      const title = element('[data-music-video-title]'); if (title) title.textContent = track?.name || 'B 站视频 · ' + id;
      const source = element('[data-music-video-source]');
      if (source) { source.href = 'https://www.bilibili.com/video/' + id + (page > 1 ? '?p=' + page : ''); source.textContent = '在 B 站打开 ↗'; source.hidden = false; }
      const status = element('[data-music-video-status]');
      if (status) status.textContent = unchecked ? '未能检查视频状态，已打开官方播放器；失败时可重新加载或换个版本。' : '已打开视频播放器，请点击其中的播放按钮。';
      videoError = ''; render(); return true;
  }
  function openVideo(value, options = {}) {
    try {
      const input = typeof value === 'string' && value.startsWith('bilibili:') ? value.slice(9) : value;
      const selection = typeof parseVideoLink === 'function' ? parseVideoLink(input) : { videoId: parseVideoId(input), page: 1 };
      if (typeof videoClient.inspect !== 'function') return mountVideo(selection, null, options.force);
      externalController?.abort(); const controller = new AbortController(), generation = ++externalGeneration;
      externalController = controller; videoError = '正在检查所选视频的公开状态…'; render();
      const link = 'https://www.bilibili.com/video/' + selection.videoId + (selection.page > 1 ? '?p=' + selection.page : '');
      return videoClient.inspect(link, { signal: controller.signal }).then(info => {
        if (generation !== externalGeneration || controller.signal.aborted) return false;
        return mountVideo(selection, info, options.force);
      }).catch(error => {
        if (generation !== externalGeneration || controller.signal.aborted) return false;
        if (['VIDEO_RESTRICTED', 'VIDEO_UNAVAILABLE', 'VIDEO_PAGE_UNAVAILABLE'].includes(error.code)) {
          if (error.code !== 'VIDEO_PAGE_UNAVAILABLE') unavailableVideos.add(selection.videoId);
          videoError = '这个版本不可公开播放或分集不存在，请选择其他版本。'; render(); return false;
        }
        return mountVideo(selection, null, options.force, true);
      });
    } catch (error) { videoError = error.message; render(); return false; }
  }
  function widgetAPI() {
    if (window.SC?.Widget) return Promise.resolve(window.SC.Widget);
    if (!widgetApiPromise) widgetApiPromise = new Promise((resolve, reject) => {
      const script = node('script'); script.src = '/vendor/soundcloud-widget-api.js';
      script.addEventListener('load', () => window.SC?.Widget ? resolve(window.SC.Widget) : reject(new Error('widget unavailable')), { once: true });
      script.addEventListener('error', () => reject(new Error('widget unavailable')), { once: true });
      document.head.append(script);
    }).catch(error => { widgetApiPromise = undefined; throw error; });
    return widgetApiPromise;
  }
  function mountAudio(track, options = {}) {
    const dock = element('[data-music-video-dock]'), host = element('[data-music-video-frame]');
    if (!dock || !host) return false;
    player.pause(); clearTimeout(mediaTimer); document.querySelectorAll('video').forEach(video => video.pause());
    let frame = host.children[0];
    const newFrame = options.force || selectedAudio?.id !== track.id || !frame;
    if (newFrame) {
      clearExternal(false); frame = node('iframe'); frame.id = 'site-soundcloud-player';
      frame.src = soundCloudEmbedUrl(track.permalinkUrl); frame.title = track.name + ' · SoundCloud 音频播放器';
      frame.allow = 'autoplay'; frame.setAttribute('scrolling', 'no'); host.replaceChildren(frame);
    }
    selectedAudio = track; externalForSongId = options.forSongId; dock.hidden = false; dock.classList.toggle('is-audio', true);
    document.body?.classList.toggle('music-video-open', true);
    const title = element('[data-music-video-title]'); if (title) title.textContent = track.name + ' · ' + track.artist;
    const source = element('[data-music-video-source]'); if (source) { source.href = track.permalinkUrl; source.textContent = '在 SoundCloud 打开 ↗'; source.hidden = false; }
    const status = element('[data-music-video-status]'); if (status) status.textContent = '已打开音频播放器，请点击其中的播放按钮。';
    playbackStatus('已切换到公开音频版本，请点击播放器播放。');
    audioError = ''; render();
    if (newFrame) widgetAPI().then(Widget => {
      const active = () => selectedAudio?.id === track.id && host.children[0] === frame;
      if (!active()) return;
      widget = Widget(frame);
      const setStatus = text => { if (active()) { const status = element('[data-music-video-status]'); if (status) status.textContent = text; playbackStatus(text); } };
      widget.bind(Widget.Events.READY, () => {
        setStatus('音频播放器已就绪，请点击播放。');
        if (active() && externalForSongId && current()?.id === externalForSongId) widget.play();
      });
      widget.bind(Widget.Events.PLAY, () => setStatus(`正在播放《${track.name}》（SoundCloud）`));
      widget.bind(Widget.Events.PAUSE, () => setStatus(`已暂停《${track.name}》。`));
      widget.bind(Widget.Events.ERROR, () => setStatus('这个音频版本暂时无法播放，可重新加载、换个版本或打开原页面。'));
      widget.bind(Widget.Events.FINISH, () => {
        if (!active()) return;
        if (externalForSongId && current()?.id === externalForSongId) { closeVideo(); player.skipForward(); player.play(); }
        else setStatus(`《${track.name}》播放结束。`);
      });
    }).catch(() => { if (selectedAudio?.id === track.id && host.children[0] === frame) { const status = element('[data-music-video-status]'); if (status) status.textContent = '可在播放器中播放；若不可用，请打开原页面或换个版本。'; } });
    return true;
  }
  async function openAudio(value, options = {}) {
    let generation, controller;
    try {
      if (!openAudioClient) return false;
      let track = typeof value === 'object' && value ? value : states.openAudio.tracks.find(item => item.id === value);
      const permalink = parseSoundCloudUrl(track?.permalinkUrl || value);
      externalController?.abort(); controller = new AbortController(); generation = ++externalGeneration;
      externalController = controller; audioError = '正在检查公开音频…'; render();
      if (!track || track.availability !== 'public_full') track = await openAudioClient.track(permalink, { signal: controller.signal });
      if (generation !== externalGeneration || controller.signal.aborted) return false;
      return mountAudio(track, options);
    } catch (error) {
      if (error.code === 'ABORTED' || (generation !== undefined && (generation !== externalGeneration || controller.signal.aborted))) return false;
      audioError = '这个音频版本暂时不可用，可换一个版本或打开 SoundCloud 搜索。'; render(); return false;
    }
  }
  function reloadExternalPlayer() {
    if (selectedAudio) return openAudio(selectedAudio, { force: true, forSongId: externalForSongId });
    if (selectedVideo) return openVideo('https://www.bilibili.com/video/' + selectedVideo + '?p=' + selectedVideoPage, { force: true });
  }
  function changeExternalVersion() {
    const audio = selectedAudio, query = audio ? states.openAudio.query || audio.name + ' ' + audio.artist : states.video.query || selectedVideoTrack?.name;
    closeVideo(); if (query) return load(audio ? 'openAudio' : 'video', String(query).slice(0, 100));
  }
  function findVideoFor(song) {
    if (song) return load('video', (song.name + ' ' + song.artist).replace(/\s+/g, ' ').slice(0, 100).trim());
  }
  function findOpenAudioFor(song) {
    if (!song) return;
    const alternative = config.audioAlternatives?.[song.id];
    if (alternative) return openAudio(alternative.url, { forSongId: song.id });
    return load('openAudio', (song.name + ' ' + song.artist).replace(/\s+/g, ' ').slice(0, 100).trim());
  }
  function addToQueue(tracks) {
    const added = tracks.filter(song => !queue.has(song.id));
    added.forEach(song => queue.set(song.id, song));
    if (added.length) {
      // APlayer inserts metadata through innerHTML, so escape only its copy.
      player.list.add(added.map(song => ({ ...song, name: escapeHtml(song.name), artist: escapeHtml(song.artist) })));
      data.textContent = JSON.stringify([...queue.values()]);
    }
  }
  function replacePlaylistQueue(tracks) {
    if (!tracks.length) return;
    const selectedId = !player.audio.paused || selectedAudio || selectedVideo ? current()?.id : null;
    // Remove only other items: APlayer keeps the selected audio element and
    // its time when removing preceding/following queue entries.
    for (let index = player.list.audios.length - 1; index >= 0; index--) {
      const id = player.list.audios[index].id;
      if (id !== selectedId) { player.list.remove(index); queue.delete(id); }
    }
    addToQueue(tracks);
    data.textContent = JSON.stringify([...queue.values()]);
    sync();
  }
  function render() {
    const browser = element('[data-music-browser]');
    if (!browser) return;
    const stateKey = activeStateKey(), state = states[stateKey], isVideo = stateKey === 'video', isOpenAudio = stateKey === 'openAudio';
    browser.querySelectorAll('[data-music-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.musicView === view)));
    browser.querySelectorAll('[data-music-provider]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.musicProvider === searchProvider)));
    browser.querySelector('[data-music-list-title]').textContent = view === 'search'
      ? (state.query ? `“${state.query}”的${isVideo ? '视频版本' : isOpenAudio ? '公开音频版本' : '搜索结果'}` : '搜索结果')
      : (state.id === config.playlistId ? config.playlistName : `网易云歌单 · ${state.id}`);
    browser.querySelector('[data-music-browser-status]').textContent = state.status;
    browser.querySelector('[data-music-retry-list]').hidden = !state.failed;
    browser.querySelector('[data-music-results]').setAttribute('aria-busy', String(state.loading));
    const source = browser.querySelector('[data-music-playlist-source]');
    source.href = 'https://music.163.com/#/playlist?id=' + states.playlist.id;
    const input = browser.querySelector('[name="playlist"]');
    if (document.activeElement !== input) input.value = playlistInput;
    const inputError = browser.querySelector('[data-music-playlist-error]');
    if (inputError) inputError.textContent = playlistError;
    const inputSource = browser.querySelector('[data-music-input-source]');
    if (inputSource) { inputSource.hidden = !playlistInputSource; if (playlistInputSource) inputSource.href = playlistInputSource; }
    const keyword = browser.querySelector('[name="keyword"]');
    if (document.activeElement !== keyword) keyword.value = states[searchStateKey()].query;
    const tools = browser.querySelector('[data-music-video-tools]'); if (tools) tools.hidden = searchProvider !== 'bilibili' && !mediaFailed;
    const videoLink = browser.querySelector('[data-music-video-search-link]');
    if (videoLink) {
      const query = states.video.query || states.search.query || (current() ? current().name + ' ' + current().artist : '音乐');
      try { videoLink.href = videoSearchUrl(String(query).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 100)); }
      catch { videoLink.href = 'https://search.bilibili.com/all'; }
    }
    const videoField = browser.querySelector('[name="videoLink"]');
    if (videoField && document.activeElement !== videoField) videoField.value = videoInput;
    const error = browser.querySelector('[data-music-video-error]'); if (error) error.textContent = videoError;
    const audioTools = browser.querySelector('[data-music-audio-tools]'); if (audioTools) audioTools.hidden = searchProvider !== 'soundcloud' && !mediaFailed;
    const audioLink = browser.querySelector('[data-music-audio-search-link]');
    if (audioLink) { try { audioLink.href = soundCloudSearchUrl((states.openAudio.query || states.search.query || '音乐').slice(0, 100)); } catch { audioLink.href = 'https://soundcloud.com/search/sounds'; } }
    const audioField = browser.querySelector('[name="audioLink"]'); if (audioField && document.activeElement !== audioField) audioField.value = audioInput;
    const audioMessage = browser.querySelector('[data-music-audio-error]'); if (audioMessage) audioMessage.textContent = audioError;
    const grid = browser.querySelector('[data-music-results]');
    grid.replaceChildren();
    state.tracks.slice(0, shown).forEach((song, index) => {
      const card = node('article', undefined, 'track-card'); card.setAttribute('translate', 'no');
      const cover = node('img'); cover.src = song.cover; cover.alt = ''; cover.loading = 'lazy'; cover.decoding = 'async';
      cover.addEventListener('error', () => { cover.src = config.fallbackCover; }, { once: true });
      const body = node('div', undefined, 'track-body');
      const duration = isOpenAudio && song.durationMs ? Math.floor(song.durationMs / 60000) + ':' + String(Math.floor(song.durationMs / 1000) % 60).padStart(2, '0') : song.duration;
      body.append(node('span', String(index + 1).padStart(2, '0') + (isVideo ? ' / BILIBILI' : isOpenAudio ? ' / SOUNDCLOUD' : ' / NETEASE'), 'track-number'), node('h2', song.name),
        node('p', isVideo ? `上传者：${song.artist}${duration ? ' · ' + duration : ''}` : song.artist + (isOpenAudio && duration ? ' · ' + duration : '')));
      const play = node('button', undefined, 'track-play section-action'); play.type = 'button';
      if (isVideo) { play.dataset.videoId = song.videoId; play.disabled = unavailableVideos.has(song.videoId); }
      else if (isOpenAudio) play.dataset.openAudioId = song.id;
      else play.dataset.trackId = song.id;
      play.append(node('span', isVideo ? (unavailableVideos.has(song.videoId) ? '此版本不可用' : selectedVideo === song.videoId ? '已打开播放器' : '播放视频版本') : isOpenAudio ? '播放音频版本' : '播放'));
      const link = node('a', isVideo ? 'B 站 ↗' : isOpenAudio ? 'SoundCloud ↗' : '网易云 ↗', 'track-source'); link.href = song.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
      body.append(play);
      if (!isVideo && !isOpenAudio) {
        const audioAlternative = node('button', '找其他音频', 'track-source track-video'); audioAlternative.type = 'button'; audioAlternative.dataset.trackOpenAudio = song.id; body.append(audioAlternative);
        const alternative = node('button', '找视频版本', 'track-source track-video'); alternative.type = 'button'; alternative.dataset.trackVideo = song.id; body.append(alternative);
      }
      body.append(node('br'), link); card.append(cover, body); grid.append(card);
    });
    browser.querySelector('[data-music-more]').hidden = state.loading || state.tracks.length <= shown;
    sync();
  }
  async function load(type, value) {
    const key = type === 'playlist' ? 'id' : 'query';
    const state = states[type];
    state.controller?.abort();
    const controller = new AbortController(), generation = ++state.generation;
    state.controller = controller; state[key] = value; state.loading = true; state.failed = false; state.tracks = [];
    state.status = type === 'playlist' ? '正在加载网易云歌单…' : '正在搜索…';
    view = ['video', 'openAudio'].includes(type) ? 'search' : type;
    if (type === 'video') searchProvider = 'bilibili'; else if (type === 'search') searchProvider = 'netease';
    else if (type === 'openAudio') searchProvider = 'soundcloud';
    shown = config.pageSize || 20; render();
    if (type === 'playlist' && !queue.size) playbackStatus('正在加载网易云歌单…');
    try {
      const tracks = type === 'openAudio' ? await openAudioClient.search(value, { signal: controller.signal })
        : type === 'video' ? await videoClient.request(value, { signal: controller.signal }) : await client.request(type, value, { signal: controller.signal });
      if (generation !== state.generation) return;
      state.tracks = tracks;
      state.loaded = true;
      state.status = type === 'openAudio' ? (tracks.length ? `找到 ${tracks.length} 个公开音频版本，请核对歌曲名和作者后选择。` : '没有找到可用的公开音频，可换关键词或打开 SoundCloud 搜索。')
        : type === 'video' ? (tracks.length ? `找到 ${tracks.length} 个视频版本，请按标题、上传者和时长选择。` : '没有找到视频版本，可在 B 站继续查找并粘贴视频链接。')
        : tracks.length ? `找到 ${tracks.length} 首歌曲，点击播放即可加入播放器。` : (type === 'playlist' ? '这个歌单没有可显示的歌曲，可换一个歌单。' : '没有找到匹配的歌曲，试试其他关键词。');
      if (type === 'playlist') {
        replacePlaylistQueue(tracks);
        try { localStorage.setItem('site-music-playlist-v2', JSON.stringify({ id: value, defaultId: config.playlistId })); } catch {}
        if (player.audio.paused && !mediaFailed && !selectedAudio && !selectedVideo) playbackStatus(tracks.length ? '歌单已加载，选择一首开始播放。' : '这个歌单没有歌曲，可在音乐页更换歌单。');
      }
    } catch (error) {
      if (generation !== state.generation || controller.signal.aborted) return;
      state.failed = true;
      state.status = type === 'openAudio' ? '公开音频搜索暂时不可用，可打开 SoundCloud 搜索或粘贴公开单曲链接。'
        : type === 'video' ? '视频搜索暂时不可用。可打开 B 站搜索，再粘贴完整视频链接或 BV 号播放。'
        : type === 'playlist' ? '歌单暂时没有加载成功，请重试。' : '搜索暂时不可用，请稍后重试。';
      if (type === 'playlist' && !queue.size) playbackStatus('歌单未能加载，请在音乐页重试。');
    } finally {
      if (generation === state.generation) { state.loading = false; render(); }
    }
  }
  function ensurePlaylist() {
    if (!states.playlist.loading && !states.playlist.loaded && !states.playlist.failed) return load('playlist', states.playlist.id);
  }
  function playTrack(id) {
    const song = queue.get(id) || states[view].tracks.find(item => item.id === id);
    if (!song) return;
    addToQueue([song]);
    document.querySelectorAll('video').forEach(video => video.pause());
    const index = player.list.audios.findIndex(item => item.id === id);
    if (player.list.index !== index || mediaFailed || player.audio.error) {
      mediaFailed = false; fallbackUsed = false; player.list.switch(index);
    }
    playbackStatus(`正在连接《${song.name}》…`);
    player.play();
    const dock = element('.music-dock'); if (dock) dock.open = true;
  }
  function failPlayback() {
    if (mediaFailed) {
      // A stale error can still schedule APlayer's internal skip. Cancel it
      // without starting another media request or clearing the failure state.
      player.pause(); player.list.switch(player.list.index);
      player.notice?.('此音源暂时不可播放。', 2000); return;
    }
    const fallback = typeof officialAudioUrl === 'function' ? officialAudioUrl(current()) : null;
    if (!fallbackUsed && fallback && !player.paused) {
      // The platform still decides which tracks it can supply. This fallback
      // uses its public endpoint and never sends an owner's login/session.
      fallbackUsed = true; clearTimeout(mediaTimer); player.pause();
      player.list.switch(player.list.index);
      player.audio.src = fallback;
      player.notice?.('正在尝试网易云备用音源…', 2000);
      playbackStatus('正在尝试网易云备用音源…');
      player.play();
      return;
    }
    mediaFailed = true; clearTimeout(mediaTimer); player.pause();
    // Switching the paused item cancels APlayer's scheduled error skip. With
    // preload:none it won't fetch again until the visitor explicitly retries.
    player.list.switch(player.list.index);
    player.notice?.('此音源暂时不可播放。', 2000);
    playbackStatus('这首歌暂时无法播放，可重试或找视频版本。', true); render(); sync();
    const song = current(), alternative = song && config.audioAlternatives?.[song.id];
    if (alternative && !alternativeUsed) {
      alternativeUsed = true; playbackStatus(`正在检查《${song.name}》的公开音频版本…`);
      const generation = externalGeneration + 1;
      void openAudio(alternative.url, { forSongId: song.id }).then(opened => {
        if (!opened && generation === externalGeneration && current()?.id === song.id && mediaFailed) playbackStatus('音频来源暂时不可用，可重试、找其他音频或视频版本。', true);
      });
    }
  }
  function watchMedia() {
    clearTimeout(mediaTimer);
    if (!player.paused) mediaTimer = setTimeout(failPlayback, config.timeoutMs);
  }
  player.on('listswitch', event => {
    const song = queue.get(player.list.audios[event.index]?.id);
    if (song?.id !== currentId) {
      closeVideo(); currentId = song?.id; mediaFailed = false; fallbackUsed = false; alternativeUsed = false; clearTimeout(mediaTimer);
      playbackStatus(song ? `已选择《${song.name}》。` : '选择一首歌曲开始播放。');
    }
    queueMicrotask(sync);
  });
  player.on('play', () => {
    closeVideo();
    if (mediaFailed) { fallbackUsed = false; alternativeUsed = false; }
    mediaFailed = false;
    playbackStatus(current() ? (player.audio.readyState < 3 ? `正在连接《${current().name}》…` : `正在播放《${current().name}》`) : '选择一首歌曲开始播放。');
    if (player.audio.readyState < 3) watchMedia(); sync();
  });
  player.on('pause', () => {
    clearTimeout(mediaTimer);
    if (current() && !mediaFailed) playbackStatus(`已暂停《${current().name}》。`);
    sync();
  });
  ['canplay', 'playing'].forEach(name => player.on(name, () => {
    clearTimeout(mediaTimer);
    player.notice?.('', 0);
    if (!player.paused && current()) playbackStatus(`正在播放《${current().name}》`);
    sync();
  }));
  ['waiting', 'loadstart'].forEach(name => player.on(name, watchMedia));
  player.on('error', failPlayback);
  document.addEventListener('submit', event => {
    if (event.target.matches('[data-music-search-form]')) {
      event.preventDefault(); const query = event.target.elements.keyword.value.trim();
      if (query) load(searchStateKey(), query);
    } else if (event.target.matches('[data-music-audio-form]')) {
      event.preventDefault(); audioInput = event.target.elements.audioLink.value; void openAudio(audioInput);
    } else if (event.target.matches('[data-music-video-form]')) {
      event.preventDefault(); videoInput = event.target.elements.videoLink.value; openVideo(videoInput);
    } else if (event.target.matches('[data-music-playlist-form]')) {
      event.preventDefault();
      playlistInput = event.target.elements.playlist.value;
      playlistError = ''; playlistInputSource = '';
      try { load('playlist', parsePlaylistId(playlistInput, config.playlistAliases)); }
      catch (error) { playlistError = error.message; playlistInputSource = error.url || ''; render(); }
    }
  });
  document.addEventListener('input', event => {
    if (event.target.matches('[name="playlist"]')) playlistInput = event.target.value;
    if (event.target.matches('[name="videoLink"]')) videoInput = event.target.value;
    if (event.target.matches('[name="audioLink"]')) audioInput = event.target.value;
  });
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-track-id],[data-video-id],[data-open-audio-id],[data-track-open-audio],[data-track-video],[data-music-provider],[data-music-find-video],[data-music-find-open-audio],[data-music-reload-external],[data-music-change-version],[data-music-close-video],[data-music-view],[data-music-more],[data-music-retry-list],[data-music-retry-play]');
    if (!target) return;
    if (target.dataset.trackId) { event.preventDefault(); playTrack(target.dataset.trackId); }
    else if (target.dataset.videoId) { event.preventDefault(); openVideo(target.dataset.videoId); }
    else if (target.dataset.openAudioId) { event.preventDefault(); void openAudio(target.dataset.openAudioId); }
    else if (target.dataset.trackOpenAudio) { event.preventDefault(); findOpenAudioFor(queue.get(target.dataset.trackOpenAudio) || states.search.tracks.find(song => song.id === target.dataset.trackOpenAudio)); }
    else if (target.dataset.trackVideo) { event.preventDefault(); findVideoFor(queue.get(target.dataset.trackVideo) || states[view].tracks.find(song => song.id === target.dataset.trackVideo)); }
    else if (target.hasAttribute('data-music-close-video')) closeVideo();
    else if (target.hasAttribute('data-music-reload-external')) reloadExternalPlayer();
    else if (target.hasAttribute('data-music-change-version')) changeExternalVersion();
    else if (target.hasAttribute('data-music-find-open-audio')) { if (element('[data-music-browser]')) event.preventDefault(); findOpenAudioFor(current()); }
    else if (target.hasAttribute('data-music-find-video')) { if (element('[data-music-browser]')) event.preventDefault(); findVideoFor(current()); }
    else if (target.dataset.musicProvider) {
      const query = element('[name="keyword"]')?.value.trim(); searchProvider = target.dataset.musicProvider;
      view = 'search'; shown = config.pageSize || 20;
      const type = searchStateKey();
      if (query && states[type].query !== query) load(type, query); else render();
    }
    else if (target.dataset.musicView) { view = target.dataset.musicView; shown = config.pageSize || 20; render(); if (view === 'playlist') ensurePlaylist(); }
    else if (target.hasAttribute('data-music-more')) { shown += config.pageSize || 20; render(); }
    else if (target.hasAttribute('data-music-retry-list')) { const key = activeStateKey(); load(key, states[key][key === 'playlist' ? 'id' : 'query']); }
    else if (target.hasAttribute('data-music-retry-play')) {
      const song = current();
      if (song) { mediaFailed = false; fallbackUsed = false; alternativeUsed = false; player.list.switch(player.list.index); playTrack(song.id); }
    }
  });
  element('.music-dock')?.addEventListener('toggle', event => { if (event.target.open) ensurePlaylist(); });
  document.addEventListener('pjax:send', () => {
    const state = states.search;
    if (state.loading) { ++state.generation; state.controller?.abort(); state.loading = false; state.status = '搜索已停止，可重新搜索。'; }
    const videoState = states.video;
    if (element('[data-music-browser]') && videoState.loading) {
      ++videoState.generation; videoState.controller?.abort(); videoState.loading = false;
      videoState.status = '视频搜索已停止，可重新搜索。'; videoState.failed = true;
    }
    const audioState = states.openAudio;
    if (element('[data-music-browser]') && audioState.loading) { ++audioState.generation; audioState.controller?.abort(); audioState.loading = false; audioState.failed = true; audioState.status = '公开音频搜索已停止，可重新搜索。'; }
  });
  document.addEventListener('pjax:complete', () => { render(); if (element('[data-music-browser]')) ensurePlaylist(); sync(); });
  document.addEventListener('play', event => { if (event.target.tagName === 'VIDEO') { player.pause(); closeVideo(); } }, true);
  window.siteMusic = { player, loadPlaylist: value => {
    const id = parsePlaylistId(value, config.playlistAliases);
    playlistInput = String(value); playlistError = ''; playlistInputSource = '';
    return load('playlist', id);
  }, search: query => load('search', query), searchVideos: query => load('video', query), searchOpenAudio: query => load('openAudio', query),
    openVideo, openAudio, closeVideo, reloadExternalPlayer, changeExternalVersion, playTrack };
  render();
  if (element('[data-music-browser]') || element('.music-dock')?.open) ensurePlaylist();
})();
