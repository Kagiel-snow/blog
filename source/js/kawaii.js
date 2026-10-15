'use strict';
// Kawaii layer: light snowfall, click sparks, a sleeping footer cat and a cute tab title.
// Everything is decorative: no network, no stored data except the snow on/off choice.
(() => {
  if (window.siteKawaii) return;
  window.siteKawaii = true;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch {} }
  };
  const dark = () => document.documentElement.getAttribute('data-theme') === 'dark';

  // ---- Snowfall: a few flakes on one canvas, paused when the tab is hidden.
  const canvas = document.createElement('canvas');
  canvas.className = 'kw-snow';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  let flakes = [], frame = 0, width = 0, height = 0, ratio = 1;
  let snowOn = !reduced && store.get('kawaii-snow') !== 'off';

  function flake(top) {
    const big = Math.random() < 0.22;
    return { x: Math.random() * width, y: top ? Math.random() * height : -12,
      r: big ? 4 + Math.random() * 3 : 1.2 + Math.random() * 2, star: big,
      vy: 0.35 + Math.random() * 0.6, sway: Math.random() * Math.PI * 2, spin: Math.random() * Math.PI,
      tint: Math.random() < 0.18 ? 'pink' : 'ice' };
  }
  function resize() {
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = width * ratio; canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const reading = !!document.getElementById('article-container');
    const count = Math.round((width < 768 ? 16 : 34) * (reading ? 0.6 : 1));
    while (flakes.length < count) flakes.push(flake(true));
    flakes.length = count;
  }
  function draw() {
    ctx.clearRect(0, 0, width, height);
    const ice = dark() ? 'rgba(235,250,255,.85)' : 'rgba(120,205,215,.75)';
    const pink = dark() ? 'rgba(255,170,205,.8)' : 'rgba(242,126,169,.6)';
    for (const f of flakes) {
      f.y += f.vy; f.sway += 0.012; f.spin += 0.006;
      f.x += Math.sin(f.sway) * 0.35;
      if (f.y > height + 12) Object.assign(f, flake(false));
      ctx.strokeStyle = ctx.fillStyle = f.tint === 'pink' ? pink : ice;
      if (!f.star) { ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill(); continue; }
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.spin); ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      for (let arm = 0; arm < 6; arm++) {
        ctx.rotate(Math.PI / 3); ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(0, -f.r * 1.6);
        ctx.moveTo(0, -f.r * 0.9); ctx.lineTo(f.r * 0.45, -f.r * 1.25);
        ctx.moveTo(0, -f.r * 0.9); ctx.lineTo(-f.r * 0.45, -f.r * 1.25);
        ctx.stroke();
      }
      ctx.restore();
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

  // A snowflake button among the right-side tools turns the snow on and off.
  function mountToggle() {
    const group = document.getElementById('rightside-config-hide');
    if (!group || document.getElementById('kw-snow-toggle')) return;
    const button = document.createElement('button');
    button.id = 'kw-snow-toggle'; button.type = 'button';
    const sync = () => {
      button.classList.toggle('is-off', !snowOn);
      button.title = snowOn ? '关掉雪花' : '让雪落下来';
      button.setAttribute('aria-pressed', String(snowOn));
    };
    button.textContent = '❄'; sync();
    button.addEventListener('click', () => {
      snowOn = !snowOn; store.set('kawaii-snow', snowOn ? 'on' : 'off'); sync();
      if (snowOn) startSnow(); else stopSnow();
    });
    group.prepend(button);
  }

  // ---- Click sparks: a small burst of snowflakes, notes and hearts.
  const sparks = ['❄', '✦', '♪', '♡', '❄', '✧'];
  document.addEventListener('pointerdown', event => {
    if (reduced || event.button !== 0) return;
    if (event.target.closest('input,textarea,select,[contenteditable],.mascot-dialog,.aplayer')) return;
    for (let index = 0; index < 6; index++) {
      const spark = document.createElement('span');
      spark.className = 'kw-spark'; spark.setAttribute('aria-hidden', 'true');
      spark.textContent = sparks[(Math.random() * sparks.length) | 0];
      spark.style.left = event.clientX - 7 + 'px'; spark.style.top = event.clientY - 7 + 'px';
      spark.style.color = index % 3 === 0 ? 'var(--kw-pink)' : 'var(--kw-teal)';
      document.body.append(spark);
      const angle = (Math.PI * 2 * index) / 6 + Math.random() * 0.6, distance = 26 + Math.random() * 26;
      const animation = spark.animate([
        { transform: 'translate(0,0) scale(.4) rotate(0deg)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance - 10}px) scale(1) rotate(${Math.random() * 120 - 60}deg)`, opacity: 0 }
      ], { duration: 650 + Math.random() * 250, easing: 'cubic-bezier(.2,.8,.4,1)' });
      animation.onfinish = () => spark.remove();
    }
  }, { passive: true });

  // ---- Footer cat: sleeps until clicked, then says one line and dozes off again.
  const lines = ['喵～', '今天也要好好学习喵', '雪好漂亮呀 ❄', '摸摸头可以哦', '再看一篇再睡喵', '♪ 要一起听歌吗', '(=^･ω･^=)'];
  const catSvg = `<svg viewBox="0 0 86 52" aria-hidden="true">
    <path class="kw-cat-tail" d="M68 44 C82 44 84 30 76 26" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" style="color:#cfe9ee"/>
    <g class="kw-cat-body">
      <ellipse cx="46" cy="42" rx="26" ry="11" fill="#fff" stroke="#9fcfd3" stroke-width="1.5"/>
      <path d="M14 32 L17 18 L25 27 Z" fill="#fff" stroke="#9fcfd3" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M33 27 L39 16 L42 30 Z" fill="#fff" stroke="#9fcfd3" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M18 29 L18.5 22 L22.5 26.5 Z M36 26 L38.5 20.5 L40 27.5 Z" fill="#ffc6da"/>
      <ellipse cx="28" cy="36" rx="16" ry="12" fill="#fff" stroke="#9fcfd3" stroke-width="1.5"/>
      <g class="kw-cat-shut" fill="none" stroke="#4a6b73" stroke-width="1.6" stroke-linecap="round">
        <path d="M19 36 q3 2.4 6 0"/><path d="M31 36 q3 2.4 6 0"/>
      </g>
      <g class="kw-cat-open" fill="#2c4a52"><ellipse cx="22" cy="35" rx="2" ry="2.6"/><ellipse cx="34" cy="35" rx="2" ry="2.6"/></g>
      <ellipse cx="17" cy="40" rx="3" ry="1.6" fill="#ffc6da" opacity=".8"/><ellipse cx="39" cy="40" rx="3" ry="1.6" fill="#ffc6da" opacity=".8"/>
      <path d="M26.5 39.5 q1.5 1.6 3 0" fill="none" stroke="#4a6b73" stroke-width="1.3" stroke-linecap="round"/>
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
    if (document.hidden) { savedTitle = document.title; document.title = '(｡•́︿•̀｡) 雪还在下哦～'; }
    else { document.title = '(≧▽≦) 欢迎回来！'; backTimer = setTimeout(() => { document.title = savedTitle; }, 1600); }
  });

  function mount() { mountToggle(); mountCat(); if (snowOn) { stopSnow(); startSnow(); } }
  document.addEventListener('pjax:complete', mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
