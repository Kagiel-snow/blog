'use strict';
// Kawaii layer: fine rain, a click ripple, a sleeping footer cat and a tab title.
// Everything is decorative: no network, no stored data except the rain on/off choice.
(() => {
  if (window.siteKawaii) return;
  window.siteKawaii = true;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch {} }
  };
  const dark = () => document.documentElement.getAttribute('data-theme') === 'dark';

  // ---- Fine rain: thin slanted streaks on one canvas, paused when the tab is hidden.
  // Names keep "snow" so the stored on/off choice ('kawaii-snow') still applies.
  const canvas = document.createElement('canvas');
  canvas.className = 'kw-snow';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  let drops = [], frame = 0, width = 0, height = 0, ratio = 1;
  let snowOn = !reduced && store.get('kawaii-snow') !== 'off';
  const WIND = 0.18;

  function drop(top) {
    const near = Math.random() < 0.18;
    return { x: Math.random() * (width + height * WIND), y: top ? Math.random() * height : -30 - Math.random() * 60,
      len: near ? 18 + Math.random() * 10 : 8 + Math.random() * 10, vy: near ? 7 + Math.random() * 3 : 4 + Math.random() * 3,
      alpha: near ? 0.32 : 0.12 + Math.random() * 0.14, width: near ? 1.2 : 0.8 };
  }
  function resize() {
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = width * ratio; canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const reading = !!document.getElementById('article-container');
    const count = Math.round((width < 768 ? 36 : 80) * (reading ? 0.5 : 1));
    while (drops.length < count) drops.push(drop(true));
    drops.length = count;
  }
  function draw() {
    ctx.clearRect(0, 0, width, height);
    const tint = dark() ? '150,215,255' : '45,105,170';
    ctx.lineCap = 'round';
    for (const d of drops) {
      d.y += d.vy; d.x -= d.vy * WIND;
      if (d.y - d.len > height || d.x < -20) Object.assign(d, drop(false));
      ctx.strokeStyle = `rgba(${tint},${d.alpha})`; ctx.lineWidth = d.width;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.len * WIND, d.y - d.len); ctx.stroke();
    }
    frame = requestAnimationFrame(draw);
  }
  function startSnow() {
    if (!snowOn || frame || document.hidden) return;
    if (!canvas.isConnected) document.body.append(canvas);
    resize(); frame = requestAnimationFrame(draw);
  }
  function stopSnow() { cancelAnimationFrame(frame); frame = 0; ctx.clearRect(0, 0, width, height); }
  window.addEventListener('resize', () => { if (frame) resize(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopSnow(); else startSnow(); });

  // An umbrella button among the right-side tools turns the rain on and off.
  function mountToggle() {
    const group = document.getElementById('rightside-config-hide');
    if (!group || document.getElementById('kw-snow-toggle')) return;
    const button = document.createElement('button');
    button.id = 'kw-snow-toggle'; button.type = 'button';
    const sync = () => {
      button.classList.toggle('is-off', !snowOn);
      button.title = snowOn ? '让雨停下' : '让雨落下来';
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(snowOn));
    };
    button.innerHTML = '<i class="fas fa-cloud-rain" aria-hidden="true"></i>'; sync();
    button.addEventListener('click', () => {
      snowOn = !snowOn; store.set('kawaii-snow', snowOn ? 'on' : 'off'); sync();
      if (snowOn) startSnow(); else stopSnow();
    });
    group.prepend(button);
  }

  // ---- Click ripple: one thin neon ring where the pointer lands.
  document.addEventListener('pointerdown', event => {
    if (reduced || event.button !== 0) return;
    if (event.target.closest('input,textarea,select,[contenteditable],.mascot-dialog,.aplayer,.site-games')) return;
    const ring = document.createElement('span');
    ring.className = 'kw-ripple'; ring.setAttribute('aria-hidden', 'true');
    ring.style.left = event.clientX + 'px'; ring.style.top = event.clientY + 'px';
    document.body.append(ring);
    const animation = ring.animate([
      { transform: 'scale(.2)', opacity: .9 },
      { transform: 'scale(1.4)', opacity: 0 }
    ], { duration: 520, easing: 'cubic-bezier(.2,.8,.4,1)' });
    animation.onfinish = () => ring.remove();
  }, { passive: true });

  // ---- Footer cat: sleeps until clicked, then says one line and dozes off again.
  const lines = ['喵～', '今天也要好好学习喵', '外面好像在下雨', '摸摸头可以哦', '再看一篇再睡喵', '♪ 要一起听歌吗', '(=^･ω･^=)'];
  const catSvg = `<svg viewBox="0 0 86 52" aria-hidden="true">
    <path class="kw-cat-tail" d="M68 44 C82 44 84 30 76 26" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" style="color:#d5e2ee"/>
    <g class="kw-cat-body">
      <ellipse cx="46" cy="42" rx="26" ry="11" fill="#fff" stroke="#a9bfd4" stroke-width="1.5"/>
      <path d="M14 32 L17 18 L25 27 Z" fill="#fff" stroke="#a9bfd4" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M33 27 L39 16 L42 30 Z" fill="#fff" stroke="#a9bfd4" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M18 29 L18.5 22 L22.5 26.5 Z M36 26 L38.5 20.5 L40 27.5 Z" fill="#d3e0ec"/>
      <ellipse cx="28" cy="36" rx="16" ry="12" fill="#fff" stroke="#a9bfd4" stroke-width="1.5"/>
      <g class="kw-cat-shut" fill="none" stroke="#4d6378" stroke-width="1.6" stroke-linecap="round">
        <path d="M19 36 q3 2.4 6 0"/><path d="M31 36 q3 2.4 6 0"/>
      </g>
      <g class="kw-cat-open" fill="#33485c"><ellipse cx="22" cy="35" rx="2" ry="2.6"/><ellipse cx="34" cy="35" rx="2" ry="2.6"/></g>
      <ellipse cx="17" cy="40" rx="3" ry="1.6" fill="#d3e0ec" opacity=".8"/><ellipse cx="39" cy="40" rx="3" ry="1.6" fill="#d3e0ec" opacity=".8"/>
      <path d="M26.5 39.5 q1.5 1.6 3 0" fill="none" stroke="#4d6378" stroke-width="1.3" stroke-linecap="round"/>
    </g>
    <text class="kw-cat-z" x="44" y="18">z</text>
  </svg>`;
  function mountCat() {
    const footer = document.getElementById('footer');
    if (!footer || footer.querySelector('.kw-cat')) return;
    const cat = document.createElement('button');
    cat.type = 'button'; cat.className = 'kw-cat'; cat.setAttribute('aria-label', '叫醒小猫');
    cat.innerHTML = catSvg + '<span class="kw-cat-bubble" role="status"></span>';
    let timer;
    cat.addEventListener('click', () => {
      cat.querySelector('.kw-cat-bubble').textContent = lines[(Math.random() * lines.length) | 0];
      cat.classList.remove('is-awake'); void cat.offsetWidth; cat.classList.add('is-awake');
      clearTimeout(timer); timer = setTimeout(() => cat.classList.remove('is-awake'), 2600);
    });
    footer.append(cat);
  }

  // ---- Tab title: a small wave when the visitor leaves and comes back.
  let savedTitle = document.title, backTimer;
  document.addEventListener('visibilitychange', () => {
    clearTimeout(backTimer);
    if (document.hidden) { savedTitle = document.title; document.title = '(｡•́︿•̀｡) 我还在等你哟～'; }
    else { document.title = '(≧▽≦) 欢迎回来！'; backTimer = setTimeout(() => { document.title = savedTitle; }, 1600); }
  });

  function mount() { mountToggle(); mountCat(); if (snowOn) { stopSnow(); startSnow(); } }
  document.addEventListener('pjax:complete', mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
