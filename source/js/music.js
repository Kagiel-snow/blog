'use strict';
(() => {
  if (window.siteMusic) return;
  const container = document.getElementById('kagiel-player');
  const data = document.getElementById('site-music-data');
  const settings = document.getElementById('site-music-config');
  if (!container || !data || !settings || !window.SiteMusicSource || typeof APlayer === 'undefined') return;
  const config = JSON.parse(settings.textContent);
  const { createClient, parsePlaylistId, escapeHtml } = window.SiteMusicSource;
  const client = createClient(config);
  const queue = new Map();
  let playlistId = config.playlistId;
  try { playlistId = parsePlaylistId(localStorage.getItem('site-music-playlist') || playlistId); } catch {}
  const states = {
    playlist: { tracks: [], id: playlistId, status: '', failed: false, loading: false, loaded: false, generation: 0 },
    search: { tracks: [], query: '', status: '输入歌曲或歌手名称开始搜索。', failed: false, loading: false, generation: 0 }
  };
  let view = 'playlist', shown = config.pageSize || 20, mediaTimer, currentId, mediaFailed = false;
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
  function render() {
    const browser = element('[data-music-browser]');
    if (!browser) return;
    const state = states[view];
    browser.querySelectorAll('[data-music-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.musicView === view)));
    browser.querySelector('[data-music-list-title]').textContent = view === 'search'
      ? (state.query ? `“${state.query}”的搜索结果` : '搜索结果')
      : (state.id === config.playlistId ? config.playlistName : `网易云歌单 · ${state.id}`);
    browser.querySelector('[data-music-browser-status]').textContent = state.status;
    browser.querySelector('[data-music-retry-list]').hidden = !state.failed;
    browser.querySelector('[data-music-results]').setAttribute('aria-busy', String(state.loading));
    const source = browser.querySelector('[data-music-playlist-source]');
    source.href = 'https://music.163.com/#/playlist?id=' + states.playlist.id;
    const input = browser.querySelector('[name="playlist"]');
    if (document.activeElement !== input) input.value = states.playlist.id;
    const keyword = browser.querySelector('[name="keyword"]');
    if (document.activeElement !== keyword) keyword.value = states.search.query;
    const grid = browser.querySelector('[data-music-results]');
    grid.replaceChildren();
    state.tracks.slice(0, shown).forEach((song, index) => {
      const card = node('article', undefined, 'track-card'); card.setAttribute('translate', 'no');
      const cover = node('img'); cover.src = song.cover; cover.alt = ''; cover.loading = 'lazy'; cover.decoding = 'async';
      cover.addEventListener('error', () => { cover.src = config.fallbackCover; }, { once: true });
      const body = node('div', undefined, 'track-body');
      body.append(node('span', String(index + 1).padStart(2, '0') + ' / NETEASE', 'track-number'), node('h2', song.name), node('p', song.artist));
      const play = node('button', undefined, 'track-play section-action'); play.type = 'button'; play.dataset.trackId = song.id;
      play.append(node('span', '播放'));
      const link = node('a', '网易云 ↗', 'track-source'); link.href = song.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
      body.append(play, node('br'), link); card.append(cover, body); grid.append(card);
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
    view = type; shown = config.pageSize || 20; render();
    if (type === 'playlist' && !queue.size) playbackStatus('正在加载网易云歌单…');
    try {
      const tracks = await client.request(type, value, { signal: controller.signal });
      if (generation !== state.generation) return;
      state.tracks = tracks;
      state.loaded = true;
      state.status = tracks.length ? `找到 ${tracks.length} 首歌曲，点击播放即可加入播放器。` : (type === 'playlist' ? '这个歌单没有可显示的歌曲，可换一个歌单。' : '没有找到匹配的歌曲，试试其他关键词。');
      if (type === 'playlist') {
        if (!queue.size) addToQueue(tracks);
        try { localStorage.setItem('site-music-playlist', value); } catch {}
        if (player.audio.paused && !mediaFailed) playbackStatus(tracks.length ? '歌单已加载，选择一首开始播放。' : '这个歌单没有歌曲，可在音乐页更换歌单。');
      }
    } catch (error) {
      if (generation !== state.generation || controller.signal.aborted) return;
      state.failed = true;
      state.status = type === 'playlist' ? '歌单暂时没有加载成功，请重试。' : '搜索暂时不可用，请稍后重试。';
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
    mediaFailed = false;
    const index = player.list.audios.findIndex(item => item.id === id);
    if (player.list.index !== index || player.audio.error) player.list.switch(index);
    playbackStatus(`正在连接《${song.name}》…`);
    player.play();
    const dock = element('.music-dock'); if (dock) dock.open = true;
  }
  function failPlayback() {
    if (mediaFailed) return;
    mediaFailed = true; clearTimeout(mediaTimer); player.pause();
    // Switching the paused item cancels APlayer's scheduled error skip. With
    // preload:none it won't fetch again until the visitor explicitly retries.
    player.list.switch(player.list.index);
    playbackStatus('这首歌暂时无法播放，可重试或前往网易云查看。', true); sync();
  }
  function watchMedia() {
    clearTimeout(mediaTimer);
    if (!player.paused) mediaTimer = setTimeout(failPlayback, config.timeoutMs);
  }
  player.on('listswitch', event => {
    const song = queue.get(player.list.audios[event.index]?.id);
    if (song?.id !== currentId) {
      currentId = song?.id; mediaFailed = false; clearTimeout(mediaTimer);
      playbackStatus(song ? `已选择《${song.name}》。` : '选择一首歌曲开始播放。');
    }
    queueMicrotask(sync);
  });
  player.on('play', () => { mediaFailed = false; playbackStatus(current() ? `正在播放《${current().name}》` : '选择一首歌曲开始播放。'); if (player.audio.readyState < 3) watchMedia(); sync(); });
  player.on('pause', () => { clearTimeout(mediaTimer); sync(); });
  ['canplay', 'playing'].forEach(name => player.on(name, () => { clearTimeout(mediaTimer); sync(); }));
  ['waiting', 'loadstart'].forEach(name => player.on(name, watchMedia));
  player.on('error', failPlayback);
  document.addEventListener('submit', event => {
    if (event.target.matches('[data-music-search-form]')) {
      event.preventDefault(); const query = event.target.elements.keyword.value.trim();
      if (query) load('search', query);
    } else if (event.target.matches('[data-music-playlist-form]')) {
      event.preventDefault();
      try { load('playlist', parsePlaylistId(event.target.elements.playlist.value)); }
      catch { view = 'playlist'; states.playlist.status = '请填写网易云歌单链接或数字 ID。'; states.playlist.failed = false; render(); }
    }
  });
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-track-id],[data-music-view],[data-music-more],[data-music-retry-list],[data-music-retry-play]');
    if (!target) return;
    if (target.dataset.trackId) { event.preventDefault(); playTrack(target.dataset.trackId); }
    else if (target.dataset.musicView) { view = target.dataset.musicView; shown = config.pageSize || 20; render(); if (view === 'playlist') ensurePlaylist(); }
    else if (target.hasAttribute('data-music-more')) { shown += config.pageSize || 20; render(); }
    else if (target.hasAttribute('data-music-retry-list')) load(view, states[view][view === 'playlist' ? 'id' : 'query']);
    else if (target.hasAttribute('data-music-retry-play')) {
      const song = current();
      if (song) { mediaFailed = false; player.list.switch(player.list.index); playTrack(song.id); }
    }
  });
  element('.music-dock')?.addEventListener('toggle', event => { if (event.target.open) ensurePlaylist(); });
  document.addEventListener('pjax:send', () => {
    const state = states.search;
    if (state.loading) { ++state.generation; state.controller?.abort(); state.loading = false; state.status = '搜索已停止，可重新搜索。'; }
  });
  document.addEventListener('pjax:complete', () => { render(); if (element('[data-music-browser]')) ensurePlaylist(); sync(); });
  document.addEventListener('play', event => { if (event.target.tagName === 'VIDEO') player.pause(); }, true);
  window.siteMusic = { player, loadPlaylist: value => load('playlist', parsePlaylistId(value)), search: query => load('search', query), playTrack };
  render();
  if (element('[data-music-browser]') || element('.music-dock')?.open) ensurePlaylist();
})();
