'use strict';
(() => {
  const container = document.getElementById('kagiel-player');
  const data = document.getElementById('site-music-data');
  if (!container || !data || typeof APlayer === 'undefined') return;
  const tracks = JSON.parse(data.textContent);
  const player = new APlayer({container, fixed:false, mini:false, autoplay:false,
    theme:'#426f98', loop:'all', order:'random', preload:'metadata', volume:0.7,
    mutex:true, listFolded:true, audio:tracks});
  const sync = () => {
    document.querySelectorAll('[data-track-id]').forEach(button => {
      const active = !player.audio.paused && tracks[player.list.index]?.id === button.dataset.trackId;
      button.closest('.track-card').classList.toggle('is-playing', active);
      button.querySelector('span').textContent = active ? button.dataset.playingLabel : button.dataset.playLabel;
    });
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-track-id]');
    if (!button) return;
    const index = tracks.findIndex(t => t.id === button.dataset.trackId);
    if (index < 0) return;
    event.preventDefault();
    document.querySelectorAll('video').forEach(video => video.pause());
    if (player.list.index !== index) player.list.switch(index);
    player.play();
    const dock = document.querySelector('.music-dock');
    if (dock) dock.open = true;
  });
  ['play','pause','ended','listswitch'].forEach(name => player.on(name,sync));
  document.addEventListener('pjax:complete', sync);
  document.addEventListener('play', event => { if (event.target.tagName === 'VIDEO') player.pause(); }, true);
})();
