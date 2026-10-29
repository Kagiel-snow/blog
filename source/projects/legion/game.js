'use strict';
// ================= 军团之王：要塞 · 主逻辑（v3：领主 + 英雄召唤 + 多地图 + 双攻双防） =================
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const overlay = document.getElementById('overlay');
const $top = document.getElementById('topbar');
const $build = document.getElementById('buildbar');
const $panel = document.getElementById('panel');
const $hint = document.getElementById('hint');
let VW = 0, VH = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = innerWidth; VH = innerHeight;
  cvs.width = VW * DPR; cvs.height = VH * DPR;
  cvs.style.width = VW + 'px'; cvs.style.height = VH + 'px';
}
addEventListener('resize', resize); resize();

const T = 40;
let GW = 80, GH = 80, WORLD_W = GW * T, WORLD_H = GH * T;
// 每张地图的大小不同：开局时按地图设定世界尺寸
function setWorld(def) {
  GW = GH = def.size || 80; WORLD_W = GW * T; WORLD_H = GH * T;
  if (dist.length !== GW * GH) dist = new Float64Array(GW * GH);
  allyFlowCache.clear();
}
const TAU = Math.PI * 2;
const MAX_ENEMIES = 360;
function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hypot = Math.hypot;
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const fmt = n => Math.floor(n).toLocaleString();

// ---------- emoji 精灵缓存 ----------
const spriteCache = new Map();
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
function sprite(e, size) {
  size = Math.max(6, Math.round(size));
  const key = e + '|' + size;
  let c = spriteCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    const s = Math.ceil(size * 1.5) * 2;
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${size * 2}px ${EMOJI_FONT}`;
    g.fillText(e, s / 2, s / 2 + size * 0.12);
    spriteCache.set(key, c);
  }
  return c;
}
function drawSprite(e, x, y, size, flip) {
  const c = sprite(e, size), s = c.width / 2;
  if (flip) { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); ctx.drawImage(c, -s / 2, -s / 2, s, s); ctx.restore(); }
  else ctx.drawImage(c, x - s / 2, y - s / 2, s, s);
}

// ---------- 美术资源：assets/ 下的 PNG（ChatGPT 绘制），缺哪张就继续用 emoji ----------
// 角色图统一朝右、脚踩在图片底边，所以按“底边对齐”绘制，朝左时水平翻转
const ART = {}, artCache = new Map();
const ART_SCALE = { char: 2, bld: 1.15 };
const DECOR_ART = { '🌲': 'decor/pine', '🌳': 'decor/oak', '🌴': 'decor/palm', '🪨': 'decor/rock', '💎': 'decor/ore', '🪦': 'decor/grave', '⚰️': 'decor/coffin', '🌵': 'decor/cactus' };
const TILE_KINDS = ['low', 'high', 'ramp', 'cliff', 'water'];
function artKeys() {
  const k = ['lord/sword', 'lord/bow', 'lord/magic', 'portraits/lord', 'fx/portal'];
  for (const id in HEROES) k.push('heroes/' + id, 'portraits/' + id);
  for (const id in UNITS) k.push('units/' + id);
  for (const t in EVOLUTIONS) for (const br of EVOLUTIONS[t]) k.push('units/' + br.id);
  for (const id in ENEMIES) k.push('enemies/' + id);
  for (const id in CAMPS) k.push('camps/' + id);
  for (const id in KINGS) k.push('enemies/king_' + id);
  for (const id in FACTIONS) for (const b of ['hq', 'barracks', 'tower']) k.push(`ebld/${id}_${b}`);
  for (const id in LAIRS) k.push('lairs/' + id);
  for (const id in RELICS) k.push('relics/' + id);
  for (const id in BUILDINGS) if (id !== 'wall' && id !== 'trap') k.push('buildings/' + id);
  for (const m of MAPS) if (!m.tiles) for (const t of TILE_KINDS) k.push(`tiles/${m.id}_${t}`);
  k.push(...Object.values(DECOR_ART));
  return [...new Set(k)];
}
function loadArt() {
  // 先探测 assets/_probe.png：网页单文件版没有 assets 文件夹，就不去逐个请求
  const probe = new Image();
  probe.onload = () => {
    const keys = artKeys(); let left = keys.length;
    const done = () => { if (--left === 0) artReady(); };
    for (const key of keys) { const im = new Image(); im.onload = () => { ART[key] = im; done(); }; im.onerror = done; im.src = `assets/${key}.png`; }
  };
  probe.src = 'assets/_probe.png';
}
function artReady() {
  artCache.clear(); if (typeof tintCache !== 'undefined') tintCache.clear();
  for (const id in MAP_CACHE) if (MAP_CACHE[id] === MAP) renderGround(MAP); else delete MAP_CACHE[id];
  if (G && $build.innerHTML) buildBarInit();
  const n = Object.keys(ART).length;
  if (n) setTimeout(() => toast(`已加载像素美术 ${n} 张`), 300);
}
// 像素风：每张图按它的像素网格（提示词里规定的格数）用最近邻取样还原成小图，
// 画的时候关掉平滑，像素边缘保持清晰。ChatGPT 画得不够规整也会被“吸附”到网格上
const PIXEL_GRID = {
  camps: 96, lord: 64, heroes: 64, portraits: 64, units: 48, enemies: 48, buildings: 64, tiles: 128, decor: 48, fx: 64,
  'units/knight': 64, 'units/griffin': 64, 'units/templar': 64, 'units/dragoon': 64, 'units/skylord': 64, 'units/stormgriffin': 64, 'units/dragon': 64, 'units/golem': 64,
  'enemies/wolfrider': 64, 'enemies/orc': 64, 'enemies/ogre': 64, 'enemies/wyvern': 64,
  'enemies/troll': 96, 'enemies/demon': 96, 'enemies/lich': 96, 'enemies/dragon': 128,
  'buildings/castle': 128, 'buildings/barracks': 96, 'buildings/altar': 96, 'buildings/training': 96,
  'decor/pine': 64, 'decor/oak': 64, 'decor/palm': 64,
  'enemies/king_goblin': 96, 'enemies/king_orc': 96, 'enemies/king_undead': 96,
  ebld: 96, 'ebld/goblin_hq': 128, 'ebld/orc_hq': 128, 'ebld/undead_hq': 128, 'ebld/goblin_tower': 64, 'ebld/orc_tower': 64, 'ebld/undead_tower': 64,
  lairs: 96, relics: 48,
};
const gridOf = key => PIXEL_GRID[key] || PIXEL_GRID[key.split('/')[0]] || 64;
function artImg(key) {
  const im = ART[key]; if (!im) return null;
  let c = artCache.get(key);
  if (!c) {
    const gw = gridOf(key);
    c = document.createElement('canvas'); c.width = gw; c.height = Math.max(1, Math.round(gw * im.height / im.width));
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(im, 0, 0, c.width, c.height);
    if (key.startsWith('tiles/')) calmTile(g, c.width, c.height);
    else if (key.startsWith('decor/')) c = toneDown(c);
    else if (OUTLINED.some(p => key.startsWith(p))) c = outlined(c);
    artCache.set(key, c);
  }
  return c;
}
// 地面贴图降噪：混入一层模糊过的自己（压掉细碎噪点，整体色调不变），再降饱和度、略微压暗，让角色和建筑更突出
// 只用 canvas filter，不读像素，双击 index.html 打开（file://）也能生效
function calmTile(g, w, h) {
  const { contrast: K, sat: S, bright: B } = VISUAL;
  if (K >= 1 && S === 1 && B === 1) return;
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  src.getContext('2d').drawImage(g.canvas, 0, 0);
  if (K < 1) {
    const big = document.createElement('canvas'); big.width = w * 3; big.height = h * 3;
    const bg = big.getContext('2d');
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) bg.drawImage(src, i * w, j * h);
    g.save(); g.globalAlpha = 1 - K; g.filter = `blur(${Math.max(1, w / 64)}px)`; g.drawImage(big, -w, -h); g.restore();
    src.getContext('2d').drawImage(g.canvas, 0, 0);
  }
  g.save(); g.clearRect(0, 0, w, h); g.filter = `saturate(${S}) brightness(${B})`; g.drawImage(src, 0, 0); g.restore();
}
// 角色描边：外围加一圈 1 像素深色轮廓，颜色略微提亮，在任何地面上都能一眼认出
const OUTLINED = ['lord/', 'heroes/', 'units/', 'enemies/'];
function outlined(c) {
  const o = document.createElement('canvas'); o.width = c.width + 2; o.height = c.height + 2;
  const g = o.getContext('2d'); g.imageSmoothingEnabled = false;
  const sil = document.createElement('canvas'); sil.width = c.width; sil.height = c.height;
  const sg = sil.getContext('2d'); sg.drawImage(c, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = VISUAL.outline; sg.fillRect(0, 0, c.width, c.height);
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2], [0, 0], [2, 0], [0, 2], [2, 2]]) g.drawImage(sil, dx, dy);
  g.filter = `saturate(${VISUAL.charSat}) brightness(${VISUAL.charBright})`; g.drawImage(c, 1, 1); g.filter = 'none';
  return o;
}
// 场景装饰（树、石头）压暗、降饱和，退到角色后面
function toneDown(c) {
  const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
  const g = o.getContext('2d'); g.filter = `saturate(${VISUAL.decorSat}) brightness(${VISUAL.decorBright})`; g.drawImage(c, 0, 0);
  return o;
}
function blitPixel(c, x, y, w, h) { const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false; ctx.drawImage(c, x, y, w, h); ctx.imageSmoothingEnabled = sm; }
// 有图画图（底边对齐 y + size/2），没图画 emoji。flipE / flipA：emoji 和图片各自是否翻转
function drawArt(key, e, x, y, size, flipE, flipA, scale = ART_SCALE.char, fl = 0) {
  if (!ART[key]) return drawSprite(e, x, y, size, flipE);
  const h = size * scale, c = artImg(key), w = h * c.width / c.height, top = y + size / 2 - h;
  const blit = im => { if (flipA) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); blitPixel(im, -w / 2, top, w, h); ctx.restore(); } else blitPixel(im, x - w / 2, top, w, h); };
  blit(c);
  if (fl > 0) { const a = ctx.globalAlpha; ctx.globalAlpha = a * Math.min(1, fl); blit(whiteOf(c)); ctx.globalAlpha = a; }
}
// 受击白闪：角色轮廓的纯白版本
const whiteCache = new WeakMap();
function whiteOf(c) {
  let w = whiteCache.get(c); if (w) return w;
  w = document.createElement('canvas'); w.width = c.width; w.height = c.height;
  const g = w.getContext('2d'); g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, w.width, w.height);
  whiteCache.set(c, w); return w;
}
// 战斗姿态：攻击时向目标前冲（远程是后坐），受击时压扁一下；以脚底为原点变形
function markAtk(o, t, melee) { o.atkAt = G.time; const l = hypot(t.x - o.x, t.y - o.y) || 1; o.atkDx = (t.x - o.x) / l; o.atkDy = (t.y - o.y) / l; o.atkMelee = melee; }
function poseBegin(o, footY) {
  const tA = G.time - (o.atkAt === undefined ? -9 : o.atkAt), tH = G.time - (o.hitAt === undefined ? -9 : o.hitAt);
  let ox = 0, oy = 0, sx = 1, sy = 1;
  if (tA >= 0 && tA < 0.2) { const k = Math.sin(tA / 0.2 * Math.PI), m = o.atkMelee ? 9 : -3; ox = o.atkDx * k * m; oy = o.atkDy * k * m * 0.6; if (o.atkMelee) { sx += 0.08 * k; sy -= 0.06 * k; } }
  if (tH >= 0 && tH < 0.14) { const k = 1 - tH / 0.14; sx += 0.14 * k; sy -= 0.12 * k; }
  ctx.save(); ctx.translate(o.x + ox, footY + oy); ctx.scale(sx, sy); ctx.translate(-o.x, -footY);
}
// 施法：脚下的旋转法阵 + 向上飘的光点
function castFx(x, y, color, R = 46) {
  G.effects.push({ kind: 'rune', x, y, r: R, color, t: 0, life: 0.75 });
  for (let i = 0; i < 12 && G.particles.length < 900; i++) G.particles.push({ x: x + rand(-R, R) * 0.7, y: y + rand(-R, R) * 0.3, vx: rand(-10, 10), vy: -rand(140, 260), life: rand(0.4, 0.8), max: 0.8, color, size: rand(2, 4) });
}
// 头像：优先 portraits/，其次全身图，最后 emoji（居中画在一个方框里）
function drawPortrait(keys, e, x, y, size) {
  const key = keys.find(k => ART[k]);
  if (!key) return drawSprite(e, x, y, size);
  const c = artImg(key), w = size * 1.3 * c.width / c.height;
  blitPixel(c, x - w / 2, y - size * 0.65, w, size * 1.3);
}
const iconHtml = (key, e) => ART[key] ? `<img class="ai" src="assets/${key}.png" alt="">` : e;
// 有图时角色比 emoji 高，血条、名字等要往上挪这么多
const artLift = (key, size) => ART[key] ? size * (ART_SCALE.char - 1) : 0;
const unitArtKey = u => u.evo && ART['units/' + u.evo] ? 'units/' + u.evo : (u.d.hero ? 'heroes/' : 'units/') + u.type;

// ---------- 音效 ----------
// ================= 设置与本地存储 =================
const LS_PREFIX = 'legion-fort-';
function lsGet(k) { try { const v = localStorage.getItem(LS_PREFIX + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(LS_PREFIX + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function lsDel(k) { try { localStorage.removeItem(LS_PREFIX + k); } catch (e) { } }
const SETTINGS = Object.assign({ vol: 0.7, sfx: true, shake: true, dmgNums: true, autosave: true, speed: 1, diff: 'normal', map: 'vale', mode: 'defense' }, lsGet('settings') || {});
const saveSettings = () => lsSet('settings', SETTINGS);
const diffOf = id => DIFFICULTIES.find(d => d.id === id) || DIFFICULTIES[1];
if (SETTINGS.tutorial === undefined) SETTINGS.tutorial = true;

// ================= 局外成长（荣耀与解锁） =================
const META = Object.assign({ glory: 0, runs: 0, wins: 0, best: {}, bestCombo: 0 }, lsGet('meta') || {});
const saveMeta = () => lsSet('meta', META);
const unlockOf = (kind, id) => UNLOCKS.find(u => u.kind === kind && u.id === id);
const isUnlocked = (kind, id) => { const u = unlockOf(kind, id); return !u || META.glory >= u.need; };
const unlockName = u => u.kind === 'hero' ? HEROES[u.id] : UNITS[u.id];
function awardGlory(win) {
  if (G.awarded) return null;
  G.awarded = true;
  const waves = win ? G.wave : G.wave - 1;
  // 从本波重来时只补发新增的部分，避免反复刷同一波
  const total = Math.round((waves * 2 + G.bossKills * 5 + (win ? 30 : 0)) * G.diff.glory);
  const gain = Math.max(0, total - G.gloryPaid);
  const before = META.glory;
  if (!G.gloryPaid) META.runs++;
  G.gloryPaid = Math.max(G.gloryPaid, total);
  META.glory += gain; if (win) META.wins++;
  META.best[G.diff.id] = Math.max(META.best[G.diff.id] || 0, waves);
  META.bestMap = META.bestMap || {}; META.bestMap[G.map.id] = Math.max(META.bestMap[G.map.id] || 0, waves);
  META.bestCombo = Math.max(META.bestCombo || 0, G.bestCombo);
  saveMeta();
  const fresh = UNLOCKS.filter(u => before < u.need && META.glory >= u.need);
  const next = UNLOCKS.find(u => META.glory < u.need);
  return { gain, fresh, next };
}

let AC = null;
const sfxLast = {};
let MASTER = null, NOISE = null;
function audioInit() {
  if (AC) return true;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6;
  MASTER = AC.createGain(); MASTER.connect(comp).connect(AC.destination);
  NOISE = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
  const ch = NOISE.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  return true;
}
// 合成音色：tone=振荡器（频率滑动），noise=滤波白噪声（爆炸、撞击、风声）
function tone(f0, dur, type, vol, f1, delay = 0) {
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 || f0), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(MASTER); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, f0, f1, delay = 0, q = 0.7, type = 'lowpass') {
  const t = AC.currentTime + delay, src = AC.createBufferSource(), flt = AC.createBiquadFilter(), g = AC.createGain();
  src.buffer = NOISE; src.loop = true;
  flt.type = type; flt.Q.value = q; flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt).connect(g).connect(MASTER); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}
const SFX = {
  hit: [0.04, () => { noise(0.05, 0.05, 3000, 800, 0, 1, 'bandpass'); tone(220 * rand(0.9, 1.1), 0.05, 'square', 0.012, 120); }],
  crit: [0.06, () => { tone(1400, 0.09, 'square', 0.03, 2200); noise(0.08, 0.08, 6000, 1500, 0, 1, 'bandpass'); }],
  kill: [0.04, () => { tone(320 * rand(0.85, 1.15), 0.09, 'triangle', 0.05, 90); noise(0.07, 0.05, 1800, 300); }],
  coin: [0.035, () => { const f = rand(1100, 1300); tone(f, 0.06, 'sine', 0.04); tone(f * 1.5, 0.12, 'sine', 0.035, f * 1.5, 0.05); }],
  level: [0.1, () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.07, f, i * 0.06)); noise(0.5, 0.04, 9000, 4000, 0.15, 1, 'highpass'); }],
  upgrade: [0.1, () => { tone(140, 0.3, 'square', 0.06, 70); noise(0.25, 0.12, 900, 120); [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.08, f * 1.01, 0.08 + i * 0.07)); noise(0.7, 0.05, 10000, 5000, 0.3, 1, 'highpass'); }],
  hurt: [0.12, () => { tone(160, 0.18, 'sawtooth', 0.06, 70); noise(0.12, 0.08, 1500, 300); }],
  skill: [0.2, () => { noise(0.45, 0.16, 400, 4000, 0, 2, 'bandpass'); tone(260, 0.4, 'sawtooth', 0.06, 620); }],
  boom: [0.06, () => { noise(0.7, 0.35, 2400, 60); tone(110, 0.45, 'sine', 0.3, 32); noise(0.15, 0.15, 5000, 1500, 0, 1, 'bandpass'); }],
  smallboom: [0.05, () => { noise(0.3, 0.16, 1800, 90); tone(140, 0.2, 'sine', 0.12, 45); }],
  crash: [0.1, () => { noise(0.9, 0.3, 1200, 50); tone(80, 0.6, 'square', 0.08, 30); [0.1, 0.22, 0.35].forEach(d => noise(0.12, 0.12, 2500, 500, d, 1, 'bandpass')); }],
  buy: [0.05, () => { tone(660, 0.08, 'square', 0.04); tone(990, 0.14, 'square', 0.04, 990, 0.07); }],
  shoot: [0.05, () => { noise(0.06, 0.04, 5000, 1200, 0, 2, 'bandpass'); }],
  build: [0.05, () => { noise(0.22, 0.3, 700, 80); tone(120, 0.18, 'square', 0.06, 55); noise(0.06, 0.12, 3000, 1500, 0.04, 2, 'bandpass'); }],
  boss: [0.5, () => { tone(55, 1.4, 'sawtooth', 0.12, 40); tone(82, 1.4, 'sawtooth', 0.08, 60); noise(1.4, 0.15, 300, 60); }],
  err: [0.1, () => { tone(150, 0.12, 'square', 0.05, 110); }],
  horn: [0.5, () => { tone(196, 1.0, 'sawtooth', 0.06, 200); tone(294, 1.0, 'sawtooth', 0.05, 300, 0.05); noise(0.9, 0.04, 800, 400, 0, 1, 'bandpass'); }],
  victory: [0.5, () => { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, i > 3 ? 0.5 : 0.18, 'triangle', 0.09, f, i * 0.12)); }],
  defeat: [0.5, () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.45, 'sawtooth', 0.06, f * 0.97, i * 0.22)); noise(1.5, 0.2, 600, 50, 0.6); }],
  magic: [0.05, () => { tone(700 * rand(0.9, 1.1), 0.12, 'sine', 0.03, 1400); noise(0.1, 0.03, 4000, 8000, 0, 3, 'bandpass'); }],
  slash: [0.05, () => { noise(0.09, 0.08, 1200, 5000, 0, 2, 'bandpass'); }],
  summon: [0.5, () => { tone(220, 0.8, 'sawtooth', 0.05, 880); [523, 784, 1046, 1568].forEach((f, i) => tone(f, 0.4, 'triangle', 0.07, f, 0.2 + i * 0.08)); noise(1.0, 0.08, 300, 6000, 0, 1, 'bandpass'); }],
  herodie: [0.5, () => { [440, 349, 262].forEach((f, i) => tone(f, 0.5, 'triangle', 0.08, f * 0.9, i * 0.2)); }],
  tut: [0.1, () => { tone(880, 0.1, 'sine', 0.05); tone(1320, 0.2, 'sine', 0.05, 1320, 0.08); }],
};
function sfx(name) {
  if (!SETTINGS.sfx || SETTINGS.vol <= 0 || !audioInit()) return;
  const S = SFX[name]; if (!S) return;
  const now = AC.currentTime;
  if (sfxLast[name] && now - sfxLast[name] < S[0]) return;
  sfxLast[name] = now;
  MASTER.gain.value = SETTINGS.vol * 1.6;
  try { S[1](); } catch (e) { }
}

// ================= 地图（每张地图固定种子生成） =================
// hgt: 0 = 低地，1 = 高地；ramp: 坡道格（只有经过坡道才能在高低地之间移动）
const MAP_CACHE = {};
let MAP = null, PORTALS = [];
function buildMap(def) {
  if (MAP_CACHE[def.id]) return MAP_CACHE[def.id];
  let seed = 0; for (const ch of def.id) seed = seed * 31 + ch.charCodeAt(0);
  const r = mulberry32(seed + 20261023);
  const R = (a, b) => a + r() * (b - a);
  const N = GW * GH;
  const water = new Uint8Array(N), hgt = new Uint8Array(N), ramp = new Uint8Array(N);
  const castleX = (def.castle[0] + 2) * T, castleY = (def.castle[1] + 2) * T;
  for (let ty = 0; ty < GH; ty++) for (let tx = 0; tx < GW; tx++) {
    const i = ty * GW + tx, x = tx * T + T / 2, y = ty * T + T / 2;
    if (def.lakes.some(([lx, ly, rx, ry]) => ((x - lx) / rx) ** 2 + ((y - ly) / ry) ** 2 < 1)) water[i] = 1;
    const cx = tx + 0.5, cy = ty + 0.5;
    for (const p of def.plateaus) {
      if (p.e && ((cx - p.e[0]) / p.e[2]) ** 2 + ((cy - p.e[1]) / p.e[3]) ** 2 < 1) hgt[i] = 1;
      if (p.r && cx >= p.r[0] && cx < p.r[0] + p.r[2] && cy >= p.r[1] && cy < p.r[1] + p.r[3]) hgt[i] = 1;
    }
  }
  for (const [x0, y0, w, h] of def.ramps) for (let ty = y0; ty < y0 + h; ty++) for (let tx = x0; tx < x0 + w; tx++) {
    if (tx >= 0 && ty >= 0 && tx < GW && ty < GH) ramp[ty * GW + tx] = 1;
  }
  const patches = [];
  for (let i = 0; i < 520 * (GW * GH) / 6400; i++) patches.push({ x: R(0, WORLD_W), y: R(0, WORLD_H), rx: R(60, 220), ry: R(40, 160), c: def.ground[1 + Math.floor(r() * (def.ground.length - 1))], rot: R(0, 3) });
  const decor = [];
  const tileAt = (x, y) => clamp(Math.floor(y / T), 0, GH - 1) * GW + clamp(Math.floor(x / T), 0, GW - 1);
  // 道路两侧不长树、不放石头
  const roadGrid = new Uint8Array(N);
  for (const rd of def.roads || []) for (let k = 1; k < rd.length; k++) {
    const [ax, ay] = rd[k - 1], [bx, by] = rd[k], n = Math.ceil(hypot(bx - ax, by - ay) / 20);
    for (let q = 0; q <= n; q++) { const x = ax + (bx - ax) * q / n, y = ay + (by - ay) * q / n; for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) roadGrid[tileAt(x + ox * T, y + oy * T)] = 1; }
  }
  const free = (x, y) => {
    const i = tileAt(x, y);
    return hypot(x - castleX, y - castleY) > 300 && !water[i] && !ramp[i] && !roadGrid[i] && !def.portals.some(p => hypot(p.x - x, p.y - y) < 150);
  };
  const cluster = (icons, size, cxx, cyy, rad, n) => {
    for (let i = 0; i < n; i++) {
      const a = R(0, TAU), d = Math.sqrt(r()) * rad, x = cxx + Math.cos(a) * d, y = cyy + Math.sin(a) * d;
      if (x < 30 || y < 30 || x > WORLD_W - 30 || y > WORLD_H - 30 || !free(x, y)) continue;
      decor.push({ x, y, icon: Array.isArray(icons) ? icons[Math.floor(r() * icons.length)] : icons, size: size * R(0.8, 1.2), flip: r() < 0.5 });
    }
  };
  const treeIcons = def.palms ? ['🌴', '🌴', '🌳'] : ['🌲', '🌲', '🌳'];
  for (const [x, y, rad, n] of def.forests) cluster(treeIcons, 44, x, y, rad, n);
  for (const [x, y, rad, n] of def.rocks) cluster('🪨', 28, x, y, rad, n);
  for (const [x, y, rad, n] of def.veins) cluster('💎', 24, x, y, rad, n);
  const flowers = def.id === 'oasis' ? ['🌵', '🌵', '🌾', '🦴'] : def.id === 'highland' ? ['🌿', '🌾', '🍂', '🌼'] : ['🌼', '🌷', '🍄', '🌿', '🌾'];
  for (let i = 0; i < 380 * (GW * GH) / 6400; i++) { const x = R(30, WORLD_W - 30), y = R(30, WORLD_H - 30); if (free(x, y)) decor.push({ x, y, icon: flowers[Math.floor(r() * flowers.length)], size: 15, flip: false, fl: i }); }
  if (def.graves) cluster(['🪦', '⚰️'], 26, def.graves[0], def.graves[1], def.graves[2], 20);
  const m = { def, patches, decor, decor0: decor.slice(), water, hgt, ramp, ground: null, mini: null, GW, GH, W: WORLD_W, H: WORLD_H };
  renderGround(m);
  MAP_CACHE[def.id] = m;
  return m;
}
// 地面预渲染（有像素贴图时 1:1，否则半分辨率），包括草地斑块、湖泊、高地、悬崖和坡道
// 大地图（宽于 3200 像素）按 800 像素分块，看到哪块才画哪块，最多缓存 GROUND_CHUNK_MAX 块
const GROUND_CHUNK = 800, GROUND_CHUNK_MAX = 30;
const hasTileArt = def => TILE_KINDS.some(k => ART[`tiles/${def.tiles || def.id}_${k}`]);
function renderGround(m) {
  m.chunks = null; m.ground = null;
  if (m.W > 3200) { m.chunks = new Map(); m.mini = buildMini(m); return; }
  const S = hasTileArt(m.def) ? 1 : 0.5, c = document.createElement('canvas');
  c.width = m.W * S; c.height = m.H * S;
  const g = c.getContext('2d');
  g.scale(S, S);
  paintGround(m, g, 0, 0, m.W, m.H);
  m.ground = c;
  const mc = document.createElement('canvas'); mc.width = mc.height = 170;
  const mg = mc.getContext('2d'); mg.drawImage(c, 0, 0, 170, 170);
  mg.fillStyle = 'rgba(255,240,200,0.18)';
  for (let i = 0; i < m.GW * m.GH; i++) if (m.hgt[i]) mg.fillRect((i % m.GW) * 170 / m.GW, ((i / m.GW) | 0) * 170 / m.GH, 170 / m.GW + 0.5, 170 / m.GH + 0.5);
  m.mini = mc;
}
// 大地图的小地图：按格子上色
function buildMini(m) {
  const mc = document.createElement('canvas'); mc.width = mc.height = 170;
  const g = mc.getContext('2d'), k = 170 / m.GW, def = m.def;
  g.fillStyle = def.ground[0]; g.fillRect(0, 0, 170, 170);
  for (let i = 0; i < m.GW * m.GH; i++) {
    const col = m.water[i] ? '#3a7aa8' : m.ramp[i] ? def.ramp : m.hgt[i] ? '#7a9a58' : null;
    if (col) { g.fillStyle = col; g.fillRect((i % m.GW) * k, ((i / m.GW) | 0) * k, k + 0.4, k + 0.4); }
  }
  g.fillStyle = 'rgba(20,50,20,0.45)';
  for (const d of m.decor) if (DECOR_ART[d.icon] === 'decor/pine' || DECOR_ART[d.icon] === 'decor/oak' || DECOR_ART[d.icon] === 'decor/palm') g.fillRect(d.x / T * k - 0.6, d.y / T * k - 0.6, 1.2, 1.2);
  return mc;
}
function groundChunk(m, cx, cy) {
  const key = cx + ',' + cy;
  let c = m.chunks.get(key);
  if (c) { m.chunks.delete(key); m.chunks.set(key, c); return c; }
  const S = hasTileArt(m.def) ? 1 : 0.5;
  c = document.createElement('canvas'); c.width = c.height = GROUND_CHUNK * S;
  const g = c.getContext('2d');
  g.scale(S, S); g.translate(-cx * GROUND_CHUNK, -cy * GROUND_CHUNK);
  paintGround(m, g, cx * GROUND_CHUNK, cy * GROUND_CHUNK, GROUND_CHUNK, GROUND_CHUNK);
  m.chunks.set(key, c);
  if (m.chunks.size > GROUND_CHUNK_MAX) m.chunks.delete(m.chunks.keys().next().value);
  return c;
}
// 在世界坐标的 [x0, y0, w, h] 区域里画地面（g 已经变换到世界坐标）
function paintGround(m, g, x0, y0, w, h) {
  const def = m.def, GWm = m.GW, GHm = m.GH, tk = def.tiles || def.id;
  const tx0 = Math.max(0, Math.floor(x0 / T) - 1), ty0 = Math.max(0, Math.floor(y0 / T) - 1), tx1 = Math.min(GWm - 1, Math.ceil((x0 + w) / T) + 1), ty1 = Math.min(GHm - 1, Math.ceil((y0 + h) / T) + 1);
  // 地面贴图：一张无缝贴图铺满 8×8 格（320 像素）
  g.imageSmoothingEnabled = false;
  const pat = kind => { const im = artImg(`tiles/${tk}_${kind}`); if (!im) return null; const p = g.createPattern(im, 'repeat'); p.setTransform(new DOMMatrix().scale(320 / im.width)); return p; };
  const pLow = pat('low'), pHigh = pat('high'), pRamp = pat('ramp'), pCliff = pat('cliff'), pWater = pat('water');
  g.fillStyle = pLow || def.ground[0]; g.fillRect(x0, y0, w, h);
  for (const q of m.patches) {
    if (q.x + q.rx + q.ry < x0 || q.x - q.rx - q.ry > x0 + w || q.y + q.rx + q.ry < y0 || q.y - q.rx - q.ry > y0 + h) continue;
    g.globalAlpha = pLow ? 0.12 : 0.55; g.fillStyle = q.c; g.beginPath(); g.ellipse(q.x, q.y, q.rx, q.ry, q.rot, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
  if (def.graves) { g.fillStyle = 'rgba(40,30,60,0.25)'; g.beginPath(); g.arc(def.graves[0], def.graves[1], def.graves[2] + 120, 0, TAU); g.fill(); }
  const rr = mulberry32(7 + tx0 * 131 + ty0 * 7);
  // 高地
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (!m.hgt[ty * GWm + tx]) continue;
    if (pHigh) { g.fillStyle = pHigh; g.fillRect(tx * T, ty * T, T, T); continue; }
    g.fillStyle = def.high; g.globalAlpha = 0.72; g.fillRect(tx * T, ty * T, T, T);
    g.globalAlpha = 0.12; g.fillStyle = rr() < 0.5 ? '#fff' : '#000';
    for (let k = 0; k < 3; k++) g.fillRect(tx * T + rr() * 34, ty * T + rr() * 34, 6 + rr() * 6, 4 + rr() * 4);
  }
  g.globalAlpha = 1;
  // 悬崖：高地格子的边缘，向南的一面画出岩壁
  const H = (x, y) => x >= 0 && y >= 0 && x < GWm && y < GHm ? m.hgt[y * GWm + x] : 0;
  const RP = (x, y) => x >= 0 && y >= 0 && x < GWm && y < GHm ? m.ramp[y * GWm + x] : 0;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (!H(tx, ty)) continue;
    const x = tx * T, y = ty * T, rp = RP(tx, ty);
    if (!H(tx, ty + 1) && !(rp && RP(tx, ty + 1))) {
      if (pCliff) { g.fillStyle = pCliff; g.fillRect(x, y + T, T, 18); }
      const grd = g.createLinearGradient(0, y + T, 0, y + T + 18);
      grd.addColorStop(0, pCliff ? 'rgba(40,30,20,0.35)' : '#4a3a28'); grd.addColorStop(1, 'rgba(40,30,20,0.15)');
      g.fillStyle = grd; g.fillRect(x, y + T, T, 18);
      g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 3; k++) g.fillRect(x + rr() * 32, y + T + 3 + rr() * 8, 5, 3);
      g.fillStyle = 'rgba(255,240,200,0.25)'; g.fillRect(x, y + T - 3, T, 3);
    }
    g.fillStyle = 'rgba(30,20,10,0.55)';
    if (!H(tx, ty - 1) && !(rp && RP(tx, ty - 1))) g.fillRect(x, y, T, 3);
    if (!H(tx - 1, ty) && !(rp && RP(tx - 1, ty))) g.fillRect(x, y, 3, T);
    if (!H(tx + 1, ty) && !(rp && RP(tx + 1, ty))) g.fillRect(x + T - 3, y, 3, T);
  }
  // 坡道（有贴图时边缘羽化，和周围地面自然过渡，不再是硬直角方块）
  let anyRamp = false;
  for (let ty = ty0; ty <= ty1 && !anyRamp; ty++) for (let tx = tx0; tx <= tx1; tx++) if (m.ramp[ty * GWm + tx]) { anyRamp = true; break; }
  if (pRamp && anyRamp) {
    const M = 16, lx = x0 - M, ly = y0 - M, LW = Math.ceil(w + M * 2), LH = Math.ceil(h + M * 2);
    const mk = document.createElement('canvas'); mk.width = LW; mk.height = LH;
    const mg = mk.getContext('2d'); mg.fillStyle = '#fff';
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) { const i = ty * GWm + tx; if (m.ramp[i] && !m.water[i]) mg.fillRect(tx * T - 2 - lx, ty * T - 2 - ly, T + 4, T + 4); }
    const lay = document.createElement('canvas'); lay.width = LW; lay.height = LH;
    const lg = lay.getContext('2d'); lg.filter = 'blur(5px)'; lg.drawImage(mk, 0, 0); lg.filter = 'none';
    lg.globalCompositeOperation = 'source-in'; lg.imageSmoothingEnabled = false;
    const im = artImg(`tiles/${tk}_ramp`), pr = lg.createPattern(im, 'repeat');
    pr.setTransform(new DOMMatrix().translate(-lx, -ly).scale(320 / im.width));
    lg.fillStyle = pr; lg.fillRect(0, 0, LW, LH);
    g.drawImage(lay, lx, ly);
  }
  if (!pRamp) for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const i = ty * GWm + tx;
    if (!m.ramp[i] || m.water[i]) continue;
    g.fillStyle = def.ramp; g.globalAlpha = 0.75; g.fillRect(tx * T, ty * T, T, T);
    g.globalAlpha = 0.25; g.strokeStyle = '#2a2014'; g.lineWidth = 2;
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(tx * T + 4, ty * T + 6 + k * 10); g.lineTo(tx * T + T - 4, ty * T + 6 + k * 10); g.stroke(); }
  }
  g.globalAlpha = 1;
  // 道路：土路 + 车辙；浅滩铺着卵石
  const inView = (x, y, pad) => x > x0 - pad && x < x0 + w + pad && y > y0 - pad && y < y0 + h + pad;
  if (def.roads) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    const path = rd => { g.beginPath(); rd.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); };
    for (const rd of def.roads) { if (!rd.some(([x, y]) => inView(x, y, 600))) continue; path(rd); g.strokeStyle = 'rgba(60,44,26,0.45)'; g.lineWidth = 40; g.stroke(); }
    for (const rd of def.roads) { if (!rd.some(([x, y]) => inView(x, y, 600))) continue; path(rd); g.strokeStyle = '#8a7350'; g.lineWidth = 30; g.stroke(); }
    for (const rd of def.roads) { if (!rd.some(([x, y]) => inView(x, y, 600))) continue; path(rd); g.strokeStyle = 'rgba(70,52,30,0.35)'; g.lineWidth = 2; g.setLineDash([14, 10]); for (const o of [-7, 7]) { g.save(); g.translate(o * 0.7, o * 0.7); g.stroke(); g.restore(); } g.setLineDash([]); }
    const rp = mulberry32(99);
    for (const [fx, fy] of def.fords || []) {
      if (!inView(fx, fy, 300)) continue;
      g.fillStyle = 'rgba(120,150,170,0.55)'; g.beginPath(); g.ellipse(fx, fy, 150, 110, 0, 0, TAU); g.fill();
      for (let k = 0; k < 70; k++) { const a = rp() * TAU, d = Math.sqrt(rp()) * 120; g.fillStyle = rp() < 0.5 ? '#a89a80' : '#7c7262'; g.beginPath(); g.ellipse(fx + Math.cos(a) * d, fy + Math.sin(a) * d * 0.8, 4 + rp() * 6, 3 + rp() * 4, 0, 0, TAU); g.fill(); }
    }
  }
  // 湖泊和河流：先画所有的岸，再画所有的水面，相连的水域不会出现接缝
  const lk = def.lakes.filter(([lx, ly, rx, ry]) => !(lx + rx + 12 < x0 || lx - rx - 12 > x0 + w || ly + ry + 12 < y0 || ly - ry - 12 > y0 + h));
  g.fillStyle = def.id === 'oasis' ? '#3a8a6a' : '#2a5a7a';
  for (const [lx, ly, rx, ry] of lk) { g.beginPath(); g.ellipse(lx, ly, rx + 12, ry + 12, 0, 0, TAU); g.fill(); }
  g.fillStyle = pWater || (def.id === 'oasis' ? '#3aa8b8' : '#3a7aa8');
  for (const [lx, ly, rx, ry] of lk) { g.beginPath(); g.ellipse(lx, ly, rx - 6, ry - 6, 0, 0, TAU); g.fill(); }
}
const tileOf = v => clamp(Math.floor(v / T), 0, GW - 1);
const tIdx = (x, y) => tileOf(y) * GW + tileOf(x);
const hAt = (x, y) => MAP.hgt[tIdx(x, y)];
const entH = o => o.fly ? 1 : hAt(o.x, o.y);
// 两个相邻格子之间能否直接走动：同一高度，或其中一个是坡道
function canStep(i, n) {
  if (MAP.water[n]) return false;
  return MAP.hgt[i] === MAP.hgt[n] || MAP.ramp[i] === 1 || MAP.ramp[n] === 1;
}
// 直线是否可以走过去（不跨悬崖、不下水）
function lineWalkable(x0, y0, x1, y1) {
  const d = hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 16);
  let prev = tIdx(x0, y0);
  for (let k = 1; k <= n; k++) {
    const q = k / n, cur = tIdx(x0 + (x1 - x0) * q, y0 + (y1 - y0) * q);
    if (cur !== prev) { if (!canStep(prev, cur)) return false; prev = cur; }
  }
  return true;
}
// 地形碰撞：移动后如果跨越了悬崖就退回，尝试沿单轴滑动
function tryMove(o, nx, ny) {
  nx = clamp(nx, 15, WORLD_W - 15); ny = clamp(ny, 15, WORLD_H - 15);
  const i0 = tIdx(o.x, o.y);
  const ok = (x, y) => { const i = tIdx(x, y); return i === i0 || canStep(i0, i); };
  if (ok(nx, ny)) { o.x = nx; o.y = ny; return true; }
  if (ok(nx, o.y)) { o.x = nx; return true; }
  if (ok(o.x, ny)) { o.y = ny; return true; }
  return false;
}

// ================= 状态 =================
let G = null;
const mapOf = id => MAPS.find(m => m.id === id) || MAPS[0];
function initState(mapId, diffId) {
  const map = mapOf(mapId), diff = diffOf(diffId);
  setWorld(map);
  MAP = buildMap(map); PORTALS = map.portals;
  MAP.decor = MAP.decor0.slice();
  const s = { matProd: 1, goldProd: 1, bldHp: 1, towerDmg: 1, towerSpd: 1, unitDmg: 1, unitHp: 1, unitCost: 1, foodProd: 1, loot: 1, recycle: COIN_TO_MAT,
    bldCost: 1, pdef: 0, mdef: 0, ls: 0, regen: 0, acc: 0, pspd: 1, aspd: 1, pickup: 100, lordDmg: 1 };
  const cx = (map.castle[0] + 2) * T, cy = (map.castle[1] + 2) * T;
  G = {
    map, s, diff, phase: 'prep', paused: false, speed: SETTINGS.speed, time: 0, wave: 1, prepT: Math.max(30, FIRST_PREP_TIME + diff.prep),
    res: { gold: Math.round(START_RES.gold * diff.res * map.res.gold), wood: Math.round(START_RES.wood * diff.res * map.res.wood), stone: Math.round(START_RES.stone * diff.res * map.res.stone), food: Math.round(START_RES.food * diff.res) },
    kills: 0, totalGold: 0, wasted: 0,
    lord: { x: cx, y: cy + 130, r: 16, hp: LORD.hp, face: 1, mdx: 0, mdy: 1, mode: 'sword', cds: { sword: 0, bow: 0, magic: 0 }, atkT: 0.3, spinT: 0, spinTick: 0,
      dead: false, respawnT: 0, walk: 0, lvl: 1, xp: 0, flash: 0, vx: 0, vy: 0, st: {} },
    buildings: [], tiles: new Int32Array(GW * GH), bmap: new Map(),
    units: [], enemies: [], projs: [], coins: [], particles: [], texts: [], effects: [], delayed: [], zones: [],
    smithy: {}, train: {}, buffT: 0, rally: { x: cx, y: cy + 200 }, follow: false, heroDead: {}, heroesSummoned: 0, auraMul: 1, fallen: {}, morale: null, group: [], barTab: 'build',
    cam: { x: cx, y: cy, z: 0.9 }, freeCam: false, shake: 0, hurtFlash: 0, slowmoT: 0,
    buildMode: null, sel: null, waveList: [], activePortals: [], spawnT: 0, spawnInterval: 1, uid: 0, announce: null, bossRef: null,
    flowDirty: true, routes: [], prodT: 0, lastWaveInfo: null, snap: null, hudRects: [],
    combo: 0, comboT: 0, bestCombo: 0, bossKills: 0, hitStop: 0, tut: null, awarded: false, gloryPaid: 0,
  };
  for (const k of SMITHY) G.smithy[k.id] = 0;
  for (const k of RECRUITABLE) G.train[k] = 1;
  allyFlowCache.clear();
  lastTop = lastPanel = '';
}
function newGame(mapId, diffId) {
  initState(mapId || SETTINGS.map, diffId || SETTINGS.diff);
  placeBuilding('castle', G.map.castle[0], G.map.castle[1], true);
  if (G.map.conquest) initConquest(); else { initCamps(); refreshCamps(false); setupWave(); }
  computeFlow();
  hideOverlay();
  buildBarInit();
  G.announce = { text: G.map.name, sub: G.map.conquest ? `难度：${G.diff.name} · 发展经济、组建军队，摧毁三个敌国的王城` : `难度：${G.diff.name} · 红色虚线是敌人的进攻路线 · 派兵摧毁地图上的敌方据点⛺可以消除增援`, t: 5 };
  if (SETTINGS.tutorial && !G.conq) G.tut = { i: 0, hx: G.lord.x, hy: G.lord.y };
  takeSnapshot();
  updateUI(true);
}

// ================= 存档 =================
// 只保存“准备阶段”的状态：战斗中保存/退出时，会回到本波开战前的那一刻
const SAVE_VER = 4;
const SAVE_SLOTS = ['auto', 'slot1', 'slot2', 'slot3'];
const SLOT_NAME = { auto: '自动存档', slot1: '存档 1', slot2: '存档 2', slot3: '存档 3' };
function serialize() {
  const h = G.lord, c = castle();
  return {
    v: SAVE_VER, at: Date.now(), map: G.map.id, diff: G.diff.id, s: { ...G.s }, wave: G.wave, prepT: Math.max(10, G.prepT),
    res: { ...G.res }, kills: G.kills, totalGold: G.totalGold, wasted: G.wasted, speed: G.speed,
    bossKills: G.bossKills, bestCombo: G.bestCombo, gloryPaid: G.gloryPaid, heroDead: JSON.parse(JSON.stringify(G.heroDead)), heroesSummoned: G.heroesSummoned, fallen: { ...G.fallen },
    lord: { x: h.dead && c ? c.x : h.x, y: h.dead && c ? c.y + c.w / 2 + 30 : h.y, lvl: h.lvl, xp: h.xp, hp: h.dead ? lordStats().hp : h.hp, mode: h.mode },
    buildings: G.buildings.map(b => ({ type: b.type, tx: b.tx, ty: b.ty, lvl: b.lvl, hp: b.hp, spent: { ...b.spent }, queue: b.queue.slice(), bonus: b.bonus })),
    units: G.units.filter(u => u.temp === undefined).map(u => ({ type: u.type, x: u.x, y: u.y, lvl: u.lvl, xp: u.xp, order: u.order && u.order.atk ? { x: u.order.x, y: u.order.y } : u.order, evo: u.evo || undefined })),
    smithy: { ...G.smithy }, train: { ...G.train }, rally: { ...G.rally }, follow: G.follow,
    waveList: G.waveList.map(w => ({ ...w })), activePortals: G.activePortals.slice(), campsDown: G.campsDown || 0,
    conq: G.conq ? saveConquest() : undefined, time: G.time,
    camps: (G.camps || []).map(c => ({ kind: c.kind, x: c.x, y: c.y, portal: c.portal, alive: c.alive, hp: c.ent ? c.ent.hp : c.hp, maxHp: c.ent ? c.ent.maxHp : c.maxHp })),
    cam: { x: G.cam.x, y: G.cam.y, z: G.cam.z },
  };
}
function takeSnapshot() {
  G.snap = serialize();
  if (SETTINGS.autosave) lsSet('save-auto', G.snap);
}
function loadGame(d) {
  if (!d) return false;
  if (d.v !== SAVE_VER) { toast('这是旧版本的存档，新版本无法读取'); return false; }
  initState(d.map, d.diff);
  Object.assign(G.s, d.s);
  Object.assign(G, { wave: d.wave, prepT: d.prepT, res: { ...d.res }, kills: d.kills, totalGold: d.totalGold, wasted: d.wasted, speed: d.speed || 1, follow: !!d.follow,
    bossKills: d.bossKills || 0, bestCombo: d.bestCombo || 0, gloryPaid: d.gloryPaid || 0, heroDead: { ...(d.heroDead || {}) }, heroesSummoned: d.heroesSummoned || 0, fallen: { ...(d.fallen || {}) } });
  Object.assign(G.smithy, d.smithy); Object.assign(G.train, d.train); G.rally = { ...d.rally };
  for (const o of d.buildings) {
    const b = placeBuilding(o.type, o.tx, o.ty, true);
    b.lvl = o.lvl; b.spent = { ...o.spent }; b.queue = (o.queue || []).slice(); b.bonus = o.bonus || 0;
    b.hp = Math.min(o.hp, bldMaxHp(b));
  }
  const h = G.lord; Object.assign(h, { x: d.lord.x, y: d.lord.y, lvl: d.lord.lvl, xp: d.lord.xp || 0, mode: d.lord.mode || 'sword' }); h.hp = Math.min(d.lord.hp, lordStats().hp);
  for (const o of d.units) { const u = addUnit(o.type, o.x, o.y, o.lvl, o.xp, o.evo); if (o.order) u.order = o.order; u.hp = unitStats(u).hp; }
  G.campsDown = d.campsDown || 0;
  G.time = d.time || 0;
  if (d.conq) loadConquest(d.conq);
  else { if (d.camps) { G.camps = d.camps.map(c => ({ ...c })); } else initCamps(); refreshCamps(false); }
  G.particles = []; G.effects = [];
  if (d.waveList && d.waveList.length) { G.waveList = d.waveList.map(w => ({ ...w })); G.activePortals = d.activePortals.slice(); G.flowDirty = true; }
  else if (!G.conq) setupWave();
  if (d.cam) { G.cam = { ...d.cam }; G.freeCam = false; }
  computeFlow();
  hideOverlay();
  buildBarInit();
  G.announce = { text: `第 ${G.wave} 波 · 准备阶段`, sub: `已读取存档 · ${G.map.name} · 难度：${G.diff.name}`, t: 3 };
  G.snap = serialize();
  updateUI(true);
  return true;
}
function saveInfo(d) {
  if (!d) return null;
  if (d.v !== SAVE_VER) return { text: '旧版本存档（无法读取）', when: '', old: true };
  const mp = mapOf(d.map), df = diffOf(d.diff);
  const t = new Date(d.at), pad = n => String(n).padStart(2, '0');
  return { text: `${mp.icon} ${mp.name} · ${df.icon} ${df.name} · 第 ${d.wave}/${MAX_WAVE} 波 · 领主 Lv${d.lord.lvl}`,
    when: `${t.getMonth() + 1}月${t.getDate()}日 ${pad(t.getHours())}:${pad(t.getMinutes())}` };
}

// ================= 属性计算 =================
// 防御减伤：伤害 × 100 / (100 + 防御)
const defMul = d => 100 / (100 + Math.max(-50, d));
const calcDmg = (p, m, pdef, mdef) => (p || 0) * defMul(pdef) + (m || 0) * defMul(mdef);
function lordStats() {
  const h = G.lord, md = LORD.modes[h.mode], L = h.lvl, s = G.s, sm = G.smithy;
  const mul = (1 + 0.12 * (L - 1)) * (1 + 0.15 * sm.lordWeapon) * s.lordDmg;
  return {
    hp: LORD.hp + 25 * (L - 1) + 30 * sm.lordArmor, patk: (md.patk || 0) * mul, matk: (md.matk || 0) * mul,
    pdef: LORD.pdef + 2 * (L - 1) + 8 * sm.lordArmor + s.pdef, mdef: LORD.mdef + 2 * (L - 1) + 6 * sm.lordArmor + s.mdef,
    cd: md.cd / (s.aspd * (1 + 0.04 * (L - 1))), range: md.range, acc: Math.min(1, (md.acc || 1) + s.acc), pspd: (md.pspd || 0) * s.pspd,
    ls: (md.ls || 0) + s.ls, regen: (LORD.regen + s.regen) * (h.st.poison ? 0.5 : 1), crit: LORD.crit, critMul: LORD.critMul, spd: LORD.spd * (h.st.chill ? 0.6 : 1),
    dodge: 0, on: md.onhit,
  };
}
const unitLvl = u => u.lvl;
const heroPerks = u => u.d.perks ? u.d.perks.filter(p => u.lvl >= p.lvl) : [];
// 士气只在战斗中影响士兵和英雄（领主和召唤物不受影响）
const moraleOf = u => fighting() && G.morale && !u.d.special ? MORALE[G.morale] : null;
function unitStats(u) {
  const d = u.d, s = G.s, sm = G.smithy, lv = u.lvl;
  const k = 1 + (d.hero ? 0.12 : 0.1) * (lv - 1);
  const tr = d.hero || d.special ? 1 : 1 + 0.15 * ((G.train[u.type] || 1) - 1);
  const buff = G.buffT > 0 ? 1.4 : 1, rage = u.rageT > 0, mo = moraleOf(u), stt = u.st || {};
  const mod = { patk: 0, matk: 0, pdef: 0, mdef: 0, ls: 0, regen: 0, crit: 0, acc: 0, range: 0, cdr: 0, aspd: 0, dodge: 0 };
  const ons = d.onhit ? [d.onhit] : [];
  for (const p of heroPerks(u)) { if (p.type === 'stat') for (const key in p.mod) mod[key] += p.mod[key]; else if (p.type === 'onhit') ons.push(p.on); }
  const atkMul = k * tr * s.unitDmg * buff * G.auraMul * (mo ? mo.atk : 1);
  return {
    hp: d.hp * k * tr * s.unitHp,
    patk: ((d.patk || 0) + mod.patk) * atkMul * (1 + 0.12 * sm.unitWeapon), matk: ((d.matk || 0) + mod.matk) * atkMul * (1 + 0.12 * sm.unitArcane),
    pdef: (d.pdef || 0) + (d.hero ? 3 : 2) * (lv - 1) + 8 * sm.unitArmor + s.pdef + mod.pdef,
    mdef: (d.mdef || 0) + (d.hero ? 3 : 2) * (lv - 1) + 5 * sm.unitArmor + s.mdef + mod.mdef,
    cd: d.cd / (s.aspd * buff * (rage ? 2 : 1) * (1 + mod.aspd) * (mo ? mo.aspd : 1)), range: d.range + (d.range > 100 ? mod.range : 0),
    acc: Math.min(1, (d.acc || 1) + s.acc + mod.acc), pspd: (d.pspd || 600) * s.pspd,
    ls: (d.ls || 0) + s.ls + (rage ? 0.3 : 0) + mod.ls, regen: ((d.regen || 0) + s.regen + (u.regenT > 0 ? 6 : 0) + mod.regen) * (stt.poison ? 0.5 : 1),
    crit: (d.crit || 0.05) + mod.crit, critMul: d.critMul || 2, spd: d.spd * (G.buffT > 0 ? 1.2 : 1) * (mo ? mo.spd : 1) * (stt.chill ? 0.6 : 1),
    dodge: Math.min(0.6, (d.dodge || 0) + mod.dodge), cdr: Math.min(0.6, mod.cdr), on: ons,
  };
}
const statsOf = a => a === G.lord ? lordStats() : unitStats(a);
const maxHpOf = a => statsOf(a).hp;
// 高低地修正
function hgMod(sx, sy, t) {
  const a = hAt(sx, sy), b = t.fly ? 1 : hAt(t.x, t.y);
  if (a > b) return { range: 1.15, acc: 0.1, dmg: 1.1 };
  if (a < b) return { range: 1, acc: -0.25, dmg: 1 };
  return { range: 1, acc: 0, dmg: 1 };
}
const rangeAt = (x, y, r) => r * (hAt(x, y) ? 1.15 : 1);

// ================= 建筑 =================
const bCost = (type, lvl) => { const c = BUILDINGS[type].cost[lvl - 1]; if (!c) return null; const o = {}; for (const k in c) o[k] = Math.ceil(c[k] * (k === 'gold' ? 1 : G.s.bldCost)); return o; };
const canPay = c => !!c && Object.keys(c).every(k => G.res[k] >= c[k]);
function pay(c) { for (const k in c) G.res[k] -= c[k]; }
const RES_ICON = { gold: '🪙', wood: '🪵', stone: '🪨', food: '🍖' };
const RES_KEYS = ['gold', 'wood', 'stone', 'food'];
const costStr = c => c ? Object.keys(c).map(k => `${RES_ICON[k]}${c[k]}`).join(' ') : '';
const castle = () => G.buildings.find(b => b.type === 'castle');
const castleLvl = () => (castle() || { lvl: 1 }).lvl;
const altar = () => G.buildings.find(b => b.type === 'altar');
const shrine = () => G.buildings.find(b => b.type === 'shrine');
const bldMaxHp = b => b.d.hp[b.lvl - 1] * G.s.bldHp;
const isSolid = b => b.d.solid !== false;
// 建筑的产出（主城按地图）
function bProd(b, k) {
  const L = b.lvl - 1;
  const mul = k === 'gold' ? G.s.goldProd : k === 'food' ? G.s.foodProd : G.s.matProd;
  if (b.type === 'castle') { const p = G.map.castleProd[k]; return p ? p[L] * mul : 0; }
  const v = b.d[k]; if (!v) return 0;
  return v[L] * (1 + b.bonus + synVal(b, 'prod')) * mul;
}

function canPlace(type, tx, ty) {
  const d = BUILDINGS[type], n = d.size;
  if (tx < 0 || ty < 0 || tx + n > GW || ty + n > GH) return '超出地图';
  const h0 = MAP.hgt[ty * GW + tx];
  for (let y = ty; y < ty + n; y++) for (let x = tx; x < tx + n; x++) {
    const i = y * GW + x;
    if (MAP.water[i]) return '不能建在水上';
    if (G.tiles[i]) return '这里已有建筑';
    if (MAP.hgt[i] !== h0) return '不能横跨悬崖';
  }
  const cx = (tx + n / 2) * T, cy = (ty + n / 2) * T;
  if (PORTALS.some(p => hypot(p.x - cx, p.y - cy) < 170)) return '离刷怪口太近';
  if (aliveCamps().some(c => hypot(c.x - cx, c.y - cy) < CAMP.keepAway)) return '离敌方据点太近';
  if (G.conq && liveFacs().some(f => f.blds.some(b => hypot(b.x - cx, b.y - cy) < CONQ.keepAway * T + b.eb.size * T / 2))) return '离敌国太近';
  return null;
}
function placeBuilding(type, tx, ty, free) {
  const d = BUILDINGS[type], n = d.size;
  const b = { id: ++G.uid, type, d, tx, ty, size: n, x: (tx + n / 2) * T, y: (ty + n / 2) * T, w: n * T, lvl: 1, hp: 0, t: rand(0, 0.5),
    queue: [], trainT: 0, flash: 0, popT: 0, prodAcc: { gold: 0, wood: 0, stone: 0, food: 0 }, bonus: 0, spent: free ? {} : { ...bCost(type, 1) } };
  b.hp = bldMaxHp(b);
  for (let y = ty; y < ty + n; y++) for (let x = tx; x < tx + n; x++) G.tiles[y * GW + x] = b.id;
  // 清掉占地上的花草树石
  MAP.decor = MAP.decor.filter(o => !(o.x >= tx * T - 4 && o.x < (tx + n) * T + 4 && o.y >= ty * T - 4 && o.y < (ty + n) * T + 8));
  if (d.near || d.nearWater) b.bonus = nearBonus(type, b.x, b.y);
  G.buildings.push(b); G.bmap.set(b.id, b);
  G.flowDirty = true; G.synDirty = true;
  return b;
}
function nearBonus(type, x, y) {
  const d = BUILDINGS[type];
  if (d.nearWater) {
    let n = 0; const cx = tileOf(x), cy = tileOf(y);
    for (let ty = cy - 4; ty <= cy + 4; ty++) for (let tx = cx - 4; tx <= cx + 4; tx++) if (tx >= 0 && ty >= 0 && tx < GW && ty < GH && MAP.water[ty * GW + tx]) n++;
    return Math.min(d.nearMax, n * d.nearWater);
  }
  const cnt = MAP.decor.filter(o => d.near.includes(o.icon) && hypot(o.x - x, o.y - y) < 170).length;
  return Math.min(d.nearMax || 1, cnt * d.nearPer);
}
// ---------- 建筑联动：相邻（最多隔 1 格）的建筑互相加成，规则在 data.js 的 SYNERGY ----------
function bldGap(a, b) {
  const gx = Math.max(0, b.tx - (a.tx + a.size), a.tx - (b.tx + b.size)), gy = Math.max(0, b.ty - (a.ty + a.size), a.ty - (b.ty + b.size));
  return Math.max(gx, gy);
}
function synOf(type, rect, list) {
  const s = { prod: 0, dmg: 0, spd: 0, train: 0, lvl: 0, list: [], partners: [] };
  for (const r of SYNERGY) {
    if (r.a !== type) continue;
    const ps = list.filter(o => o !== rect && o.type === r.b && bldGap(rect, o) <= 1);
    if (!ps.length) continue;
    s[r.stat] += Math.min(r.max, ps.length * r.per); s.list.push(r); s.partners.push(...ps);
  }
  return s;
}
function computeSynergy() { G.synDirty = false; for (const b of G.buildings) b.syn = synOf(b.type, b, G.buildings); }
const synVal = (b, k) => b.syn ? b.syn[k] : 0;
function removeBuilding(b) {
  for (let y = b.ty; y < b.ty + b.size; y++) for (let x = b.tx; x < b.tx + b.size; x++) if (G.tiles[y * GW + x] === b.id) G.tiles[y * GW + x] = 0;
  G.buildings = G.buildings.filter(o => o !== b); G.bmap.delete(b.id);
  if (G.sel && G.sel.id === b.id) G.sel = null;
  G.flowDirty = true; G.synDirty = true;
}
function destroyBuilding(b) {
  burst(b.x, b.y, '#a08a6a', 30, 260); burst(b.x, b.y, '#ff8a3a', 14, 200);
  G.shake = Math.max(G.shake, b.type === 'castle' ? 30 : 6); sfx(b.size >= 2 ? 'crash' : 'smallboom');
  G.effects.push({ kind: 'flash', x: b.x, y: b.y, r: b.w, t: 0, life: 0.15 });
  burst(b.x, b.y, '#5a4a3a', b.size * 8, 200);
  addText(b.x, b.y - 20, `${bName(b)} 被摧毁！`, '#ff6a4a', 1.2);
  if (b.type === 'castle') { b.hp = 0; showEnd(false); return; }
  removeBuilding(b);
}
function bName(b) { return b.d.names ? b.d.names[b.lvl - 1] : b.d.name; }
function buildingAt(wx, wy) {
  if (wx < 0 || wy < 0 || wx >= WORLD_W || wy >= WORLD_H) return null;
  const id = G.tiles[tIdx(wx, wy)];
  return id ? G.bmap.get(id) : null;
}
function solidBuildingAt(wx, wy) { const b = buildingAt(wx, wy); return b && isSolid(b) ? b : null; }
function edgeDist(b, x, y) {
  const x0 = b.tx * T, y0 = b.ty * T, x1 = x0 + b.w, y1 = y0 + b.w;
  return hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1));
}
function hurtBuilding(b, dmg) {
  if (!G.bmap.has(b.id) || G.phase === 'over') return;
  b.hp -= dmg; b.flash = 0.1;
  if (b.hp <= 0) destroyBuilding(b);
}
// 每波开战时要消耗的粮食：士兵按体型，英雄固定
function foodNeed() {
  let n = 0;
  for (const u of G.units) if (!u.dead && u.temp === undefined && !u.d.special) n += u.d.hero ? FOOD_UPKEEP.hero : u.d.pop * FOOD_UPKEEP.pop;
  for (const b of G.buildings) for (const q of b.queue) n += UNITS[q].pop * FOOD_UPKEEP.pop;
  return n;
}
const unitCost = type => Math.max(5, Math.round(UNITS[type].cost * G.s.unitCost));
const heroCost = type => Math.round(HEROES[type].cost * G.s.unitCost);
const trainCost = type => Math.round(UNITS[type].cost * 1.5 * G.train[type]);
const smithyCost = (k, lvl) => { const o = {}; for (const r in k.cost) o[r] = Math.round(k.cost[r] * lvl); return o; };
function repairCost(b) {
  const miss = 1 - b.hp / bldMaxHp(b);
  if (miss <= 0.001) return null;
  const c = {};
  for (let l = 1; l <= b.lvl; l++) { const k = b.d.cost[l - 1] || { wood: 200, stone: 200 }; for (const r in k) if (r !== 'gold') c[r] = (c[r] || 0) + k[r]; }
  for (const r in c) c[r] = Math.max(1, Math.ceil(c[r] * miss * 0.35));
  return c;
}
const heroesAlive = () => G.units.filter(u => u.d.hero && !u.dead);
const heroSlots = () => { const a = altar(); return a ? a.d.slots[a.lvl - 1] : 0; };
// 复活价格 = (原价 + 能力估值) × 130%，估值 = 已升等级 + 已学技能
function heroValue(type, lvl) {
  let v = 0; for (let l = 1; l < lvl; l++) v += HERO_LVL_VALUE(l);
  return v + HEROES[type].perks.filter(p => lvl >= p.lvl).length * PERK_VALUE;
}
function reviveCost(type) {
  const sn = G.heroDead[type]; if (!sn) return 0;
  const sh = shrine(), disc = sh ? sh.d.discount[sh.lvl - 1] : 0;
  return Math.round((heroCost(type) + heroValue(type, sn.lvl)) * REVIVE_MUL * (1 - disc));
}

// ================= 寻路 =================
// 敌人：流场从主城反向扩散，城墙按等级增加代价（敌人会权衡绕路还是拆墙），只能经坡道上下高地
let dist = new Float64Array(GW * GH);
const heap = { a: [],
  push(d, i) { const a = this.a; a.push([d, i]); let k = a.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (a[p][0] <= a[k][0]) break; [a[p], a[k]] = [a[k], a[p]]; k = p; } },
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === k) break; [a[m], a[k]] = [a[k], a[m]]; k = m; } } return top; } };
function tileCost(i) {
  const id = G.tiles[i];
  if (!id) return 1;
  const b = G.bmap.get(id);
  if (!b || !isSolid(b) || b.type === 'castle') return 1;
  if (b.type === 'wall') return 5 + b.lvl * 5;
  return 14;
}
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
function blocksDiag(i) { if (MAP.water[i]) return true; const id = G.tiles[i]; if (!id) return false; const b = G.bmap.get(id); return !!b && isSolid(b); }
// 相邻格（含对角）能否通行
function stepOK(i, n, dx, dy, x, y, bld) {
  if (!canStep(i, n)) return false;
  if (dx && dy) {
    const a = y * GW + x + dx, b = (y + dy) * GW + x;
    if (!canStep(i, a) || !canStep(i, b) || !canStep(a, n) || !canStep(b, n)) return false;
    if (bld && (blocksDiag(a) || blocksDiag(b))) return false;
  }
  return true;
}
function computeFlow() {
  dist.fill(Infinity);
  heap.a.length = 0;
  const c = castle();
  G.flowDirty = false;
  if (!c) return;
  for (let y = c.ty; y < c.ty + c.size; y++) for (let x = c.tx; x < c.tx + c.size; x++) { dist[y * GW + x] = 0; heap.push(0, y * GW + x); }
  while (heap.a.length) {
    const [d, i] = heap.pop();
    if (d > dist[i] + 1e-3) continue;
    const x = i % GW, y = (i / GW) | 0, enter = tileCost(i);
    for (const [dx, dy, w] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const n = ny * GW + nx;
      if (!stepOK(i, n, dx, dy, x, y, true)) continue;
      const nd = d + enter * w;
      if (nd < dist[n]) { dist[n] = nd; heap.push(nd, n); }
    }
  }
  computeRoutes();
}
function nextTile(i) {
  const x = i % GW, y = (i / GW) | 0;
  let best = -1, bd = dist[i];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
    const n = ny * GW + nx;
    if (!stepOK(i, n, dx, dy, x, y, true)) continue;
    if (dist[n] < bd) { bd = dist[n]; best = n; }
  }
  return best;
}
function computeRoutes() {
  G.routes = G.activePortals.map(pi => {
    const p = PORTALS[pi], pts = [[p.x, p.y]];
    let i = tIdx(p.x, p.y);
    for (let k = 0; k < 400; k++) {
      const n = nextTile(i); if (n < 0) break;
      i = n; pts.push([(n % GW) * T + T / 2, ((n / GW) | 0) * T + T / 2]);
      if (dist[n] === 0) break;
    }
    return { pi, pts };
  });
}
// 友军（以及追击友军的敌人）：到任意目标格的流场，只考虑地形，缓存最近用过的目标
const allyFlowCache = new Map();
function allyFlow(target) {
  let f = allyFlowCache.get(target);
  if (f) { allyFlowCache.delete(target); allyFlowCache.set(target, f); return f; }
  f = new Float64Array(GW * GH).fill(Infinity);
  const q = [target]; f[target] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % GW, y = (i / GW) | 0;
    for (const [dx, dy, w] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const n = ny * GW + nx;
      if (!stepOK(i, n, dx, dy, x, y, false)) continue;
      const nd = f[i] + w;
      if (nd < f[n]) { f[n] = nd; q.push(n); }
    }
  }
  allyFlowCache.set(target, f);
  if (allyFlowCache.size > 40) allyFlowCache.delete(allyFlowCache.keys().next().value);
  return f;
}
function allyNext(from, target) {
  const f = allyFlow(target), x = from % GW, y = (from / GW) | 0;
  let best = -1, bd = f[from];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
    const n = ny * GW + nx;
    if (!stepOK(from, n, dx, dy, x, y, false)) continue;
    if (f[n] < bd) { bd = f[n]; best = n; }
  }
  return best;
}
// 走向目标点：能直走就直走，否则顺着流场绕到坡道
function walkTo(o, tx, ty, sp, dt) {
  if (o.fly || o.d && o.d.fly) {
    const dx = tx - o.x, dy = ty - o.y, l = hypot(dx, dy);
    if (l > 1) { const s = Math.min(l, sp * dt); o.x += dx / l * s; o.y += dy / l * s; }
    return;
  }
  o.lwT = (o.lwT || 0) - dt;
  const tt = tIdx(tx, ty);
  if (o.lwT <= 0 || o.lwTile !== tt) { o.lwT = 0.3; o.lwTile = tt; o.lwOk = lineWalkable(o.x, o.y, tx, ty); }
  let gx = tx, gy = ty;
  if (!o.lwOk) {
    const n = allyNext(tIdx(o.x, o.y), tt);
    if (n >= 0) { gx = (n % GW) * T + T / 2; gy = ((n / GW) | 0) * T + T / 2; }
  }
  const dx = gx - o.x, dy = gy - o.y, l = hypot(dx, dy);
  if (l > 1) { const s = Math.min(l, sp * dt); tryMove(o, o.x + dx / l * s, o.y + dy / l * s); }
}

// ================= 征服大陆 =================
const isLive = () => !!G && (G.phase === 'prep' || G.phase === 'battle' || G.phase === 'war');
const canBuild = () => G.phase === 'prep' || G.phase === 'war';
const fighting = () => G.phase === 'battle' || G.phase === 'war';
const liveFacs = () => (G.facs || []).filter(f => f.alive);
const facTech = f => Math.min(8, 1 + Math.floor((G.time - (f.born || 0)) / 180));
const STANCE = {
  grow: { name: '发育中', color: '#9fe07a', desc: '还在发展经济，暂时不会进攻' },
  defend: { name: '龟缩防守', color: '#8fd4ff', desc: '你比它强很多：多造箭塔，攒满大军才出击' },
  balanced: { name: '伺机进攻', color: '#ffd76a', desc: '实力相当：兵力追上你就出击' },
  raid: { name: '骚扰掠夺', color: '#ff7a5a', desc: '你比它弱：频繁派小队偷袭你的经济建筑' },
};
function initConquest() {
  G.conq = true; G.phase = 'war'; G.facs = []; G.wave = 1; G.upkeepT = CONQ.upkeep; G.aiT = 0; G.morale = 'fed'; G.pings = [];
  G.map.cities.forEach((ct, k) => {
    const f = newFac(ct.fac, k, ct.at);
    autoBuild(f, 'barracks'); autoBuild(f, 'mine'); autoBuild(f, 'lumber'); autoBuild(f, 'tower'); autoBuild(f, 'tower');
    for (let i = 0; i < CONQ.army0[k]; i++) trainEUnit(f, pickEType(f));
    spawnKing(f);
  });
  initWilds();
}
// 敌国士兵等级：开局就比玩家高，随科技继续提升
const facLvl = f => CONQ.lvl0[f.k] + facTech(f) - 1;
function levelUp(e, lvl) {
  e.lvl = lvl; const kh = 1 + CONQ.lvlHp * (lvl - 1), kd = 1 + CONQ.lvlDmg * (lvl - 1);
  e.hp *= kh; e.maxHp *= kh; e.patk *= kd; e.matk *= kd; e.pdef += CONQ.lvlDef * lvl; e.mdef += CONQ.lvlDef * lvl;
  e.gold *= 1 + 0.1 * (lvl - 1); e.xp *= 1 + 0.1 * (lvl - 1);
  return e;
}
// 国王：守在王城旁的首领，活着时王城减伤
function spawnKing(f, hpFrac) {
  const K = KINGS[f.id], B = ENEMIES[K.base], tech = facTech(f);
  const e = spawnEnemy(K.base, f.hq.x + (f.rally.x - f.hq.x) * 0.45, f.hq.y + (f.rally.y - f.hq.y) * 0.45, false);
  e.d = Object.assign({}, B, K, { boss: true, big: true, siege: 3 });
  const k = (1 + 0.15 * (tech - 1)) * G.diff.ehp, kd = (1 + 0.08 * (tech - 1)) * G.diff.edmg;
  e.maxHp = K.hp * k; e.hp = e.maxHp * (hpFrac || 1); e.patk = (K.patk || 0) * kd; e.matk = (K.matk || 0) * kd;
  e.pdef = K.pdef + tech * 3; e.mdef = K.mdef + tech * 3; e.regen = K.regen * k; e.ls = K.ls || 0; e.spd = K.spd; e.r = K.r;
  if (ART['enemies/king_' + f.id]) e.d.art = 'king_' + f.id;
  e.gold = K.gold; e.xp = XP_OF(K.gold, false, true) * 2; e.king = f; e.fac = f; e.abT = 4;
  e.home = { x: e.x, y: e.y, camp: null };
  f.king = e;
  return e;
}
function initWilds() {
  G.lairs = (G.map.lairs || []).map((l, i) => ({ i, kind: l.kind, x: (l.at[0] + 0.5) * T, y: (l.at[1] + 0.5) * T, alive: true }));
  G.relics = (G.map.relics || []).map((r, i) => ({ i, kind: r.kind, x: (r.at[0] + 0.5) * T, y: (r.at[1] + 0.5) * T }));
  for (const l of G.lairs) spawnLair(l);
}
function spawnLair(l) {
  const L = LAIRS[l.kind]; let n = 0;
  for (const [t, c] of L.units) for (let i = 0; i < c; i++) {
    const a = n++ * 2.4, d = 30 + n * 9, e = spawnEnemy(t, l.x + Math.cos(a) * d, l.y + Math.sin(a) * d, Math.random() < 0.15);
    if (e.boss) { e.lairBoss = true; e.abT = 4; }
    levelUp(e, L.lvl); e.lair = l; e.home = { x: e.x, y: e.y, camp: null };
  }
}
function lairCleared(l) {
  if (!l.alive || G.enemies.some(e => e.lair === l && !e.dead)) return;
  l.alive = false;
  const L = LAIRS[l.kind], got = [], k = 1 + 0.05 * (G.wave - 1);
  for (const r in L.loot) { const v = Math.round(L.loot[r] * k); G.res[r] += v; got.push(RES_ICON[r] + v); }
  let bn = null;
  if (L.boon) { bn = pick(BOONS); applyBoon(bn); }
  addText(l.x, l.y - 40, `清剿${L.name} ${got.join(' ')}`, '#ffd76a', 1.2);
  G.announce = { text: `${L.icon} ${L.name} 已清剿`, sub: got.join('  ') + (bn ? ` · 获得天赋 ${bn.icon}${bn.name}` : ''), t: 3 };
  sfx('tut');
}
function updateRelics() {
  const h = G.lord; if (h.dead || !G.relics) return;
  for (const r of G.relics) {
    if (r.taken || hypot(r.x - h.x, r.y - h.y) > 46) continue;
    r.taken = true; const R = RELICS[r.kind], got = [];
    if (R.loot) for (const k in R.loot) { const v = Math.round(rand(R.loot[k][0], R.loot[k][1]) * (1 + 0.1 * (G.wave - 1))); G.res[k] += v; got.push(RES_ICON[k] + v); }
    if (R.boon) { const bn = pick(BOONS); applyBoon(bn); got.push(`天赋 ${bn.icon}${bn.name}`); }
    if (R.heal) { h.hp = lordStats().hp; for (const u of G.units) if (!u.dead && hypot(u.x - h.x, u.y - h.y) < 400) u.hp = unitStats(u).hp; got.push('附近友军生命回满'); }
    if (R.xp) { giveXp(h, R.xp * (1 + 0.2 * (G.wave - 1)), h.x, h.y); got.push('经验'); }
    burst(r.x, r.y, '#ffd76a', 24, 220); sfx('coin');
    G.announce = { text: `${R.icon} ${R.name}`, sub: got.join('  '), t: 2.6 };
  }
  G.relics = G.relics.filter(r => !r.taken);
}
function drawWilds(vis) {
  if (!G.conq) return;
  for (const r of G.relics || []) if (vis(r.x, r.y)) {
    ctx.fillStyle = 'rgba(255,215,106,' + (0.25 + 0.15 * Math.sin(G.time * 3 + r.i)) + ')'; ctx.beginPath(); ctx.arc(r.x, r.y, 26, 0, TAU); ctx.fill();
    drawArt('relics/' + r.kind, RELICS[r.kind].icon, r.x, r.y - 4, 30, false, false, 1.4);
  }
  for (const l of G.lairs || []) if (vis(l.x, l.y)) {
    const L = LAIRS[l.kind];
    ctx.globalAlpha = l.alive ? 1 : 0.35; drawArt('lairs/' + l.kind, L.icon, l.x, l.y, 60, false, false, 1.6); ctx.globalAlpha = 1;
    ctx.font = 'bold 12px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = l.alive ? '#ffb070' : '#9a9a9a'; ctx.fillText(l.alive ? `${L.name} Lv${L.lvl}` : `${L.name}（已清剿）`, l.x, l.y + 34);
  }
}
function newFac(id, k, at) {
  const F = FACTIONS[id];
  const f = { id, k, name: F.name, icon: F.icon, color: F.color, res: { ...F.res }, alive: true, blds: [], stance: 'grow', attackT: CONQ.grace[k], buildT: 0, trainT: 0, sent: 0, power: 0, ratio: 1, born: 0, alert: null };
  const hq = addEBld(f, 'hq', at[0], at[1]);
  const dx = WORLD_W / 2 - hq.x, dy = WORLD_H / 2 - hq.y, l = hypot(dx, dy) || 1;
  f.x = hq.x; f.y = hq.y; f.rally = { x: hq.x + dx / l * 340, y: hq.y + dy / l * 340 };
  G.facs.push(f);
  return f;
}
function addEBld(f, kind, tx, ty, hp) {
  const D = EBLD[kind], n = D.size, tech = facTech(f), dm = (1 + (G.wave - 1) * 0.08) * G.diff.edmg;
  const mh = D.hp * (1 + 0.12 * (tech - 1)) * G.diff.ehp;
  const e = { id: ++G.uid, type: 'eb_' + kind, d: { name: f.name + '·' + D.name, icon: D.icon, color: f.color }, eb: { kind, fac: f, tx, ty, size: n },
    x: (tx + n / 2) * T, y: (ty + n / 2) * T, r: n * T * 0.42, hp: hp || mh, maxHp: mh, spd: 0,
    patk: D.shoot ? D.shoot.patk * dm : 0, matk: 0, pdef: 30 + tech * 5, mdef: 20 + tech * 5, regen: 0, ls: 0, gold: 0, xp: 40 + n * 25,
    elite: false, boss: false, fly: false, st: {}, big: true, flash: 0, kbx: 0, kby: 0, slowT: 0, atkT: 1, face: 1, dead: false, vx: 0, vy: 0,
    target: null, retarget: 0, abT: 0, abI: 0, state: null, stT: 0, wob: 0 };
  f.blds.push(e); G.enemies.push(e);
  if (kind === 'hq') f.hq = e;
  return e;
}
// 在王城周围找一块能放建筑的空地
function ebSpot(f, n) {
  const h0 = MAP.hgt[tIdx(f.x, f.y)], R1 = 10 + f.blds.length;
  for (let k = 0; k < 80; k++) {
    const a = rand(0, TAU), d = rand(4, R1) * T, tx = Math.round((f.x + Math.cos(a) * d) / T - n / 2), ty = Math.round((f.y + Math.sin(a) * d) / T - n / 2);
    if (tx < 2 || ty < 2 || tx + n > GW - 2 || ty + n > GH - 2) continue;
    let ok = true;
    for (let y = ty - 1; y <= ty + n && ok; y++) for (let x = tx - 1; x <= tx + n; x++) { const i = y * GW + x; if (MAP.water[i] || MAP.ramp[i] || MAP.hgt[i] !== h0 || G.tiles[i]) { ok = false; break; } }
    if (!ok) continue;
    if (f.blds.some(b => tx < b.eb.tx + b.eb.size + 1 && b.eb.tx < tx + n + 1 && ty < b.eb.ty + b.eb.size + 1 && b.eb.ty < ty + n + 1)) continue;
    if (hypot((tx + n / 2) * T - f.rally.x, (ty + n / 2) * T - f.rally.y) < 120) continue;
    return [tx, ty];
  }
  return null;
}
function autoBuild(f, kind) { const sp = ebSpot(f, EBLD[kind].size); return sp ? addEBld(f, kind, sp[0], sp[1]) : null; }
const facPay = (f, c) => Object.keys(c).every(k => f.res[k] >= c[k]);
function pickEType(f) {
  const tech = facTech(f), list = FACTIONS[f.id].units.filter(([, t]) => t <= tech);
  // 越高级的兵越晚出现，出现后占比逐渐提高
  let s = 0; const w = list.map(([, t]) => { const v = 1 + (tech - t) * 0.6; s += v; return v; });
  let r = Math.random() * s; for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i][0]; }
  return list[0][0];
}
function trainEUnit(f, type) {
  const bs = f.blds.filter(b => b.eb.kind === 'barracks'); if (!bs.length || G.enemies.length >= MAX_ENEMIES) return null;
  const b = pick(bs), tech = facTech(f);
  const e = spawnEnemy(type, b.x + rand(-30, 30), b.y + b.eb.size * T / 2 + 16, Math.random() < (tech - 2) * 0.03);
  e.fac = f; e.home = { x: f.rally.x + rand(-110, 110), y: f.rally.y + rand(-110, 110), camp: null };
  return levelUp(e, facLvl(f));
}
const eUnitVal = e => e.king ? e.maxHp / 6 : (ENEMIES[e.type] ? ENEMIES[e.type].gold : 3) * EUNIT_COST * (e.elite ? 3 : 1) * (1 + 0.08 * (G.wave - 1)) * (1 + 0.12 * ((e.lvl || 1) - 1));
function playerPower() {
  let p = 100 + G.lord.lvl * 30;
  for (const u of G.units) { if (u.dead || u.temp !== undefined) continue; p += (u.d.hero ? heroCost(u.type) : UNITS[u.type] ? UNITS[u.type].cost : 30) * (1 + 0.12 * (u.lvl - 1)); }
  for (const b of G.buildings) if (b.d.attack && b.type !== 'castle') p += 120 * b.lvl;
  return p;
}
function facPower(f, army) {
  let p = 0;
  for (const e of army) p += eUnitVal(e);
  for (const b of f.blds) if (EBLD[b.eb.kind].shoot) p += 150;
  return p;
}
function updateConquest(dt) {
  G.wave = Math.min(MAX_WAVE, 1 + Math.floor(G.time / CONQ.eraTime));
  // 军饷：士兵和英雄定期吃饭
  G.upkeepT -= dt;
  if (G.upkeepT <= 0) {
    G.upkeepT = CONQ.upkeep;
    const need = foodNeed(), have = Math.floor(G.res.food);
    if (!need || have >= need) { G.res.food -= need; G.morale = 'fed'; }
    else { G.res.food = 0; G.morale = have >= need * 0.5 ? 'low' : 'starve'; toast(`粮食不够！军队${MORALE[G.morale].name}`); }
  }
  for (const p of G.pings) p.t -= dt;
  G.pings = G.pings.filter(p => p.t > 0);
  updateRelics();
  G.aiT -= dt; if (G.aiT > 0) return;
  G.aiT = CONQ.tick;
  const pp = playerPower(); G.myPower = pp;
  for (const f of liveFacs()) aiTick(f, pp, CONQ.tick);
}
function aiTick(f, pp, dt) {
  const tech = facTech(f), F = FACTIONS[f.id];
  for (const b of f.blds) { const P = EBLD[b.eb.kind].prod; if (P) for (const k in P) f.res[k] += P[k] * F.income * (1 + 0.1 * (tech - 1)) * dt; }
  if (f.alert) { f.alert.t -= dt; if (f.alert.t <= 0) f.alert = null; }
  const army = G.enemies.filter(e => e.fac === f && !e.dead), home = army.filter(e => e.home && !e.king);
  // 国王随科技成长
  if (f.king && !f.king.dead && f.king.tech !== tech) { const K = KINGS[f.id], fr = f.king.hp / f.king.maxHp; f.king.tech = tech; f.king.maxHp = K.hp * (1 + 0.15 * (tech - 1)) * G.diff.ehp; f.king.hp = f.king.maxHp * fr; }
  f.power = facPower(f, army); f.ratio = pp / Math.max(1, f.power); f.army = army.length - (f.king && !f.king.dead ? 1 : 0);
  f.stance = G.time < CONQ.grace[f.k] ? 'grow' : f.ratio > CONQ.defendAt ? 'defend' : f.ratio < CONQ.raidAt ? 'raid' : 'balanced';
  const cnt = k => f.blds.filter(b => b.eb.kind === k).length;
  const cap = CONQ.army0[f.k] + tech * 4 + (f.stance === 'defend' ? 6 : 0);
  // 建造：先兵营，再经济，再箭塔
  f.buildT -= dt;
  if (f.buildT <= 0) {
    const eco = ['mine', 'lumber', 'quarry'].sort((a, b) => cnt(a) - cnt(b))[0], ecoN = cnt('mine') + cnt('lumber') + cnt('quarry');
    const towerWant = (f.stance === 'defend' ? 3 : 1) + Math.floor(tech * (f.stance === 'defend' ? 1.2 : 0.6));
    const want = !cnt('barracks') ? 'barracks' : ecoN < 1 + tech ? eco : cnt('tower') < towerWant ? 'tower' : cnt('barracks') < 1 + Math.floor(tech / 3) ? 'barracks' : null;
    if (want && facPay(f, EBLD[want].cost)) {
      const sp = ebSpot(f, EBLD[want].size);
      if (sp) { for (const k in EBLD[want].cost) f.res[k] -= EBLD[want].cost[k]; addEBld(f, want, sp[0], sp[1]); f.buildT = 25; }
    }
  }
  // 造兵：只花金币
  f.trainT -= dt;
  if (cnt('barracks') && army.length < cap && f.trainT <= 0) {
    const t = pickEType(f), c = ENEMIES[t].gold * EUNIT_COST;
    if (f.res.gold >= c) { f.res.gold -= c; trainEUnit(f, t); f.trainT = 7 / cnt('barracks'); }
  }
  // 进攻：按双方实力决定
  f.attackT -= dt;
  if (f.stance !== 'grow' && f.attackT <= 0) {
    const pArmy = G.units.filter(u => !u.dead && u.temp === undefined).length;
    let n = 0, goal = 'castle';
    if (f.stance === 'raid' && home.length >= 4) { n = Math.ceil(home.length * 0.6); goal = 'eco'; }
    else if (f.stance === 'balanced' && home.length >= Math.max(6, pArmy * 0.8)) n = Math.ceil(home.length * 0.8);
    else if (f.stance === 'defend' && home.length >= cap * 0.9) n = Math.ceil(home.length * 0.5);
    else if (f.attackT < -180 && home.length >= 6) n = Math.ceil(home.length * 0.6);
    if (n) launchAttack(f, home.slice(0, n), goal);
  }
}
function launchAttack(f, units, goal) {
  let tgt = castle();
  if (goal === 'eco') {
    let bd = Infinity;
    for (const b of G.buildings) if (b.d.cat === 'eco') { const d = hypot(b.x - f.x, b.y - f.y); if (d < bd) { bd = d; tgt = b; } }
  }
  if (!tgt) return;
  for (const e of units) { delete e.home; e.goal = { id: tgt.id, x: tgt.x, y: tgt.y, tile: tIdx(tgt.x, tgt.y) }; e.retarget = 0; }
  f.attackT = rand(CONQ.attackCd[0], CONQ.attackCd[1]) * (f.stance === 'raid' ? 0.6 : 1);
  f.sent++;
  const ax = units.reduce((s, e) => s + e.x, 0) / units.length, ay = units.reduce((s, e) => s + e.y, 0) / units.length;
  G.pings.push({ x: ax, y: ay, t: 8, color: f.color });
  G.announce = { text: `⚠ ${f.icon} ${f.name} 来袭`, sub: `${units.length} 名敌军正冲向你的${tgt.type === 'castle' ? '主城' : BUILDINGS[tgt.type].name} · ${STANCE[f.stance].name}`, t: 3.5, boss: true };
  sfx('horn');
}
function kingSlain(e) {
  const f = e.king; f.king = null;
  const v = Math.round(e.gold * 2); G.res.wood += v; G.res.stone += v;
  G.announce = { text: `👑 ${e.d.name} 被击败！`, sub: `${f.icon}${f.name}的王城失去了庇护 · 🪵${v} 🪨${v}`, t: 4, boss: true };
}
// 敌国单位被打时，附近的守军会赶过来支援
function facAlert(f, x, y) { if (f && f.alive) f.alert = { x, y, t: 12 }; }
const homeOf = e => e.fac && e.fac.alert && hypot(e.fac.alert.x - e.home.x, e.fac.alert.y - e.home.y) < 1500 ? e.fac.alert : e.home;
function updateStatic(e, dt) {
  e.kbx = e.kby = 0; e.vx = e.vy = 0;
  const S = e.camp ? CAMPS[e.camp.kind].shoot : EBLD[e.eb.kind].shoot;
  if (!S || e.atkT > 0) return;
  const h = G.lord;
  let best = null, bd = S.range * S.range;
  if (!h.dead) { const d2 = (h.x - e.x) ** 2 + (h.y - e.y) ** 2; if (d2 < bd) { bd = d2; best = h; } }
  for (const u of G.units) { if (u.dead) continue; const d2 = (u.x - e.x) ** 2 + (u.y - e.y) ** 2; if (d2 < bd) { bd = d2; best = u; } }
  if (!best) { e.atkT = 0.3; return; }
  e.atkT = S.cd; enemyShoot(e, best, S);
}
function ebDestroyed(e) {
  const f = e.eb.fac, D = EBLD[e.eb.kind], got = [];
  f.blds = f.blds.filter(b => b !== e);
  const k = 1 + 0.05 * (G.wave - 1);
  for (const r in D.loot) { const v = Math.round(D.loot[r] * k); G.res[r] += v; got.push(RES_ICON[r] + v); }
  burst(e.x, e.y, '#a08a6a', 30, 260); G.shake = Math.max(G.shake, e.eb.kind === 'hq' ? 26 : 8); sfx('crash');
  addText(e.x, e.y - 40, `摧毁${D.name} ${got.join(' ')}`, '#ffd76a', 1.1);
  if (e.eb.kind !== 'hq') return;
  // 王城陷落：敌国灭亡，剩下的建筑一起倒塌，军队溃散成流寇
  f.alive = false;
  for (const b of f.blds) { b.dead = true; burst(b.x, b.y, '#a08a6a', 16, 200); for (const r in EBLD[b.eb.kind].loot) G.res[r] += Math.round(EBLD[b.eb.kind].loot[r] * 0.5); }
  f.blds = [];
  for (const u of G.enemies) if (u.fac === f && !u.dead) { delete u.home; u.goal = null; }
  for (let i = 0; i < 5; i++) G.effects.push({ kind: 'ring', x: e.x, y: e.y, r0: 10, r1: 240 + i * 60, t: -i * 0.08, life: 0.6, color: '#ffd76a' });
  G.slowmoT = 1.2;
  const left = liveFacs().length;
  G.announce = { text: `${f.icon} ${f.name} 灭亡！`, sub: left ? `还剩 ${left} 个敌国` : '大陆已经统一！', t: 4 };
  if (!left) setTimeout(() => { if (G && G.phase === 'war') showEnd(true); }, 2500);
}
// 存档
function saveConquest() {
  return { upkeepT: G.upkeepT, facs: G.facs.map(f => ({ id: f.id, k: f.k, res: { ...f.res }, alive: f.alive, attackT: f.attackT, buildT: f.buildT, trainT: f.trainT, sent: f.sent, born: f.born, rally: f.rally, x: f.x, y: f.y,
    blds: f.blds.map(b => ({ kind: b.eb.kind, tx: b.eb.tx, ty: b.eb.ty, hp: b.hp })),
    king: f.king && !f.king.dead ? f.king.hp / f.king.maxHp : 0,
    army: G.enemies.filter(e => e.fac === f && !e.dead && !e.eb && !e.king && !e.summoner).map(e => ({ type: e.type, x: e.x, y: e.y, elite: e.elite, lvl: e.lvl, home: e.home ? [e.home.x, e.home.y] : null })) })),
    lairs: (G.lairs || []).filter(l => !l.alive).map(l => l.i), relics: (G.relics || []).map(r => r.i) };
}
function loadConquest(d) {
  G.conq = true; G.phase = 'war'; G.facs = []; G.upkeepT = d.upkeepT || CONQ.upkeep; G.aiT = 0; G.morale = G.morale || 'fed'; G.pings = [];
  for (const o of d.facs) {
    const F = FACTIONS[o.id];
    const f = { id: o.id, k: o.k, name: F.name, icon: F.icon, color: F.color, res: { ...o.res }, alive: o.alive, blds: [], stance: 'grow', attackT: o.attackT, buildT: o.buildT, trainT: o.trainT, sent: o.sent, power: 0, ratio: 1, born: o.born || 0, alert: null, rally: o.rally, x: o.x, y: o.y };
    G.facs.push(f);
    for (const b of o.blds) addEBld(f, b.kind, b.tx, b.ty, b.hp);
    for (const a of o.army) {
      const e = spawnEnemy(a.type, a.x, a.y, a.elite); e.fac = f; levelUp(e, a.lvl || facLvl(f));
      if (a.home) e.home = { x: a.home[0], y: a.home[1], camp: null };
      else { const c = castle(); e.goal = { id: c.id, x: c.x, y: c.y, tile: tIdx(c.x, c.y) }; }
    }
    if (o.king && f.alive && f.hq) spawnKing(f, o.king);
  }
  G.lairs = (G.map.lairs || []).map((l, i) => ({ i, kind: l.kind, x: (l.at[0] + 0.5) * T, y: (l.at[1] + 0.5) * T, alive: !(d.lairs || []).includes(i) }));
  const keep = d.relics ? new Set(d.relics) : null;
  G.relics = (G.map.relics || []).map((r, i) => ({ i, kind: r.kind, x: (r.at[0] + 0.5) * T, y: (r.at[1] + 0.5) * T })).filter(r => !keep || keep.has(r.i));
  for (const l of G.lairs) if (l.alive) spawnLair(l);
}
// 敌国建筑：借用玩家建筑的美术，染成敌国的颜色
const tintCache = new Map();
function tinted(key, hue) {
  const k = key + '|' + hue; let c = tintCache.get(k); if (c) return c;
  const src = artImg(key); if (!src) return null;
  c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.filter = `sepia(0.55) hue-rotate(${hue}deg) saturate(1.5) brightness(0.72)`; g.drawImage(src, 0, 0);
  tintCache.set(k, c); return c;
}
function drawEBld(e) {
  const f = e.eb.fac, D = EBLD[e.eb.kind], w = e.eb.size * T, key = 'buildings/' + D.art, x0 = e.eb.tx * T, y0 = e.eb.ty * T;
  ctx.fillStyle = 'rgba(40,10,10,0.3)'; ctx.fillRect(x0 + 2, y0 + 2, w - 4, w - 4);
  ctx.strokeStyle = f.color; ctx.globalAlpha = 0.55; ctx.lineWidth = 2; ctx.strokeRect(x0 + 2, y0 + 2, w - 4, w - 4); ctx.globalAlpha = 1;
  // 有专属美术就用专属的，否则借用玩家建筑染色
  const own = 'ebld/' + f.id + '_' + e.eb.kind, c = ART[own] ? artImg(own) : ART[key] && tinted(key, FACTIONS[f.id].hue);
  let top = e.y - w * 0.3;
  const sh = e.flash > 0 ? rand(-2, 2) : 0;
  if (c) { const h = w * ART_SCALE.bld, ww = h * c.width / c.height; top = e.y - 2 + w / 2 - h; blitPixel(c, e.x - ww / 2 + sh, top, ww, h);
    if (e.flash > 0) { ctx.globalAlpha = 0.45; blitPixel(whiteOf(c), e.x - ww / 2 + sh, top, ww, h); ctx.globalAlpha = 1; } }
  else { drawSprite(D.icon, e.x + sh, e.y, w * 0.6); if (e.flash > 0) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff'; ctx.fillRect(x0, y0, w, w); ctx.globalAlpha = 1; } }
  // 旗帜
  const fx = e.x + w * 0.32, fy = top + 4;
  ctx.fillStyle = '#3a2a1a'; ctx.fillRect(fx, fy, 3, 26); ctx.fillStyle = f.color; ctx.fillRect(fx + 3, fy, 18, 12);
  if (e.hp < e.maxHp || e.eb.kind === 'hq') {
    const bw = Math.max(40, w * 0.8), by = top - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(e.x - bw / 2, by, bw, 6);
    ctx.fillStyle = f.color; ctx.fillRect(e.x - bw / 2, by, bw * clamp(e.hp / e.maxHp, 0, 1), 6);
  }
  if (e.eb.kind === 'hq') {
    ctx.font = 'bold 15px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(`${f.icon} ${f.name}`, e.x, top - 12); ctx.fillStyle = f.color; ctx.fillText(`${f.icon} ${f.name}`, e.x, top - 12);
  }
  drawStatus(e, e.x, top - 30);
}
// 左上角：敌国情报
function drawIntel() {
  if (!G.conq) return;
  const x = 12, y0 = 56, w = 250, rowH = 46;
  ctx.fillStyle = 'rgba(18,12,10,0.78)'; roundRect(x, y0, w, 26 + G.facs.length * rowH, 8); ctx.fill();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 13px "Microsoft YaHei",sans-serif'; ctx.fillStyle = '#ffe7a8';
  ctx.fillText(`🛡 敌国情报 · 你的实力 ${fmt(G.myPower || playerPower())}`, x + 10, y0 + 14);
  G.facs.forEach((f, i) => {
    const y = y0 + 26 + i * rowH;
    ctx.font = 'bold 13px "Microsoft YaHei",sans-serif'; ctx.fillStyle = f.alive ? f.color : '#6a6a6a';
    ctx.fillText(`${f.icon} ${f.name}`, x + 10, y + 12);
    ctx.font = '12px "Microsoft YaHei",sans-serif';
    if (!f.alive) { ctx.fillStyle = '#8a8a8a'; ctx.fillText('已灭亡', x + 130, y + 12); return; }
    const st = STANCE[f.stance];
    ctx.fillStyle = st.color; ctx.fillText(st.name, x + 150, y + 12);
    ctx.fillStyle = '#c8b898';
    ctx.fillText(`⚔${f.army || 0} Lv${facLvl(f)}  🏠${f.blds.length}  💪${fmt(f.power)}`, x + 10, y + 31);
    ctx.fillStyle = f.king && !f.king.dead ? '#ffd76a' : '#8a8a8a'; ctx.fillText(f.king && !f.king.dead ? `👑${Math.round(f.king.hp / f.king.maxHp * 100)}%` : '👑已死', x + 195, y + 31);
  });
}

// ================= 敌方据点 =================
const aliveCamps = () => (G.camps || []).filter(c => c.alive);
const campMaxHp = kind => CAMPS[kind].hp * (1 + CAMP.grow * (G.wave - 1)) * G.diff.ehp;
// 开局在三个相距较远的刷怪口附近各放一座据点：离主城最近的最弱
function initCamps() {
  const c = castle(); G.camps = [];
  const ps = shuffle(PORTALS.map((p, i) => ({ p, i, d: hypot(p.x - c.x, p.y - c.y) }))), picks = [];
  for (const q of ps) if (picks.length < 3 && picks.every(o => hypot(o.p.x - q.p.x, o.p.y - q.p.y) > 1300)) picks.push(q);
  picks.sort((a, b) => a.d - b.d);
  picks.forEach((q, k) => {
    const p = q.p, h0 = MAP.hgt[tIdx(p.x, p.y)], f = Math.min(0.45, 420 / q.d);
    const sx = p.x + (c.x - p.x) * f, sy = p.y + (c.y - p.y) * f;
    let best = null, bd = 1e9;
    for (let ty = tileOf(sy) - 7; ty <= tileOf(sy) + 7; ty++) for (let tx = tileOf(sx) - 7; tx <= tileOf(sx) + 7; tx++) {
      if (tx < 2 || ty < 2 || tx >= GW - 2 || ty >= GH - 2) continue;
      let ok = true;
      for (let y = ty - 1; y <= ty + 1 && ok; y++) for (let x = tx - 1; x <= tx + 1; x++) { const i = y * GW + x; if (MAP.water[i] || MAP.ramp[i] || MAP.hgt[i] !== h0 || G.tiles[i]) { ok = false; break; } }
      const wx = tx * T + T / 2, wy = ty * T + T / 2, dd = hypot(wx - sx, wy - sy);
      if (ok && dd < bd) { bd = dd; best = [wx, wy]; }
    }
    if (best) G.camps.push({ kind: ['goblin', 'orc', 'undead'][k], x: best[0], y: best[1], portal: q.i, alive: true });
  });
}
function spawnCampEnt(rec) {
  const d = CAMPS[rec.kind], w = G.wave, dm = (1 + (w - 1) * 0.08) * G.diff.edmg;
  const e = { id: ++G.uid, type: 'camp_' + rec.kind, d: { name: d.name, icon: d.icon, color: d.color }, camp: rec, x: rec.x, y: rec.y, r: d.r,
    hp: rec.hp || rec.maxHp, maxHp: rec.maxHp, spd: 0, patk: (d.shoot.patk || 0) * dm, matk: (d.shoot.matk || 0) * dm,
    pdef: d.pdef + (w - 1) * 2, mdef: d.mdef + (w - 1) * 2, regen: 0, ls: 0, gold: 0, xp: 80 + w * 12, elite: false, boss: false, fly: false, st: {}, big: true,
    flash: 0, kbx: 0, kby: 0, slowT: 0, atkT: 1, face: 1, dead: false, vx: 0, vy: 0, target: null, retarget: 0, abT: 0, abI: 0, state: null, stT: 0, wob: 0 };
  rec.ent = e; G.enemies.push(e);
}
const campTypes = (kind, w) => { const g = CAMPS[kind].guards, ok = g.filter(t => (ENEMY_POOL.find(p => p.type === t) || { from: 1 }).from <= w); return ok.length ? ok : [g[0]]; };
// 准备阶段：据点生命随波次成长并回复一部分，守卫补满
function refreshCamps(heal) {
  for (const rec of aliveCamps()) {
    const d = CAMPS[rec.kind], mh = campMaxHp(rec.kind);
    if (rec.ent && !rec.ent.dead && G.enemies.includes(rec.ent)) { const e = rec.ent, k = e.hp / e.maxHp; e.maxHp = mh; e.hp = Math.min(mh, mh * k + (heal ? mh * CAMP.regen : 0)); }
    else { if (!rec.maxHp) rec.maxHp = mh; spawnCampEnt(rec); }
    const n = Math.min(d.nGuard[1], d.nGuard[0] + Math.floor((G.wave - 1) / 2)), types = campTypes(rec.kind, G.wave);
    const have = G.enemies.filter(e => e.home && e.home.camp === rec && !e.dead).length;
    for (let i = have; i < n && G.enemies.length < MAX_ENEMIES; i++) {
      let x = rec.x, y = rec.y;
      for (let k = 0; k < 10; k++) { const a = rand(0, TAU), r = rand(70, 150), qx = rec.x + Math.cos(a) * r, qy = rec.y + Math.sin(a) * r, j = tIdx(qx, qy); if (!MAP.water[j] && MAP.hgt[j] === MAP.hgt[tIdx(rec.x, rec.y)]) { x = qx; y = qy; break; } }
      const g = spawnEnemy(types[i % types.length], x, y, false);
      g.home = { x, y, camp: rec };
    }
  }
}
function updateCamp(e, dt) {
  e.kbx = e.kby = 0; e.vx = e.vy = 0;
  if (e.atkT > 0) return;
  const S = CAMPS[e.camp.kind].shoot, h = G.lord;
  let best = null, bd = S.range * S.range;
  if (!h.dead) { const d2 = (h.x - e.x) ** 2 + (h.y - e.y) ** 2; if (d2 < bd) { bd = d2; best = h; } }
  for (const u of G.units) { if (u.dead) continue; const d2 = (u.x - e.x) ** 2 + (u.y - e.y) ** 2; if (d2 < bd) { bd = d2; best = u; } }
  if (!best) { e.atkT = 0.3; return; }
  e.atkT = S.cd; enemyShoot(e, best, S);
}
function campDestroyed(rec) {
  rec.alive = false; rec.ent = null;
  const d = CAMPS[rec.kind], k = 1 + 0.08 * (G.wave - 1), got = [];
  for (const r in d.reward) { const v = Math.round(d.reward[r] * k); G.res[r] += v; got.push(RES_ICON[r] + v); }
  // 失去营地的守卫会直接冲向主城
  for (const g of G.enemies) if (g.home && g.home.camp === rec) delete g.home;
  for (let i = 0; i < 4; i++) G.effects.push({ kind: 'ring', x: rec.x, y: rec.y, r0: 10, r1: 160 + i * 50, t: -i * 0.08, life: 0.5, color: '#ffd76a' });
  burst(rec.x, rec.y, '#a08a6a', 40, 300); G.shake = Math.max(G.shake, 16); sfx('crash');
  G.campsDown = (G.campsDown || 0) + 1;
  G.announce = { text: `摧毁 ${d.name}！`, sub: `获得 ${got.join(' ')} · ${PORTALS[rec.portal].name}方向不再有增援`, t: 4 };
}

// ================= 波次 =================
function isBossWave(w) { return !!BOSS_WAVES[w]; }
function setupWave() {
  const w = G.wave;
  const nPortals = Math.min(1 + Math.floor((w - 1) / 4), 4);
  G.activePortals = shuffle([...PORTALS.keys()]).slice(0, nPortals);
  const pool = ENEMY_POOL.filter(e => w >= e.from);
  const N = Math.round((10 + w * 5 + w * w * 0.25) * G.diff.count);
  const list = [];
  let s = 0; for (const e of pool) s += e.w;
  for (let i = 0; i < N; i++) {
    let r = Math.random() * s, type = pool[0].type;
    for (const e of pool) { r -= e.w; if (r <= 0) { type = e.type; break; } }
    const sp = { type, portal: G.activePortals[i % nPortals], elite: Math.random() < (0.015 + w * 0.005) * G.diff.elite };
    sp.aff = rollAffixes(sp, w);
    list.push(sp);
  }
  // 活着的敌方据点每波额外派出增援
  G.campExtra = 0;
  for (const rec of aliveCamps()) {
    const n = Math.round(N * CAMPS[rec.kind].extra), types = campTypes(rec.kind, w);
    if (!G.activePortals.includes(rec.portal)) G.activePortals.push(rec.portal);
    for (let i = 0; i < n; i++) { const sp = { type: pick(types), portal: rec.portal, elite: false }; sp.aff = rollAffixes(sp, w); list.push(sp); }
    G.campExtra += n;
  }
  shuffle(list);
  if (isBossWave(w)) { const b = { type: BOSS_WAVES[w], portal: G.activePortals[0], elite: false, boss: true }; b.aff = rollAffixes(b, w); delete b.boss; list.splice(Math.floor(list.length * 0.3), 0, b); }
  G.waveList = list;
  G.flowDirty = true;
}
// 精英词条：精英 1~3 个，首领第 10 波起带，普通怪第 6 波起小概率带 1 个；同一只怪的词条不重复
function rollAffixes(s, w) {
  const n = s.boss ? (w >= 20 ? 3 : w >= 15 ? 2 : w >= 10 ? 1 : 0)
    : s.elite ? (w >= 15 ? 3 : w >= 8 ? 2 : 1) : (w >= 6 && Math.random() < (w - 5) * 0.008 ? 1 : 0);
  if (!n) return undefined;
  const pool = Object.keys(AFFIXES).filter(k => AFFIXES[k].from <= w && !(s.boss && AFFIXES[k].boss === false));
  return shuffle(pool).slice(0, n);
}
const hasAff = (e, a) => !!e.aff && e.aff.includes(a);
const affIcons = aff => (aff || []).map(a => AFFIXES[a].icon + AFFIXES[a].name).join(' ');
function applyAffixes(e, aff) {
  e.aff = aff; const k = 1 + 0.4 * aff.length;
  e.gold *= k; e.xp = Math.round(e.xp * k);
  for (const a of aff) {
    if (a === 'haste') { e.spd *= 1.45; e.aspd = 0.7; }
    else if (a === 'armored') { e.pdef += 60; e.mdef += 60; }
    else if (a === 'shield') { e.shieldMax = e.shield = e.maxHp * 0.4; e.shieldT = 0; }
    else if (a === 'vampiric') e.ls = Math.max(e.ls, 0.35);
    else if (a === 'regen') e.regen += e.maxHp * 0.02;
    else if (a === 'summon') e.sumT = 4;
    else if (a === 'frost') e.frT = 1;
  }
}
// 护盾先吸收伤害；受伤后 5 秒才开始回充
function enemyTakeDmg(e, dmg) {
  if (e.eb && e.eb.kind === 'hq' && e.eb.fac.king && !e.eb.fac.king.dead) { dmg *= CONQ.kingShield; if (Math.random() < 0.05) addText(e.x, e.y - 60, '国王庇护：先击败国王！', '#ffd76a', 1); }
  if (e.shieldMax) {
    e.shieldT = 5;
    if (e.shield > 0) { const a = Math.min(e.shield, dmg); e.shield -= a; dmg -= a; if (e.shield <= 0) { burst(e.x, e.y, '#7ac8ff', 14, 200); addText(e.x, e.y - e.r - 20, '护盾破碎', '#7ac8ff', 0.9); } }
  }
  e.hp -= dmg;
}
function updateAffixes(e, dt) {
  if (e.shieldMax) { e.shieldT -= dt; if (e.shieldT <= 0 && e.shield < e.shieldMax) e.shield = Math.min(e.shieldMax, e.shield + e.shieldMax * 0.5 * dt); }
  if (hasAff(e, 'enrage') && !e.enraged && e.hp < e.maxHp * 0.4) {
    e.enraged = true; e.patk *= 1.8; e.matk *= 1.8; e.spd *= 1.3;
    addText(e.x, e.y - e.r - 24, '😡狂怒！', '#ff5a3a', 1.1); burst(e.x, e.y, '#ff4a2a', 16, 220);
  }
  if (e.sumT !== undefined) {
    e.sumT -= dt;
    if (e.sumT <= 0) {
      e.sumT = 7;
      G.effects.push({ kind: 'ring', x: e.x, y: e.y, r0: 10, r1: 70, t: 0, life: 0.4, color: '#b07aff' });
      for (let i = 0; i < 2 && G.enemies.length < MAX_ENEMIES; i++) {
        const m = spawnEnemy('skeleton', e.x + rand(-45, 45), e.y + rand(-45, 45), false);
        m.gold *= 0.3; m.xp = Math.round(m.xp * 0.3);
      }
    }
  }
  if (e.frT !== undefined) {
    e.frT -= dt;
    if (e.frT <= 0) {
      e.frT = 1; const R = 120, on = { st: 'chill', chance: 1, dur: 1.3 };
      const h = G.lord;
      if (!h.dead && hypot(h.x - e.x, h.y - e.y) < R) applyStatus(h, on, 0, e);
      for (const u of G.units) if (!u.dead && hypot(u.x - e.x, u.y - e.y) < R) applyStatus(u, on, 0, e);
    }
  }
}
function affixDeath(e) {
  if (hasAff(e, 'explode')) {
    const R = 95, p = (e.patk + e.matk) * 2 + 15;
    G.effects.push({ kind: 'ring', x: e.x, y: e.y, r0: 10, r1: R, t: 0, life: 0.35, color: '#ff8a3a', fill: true });
    burst(e.x, e.y, '#ff8a3a', 30, 320); G.shake = Math.max(G.shake, 8); sfx('smallboom');
    const h = G.lord;
    if (!h.dead && hypot(h.x - e.x, h.y - e.y) < R + h.r) hurtAlly(h, p, 0, null);
    for (const u of G.units) if (!u.dead && hypot(u.x - e.x, u.y - e.y) < R) hurtAlly(u, p, 0, null);
    for (const b of G.buildings.slice()) if (edgeDist(b, e.x, e.y) < R) hurtBuilding(b, p);
  }
  if (hasAff(e, 'split') && !e.child) {
    for (let i = 0; i < 2; i++) {
      const c = spawnEnemy(e.type, e.x + rand(-22, 22), e.y + rand(-22, 22), false);
      c.maxHp = c.hp = e.maxHp * 0.3; c.r = e.r * 0.8; c.child = true;
      c.patk = e.patk * 0.6; c.matk = e.matk * 0.6; c.gold = e.gold * 0.15; c.xp = Math.round(e.xp * 0.15);
    }
    addText(e.x, e.y - e.r - 20, '🧬分裂！', '#c8ff7a', 1);
  }
}
function startBattle() {
  if (!G || G.phase !== 'prep') return;
  takeSnapshot();
  if (G.prepT > 2) { const bonus = Math.floor(G.prepT / 2); G.res.gold += bonus; addText(G.lord.x, G.lord.y - 40, `提前开战 +${bonus}🪙`, '#ffd24a', 1.2); }
  // 开战时士兵和英雄吃饭：粮食不够就士气低迷或饥饿
  const need = foodNeed(), have = Math.floor(G.res.food);
  if (!need || have >= need) { G.res.food -= need; G.morale = 'fed'; }
  else { G.res.food = 0; G.morale = have >= need * 0.5 ? 'low' : 'starve'; }
  G.foodUsed = Math.min(need, have);
  G.phase = 'battle'; G.buildMode = null;
  G.spawnT = 0; G.spawnInterval = (18 + G.wave) / G.waveList.length;
  const mo = MORALE[G.morale];
  G.announce = { text: `第 ${G.wave} 波`, sub: (isBossWave(G.wave) ? `⚠ 首领：${ENEMIES[BOSS_WAVES[G.wave]].name}` : `${G.waveList.length} 个敌人来袭${G.campExtra ? `（据点增援 ${G.campExtra}）` : ''}`) + (need ? ` · 消耗粮食 ${G.foodUsed}/${need} · ${mo.icon}${mo.name}` : ''), t: 2.6, boss: G.morale === 'starve' };
  sfx('horn');
  const affSet = [...new Set(G.waveList.flatMap(s => s.aff || []))];
  if (affSet.length) toast(`本波出现词条：${affIcons(affSet)}`);
  updateUI(true);
}
function updateSpawns(dt) {
  if (!G.waveList.length) return;
  G.spawnT -= dt;
  while (G.spawnT <= 0 && G.waveList.length && G.enemies.length < MAX_ENEMIES) {
    G.spawnT += G.spawnInterval;
    const s = G.waveList.shift(), p = PORTALS[s.portal];
    const e = spawnEnemy(s.type, p.x + rand(-40, 40), p.y + rand(-40, 40), s.elite, s.aff);
    if (e.boss) { G.bossRef = e; G.shake = 18; sfx('boss'); G.announce = { text: e.d.name, sub: '首领降临！', t: 2.2, boss: true }; }
  }
}
function spawnEnemy(type, x, y, elite, aff) {
  const d = ENEMIES[type], w = G.wave;
  const hpMul = (d.boss ? 1 : (1 + (w - 1) * 0.2 + Math.max(0, w - 10) * 0.15) * (elite ? 5 : 1)) * G.diff.ehp * (G.curse && G.curse.wave === w ? 1.3 : 1);
  const dmgMul = (1 + (w - 1) * 0.08) * (elite ? 1.5 : 1) * G.diff.edmg;
  const e = { id: ++G.uid, type, d, x, y, r: d.r * (elite ? 1.35 : 1), hp: d.hp * hpMul, spd: d.spd * rand(0.9, 1.1),
    patk: (d.patk || 0) * dmgMul, matk: (d.matk || 0) * dmgMul, pdef: (d.pdef || 0) + (w - 1) * 1.5 + (elite ? 15 : 0), mdef: (d.mdef || 0) + (w - 1) * 1.5 + (elite ? 15 : 0),
    regen: (d.regen || 0) * (1 + (w - 1) * 0.1), ls: d.ls || 0,
    gold: d.gold * (elite ? 6 : 1), xp: XP_OF(d.gold, elite, d.boss), elite, boss: !!d.boss, fly: !!d.fly, st: {},
    big: !!d.big || elite, flash: 0, kbx: 0, kby: 0, slowT: 0, atkT: rand(0, 0.5), face: 1, dead: false, vx: 0, vy: 0,
    target: null, retarget: 0, abT: 3, abI: 0, state: null, stT: 0, wob: rand(0, TAU) };
  e.maxHp = e.hp;
  if (G.curse && G.curse.wave === w) e.gold *= 2;
  if (aff && aff.length) applyAffixes(e, aff);
  G.enemies.push(e);
  return e;
}
function checkWaveEnd() {
  if (G.phase !== 'battle' || G.waveList.length || G.enemies.some(e => !e.camp && !e.home)) return;
  // 没捡的金币按比例转化为木材和石材
  let total = 0;
  for (const c of G.coins) total += c.v;
  const mat = Math.floor(total * G.s.recycle);
  G.res.wood += mat; G.res.stone += mat; G.wasted += total;
  G.coins = []; G.projs = G.projs.filter(p => p.team === 'ally'); G.zones = [];
  G.lastWaveInfo = { total: Math.floor(total), mat };
  if (G.wave >= MAX_WAVE) { showEnd(true); return; }
  showBoons();
}
function startPrep() {
  G.wave++;
  G.phase = 'prep'; G.prepT = Math.max(20, PREP_TIME + G.diff.prep); G.morale = null;
  refreshCamps(true);
  setupWave();
  const h = G.lord;
  if (h.dead) respawnLord();
  h.hp = lordStats().hp;
  G.units = G.units.filter(u => u.temp === undefined);
  for (const u of G.units) { u.st = {}; u.hp = unitStats(u).hp; }
  h.st = {};
  const info = G.lastWaveInfo;
  G.announce = { text: '准备阶段', sub: info && info.total ? `遗落 ${info.total} 金币 → 转化为 🪵${info.mat} 🪨${info.mat}` : '敌人的进攻路线已标出', t: 3.5 };
  hideOverlay();
  takeSnapshot();
  updateUI(true);
}

// ================= 敌人空间网格 =================
const CELL = 80;
const grid = new Map();
function buildGrid() {
  grid.clear();
  for (const e of G.enemies) {
    if (e.dead) continue;
    const k = ((e.x / CELL) | 0) * 4096 + ((e.y / CELL) | 0);
    let a = grid.get(k); if (!a) { a = []; grid.set(k, a); }
    a.push(e);
  }
}
function queryEnemies(x, y, r, groundOnly) {
  const out = [];
  const x0 = Math.max(0, ((x - r - 80) / CELL) | 0), x1 = ((x + r + 80) / CELL) | 0;
  const y0 = Math.max(0, ((y - r - 80) / CELL) | 0), y1 = ((y + r + 80) / CELL) | 0;
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    const a = grid.get(cx * 4096 + cy); if (!a) continue;
    for (const e of a) {
      if (e.dead || (groundOnly && e.fly)) continue;
      const dx = e.x - x, dy = e.y - y, rr = r + e.r;
      if (dx * dx + dy * dy < rr * rr) out.push(e);
    }
  }
  return out;
}
function nearestEnemy(x, y, maxR, groundOnly) {
  let best = null, bd = maxR * maxR;
  for (const e of G.enemies) {
    if (e.dead || (groundOnly && e.fly)) continue;
    const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// ================= 伤害 =================
// o: { src 攻击者（吸血用）, ls, crit, critMul, kb, sx, sy, anti, slow, mul }
function hitEnemy(e, p, m, o = {}) {
  if (e.dead) return 0;
  let dmg = calcDmg(p, m, e.pdef, e.mdef) * rand(0.92, 1.08) * (o.mul || 1), crit = false;
  if (o.crit && Math.random() < o.crit) { dmg *= o.critMul || 2; crit = true; }
  if (o.anti && e.big) dmg *= o.anti;
  dmg = Math.max(1, Math.round(dmg));
  enemyTakeDmg(e, dmg); e.flash = 0.09; e.hitAt = G.time;
  if (G.effects.length < 260 && !e.eb && !e.camp) {
    const sx0 = o.sx !== undefined ? o.sx : o.src ? o.src.x : e.x - 1, sy0 = o.sy !== undefined ? o.sy : o.src ? o.src.y : e.y;
    G.effects.push({ kind: 'spark', x: e.x, y: e.y - e.r * 0.3, ang: Math.atan2(e.y - sy0, e.x - sx0), color: (m || 0) > (p || 0) ? '#e0b8ff' : crit ? '#ffe36a' : '#fff4d8', n: crit ? 9 : 5, len: crit ? 30 : 18 + e.r * 0.3, seed: Math.random(), t: 0, life: crit ? 0.22 : 0.16 });
  }
  if (e.eb) facAlert(e.eb.fac, e.x, e.y); else if (e.fac && e.home) facAlert(e.fac, e.x, e.y);
  if (e.boss && G.conq && G.bossRef !== e) G.bossRef = e;
  if (o.src && !o.src.dead && hasAff(e, 'thorns') && (o.src === G.lord || o.src.isUnit) && hypot(o.src.x - e.x, o.src.y - e.y) < e.r + 70) hurtAlly(o.src, dmg * 0.25, 0, null);
  if (o.kb && !e.boss) {
    const sx = o.sx !== undefined ? o.sx : G.lord.x, sy = o.sy !== undefined ? o.sy : G.lord.y;
    const dx = e.x - sx, dy = e.y - sy, d = hypot(dx, dy) || 1;
    const k = o.kb * (e.big ? 0.3 : 1);
    e.kbx += dx / d * k; e.kby += dy / d * k;
  }
  if (o.slow) e.slowT = Math.max(e.slowT, o.slow);
  if (o.ls && o.src) healAlly(o.src, dmg * o.ls, true);
  if (o.on) for (const on of Array.isArray(o.on) ? o.on : [o.on]) applyStatus(e, on, o.pw || 0, o.src);
  const magic = (m || 0) > (p || 0);
  if (SETTINGS.dmgNums && (crit || (G.texts.length < 50 && (dmg >= 10 || Math.random() < 0.4)))) addText(e.x + rand(-8, 8), e.y - e.r, '' + dmg, crit ? '#ffd23f' : magic ? '#d0a8ff' : (o.color || '#ffffff'), crit ? 1.4 : 1);
  if (crit) { burst(e.x, e.y, '#ffe36a', 6, 220); sfx('crit'); } else sfx('hit');
  if (e.hp <= 0) killEnemy(e, o.src);
  return dmg;
}
function killEnemy(e, src) {
  if (e.dead) return;
  e.dead = true; G.kills++;
  if (e.camp) campDestroyed(e.camp);
  if (e.eb) ebDestroyed(e);
  if (e.king) kingSlain(e);
  if (e.lair) lairCleared(e.lair);
  giveXp(src, e.xp, e.x, e.y);
  G.combo++; G.comboT = 2.5; if (G.combo > G.bestCombo) G.bestCombo = G.combo;
  if (e.boss) G.bossKills++;
  if (e.elite || e.boss) { G.hitStop = e.boss ? 0.12 : 0.05; G.effects.push({ kind: 'ring', x: e.x, y: e.y, r0: 8, r1: 90, t: 0, life: 0.3, color: '#ffd76a' }); G.effects.push({ kind: 'flash', x: e.x, y: e.y, r: 70, t: 0, life: 0.1 }); }
  burst(e.x, e.y, e.d.color, e.boss ? 80 : e.elite ? 24 : 9, e.boss ? 420 : 200);
  if (!e.eb && !e.camp) addCorpse(e.d.art ? 'enemies/' + e.d.art : 'enemies/' + e.type, e.d.icon, e.x, e.y + (e.fly ? -10 : 0), e.r * 1.9, e.face > 0, e.boss ? 1.6 : 0.8, e.fly);
  if (e.aff) affixDeath(e);
  const v = e.gold * G.s.loot;
  const coins = Math.min(e.boss ? 30 : 4, Math.ceil(v / 2));
  // 征服模式地图太大，金币直接入账
  if (G.conq) { G.res.gold += v; G.totalGold += v; }
  else for (let i = 0; i < coins; i++) dropCoin(e.x, e.y, v / coins, e.boss ? 260 : 90);
  if (e.boss) {
    G.slowmoT = 1.3; G.shake = 26; sfx('boom');
    for (let i = 0; i < 5; i++) G.effects.push({ kind: 'ring', x: e.x, y: e.y, r0: 10, r1: 240 + i * 60, t: -i * 0.08, life: 0.6, color: '#ffd76a' });
  }
  // 死灵法师被动：附近敌人死亡时化为骷髅
  if (!e.boss) {
    const nec = G.units.find(u => u.type === 'necro' && !u.dead);
    if (nec && hypot(nec.x - e.x, nec.y - e.y) < 420 && Math.random() < 0.15 && G.units.filter(u => u.temp !== undefined).length < 14) {
      const u = addUnit('skeleton', e.x, e.y); u.temp = 12;
    }
  }
  sfx('kill');
}
function healAlly(a, amt, quiet) {
  if (a.dead || amt <= 0) return;
  const mx = maxHpOf(a), h0 = a.hp;
  a.hp = Math.min(mx, a.hp + amt);
  const got = a.hp - h0;
  if (!quiet && got >= 5) addText(a.x, a.y - 22, '+' + Math.round(got), '#7aff8a', 0.9);
}
// 敌人打友军（领主、英雄、士兵）；src 是攻击者，它的 onhit 会给友军附加异常状态
function hurtAlly(a, p, m, src) {
  if (a.dead || G.phase === 'over') return;
  const isLord = a === G.lord;
  if (isLord && a.spinT > 0 && Math.random() < 0.5) return;
  const st = statsOf(a);
  if (st.dodge && Math.random() < st.dodge) { if (Math.random() < 0.5) addText(a.x, a.y - 26, '闪避', '#bfe8ff', 0.8); return; }
  let dmg = Math.max(1, Math.round(calcDmg(p, m, st.pdef, st.mdef)));
  a.hp -= dmg; a.flash = 0.12; a.hitAt = G.time;
  if (src && src.ls) src.hp = Math.min(src.maxHp, src.hp + dmg * src.ls);
  if (src && src.d && src.d.onhit) applyStatus(a, src.d.onhit, (src.patk || 0) + (src.matk || 0), src);
  if (isLord) {
    G.hurtFlash = 0.25; G.shake = Math.max(G.shake, 4);
    addText(a.x, a.y - 26, '-' + dmg, '#ff4a4a', 1.1);
    sfx('hurt');
  }
  if (a.hp <= 0) allyDie(a);
}
function allyDie(a) {
  if (a === G.lord) {
    if (a.dead) return;
    a.dead = true; a.respawnT = 10; a.hp = 0; a.st = {};
    burst(a.x, a.y, LORD.color, 30, 260);
    G.announce = { text: '领主倒下了', sub: '10 秒后在主城复活', t: 2.5, boss: true };
  } else killUnit(a);
}
function killUnit(u) {
  if (u.dead) return;
  u.dead = true; burst(u.x, u.y, '#8fd4ff', 12, 180);
  addCorpse(unitArtKey(u), u.d.icon, u.x, u.y, u.d.hero ? 34 : 24, u.face < 0, u.d.hero ? 1.2 : 0.8, u.fly);
  G.group = G.group.filter(id => id !== u.id);
  if (u.d.hero) {
    G.heroDead[u.type] = { lvl: u.lvl, xp: u.xp || 0 };
    burst(u.x, u.y, u.d.color, 40, 300);
    G.effects.push({ kind: 'ring', x: u.x, y: u.y, r0: 10, r1: 160, t: 0, life: 0.6, color: u.d.color });
    G.announce = { text: `${u.d.name} 阵亡了`, sub: '可以在复活祭坛花钱复活，保留等级和技能', t: 3, boss: true };
    sfx('herodie');
  } else if (!u.d.special && u.temp === undefined) G.fallen[u.type] = (G.fallen[u.type] || 0) + 1;
  if (G.sel && G.sel.id === u.id) G.sel = null;
}

// ---------- 异常状态 ----------
const ST_INFO = {
  burn: { name: '灼烧', icon: '🔥', color: '#ff8a3a' }, poison: { name: '中毒', icon: '🧪', color: '#9ae04a' },
  bleed: { name: '流血', icon: '🩸', color: '#ff4a5a' }, chill: { name: '冰冻', icon: '❄️', color: '#9adfff' }, stun: { name: '眩晕', icon: '💫', color: '#ffe36a' },
};
// on: { st, chance, pow, dur }；atk：施加者的攻击力，持续伤害 = atk × pow / 秒
function applyStatus(t, on, atk, src) {
  if (!on || t.dead || Math.random() > (on.chance === undefined ? 1 : on.chance)) return;
  t.st = t.st || {};
  const cur = t.st[on.st];
  let dur = on.dur || 2;
  if (t.boss && (on.st === 'stun' || on.st === 'chill')) dur *= 0.3;
  if (!cur) addText(t.x, t.y - (t.r || 14) - 16, ST_INFO[on.st].icon + ST_INFO[on.st].name, ST_INFO[on.st].color, 0.8);
  t.st[on.st] = { t: Math.max(cur ? cur.t : 0, dur), dps: Math.max(cur ? cur.dps : 0, (on.pow || 0) * atk), src: src || (cur && cur.src), tick: cur ? cur.tick : 0.5 };
}
// 每帧结算异常状态；返回是否处于眩晕
function tickStatus(t, dt, enemy) {
  const S = t.st; if (!S) return false;
  let stun = false;
  for (const k in S) {
    const o = S[k];
    o.t -= dt;
    if (k === 'stun') stun = true;
    if (o.dps > 0) {
      o.tick -= dt;
      if (o.tick <= 0) {
        o.tick += 0.5;
        let pdef, mdef;
        if (enemy) { pdef = t.pdef; mdef = t.mdef; } else { const st = statsOf(t); pdef = st.pdef; mdef = st.mdef; }
        const dmg = Math.max(1, Math.round(o.dps * 0.5 * (k === 'burn' ? defMul(mdef) : k === 'bleed' ? defMul(pdef) : 1)));
        if (enemy) enemyTakeDmg(t, dmg); else t.hp -= dmg;
        if (SETTINGS.dmgNums && G.texts.length < 120) addText(t.x + rand(-6, 6), t.y - (t.r || 14), '' + dmg, ST_INFO[k].color, 0.75);
        if (t.hp <= 0) { if (enemy) killEnemy(t, o.src); else allyDie(t); return true; }
      }
    }
    if (o.t <= 0) delete S[k];
  }
  return stun;
}

// ---------- 经验与升级 ----------
function addXp(a, v) {
  if (!a || a.dead || !v || a.temp !== undefined) return;
  const max = lvlMaxOf(a);
  if (a.lvl >= max) return;
  a.xp = (a.xp || 0) + v;
  while (a.lvl < max && a.xp >= XP_NEED(a.lvl)) {
    a.xp -= XP_NEED(a.lvl);
    const before = maxHpOf(a);
    a.lvl++;
    a.hp += maxHpOf(a) - before;
    levelFx(a);
  }
  if (a.lvl >= max) a.xp = 0;
}
const lvlMaxOf = a => a === G.lord ? LVL_MAX.lord : a.d.hero ? LVL_MAX.hero : a.evo ? EVO_LVL_MAX : LVL_MAX.unit;
// ---------- 兵种进化 ----------
const evoCache = {};
function evoDef(type, id) {
  const k = type + '/' + id; if (evoCache[k]) return evoCache[k];
  const br = (EVOLUTIONS[type] || []).find(b => b.id === id); if (!br) return UNITS[type];
  return (evoCache[k] = Object.assign({}, UNITS[type], br.set, { name: br.name, icon: br.icon, desc: br.desc, evo: id, baseName: UNITS[type].name }));
}
const canEvolve = u => !!u.isUnit && !u.dead && !u.d.hero && !u.d.special && !u.evo && u.temp === undefined && u.lvl >= LVL_MAX.unit && !!EVOLUTIONS[u.type];
const trainingGround = () => G.buildings.find(b => b.type === 'training');
function evolveUnit(u, id) {
  const br = (EVOLUTIONS[u.type] || []).find(b => b.id === id), c = EVO_COST(u.type);
  if (!br || !canEvolve(u)) return false;
  if (!trainingGround()) { toast('需要先建造训练场'); sfx('err'); return false; }
  if (!canPay(c)) { toast('金币不足'); sfx('err'); return false; }
  pay(c);
  const r0 = u.hp / unitStats(u).hp;
  u.evo = id; u.d = evoDef(u.type, id); u.xp = 0;
  u.hp = unitStats(u).hp * Math.max(r0, 0.5);
  burst(u.x, u.y, '#ffd76a', 30, 260); sfx('upgrade');
  G.effects.push({ kind: 'pillar', x: u.x, y: u.y, w: 50, t: 0, life: 0.8 });
  G.announce = { text: `${UNITS[u.type].icon} ${UNITS[u.type].name} 进化为「${br.icon}${br.name}」`, sub: br.desc, t: 2.6 };
  return true;
}
function levelFx(a) {
  const col = a === G.lord ? LORD.color : a.d.hero ? a.d.color : '#8fd4ff';
  burst(a.x, a.y, col, a.isUnit && !a.d.hero ? 8 : 20, 160);
  G.effects.push({ kind: 'ring', x: a.x, y: a.y, r0: 6, r1: 50, t: 0, life: 0.35, color: '#ffd76a' });
  addText(a.x, a.y - 44, `升级！Lv${a.lvl}`, '#ffd76a', a.isUnit && !a.d.hero ? 0.9 : 1.3);
  sfx('level');
  if (a.isUnit && a.d.hero) {
    const pk = a.d.perks.find(p => p.lvl === a.lvl);
    if (pk) {
      G.announce = { text: `${a.d.icon} ${a.d.name} 学会了「${pk.icon}${pk.name}」`, sub: pk.desc, t: 2.8 };
      G.effects.push({ kind: 'pillar', x: a.x, y: a.y, w: 60, t: 0, life: 0.8 });
      if (pk.type === 'ability') a.ab2T = 1;
    }
  }
  if (canEvolve(a)) {
    addText(a.x, a.y - 60, '可以进化！', '#ffd76a', 1.1);
    if (!G.evoHint) { G.evoHint = true; toast(`${a.d.name} 满级了：选中它或打开训练场，选择进化方向`); }
  }
}
// 击杀者拿全部经验，附近友军各分一部分（防御塔击杀时只有附近友军分）
function giveXp(src, xp, x, y) {
  if (!xp) return;
  const killer = src && !src.dead && (src === G.lord || src.isUnit) ? src : null;
  if (killer) addXp(killer, xp);
  const share = Math.max(1, Math.round(xp * XP_SHARE)), R2 = XP_RANGE * XP_RANGE;
  const h = G.lord;
  if (h !== killer && !h.dead && (h.x - x) ** 2 + (h.y - y) ** 2 < R2) addXp(h, share);
  for (const u of G.units) if (u !== killer && !u.dead && (u.x - x) ** 2 + (u.y - y) ** 2 < R2) addXp(u, share);
}
function respawnLord() {
  const c = castle(), h = G.lord;
  h.x = c ? c.x : WORLD_W / 2; h.y = c ? c.y + c.w / 2 + 30 : WORLD_H / 2;
  h.hp = lordStats().hp; h.dead = false; h.st = {};
  G.freeCam = false;
  burst(h.x, h.y, LORD.color, 20, 200);
}

// ---------- 掉落、特效 ----------
function dropCoin(x, y, v, spread) {
  if (G.coins.length > 400) { G.coins[Math.floor(Math.random() * G.coins.length)].v += v; return; }
  const a = rand(0, TAU), s = rand(20, spread);
  G.coins.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, v, mag: false, spd: 0 });
}
function burst(x, y, color, n, spd) {
  for (let i = 0; i < n && G.particles.length < 900; i++) {
    const a = rand(0, TAU), s = rand(spd * 0.2, spd);
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), max: 0.7, color, size: rand(2, 5) });
  }
}
function addText(x, y, text, color, scale) { G.texts.push({ x, y, text, color, scale, life: 0.9, vy: -55 }); }
// 弹道：team = 'ally' 打敌人，'enemy' 打友军和建筑
function fireProj(o) {
  const p = Object.assign({ r: 6, pierce: 0, life: 1.4, color: '#fff', aoe: 0, kb: 60, hit: new Set(), kind: 'orb', team: 'ally', p: 0, m: 0 }, o);
  G.projs.push(p); return p;
}
// 瞄准：精度越高越会预判移动目标，偏差也越小；高低地影响精度
function shoot(sx, sy, t, st, extra) {
  const hg = hgMod(sx, sy, t), acc = clamp(st.acc + hg.acc, 0.05, 1);
  const d = hypot(t.x - sx, t.y - sy), tt = d / st.pspd;
  const lx = t.x + (t.vx || 0) * tt * acc, ly = t.y + (t.vy || 0) * tt * acc;
  const a = Math.atan2(ly - sy, lx - sx) + gauss() * (1 - acc) * 0.45;
  const range = (extra && extra.range) || st.range * hg.range;
  return fireProj(Object.assign({ x: sx, y: sy, vx: Math.cos(a) * st.pspd, vy: Math.sin(a) * st.pspd, life: range * 1.25 / st.pspd + 0.05,
    p: st.patk * hg.dmg, m: st.matk * hg.dmg, crit: st.crit, critMul: st.critMul, ls: st.ls }, extra));
}
function explodeAt(x, y, R, p, m, color, o = {}) {
  for (const e of queryEnemies(x, y, R, o.groundOnly)) hitEnemy(e, p, m, Object.assign({ kb: 160, sx: x, sy: y, color: '#ffc080' }, o));
  G.effects.push({ kind: 'ring', x, y, r0: 6, r1: R, t: 0, life: 0.25, color, fill: true });
  G.effects.push({ kind: 'flash', x, y, r: R * 0.8, t: 0, life: 0.12 });
  burst(x, y, color, 14, 260); burst(x, y, '#5a4a3a', 6, 160);
  if (onScreen(x, y)) { G.shake = Math.max(G.shake, Math.min(5, R / 25)); sfx('smallboom'); }
}
function onScreen(x, y) { const c = G.cam, hw = VW / 2 / c.z + 60, hh = VH / 2 / c.z + 60; return Math.abs(x - c.x) < hw && Math.abs(y - c.y) < hh; }

// ================= 领主 =================
const MODE_ORDER = ['sword', 'bow', 'magic'];
function switchMode() {
  const h = G.lord; if (h.dead) return;
  h.mode = MODE_ORDER[(MODE_ORDER.indexOf(h.mode) + 1) % 3];
  const md = LORD.modes[h.mode];
  addText(h.x, h.y - 40, `${md.icon} ${md.name}`, '#ffe7a8', 1.2);
  h.atkT = Math.min(h.atkT, 0.15); sfx('slash');
  updateUI(true);
}
function lordAttack() {
  const h = G.lord, st = lordStats(), md = LORD.modes[h.mode];
  if (h.mode === 'sword') {
    const range = st.range, t = nearestEnemy(h.x, h.y, range + 30); if (!t) return false;
    markAtk(h, t, true);
    const ang = Math.atan2(t.y - h.y, t.x - h.x);
    for (const e of queryEnemies(h.x, h.y, range)) {
      let da = Math.atan2(e.y - h.y, e.x - h.x) - ang; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) <= 1.2) hitEnemy(e, st.patk, st.matk, { kb: 220, crit: st.crit, critMul: st.critMul, ls: st.ls, src: h, on: st.on, pw: st.patk + st.matk });
    }
    G.effects.push({ kind: 'slash', x: h.x, y: h.y, ang, half: 1.2, r: range, t: 0, life: 0.18, color: '#fff4c0', follow: true });
    sfx('slash'); return true;
  }
  const rg = rangeAt(h.x, h.y, st.range), t = nearestEnemy(h.x, h.y, rg); if (!t) return false;
  markAtk(h, t, false);
  if (h.mode === 'bow') shoot(h.x, h.y, t, st, { r: 6, pierce: md.pierce, color: '#e6f5a8', kind: 'arrow', kb: 90, src: h, on: st.on, pw: st.patk + st.matk });
  else shoot(h.x, h.y, t, st, { r: 9, aoe: md.aoe, color: '#c08aff', kind: 'fire', src: h, on: st.on, pw: st.patk + st.matk });
  sfx(h.mode === 'bow' ? 'shoot' : 'magic'); return true;
}
function useSkill() {
  if (!G || G.paused || !isLive()) return;
  const h = G.lord;
  if (h.dead || h.cds[h.mode] > 0) return;
  const md = LORD.modes[h.mode], st = lordStats();
  h.cds[h.mode] = md.skill.cd;
  sfx('skill'); G.shake = Math.max(G.shake, 8);
  castFx(h.x, h.y + 12, h.mode === 'sword' ? '#ffd76a' : h.mode === 'bow' ? '#b8f07a' : '#c08aff', 56);
  if (h.mode === 'sword') { h.spinT = 1.0; h.spinTick = 0; }
  else if (h.mode === 'bow') {
    let [mx, my] = toWorld(mouse.sx, mouse.sy);
    if (hypot(mx - h.x, my - h.y) > 700) { const t = nearestEnemy(h.x, h.y, 700); if (t) { mx = t.x; my = t.y; } }
    for (let i = 0; i < 40; i++) {
      const a = rand(0, TAU), d = Math.sqrt(Math.random()) * 170;
      G.effects.push({ kind: 'strike', x: mx + Math.cos(a) * d, y: my + Math.sin(a) * d, t: -i * 0.025, life: 0.22, r: 30, p: st.patk * 1.6, m: 0, icon: 'arrow', src: h });
    }
  } else {
    const R = 240;
    for (const e of queryEnemies(h.x, h.y, R)) hitEnemy(e, 0, st.matk * 4, { kb: 450, sx: h.x, sy: h.y, src: h, on: { st: 'burn', chance: 1, pow: 0.4, dur: 3 }, pw: st.matk });
    G.effects.push({ kind: 'ring', x: h.x, y: h.y, r0: 20, r1: R, t: 0, life: 0.45, color: '#c08aff', fill: true });
    G.effects.push({ kind: 'flash', x: h.x, y: h.y, r: R, t: 0, life: 0.15 });
    sfx('boom');
  }
  updateUI(true);
}
function updateLord(dt) {
  const h = G.lord;
  if (h.dead) { h.respawnT -= dt; if (h.respawnT <= 0) respawnLord(); return; }
  const stunned = tickStatus(h, dt, false);
  if (h.dead) return;
  const st = lordStats();
  if (stunned) { h.vx = h.vy = 0; for (const k in h.cds) h.cds[k] -= dt; return; }
  let mx = 0, my = 0;
  if (keys.KeyW) my--; if (keys.KeyS) my++; if (keys.KeyA) mx--; if (keys.KeyD) mx++;
  const l = hypot(mx, my), ox = h.x, oy = h.y;
  if (l > 0) {
    tryMove(h, h.x + mx / l * st.spd * dt, h.y + my / l * st.spd * dt);
    h.mdx = mx / l; h.mdy = my / l;
    if (mx) h.face = mx > 0 ? 1 : -1;
    h.walk += dt * 12;
    G.freeCam = false;
  }
  h.vx = (h.x - ox) / Math.max(dt, 1e-4); h.vy = (h.y - oy) / Math.max(dt, 1e-4);
  for (const k in h.cds) h.cds[k] -= dt;
  h.flash -= dt;
  h.hp = Math.min(st.hp, h.hp + st.regen * dt);
  if (h.spinT > 0) {
    h.spinT -= dt; h.spinTick -= dt;
    if (h.spinTick <= 0) {
      h.spinTick = 0.12;
      for (const e of queryEnemies(h.x, h.y, 150)) hitEnemy(e, st.patk * 0.9, 0, { kb: 200, sx: h.x, sy: h.y, ls: st.ls, src: h, crit: st.crit, critMul: st.critMul, on: st.on, pw: st.patk });
      G.effects.push({ kind: 'slash', x: h.x, y: h.y, ang: G.time * 18, half: 1.6, r: 150, t: 0, life: 0.14, color: '#fff4c0', follow: true });
      sfx('slash');
    }
    return;
  }
  h.atkT -= dt;
  if (h.atkT <= 0) h.atkT = lordAttack() ? st.cd : 0.08;
}

// ================= 士兵与英雄 =================
function addUnit(type, x, y, lvl, xp, evo) {
  const d = HEROES[type] ? Object.assign({ hero: true, pop: 0 }, HEROES[type]) : evo ? evoDef(type, evo) : UNITS[type];
  if (!lvl) lvl = d.special ? Math.min(LVL_MAX.unit, 1 + Math.floor(G.wave / 4)) : 1;
  const u = { isUnit: true, id: ++G.uid, type, d, x, y, hp: 1, t: rand(0, 0.4), healT: 1, target: null, retarget: 0, face: 1, flash: 0, dead: false,
    slot: 0, bob: rand(0, TAU), r: d.hero ? 15 : 12, fly: !!d.fly, vx: 0, vy: 0, lvl, xp: xp || 0, st: {}, abT: d.ability ? d.ability.cd * 0.5 : 0, ab2T: 3, dodgeT: 0, fleeing: false, order: d.hero ? 'follow' : null };
  if (evo && d.evo) u.evo = evo;
  u.hp = unitStats(u).hp;
  G.units.push(u);
  burst(x, y, d.hero ? d.color : '#8fd4ff', d.hero ? 30 : 12, d.hero ? 220 : 140);
  return u;
}
function unitAnchor(u, alive, idx) {
  const h = G.lord;
  if (u.d.hero) {
    if (u.order && u.order !== 'follow') return { x: u.order.x, y: u.order.y, leash: 420, r: 20 };
    const a = idx * 1.3 + 0.6;
    return h.dead ? { x: G.rally.x, y: G.rally.y, leash: 460, r: 50 } : { x: h.x + Math.cos(a) * 70, y: h.y + Math.sin(a) * 70, leash: 460, r: 10 };
  }
  if (u.order && u.order.x !== undefined) return { x: u.order.x, y: u.order.y, leash: 320, r: 8 };
  return null;
}
// 英雄的战场判断：躲首领技能、躲飞来的弹道、残血撤退、远程被贴身时后撤。返回躲避方向
function heroThreat(u, st) {
  for (const e of G.enemies) if (e.boss && e.state === 'tele') {
    if (e.ab === 'slam') { const d = hypot(u.x - e.x, u.y - e.y); if (d < e.slamR + 30) return { x: (u.x - e.x) / (d || 1), y: (u.y - e.y) / (d || 1), why: 'boss' }; }
    else if (e.ab === 'dash') {
      const l = hypot(e.tdx, e.tdy) || 1, nx = e.tdx / l, ny = e.tdy / l, rx = u.x - e.x, ry = u.y - e.y;
      const along = rx * nx + ry * ny, perp = rx * ny - ry * nx;
      if (along > -30 && along < 540 && Math.abs(perp) < e.r + 40) { const sg = perp >= 0 ? 1 : -1; return { x: ny * sg, y: -nx * sg, why: 'boss' }; }
    }
  }
  for (const b of G.projs) {
    if (b.team !== 'enemy') continue;
    const rx = u.x - b.x, ry = u.y - b.y;
    if (rx * rx + ry * ry > 260 * 260) continue;
    const sp2 = b.vx * b.vx + b.vy * b.vy || 1, tt = (rx * b.vx + ry * b.vy) / sp2;
    if (tt < 0 || tt > 0.7) continue;
    const cx = b.x + b.vx * tt - u.x, cy = b.y + b.vy * tt - u.y;
    if (hypot(cx, cy) < u.r + b.r + 8) {
      const sp = Math.sqrt(sp2); let px = -b.vy / sp, py = b.vx / sp;
      if (px * cx + py * cy > 0) { px = -px; py = -py; }
      return { x: px, y: py, why: 'proj' };
    }
  }
  const k = u.hp / st.hp;
  u.fleeing = k < 0.3 ? true : k > 0.55 ? false : u.fleeing;
  if (u.fleeing && !u.d.taunt) {
    const e = nearestEnemy(u.x, u.y, 280);
    if (e) { const d = hypot(u.x - e.x, u.y - e.y) || 1; return { x: (u.x - e.x) / d, y: (u.y - e.y) / d, why: 'flee' }; }
  }
  if (u.d.range > 100) for (const e of queryEnemies(u.x, u.y, 90)) if (!e.d.ranged) {
    const d = hypot(u.x - e.x, u.y - e.y) || 1; return { x: (u.x - e.x) / d, y: (u.y - e.y) / d, why: 'kite' };
  }
  return null;
}
function updateUnits(dt) {
  const h = G.lord;
  const alive = G.units.filter(u => !u.dead);
  G.auraMul = alive.some(u => u.d.aura) ? 1 + Math.max(...alive.map(u => u.d.aura || 0)) : 1;
  // 没有单独命令的士兵：跟随领主（全局 F 或单独命令）或者在集结点围成圈
  const lordGrp = [], rallyGrp = [];
  for (const u of alive) {
    if (u.d.hero || (u.order && u.order.x !== undefined)) continue;
    if (!h.dead && (u.order === 'follow' || G.follow)) lordGrp.push(u); else rallyGrp.push(u);
  }
  const slotOf = new Map();
  lordGrp.forEach((u, i) => slotOf.set(u, { i, n: lordGrp.length, anc: h, follow: true }));
  rallyGrp.forEach((u, i) => slotOf.set(u, { i, n: rallyGrp.length, anc: G.rally, follow: false }));
  let hi = 0;
  for (const u of alive) {
    const d = u.d;
    const ox = u.x, oy = u.y;
    if (u.temp !== undefined) { u.temp -= dt; if (u.temp <= 0) { u.dead = true; burst(u.x, u.y, '#b07aff', 8, 120); continue; } }
    const stunned = tickStatus(u, dt, false);
    if (u.dead) continue;
    const st = unitStats(u);
    u.flash -= dt; u.bob += dt * 6; u.t -= dt; u.rageT -= dt; u.regenT -= dt; u.dodgeT -= dt;
    u.hp = Math.min(st.hp, u.hp + st.regen * dt);
    const mo = moraleOf(u);
    if (mo && mo.drain) u.hp = Math.max(1, u.hp - st.hp * mo.drain * dt);
    if (stunned) { u.vx = u.vy = 0; continue; }
    if (d.heal) {
      u.healT -= dt;
      if (u.healT <= 0) {
        let best = null, bp = 0.92;
        if (!h.dead && h.hp / lordStats().hp < bp && hypot(h.x - u.x, h.y - u.y) < 320) { best = h; bp = h.hp / lordStats().hp; }
        for (const o of alive) { if (o.dead) continue; const r = o.hp / unitStats(o).hp; if (r < bp && hypot(o.x - u.x, o.y - u.y) < 320) { best = o; bp = r; } }
        if (best) {
          healAlly(best, d.heal * (1 + 0.1 * (u.lvl - 1)));
          G.effects.push({ kind: 'beam', x: u.x, y: u.y, x2: best.x, y2: best.y, t: 0, life: 0.3, color: '#fff2a0' });
          u.healT = d.healCd;
        } else u.healT = 0.4;
      }
    }
    if (d.ability) { u.abT -= dt; if (u.abT <= 0) { const ok = castAbility(u, st, d.ability); if (ok) castFx(u.x, u.y + 10, d.color || '#ffd76a'); u.abT = ok ? d.ability.cd * (1 - st.cdr) : 0.5; } }
    if (d.hero) {
      const p2 = heroPerks(u).find(p => p.type === 'ability');
      if (p2) { u.ab2T -= dt; if (u.ab2T <= 0) { const ok = castAbility(u, st, p2.ab); if (ok) castFx(u.x, u.y + 10, d.color || '#ffd76a'); u.ab2T = ok ? p2.ab.cd * (1 - st.cdr) : 0.5; } }
    }
    const ha = unitAnchor(u, alive, d.hero ? hi++ : 0);
    const so = slotOf.get(u);
    const anc = ha || (so ? so.anc : G.rally), leash = ha ? ha.leash : 420;
    if (u.target && u.target.dead) u.target = null;
    u.retarget -= dt;
    const ranged = d.range > 100, rg = ranged ? rangeAt(u.x, u.y, st.range) : st.range;
    const ao = u.order && u.order.atk;
    if (ao) { if (ao.dead || !G.enemies.includes(ao)) delete u.order.atk; else { u.order.x = ao.x; u.order.y = ao.y; u.target = ao; u.retarget = 0.25; } }
    if (u.retarget <= 0) {
      u.retarget = 0.25;
      u.target = nearestEnemy(u.x, u.y, ranged ? rg + 100 : 240);
      if (u.target && hypot(u.target.x - anc.x, u.target.y - anc.y) > leash) u.target = null;
    }
    let tx, ty;
    const t = u.target;
    if (t) {
      const dx = t.x - u.x, dy = t.y - u.y, dd = hypot(dx, dy);
      const want = ranged ? rg * 0.9 : d.range + t.r;
      if (dd > want) { tx = t.x; ty = t.y; }
      if (dd <= (ranged ? rg : want + 10) && u.t <= 0) { unitAttack(u, t, st); u.t = st.cd; }
      u.face = dx < 0 ? -1 : 1;
    } else if (ha) {
      if (hypot(ha.x - u.x, ha.y - u.y) > ha.r) { tx = ha.x; ty = ha.y; }
    } else if (so) {
      const ring = Math.floor(so.i / 10), idx = so.i % 10, cnt = Math.min(10, so.n - ring * 10);
      const a = idx / Math.max(1, cnt) * TAU + ring * 0.3 + (so.follow ? G.time * 0.3 : 0);
      const rad = (so.follow ? 60 : 30) + ring * 34;
      tx = so.anc.x + Math.cos(a) * rad; ty = so.anc.y + Math.sin(a) * rad;
    }
    // 英雄会躲技能和弹道、残血撤退
    if (d.hero && !u.fly) {
      if (u.dodgeT <= 0) {
        const th = heroThreat(u, st);
        if (th) { u.dodge = th; u.dodgeT = th.why === 'proj' ? 0.25 : th.why === 'boss' ? 0.2 : 0.15; if (th.why === 'proj' && Math.random() < 0.3) addText(u.x, u.y - 30, '躲闪', '#bfe8ff', 0.75); }
      }
      if (u.dodgeT > 0 && u.dodge) { const sp = st.spd * (u.dodge.why === 'flee' ? 1.1 : 1.35); tryMove(u, u.x + u.dodge.x * sp * dt, u.y + u.dodge.y * sp * dt); tx = undefined; }
    }
    if (tx !== undefined) {
      const dd = hypot(tx - u.x, ty - u.y);
      if (dd > 4) {
        walkTo(u, tx, ty, st.spd * (dd > 200 ? 1.4 : 1), dt);
        if (!t && Math.abs(tx - u.x) > 3) u.face = tx < u.x ? -1 : 1;
      }
    }
    if (!u.fly) for (const o of alive) {
      if (o === u || o.fly || o.dead) continue;
      const dx = u.x - o.x, dy = u.y - o.y, dd = dx * dx + dy * dy, rr = u.r + o.r - 2;
      if (dd < rr * rr && dd > 0.01) { const l = Math.sqrt(dd); tryMove(u, u.x + dx / l * (rr - l) * 0.3, u.y + dy / l * (rr - l) * 0.3); }
    }
    u.x = clamp(u.x, 20, WORLD_W - 20); u.y = clamp(u.y, 20, WORLD_H - 20);
    u.vx = (u.x - ox) / Math.max(dt, 1e-4); u.vy = (u.y - oy) / Math.max(dt, 1e-4);
  }
  G.units = G.units.filter(u => !u.dead);
}
function unitAttack(u, t, st) {
  markAtk(u, t, u.d.range <= 100);
  const d = u.d, o = { src: u, ls: st.ls, crit: st.crit, critMul: st.critMul, anti: d.antiBig, slow: d.slow, on: st.on, pw: st.patk + st.matk };
  if (d.range > 100) {
    const pr = d.proj || {};
    shoot(u.x, u.y, t, st, Object.assign({ r: pr.r || 6, pierce: pr.pierce || 0, aoe: pr.aoe || 0, color: pr.color || '#fff', kind: pr.aoe ? 'fire' : st.matk > st.patk ? 'orb' : 'arrow',
      kb: 50, homing: !!pr.homing, tgt: t, src: u, slow: d.slow, on: st.on, pw: st.patk + st.matk }, {}));
    if (st.matk > st.patk) sfx('magic');
  } else if (d.slam || d.cleave) {
    const R = d.slam || d.cleave;
    for (const e of queryEnemies(t.x, t.y, R)) hitEnemy(e, st.patk, st.matk, Object.assign({ kb: 180, sx: u.x, sy: u.y, color: '#c8ecff' }, o));
    if (d.slam) G.effects.push({ kind: 'ring', x: t.x, y: t.y, r0: 10, r1: R, t: 0, life: 0.25, color: '#c9b08a', fill: true });
    else G.effects.push({ kind: 'slash', x: u.x, y: u.y, ang: Math.atan2(t.y - u.y, t.x - u.x), half: 1.3, r: R + 20, t: 0, life: 0.16, color: '#ffd0a0' });
  } else {
    hitEnemy(t, st.patk, st.matk, Object.assign({ kb: 100, sx: u.x, sy: u.y, color: '#c8ecff' }, o));
    G.effects.push({ kind: 'slash', x: u.x, y: u.y, ang: Math.atan2(t.y - u.y, t.x - u.x), half: 0.8, r: 30, t: 0, life: 0.12, color: st.matk > st.patk ? '#d8b0ff' : '#d8f0ff' });
  }
}
// 英雄技能（自动释放），返回 false 表示这次没有合适的时机
function castAbility(u, st, ab) {
  const sc = 1 + 0.12 * (u.lvl - 1);
  const near = r => nearestEnemy(u.x, u.y, r);
  const cluster = r => { const t = near(r); return t; };
  switch (ab.id) {
    case 'holy': {
      const R = 230, foes = queryEnemies(u.x, u.y, R);
      const hurt = [G.lord, ...G.units].filter(a => !a.dead && hypot(a.x - u.x, a.y - u.y) < R && a.hp < maxHpOf(a) * 0.8);
      if (!foes.length && !hurt.length) return false;
      for (const a of [G.lord, ...G.units]) if (!a.dead && hypot(a.x - u.x, a.y - u.y) < R) healAlly(a, maxHpOf(a) * 0.25);
      for (const e of foes) hitEnemy(e, 0, 80 * sc, { kb: 200, sx: u.x, sy: u.y, src: u });
      G.effects.push({ kind: 'ring', x: u.x, y: u.y, r0: 20, r1: R, t: 0, life: 0.5, color: '#fff2a0', fill: true });
      G.effects.push({ kind: 'pillar', x: u.x, y: u.y, w: 60, t: 0, life: 0.6 });
      break;
    }
    case 'volley': {
      const t = near(rangeAt(u.x, u.y, st.range)); if (!t) return false;
      const a0 = Math.atan2(t.y - u.y, t.x - u.x);
      for (let i = 0; i < 24; i++) { const a = a0 + (i - 11.5) * 0.045; fireProj({ x: u.x, y: u.y, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, p: 30 * sc, r: 7, pierce: 3, color: '#fff6a0', life: 0.8, kind: 'arrow', kb: 140, src: u }); }
      sfx('shoot'); break;
    }
    case 'meteor': {
      const t = near(st.range + 80); if (!t) return false;
      const tg = shuffle(queryEnemies(t.x, t.y, 220));
      for (let i = 0; i < 6; i++) { const e = tg[i] || t; G.effects.push({ kind: 'meteor', x: e.x + rand(-30, 30), y: e.y + rand(-30, 30), t: -0.1 - i * 0.1, life: 0.55, r: 100, p: 0, m: 90 * sc, src: u }); }
      break;
    }
    case 'raise': {
      if (!near(500)) return false;
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; const s = addUnit('skeleton', u.x + Math.cos(a) * 60, u.y + Math.sin(a) * 60); s.temp = 15; }
      G.effects.push({ kind: 'ring', x: u.x, y: u.y, r0: 10, r1: 160, t: 0, life: 0.5, color: '#b07aff', fill: true });
      break;
    }
    case 'blizzard': {
      const t = near(st.range + 60); if (!t) return false;
      G.zones.push({ x: t.x, y: t.y, r: 160, t: 4, tick: 0, m: 25 * sc, slow: 2, src: u, color: '#bfefff', icon: '❄️' });
      sfx('magic'); break;
    }
    case 'warcry': {
      if (!near(400)) return false;
      G.buffT = 8;
      for (const a of G.units) { healAlly(a, maxHpOf(a) * 0.3, true); burst(a.x, a.y, '#ffb35a', 6, 120); }
      G.effects.push({ kind: 'ring', x: u.x, y: u.y, r0: 20, r1: 300, t: 0, life: 0.45, color: '#ffb35a', fill: true });
      break;
    }
    case 'c4': {
      const t = near(380); if (!t) return false;
      burst(u.x, u.y, '#5a2a3a', 14, 160);
      if (u.type === 'assassin') { tryMove(u, t.x - 30, t.y); if (hypot(u.x - t.x, u.y - t.y) > 80) { u.x = t.x - 30; u.y = t.y; } }
      burst(u.x, u.y, '#ff5a7a', 14, 160);
      const bx = t.x, by = t.y;
      G.effects.push({ kind: 'bomb', x: bx, y: by, t: 0, life: 1.5 });
      G.delayed.push({ t: 1.5, fn: () => { explodeAt(bx, by, 150, 300 * sc, 0, '#ff8a3a', { kb: 380, src: u }); G.shake = Math.max(G.shake, 12); sfx('boom'); } });
      break;
    }
    case 'snipe': {
      const t = near(rangeAt(u.x, u.y, st.range) + 200); if (!t) return false;
      const a = Math.atan2(t.y - u.y, t.x - u.x);
      fireProj({ x: u.x, y: u.y, vx: Math.cos(a) * 2400, vy: Math.sin(a) * 2400, p: 260 * sc, r: 8, pierce: 99, color: '#fff0a0', life: 0.45, kind: 'arrow', kb: 200, src: u, crit: st.crit, critMul: st.critMul });
      G.effects.push({ kind: 'beam', x: u.x, y: u.y, x2: u.x + Math.cos(a) * 1000, y2: u.y + Math.sin(a) * 1000, t: 0, life: 0.25, color: '#fff0a0' });
      G.shake = Math.max(G.shake, 6); sfx('boom'); break;
    }
    case 'grove': {
      const all = [G.lord, ...G.units].filter(a => !a.dead && hypot(a.x - u.x, a.y - u.y) < 400);
      if (!all.some(a => a.hp < maxHpOf(a) * 0.75) && !near(300)) return false;
      for (const a of all) { healAlly(a, maxHpOf(a) * 0.4); if (a !== G.lord) a.regenT = 8; }
      for (let i = 0; i < 2; i++) { const w = addUnit('wolf', u.x + rand(-40, 40), u.y + rand(-40, 40)); w.temp = 15; }
      G.effects.push({ kind: 'ring', x: u.x, y: u.y, r0: 20, r1: 400, t: 0, life: 0.6, color: '#7ae0a0', fill: true });
      break;
    }
    case 'rage': {
      if (!near(200)) return false;
      u.rageT = 6;
      G.effects.push({ kind: 'ring', x: u.x, y: u.y, r0: 10, r1: 120, t: 0, life: 0.4, color: '#ff5a3a', fill: true });
      addText(u.x, u.y - 34, '狂暴！', '#ff5a3a', 1.4);
      break;
    }
    case 'plague': {
      const t = near(st.range + 60); if (!t) return false;
      G.zones.push({ x: t.x, y: t.y, r: 170, t: 5, tick: 0, m: 18 * sc, src: u, color: '#9ae04a', icon: '☠️', on: { st: 'poison', chance: 1, pow: 0.6, dur: 4 }, pw: st.matk });
      sfx('magic'); break;
    }
    case 'nova': {
      const R = 210, foes = queryEnemies(u.x, u.y, R); if (!foes.length) return false;
      for (const e of foes) hitEnemy(e, 0, 60 * sc, { kb: 120, sx: u.x, sy: u.y, src: u, on: { st: ab.st || 'stun', chance: 1, dur: 1.5 } });
      G.effects.push({ kind: 'ring', x: u.x, y: u.y, r0: 20, r1: R, t: 0, life: 0.45, color: u.d.color, fill: true });
      G.shake = Math.max(G.shake, 7); sfx('boom'); break;
    }
    default: return false;
  }
  addText(u.x, u.y - 40, `${ab.icon} ${ab.name}`, u.d.color, 1.1);
  sfx('skill');
  return true;
}
function summonHero(type) {
  const a = altar(), d = HEROES[type];
  if (!a || !d) return;
  const why = summonLock(type);
  if (why) { toast(why); sfx('err'); return; }
  G.res.gold -= heroCost(type); G.heroesSummoned++;
  const u = addUnit(type, a.x, a.y + a.w / 2 + 24);
  G.effects.push({ kind: 'pillar', x: u.x, y: u.y, w: 80, t: 0, life: 0.9 });
  G.effects.push({ kind: 'ring', x: u.x, y: u.y, r0: 10, r1: 180, t: 0, life: 0.5, color: d.color, fill: true });
  G.shake = Math.max(G.shake, 8);
  G.announce = { text: `${d.icon} ${d.name}`, sub: `${d.title} · 响应召唤！`, t: 2.2 };
  sfx('summon');
  G.sel = { kind: 'unit', id: u.id }; G.group = [u.id];
}
function reviveLock(type) {
  const sn = G.heroDead[type];
  if (!sn) return '没有阵亡';
  if (!shrine()) return '需要先建造复活祭坛';
  if (heroesAlive().length >= heroSlots()) return heroSlots() ? `英雄已满（${heroSlots()} 位），升级英雄祭坛可增加` : '需要英雄祭坛提供英雄位';
  if (G.res.gold < reviveCost(type)) return '金币不足';
  return null;
}
function reviveHero(type) {
  const why = reviveLock(type);
  if (why) { toast(why); sfx('err'); return; }
  const sh = shrine(), sn = G.heroDead[type], d = HEROES[type];
  G.res.gold -= reviveCost(type);
  delete G.heroDead[type];
  const u = addUnit(type, sh.x, sh.y + sh.w / 2 + 24, sn.lvl, sn.xp);
  G.effects.push({ kind: 'pillar', x: u.x, y: u.y, w: 80, t: 0, life: 0.9 });
  G.effects.push({ kind: 'ring', x: u.x, y: u.y, r0: 10, r1: 180, t: 0, life: 0.5, color: d.color, fill: true });
  G.announce = { text: `${d.icon} ${d.name} 复活了`, sub: `保留 Lv${sn.lvl} 和全部技能`, t: 2.4 };
  sfx('summon');
  G.sel = { kind: 'unit', id: u.id }; G.group = [u.id];
}
function summonLock(type) {
  const a = altar(), d = HEROES[type];
  if (!a) return '需要先建造英雄祭坛';
  if (!isUnlocked('hero', type)) return `累计荣耀 ${unlockOf('hero', type).need} 解锁`;
  if (G.heroDead[type]) return '已阵亡，要在复活祭坛复活';
  if (G.units.some(u => u.type === type && !u.dead)) return '已经在场';
  if (a.lvl < d.altar) return `需要 ${d.altar} 级祭坛`;
  if (heroesAlive().length >= heroSlots()) return `英雄已满（${heroSlots()} 位），升级祭坛可增加`;
  if (G.res.gold < heroCost(type)) return '金币不足';
  return null;
}

// ================= 建筑：生产、训练、防御 =================
function towerStats(b) {
  const A = b.d.attack, L = b.lvl - 1, mul = G.s.towerDmg * (1 + 0.12 * G.smithy.ammo) * (1 + synVal(b, 'dmg'));
  return { patk: (A.patk ? A.patk[L] : 0) * mul, matk: (A.matk ? A.matk[L] : 0) * mul, cd: A.cd / G.s.towerSpd / (1 + synVal(b, 'spd')),
    range: rangeAt(b.x, b.y, A.range), acc: Math.min(1, A.acc + 0.03 * G.smithy.ammo + G.s.acc), pspd: (A.pspd || 800) * G.s.pspd, crit: 0.05, critMul: 2, ls: 0 };
}
function updateBuildings(dt) {
  if (G.synDirty) computeSynergy();
  G.prodT += dt;
  const showProd = G.prodT > 4; if (showProd) G.prodT = 0;
  for (const b of G.buildings) {
    b.flash -= dt; if (b.popT > 0) b.popT -= dt;
    const d = b.d, L = b.lvl - 1;
    const pa = b.prodAcc;
    for (const k of RES_KEYS) {
      const v = bProd(b, k) * dt; if (!v) continue;
      G.res[k] += v; pa[k] += v; if (k === 'gold') G.totalGold += v;
    }
    if (showProd) {
      let txt = '';
      for (const k in pa) if (pa[k] >= 1) { txt += `+${Math.floor(pa[k])}${RES_ICON[k]} `; pa[k] -= Math.floor(pa[k]); }
      if (txt) addText(b.x, b.y - b.w / 2, txt.trim(), pa.gold !== undefined && d.gold ? '#ffd24a' : '#e8d8b0', 0.9);
    }
    if (b.queue.length) {
      b.trainT += dt * (1 + synVal(b, 'train'));
      if (b.trainT >= UNITS[b.queue[0]].time) {
        b.trainT = 0;
        addUnit(b.queue.shift(), b.x + rand(-10, 10), b.ty * T + b.w + 14, synVal(b, 'lvl') ? 1 + synVal(b, 'lvl') : undefined);
        sfx('buy');
      }
    }
    if (d.attack && fighting()) {
      const A = d.attack;
      b.t -= dt;
      if (b.t > 0) continue;
      const st = towerStats(b);
      const tgt = nearestEnemy(b.x, b.y, st.range, !A.air);
      if (!tgt) { b.t = 0.15; continue; }
      b.t = st.cd;
      const sy = b.y - b.w * 0.35;
      if (A.kind === 'arrow') {
        shoot(b.x, sy, tgt, st, { r: 5, color: '#f0e0a0', kind: 'arrow', kb: 40, range: st.range });
        sfx('shoot');
      } else if (A.kind === 'shell') {
        // 炮弹：按精度预判落点，精度越低散布越大
        const hg = hgMod(b.x, b.y, tgt), acc = clamp(st.acc + hg.acc, 0.05, 1);
        const d0 = hypot(tgt.x - b.x, tgt.y - sy), dur = clamp(d0 / st.pspd, 0.35, 0.9);
        const lx = tgt.x + (tgt.vx || 0) * dur * acc + gauss() * (1 - acc) * 110, ly = tgt.y + (tgt.vy || 0) * dur * acc + gauss() * (1 - acc) * 110;
        G.projs.push({ kind: 'shell', team: 'ally', x: b.x, y: sy, sx: b.x, sy, tx: lx, ty: ly, t: 0, dur, p: st.patk * hg.dmg, m: 0, aoe: A.aoe, life: 9, hit: new Set(), color: '#ffb060', r: 8, vx: 0, vy: 0 });
        sfx('shoot');
      } else if (A.kind === 'chain') {
        let cur = tgt, px = b.x, py = sy;
        const hit = new Set();
        for (let k = 0; k < A.chains[L] && cur; k++) {
          hit.add(cur.id);
          G.effects.push({ kind: 'zap', x: px, y: py, x2: cur.x, y2: cur.y, t: 0, life: 0.22, seed: Math.random() });
          hitEnemy(cur, st.patk * Math.pow(0.85, k), st.matk * Math.pow(0.85, k), { color: '#bfe8ff', slow: 1.5 });
          px = cur.x; py = cur.y;
          let nb = null, nd = 160 * 160;
          for (const e of queryEnemies(px, py, 160)) { if (hit.has(e.id) || e.dead) continue; const dd = (e.x - px) ** 2 + (e.y - py) ** 2; if (dd < nd) { nd = dd; nb = e; } }
          cur = nb;
        }
        sfx('magic');
      }
    }
    if (d.trap && fighting()) {
      b.t -= dt;
      if (b.t > 0) continue;
      b.t = d.trap.cd;
      const x0 = b.tx * T, y0 = b.ty * T;
      for (const e of queryEnemies(b.x, b.y, T * 0.7, true)) {
        if (e.x > x0 - e.r * 0.5 && e.x < x0 + T + e.r * 0.5 && e.y > y0 - e.r * 0.5 && e.y < y0 + T + e.r * 0.5) {
          hitEnemy(e, d.trap.patk[L] * G.s.towerDmg, 0, { color: '#ffaaaa', on: { st: 'bleed', chance: 0.3, pow: 0.4, dur: 3 }, pw: d.trap.patk[L] }); b.flash = 0.15;
        }
      }
    }
  }
}

// ================= 敌人 =================
function enemyBlocked(x, y, e) {
  const cr = Math.min(e.r * 0.6, 13), i0 = tIdx(e.x, e.y), i1 = tIdx(x, y);
  if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return { water: true };
  if (i1 !== i0 && !canStep(i0, i1)) return { water: true };
  for (const [ox, oy] of [[0, 0], [cr, 0], [-cr, 0], [0, cr], [0, -cr]]) {
    const px = x + ox, py = y + oy;
    if (px < 0 || py < 0 || px >= WORLD_W || py >= WORLD_H) return { water: true };
    if (MAP.water[tIdx(px, py)]) return { water: true };
    const b = solidBuildingAt(px, py);
    if (b) return { b };
  }
  return null;
}
// 仇恨优先级：嘲讽 > 领主、英雄和士兵 > 城墙与防御设施 > 挡路的建筑 > 主城等主建筑
function pickEnemyTarget(e) {
  const h = G.lord;
  for (const u of G.units) { const tr = u.d.taunt; if (tr && !u.dead && hypot(u.x - e.x, u.y - e.y) < tr) return u; }
  const aggro = e.d.ranged ? e.d.ranged.range : e.boss ? 260 : e.home ? 250 : 170;
  let best = null, bd = aggro * aggro;
  if (!h.dead) { const d2 = (h.x - e.x) ** 2 + (h.y - e.y) ** 2; if (d2 < bd) { bd = d2; best = h; } }
  for (const u of G.units) { if (u.dead) continue; const d2 = (u.x - e.x) ** 2 + (u.y - e.y) ** 2; if (d2 < bd) { bd = d2; best = u; } }
  if (best) return best;
  const reach = e.d.ranged ? e.d.ranged.range * 0.7 : 60;
  let bb = null, bbd = reach;
  for (const b of G.buildings) {
    if (b.d.cat !== 'defense') continue;
    if (Math.abs(b.x - e.x) > 360 || Math.abs(b.y - e.y) > 360) continue;
    const dd = edgeDist(b, e.x, e.y);
    if (dd < bbd) { bbd = dd; bb = b; }
  }
  if (bb) return bb;
  if (!e.fly) {
    const n = nextTile(tIdx(e.x, e.y));
    if (n >= 0 && G.tiles[n]) { const b = G.bmap.get(G.tiles[n]); if (b && isSolid(b)) return b; }
  }
  for (const b of G.buildings) {
    if (b.d.cat === 'trap') continue;
    if (Math.abs(b.x - e.x) > 220 || Math.abs(b.y - e.y) > 220) continue;
    if (edgeDist(b, e.x, e.y) < (e.d.ranged ? e.d.ranged.range * 0.5 : 26)) return b;
  }
  return null;
}
function enemyShoot(e, t, R) {
  const n = R.n || 1, st = { acc: R.acc || 0.8, pspd: R.pspd, range: R.range, patk: e.patk, matk: e.matk, crit: 0, critMul: 1, ls: e.ls };
  const hg = hgMod(e.x, e.y, t), acc = clamp(st.acc + hg.acc, 0.05, 1);
  const d = hypot(t.x - e.x, t.y - e.y), tt = d / st.pspd;
  const a0 = Math.atan2(t.y + (t.vy || 0) * tt * acc - e.y, t.x + (t.vx || 0) * tt * acc - e.x);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i - (n - 1) / 2) * 0.25 + gauss() * (1 - acc) * 0.45;
    fireProj({ team: 'enemy', x: e.x, y: e.y, vx: Math.cos(a) * st.pspd, vy: Math.sin(a) * st.pspd, r: 7, p: e.patk * hg.dmg, m: e.matk * hg.dmg, siege: 1, life: R.range * 1.3 / st.pspd, color: '#ff5ad0', src: e });
  }
}
function updateEnemies(dt) {
  const c = castle();
  for (const e of G.enemies) {
    if (e.dead) continue;
    const ox = e.x, oy = e.y;
    e.flash -= dt; e.slowT -= dt; e.atkT -= dt;
    const stunned = tickStatus(e, dt, true);
    if (e.dead) continue;
    if (e.camp || e.eb) { updateStatic(e, dt); continue; }
    if (e.regen) e.hp = Math.min(e.maxHp, e.hp + e.regen * dt * (e.st.poison ? 0.5 : 1));
    if (e.aff) updateAffixes(e, dt);
    if (stunned) {
      const decay = Math.pow(0.002, dt); e.x += e.kbx * dt; e.y += e.kby * dt; e.kbx *= decay; e.kby *= decay;
      e.x = clamp(e.x, 15, WORLD_W - 15); e.y = clamp(e.y, 15, WORLD_H - 15); e.vx = e.vy = 0; continue;
    }
    let slowK = e.slowT > 0 || e.st.chill ? 0.5 : 1;
    for (const z of G.zones) if (z.slow && hypot(z.x - e.x, z.y - e.y) < z.r) slowK = Math.min(slowK, 0.35);
    const spd = e.spd * slowK;
    e.retarget -= dt;
    if (e.target && (e.target.dead || (e.target.tx !== undefined && !G.bmap.has(e.target.id)))) e.target = null;
    if (e.retarget <= 0) { e.retarget = 0.3; const nt = pickEnemyTarget(e); if (nt || !e.target || e.target.tx === undefined) e.target = nt; }
    // 据点守卫：只在营地附近迎战，不去拆建筑，追远了就回去
    if (e.home && e.target) { const hm = homeOf(e); if (e.target.tx !== undefined || hypot(e.target.x - hm.x, e.target.y - hm.y) > (hm === e.home ? 380 : 520)) e.target = null; }
    if (e.goal && e.goal.id && !G.bmap.has(e.goal.id)) { const c = castle(); e.goal = c ? { id: c.id, x: c.x, y: c.y, tile: tIdx(c.x, c.y) } : null; }
    if (e.boss && !updateBoss(e, dt)) { e.x = clamp(e.x, 15, WORLD_W - 15); e.y = clamp(e.y, 15, WORLD_H - 15); e.vx = (e.x - ox) / dt; e.vy = (e.y - oy) / dt; continue; }
    const t = e.target;
    let mvx = 0, mvy = 0;
    if (t) {
      const isB = t.tx !== undefined;
      const tdist = isB ? edgeDist(t, e.x, e.y) : hypot(t.x - e.x, t.y - e.y) - (t.r || 14);
      const range = e.d.ranged ? e.d.ranged.range * 0.85 : e.r + 6;
      if (tdist > range) {
        let gx = t.x, gy = t.y;
        // 追击友军时，如果中间隔着悬崖，就沿流场绕到坡道
        if (!isB && !e.fly) {
          e.lwT = (e.lwT || 0) - dt;
          if (e.lwT <= 0) { e.lwT = 0.4; e.lwOk = lineWalkable(e.x, e.y, t.x, t.y); }
          if (!e.lwOk) { const n = allyNext(tIdx(e.x, e.y), tIdx(t.x, t.y)); if (n >= 0) { gx = (n % GW) * T + T / 2; gy = ((n / GW) | 0) * T + T / 2; } }
        }
        const dx = gx - e.x, dy = gy - e.y, l = hypot(dx, dy) || 1;
        mvx = dx / l; mvy = dy / l;
      } else if (e.atkT <= 0) {
        e.atkT = (e.boss ? 1.2 : 1.0) * (e.aspd || 1); markAtk(e, t, !e.d.ranged);
        if (e.d.ranged) { enemyShoot(e, t, e.d.ranged); e.atkT = e.d.ranged.cd * (e.aspd || 1); }
        else if (isB) {
          hurtBuilding(t, (e.patk + e.matk) * (e.d.siege || 1));
          burst(e.x + (t.x - e.x) * 0.3, e.y + (t.y - e.y) * 0.3, '#b09070', 3, 80);
        } else hurtAlly(t, e.patk, e.matk, e);
      }
      if (Math.abs(t.x - e.x) > 2) e.face = t.x < e.x ? -1 : 1;
    } else if (e.home) {
      const hm = homeOf(e);
      let gx = hm.x, gy = hm.y;
      if (!e.fly && hypot(gx - e.x, gy - e.y) > 200) { const n = allyNext(tIdx(e.x, e.y), tIdx(gx, gy)); if (n >= 0) { gx = (n % GW) * T + T / 2; gy = ((n / GW) | 0) * T + T / 2; } }
      const dx = gx - e.x, dy = gy - e.y, l = hypot(dx, dy);
      if (l > 14) { mvx = dx / l; mvy = dy / l; e.face = mvx < 0 ? -1 : 1; }
    } else if (e.goal) {
      // 征服模式：敌国派出的进攻部队沿地形走向目标建筑
      let gx = e.goal.x, gy = e.goal.y;
      if (!e.fly) { const n = allyNext(tIdx(e.x, e.y), e.goal.tile); if (n >= 0) { gx = (n % GW) * T + T / 2; gy = ((n / GW) | 0) * T + T / 2; } }
      const dx = gx - e.x, dy = gy - e.y, l = hypot(dx, dy) || 1;
      mvx = dx / l; mvy = dy / l;
      if (Math.abs(mvx) > 0.1) e.face = mvx < 0 ? -1 : 1;
    } else {
      // 沿流场走向主城
      let tx = c ? c.x : WORLD_W / 2, ty = c ? c.y : WORLD_H / 2;
      if (!e.fly) {
        const n = nextTile(tIdx(e.x, e.y));
        if (n >= 0) { tx = (n % GW) * T + T / 2; ty = ((n / GW) | 0) * T + T / 2; }
      }
      const dx = tx - e.x, dy = ty - e.y, l = hypot(dx, dy) || 1;
      mvx = dx / l; mvy = dy / l;
      if (Math.abs(mvx) > 0.1) e.face = mvx < 0 ? -1 : 1;
    }
    if (e.type === 'bat') { const w = Math.sin(G.time * 6 + e.wob) * 0.5, ox2 = mvx; mvx -= mvy * w; mvy += ox2 * w; }
    const nx = e.x + mvx * spd * dt + e.kbx * dt, ny = e.y + mvy * spd * dt + e.kby * dt;
    const decay = Math.pow(0.002, dt); e.kbx *= decay; e.kby *= decay;
    if (e.fly) { e.x = nx; e.y = ny; }
    else {
      const bx = enemyBlocked(nx, e.y, e); if (!bx) e.x = nx; else if (bx.b && !e.target) e.target = bx.b;
      const by = enemyBlocked(e.x, ny, e); if (!by) e.y = ny; else if (by.b && !e.target) e.target = by.b;
    }
    // 推挤
    let pushed = 0;
    for (const o of queryEnemies(e.x, e.y, e.r)) {
      if (o === e || pushed > 5 || o.fly !== e.fly || o.camp || o.eb) continue;
      const qx = e.x - o.x, qy = e.y - o.y, l = hypot(qx, qy) || 0.01, ov = e.r + o.r - l;
      if (ov > 0) {
        const k = o.boss ? 0.8 : e.boss ? 0.05 : 0.4, px = e.x + qx / l * ov * k, py = e.y + qy / l * ov * k;
        if (e.fly || !enemyBlocked(px, py, e)) { e.x = px; e.y = py; }
        pushed++;
      }
    }
    e.x = clamp(e.x, 15, WORLD_W - 15); e.y = clamp(e.y, 15, WORLD_H - 15);
    e.vx = (e.x - ox) / Math.max(dt, 1e-4); e.vy = (e.y - oy) / Math.max(dt, 1e-4);
  }
  G.enemies = G.enemies.filter(e => !e.dead);
}
function updateBoss(e, dt) {
  if ((e.home || e.goal) && !e.target && !e.state) return true;
  const tgt = e.target || castle() || G.lord;
  if (e.state === 'tele') {
    e.stT -= dt;
    if (e.stT <= 0) {
      if (e.ab === 'slam') {
        const R = e.slamR;
        G.effects.push({ kind: 'ring', x: e.x, y: e.y, r0: 20, r1: R, t: 0, life: 0.4, color: '#ff6a3a', fill: true });
        burst(e.x, e.y, '#c9a070', 50, 380); G.shake = 16; sfx('boom');
        const h = G.lord;
        if (!h.dead && hypot(h.x - e.x, h.y - e.y) < R + h.r) hurtAlly(h, e.patk * 1.4, e.matk * 1.4, e);
        for (const u of G.units) if (!u.dead && hypot(u.x - e.x, u.y - e.y) < R) hurtAlly(u, e.patk * 2, e.matk * 2, e);
        for (const b of G.buildings.slice()) if (edgeDist(b, e.x, e.y) < R) hurtBuilding(b, (e.patk + e.matk) * 3);
        e.state = null;
      } else if (e.ab === 'dash') {
        e.state = 'dash'; e.stT = 0.55;
        const l = hypot(e.tdx, e.tdy) || 1; e.dvx = e.tdx / l * 900; e.dvy = e.tdy / l * 900;
      }
    }
    return false;
  }
  if (e.state === 'dash') {
    e.stT -= dt;
    const nx = e.x + e.dvx * dt, ny = e.y + e.dvy * dt;
    if (!e.fly && (MAP.water[tIdx(nx, ny)] || !canStep(tIdx(e.x, e.y), tIdx(nx, ny)))) e.stT = 0;
    else { e.x = nx; e.y = ny; }
    burst(e.x, e.y, e.d.color, 3, 100);
    const h = G.lord;
    if (!h.dead && hypot(h.x - e.x, h.y - e.y) < e.r + h.r && !e.dashHitHero) { e.dashHitHero = true; hurtAlly(h, e.patk, e.matk, e); }
    for (const u of G.units) if (!u.dead && hypot(u.x - e.x, u.y - e.y) < e.r + u.r) hurtAlly(u, e.patk * 0.5, e.matk * 0.5, e);
    const b = e.fly ? null : solidBuildingAt(e.x, e.y);
    if (b) { hurtBuilding(b, (e.patk + e.matk) * 4); e.state = null; G.shake = 12; e.x -= e.dvx * dt * 2; e.y -= e.dvy * dt * 2; }
    if (e.stT <= 0) e.state = null;
    return false;
  }
  e.abT -= dt;
  if (e.abT <= 0) {
    const abs = e.d.abilities;
    e.ab = abs[e.abI++ % abs.length];
    castFx(e.x, e.y + e.r * 0.5, '#ff5a3a', e.r * 1.6);
    e.abT = e.hp / e.maxHp < 0.5 ? 2.6 : 3.6;
    const dx = tgt.x - e.x, dy = tgt.y - e.y;
    if (e.ab === 'slam') { e.state = 'tele'; e.stT = 1.0; e.slamR = 150 + e.r; }
    else if (e.ab === 'dash') { e.state = 'tele'; e.stT = 0.8; e.tdx = dx; e.tdy = dy; e.dashHitHero = false; }
    else if (e.ab === 'burst') {
      const n = 14 + G.wave, off = Math.random();
      for (let k = 0; k < 2; k++) G.delayed.push({ t: k * 0.35, fn: () => {
        for (let i = 0; i < n; i++) {
          const a = (i + off + k * 0.5) / n * TAU;
          fireProj({ team: 'enemy', x: e.x, y: e.y, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, r: 9, p: e.patk * 0.5, m: e.matk * 0.5 + (e.matk ? 0 : e.patk * 0.2), siege: 2, life: 4, color: '#ff4a6a', src: e });
        }
      } });
    } else if (e.ab === 'summon') {
      for (let i = 0; i < 6 + G.wave / 2; i++) {
        const a = rand(0, TAU);
        if (e.home && G.enemies.filter(o => o.summoner === e && !o.dead).length >= 8) break;
        const m = spawnEnemy(e.fac ? pickEType(e.fac) : G.wave >= 10 ? pick(['skeleton', 'orc', 'zombie']) : 'goblin', e.x + Math.cos(a) * (e.r + 40), e.y + Math.sin(a) * (e.r + 40), false);
        if (e.home) { m.summoner = e; m.home = { x: m.x, y: m.y, camp: null }; m.gold *= 0.3; if (e.fac) { m.fac = e.fac; levelUp(m, facLvl(e.fac)); } if (e.lair) m.lair = e.lair; }
      }
      burst(e.x, e.y, '#7040a0', 30, 260);
    }
  }
  return true;
}

// ================= 弹道 =================
function updateProjs(dt) {
  const h = G.lord;
  for (const b of G.projs) {
    b.life -= dt;
    if (b.kind === 'shell') {
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.x = b.sx + (b.tx - b.sx) * k; b.y = b.sy + (b.ty - b.sy) * k - Math.sin(k * Math.PI) * 90;
      if (k >= 1) { explodeAt(b.tx, b.ty, b.aoe, b.p, b.m, '#ffb060', { groundOnly: true }); b.life = 0; }
      continue;
    }
    if (b.homing) {
      if (!b.tgt || b.tgt.dead) b.tgt = nearestEnemy(b.x, b.y, 400);
      if (b.tgt) {
        const sp = hypot(b.vx, b.vy) || 400, dx = b.tgt.x - b.x, dy = b.tgt.y - b.y, l = hypot(dx, dy) || 1;
        b.vx += (dx / l * sp - b.vx) * Math.min(1, dt * 9); b.vy += (dy / l * sp - b.vy) * Math.min(1, dt * 9);
        const s2 = hypot(b.vx, b.vy) || 1; b.vx = b.vx / s2 * sp; b.vy = b.vy / s2 * sp;
      }
    }
    if (!b.tr) b.tr = []; b.tr.push(b.x, b.y); if (b.tr.length > 16) b.tr.splice(0, 2);
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < 0 || b.y < 0 || b.x > WORLD_W || b.y > WORLD_H) b.life = 0;
    if (b.life <= 0) continue;
    if (b.team === 'ally') {
      for (const e of queryEnemies(b.x, b.y, b.r)) {
        if (b.hit.has(e.id)) continue;
        b.hit.add(e.id);
        if (b.aoe) { explodeAt(b.x, b.y, b.aoe, b.p, b.m, b.color, { src: b.src, ls: b.ls, on: b.on, pw: b.pw }); b.life = 0; break; }
        hitEnemy(e, b.p, b.m, { kb: b.kb, sx: b.x - b.vx, sy: b.y - b.vy, color: b.src && b.src.isUnit ? '#c8ecff' : undefined, src: b.src, ls: b.ls, crit: b.crit, critMul: b.critMul, slow: b.slow, on: b.on, pw: b.pw });
        if (--b.pierce < 0) { b.life = 0; break; }
      }
      if (b.life <= 0 && b.aoe && !b.hit.size) explodeAt(b.x, b.y, b.aoe, b.p, b.m, b.color, { src: b.src, ls: b.ls, on: b.on, pw: b.pw });
    } else {
      if (!h.dead && hypot(b.x - h.x, b.y - h.y) < b.r + h.r - 3) { hurtAlly(h, b.p, b.m, b.src); b.life = 0; continue; }
      for (const u of G.units) if (!u.dead && hypot(b.x - u.x, b.y - u.y) < b.r + u.r) { hurtAlly(u, b.p, b.m, b.src); b.life = 0; break; }
      if (b.life > 0) { const bl = solidBuildingAt(b.x, b.y); if (bl) { hurtBuilding(bl, (b.p + b.m) * (b.siege || 1)); b.life = 0; } }
    }
  }
  G.projs = G.projs.filter(b => b.life > 0);
  // 持续区域（暴风雪）
  for (const z of G.zones) {
    z.t -= dt; z.tick -= dt;
    if (z.tick <= 0) { z.tick = 0.5; for (const e of queryEnemies(z.x, z.y, z.r)) hitEnemy(e, 0, z.m, { slow: z.slow, src: z.src, color: z.color, on: z.on, pw: z.pw }); }
  }
  G.zones = G.zones.filter(z => z.t > 0);
}
function updateCoins(dt) {
  const h = G.lord, pr = G.s.pickup;
  for (const c of G.coins) {
    const dx = h.x - c.x, dy = h.y - c.y, d = hypot(dx, dy) || 1;
    if (!h.dead && d < pr) c.mag = true;
    if (c.mag && !h.dead) {
      c.spd += dt * 1600;
      const s = (520 + c.spd) * dt;
      c.x += dx / d * Math.min(d, s); c.y += dy / d * Math.min(d, s);
      if (d < h.r + 8) { c.gone = true; G.res.gold += c.v; G.totalGold += c.v; sfx('coin'); }
    } else {
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.vx *= Math.pow(0.02, dt); c.vy *= Math.pow(0.02, dt);
    }
  }
  G.coins = G.coins.filter(c => !c.gone);
}
// 倒地：向一侧倾倒、下沉并淡出
function addCorpse(key, icon, x, y, size, flip, life, fly) {
  if (!G.corpses) G.corpses = [];
  if (G.corpses.length > 140) G.corpses.shift();
  G.corpses.push({ key, icon, x, y, size, flip, life, fly, t: 0 });
}
function drawCorpses(vis) {
  for (const c of G.corpses || []) {
    if (!vis(c.x, c.y)) continue;
    const k = c.t / c.life, fall = Math.min(1, k * 3.2), foot = c.y + c.size / 2;
    ctx.save(); ctx.globalAlpha = k < 0.55 ? 1 : Math.max(0, 1 - (k - 0.55) / 0.45);
    ctx.translate(c.x, foot + (c.fly ? fall * 14 : k * 5)); ctx.rotate((c.flip ? -1 : 1) * fall * 1.35); ctx.scale(1, 1 - fall * 0.15); ctx.translate(-c.x, -foot);
    ctx.filter = 'brightness(0.65) saturate(0.7)';
    drawArt(c.key, c.icon, c.x, c.y, c.size, c.flip, c.flip);
    ctx.filter = 'none'; ctx.restore();
  }
}
function updateFx(dt) {
  if (G.corpses) { for (const c of G.corpses) c.t += dt; G.corpses = G.corpses.filter(c => c.t < c.life); }
  for (const q of G.particles) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92; }
  G.particles = G.particles.filter(q => q.life > 0);
  for (const t of G.texts) { t.life -= dt; t.y += t.vy * dt; t.vy *= 0.94; }
  G.texts = G.texts.filter(t => t.life > 0);
  for (const f of G.effects) {
    const was = f.t; f.t += dt;
    if (f.kind === 'meteor' && was < f.life && f.t >= f.life) {
      for (const e of queryEnemies(f.x, f.y, f.r)) hitEnemy(e, f.p, f.m, { kb: 300, sx: f.x, sy: f.y, color: '#ffb060', src: f.src, on: { st: 'burn', chance: 0.6, pow: 0.3, dur: 3 }, pw: f.m });
      burst(f.x, f.y, '#ff8a3a', 26, 340);
      G.effects.push({ kind: 'ring', x: f.x, y: f.y, r0: 10, r1: f.r, t: 0, life: 0.3, color: '#ff8a3a', fill: true });
      G.shake = Math.max(G.shake, 9); sfx('boom');
    }
    if (f.kind === 'strike' && was < f.life && f.t >= f.life) {
      for (const e of queryEnemies(f.x, f.y, f.r)) hitEnemy(e, f.p, f.m, { kb: 60, sx: f.x, sy: f.y - 10, src: f.src });
      burst(f.x, f.y, '#e6d8a0', 3, 80); sfx('hit');
    }
  }
  G.effects = G.effects.filter(f => f.t < f.life + (f.kind === 'meteor' || f.kind === 'strike' ? 0.01 : 0));
  for (const d of G.delayed) { d.t -= dt; if (d.t <= 0) { d.fn(); d.done = true; } }
  G.delayed = G.delayed.filter(d => !d.done);
}

// ================= 主循环 =================
let last = performance.now(), uiT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G && G.hitStop > 0) G.hitStop -= dt;
  else if (G && !G.paused && isLive()) {
    const sp = G.speed * (window.__speed || 1), steps = Math.ceil(sp);
    for (let i = 0; i < steps && isLive(); i++) step(dt * sp / steps);
  }
  if (G) { updateCamera(dt); uiT -= dt; if (uiT <= 0) { uiT = 0.2; updateUI(); } }
  render();
  requestAnimationFrame(frame);
}
function step(rawDt) {
  G.slowmoT -= rawDt;
  const dt = rawDt * (G.slowmoT > 0 ? 0.3 : 1);
  G.time += dt;
  G.shake *= Math.pow(0.004, rawDt); G.hurtFlash -= rawDt; G.buffT -= dt;
  if (G.comboT > 0) { G.comboT -= rawDt; if (G.comboT <= 0) G.combo = 0; }
  if (G.announce) { G.announce.t -= rawDt; if (G.announce.t <= 0) G.announce = null; }
  if (G.flowDirty) computeFlow();
  if (G.phase === 'prep') { if (!(G.tut && G.tut.i < 6)) G.prepT -= dt; if (G.prepT <= 0) startBattle(); }
  buildGrid();
  updateLord(dt);
  if (G.tut) tutCheck();
  if (G.phase === 'battle') updateSpawns(dt);
  if (G.phase === 'war') updateConquest(dt);
  updateBuildings(dt);
  updateUnits(dt);
  updateEnemies(dt);
  if (G.phase === 'over') return;
  buildGrid();
  updateProjs(dt);
  if (G.phase === 'over') return;
  updateCoins(dt);
  updateFx(dt);
  checkWaveEnd();
}
function updateCamera(dt) {
  const cam = G.cam, h = G.lord;
  const pan = 900 / cam.z * dt;
  if (keys.ArrowLeft) { cam.x -= pan; G.freeCam = true; }
  if (keys.ArrowRight) { cam.x += pan; G.freeCam = true; }
  if (keys.ArrowUp) { cam.y -= pan; G.freeCam = true; }
  if (keys.ArrowDown) { cam.y += pan; G.freeCam = true; }
  if (!G.freeCam && !h.dead) { cam.x += (h.x - cam.x) * Math.min(1, dt * 8); cam.y += (h.y - cam.y) * Math.min(1, dt * 8); }
  const hw = VW / 2 / cam.z, hh = VH / 2 / cam.z;
  cam.x = hw * 2 > WORLD_W ? WORLD_W / 2 : clamp(cam.x, hw, WORLD_W - hw);
  cam.y = hh * 2 > WORLD_H ? WORLD_H / 2 : clamp(cam.y, hh, WORLD_H - hh);
}

// ================= 输入 =================
const keys = {};
const mouse = { sx: 0, sy: 0, painting: false, mdrag: null, minimap: false, box: null };
function toWorld(sx, sy) { const c = G.cam; return [(sx - VW / 2) / c.z + c.x, (sy - VH / 2) / c.z + c.y]; }
const BUILD_KEYS = { F1: 0, F2: 1, F3: 2, F4: 3, F5: 4, F6: 5, F7: 6, F8: 7, F9: 8, F10: 9 };
// 编队：Ctrl+数字 编组，数字 选中，连按两下 视角跳过去
const grpTap = { n: 0, t: 0 };
function ctrlGroup(n, assign) {
  const cg = G.ctrlGroups || (G.ctrlGroups = {});
  if (assign) {
    const ids = groupUnits().map(u => u.id);
    if (!ids.length) { toast('先选中单位，再按 Ctrl+数字 编队'); return; }
    for (const k in cg) cg[k] = cg[k].filter(id => !ids.includes(id));
    cg[n] = ids; toast(`第 ${n} 队：${ids.length} 个单位`); sfx('tut'); return;
  }
  const ids = (cg[n] || []).filter(id => G.units.some(u => u.id === id && !u.dead));
  cg[n] = ids;
  if (!ids.length) { toast(`第 ${n} 队还没有单位（选中后按 Ctrl+${n} 编队）`); return; }
  G.group = [...ids]; G.sel = ids.length === 1 ? { kind: 'unit', id: ids[0] } : { kind: 'group' }; G.buildMode = null;
  const now = performance.now();
  if (grpTap.n === n && now - grpTap.t < 350) { const g = groupUnits(); G.cam.x = g.reduce((a, u) => a + u.x, 0) / g.length; G.cam.y = g.reduce((a, u) => a + u.y, 0) / g.length; G.freeCam = true; }
  grpTap.n = n; grpTap.t = now; updateUI(true);
}
const unitGroupNo = u => { const cg = G.ctrlGroups; if (cg) for (const k in cg) if (cg[k].includes(u.id)) return k; return ''; };
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow') || /^F([1-9]|10)$/.test(e.code) || (G && (e.ctrlKey || e.metaKey) && /^Digit[0-9]$/.test(e.code))) e.preventDefault();
  const pickKey = () => { const el = overlay.querySelector(`[data-key="${e.code.slice(5)}"]`); if (el) el.click(); };
  if (e.code === 'Escape') { const b = overlay.querySelector('[data-esc]'); if (b && (!G || G.paused)) { b.click(); return; } }
  if (!G) { if (/^Digit[1-5]$/.test(e.code)) pickKey(); return; }
  if (G.phase === 'reward') { if (/^Digit[1-3]$/.test(e.code)) pickKey(); return; }
  if (!isLive()) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (G.paused) { if (e.code === 'Escape') togglePause(); return; }
  if (e.code === 'Space') useSkill();
  else if (e.code === 'KeyQ') switchMode();
  else if (e.code === 'Tab') setTab((BUILD_TABS.findIndex(t => t.id === G.barTab) + (e.shiftKey ? BUILD_TABS.length - 1 : 1)) % BUILD_TABS.length);
  else if (e.code === 'Escape') { if (G.buildMode) G.buildMode = null; else if (G.sel || G.group.length) { G.sel = null; G.group = []; } else togglePause(); updateUI(true); }
  else if (e.code === 'Enter') startBattle();
  else if (e.code === 'KeyF') { G.follow = !G.follow; for (const u of G.units) if (!u.d.hero) u.order = null; addText(G.lord.x, G.lord.y - 40, G.follow ? '全体士兵：跟随领主' : '全体士兵：回集结点', '#8fd4ff', 1.1); }
  else if (e.code === 'KeyT') G.speed = G.speed === 1 ? 2 : 1;
  else if (e.code === 'KeyC') G.freeCam = false;
  else if (e.code === 'KeyH') { G.sel = { kind: 'lord' }; G.buildMode = null; updateUI(true); }
  else if (e.code === 'KeyR') repairAll();
  else if (e.code === 'KeyM') { SETTINGS.sfx = !SETTINGS.sfx; saveSettings(); toast(SETTINGS.sfx ? '音效：开' : '音效：关'); }
  else if (e.code in BUILD_KEYS) quickPick(BUILD_KEYS[e.code]);
  else if (/^Digit[1-9]$/.test(e.code)) ctrlGroup(+e.code.slice(5), e.ctrlKey || e.metaKey);
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('beforeunload', () => { if (G && canBuild() && SETTINGS.autosave) lsSet('save-auto', serialize()); });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (G && isLive() && !G.paused) togglePause(); });
cvs.addEventListener('contextmenu', e => e.preventDefault());
cvs.addEventListener('mousemove', e => {
  mouse.sx = e.clientX; mouse.sy = e.clientY;
  if (!G) return;
  if (mouse.mdrag) { const c = G.cam; c.x = mouse.mdrag.cx - (e.clientX - mouse.mdrag.sx) / c.z; c.y = mouse.mdrag.cy - (e.clientY - mouse.mdrag.sy) / c.z; G.freeCam = true; return; }
  if (mouse.minimap) { minimapPan(e.clientX, e.clientY); return; }
  if (mouse.painting && G.buildMode && BUILDINGS[G.buildMode].drag) tryPlaceAtMouse(true);
  if (mouse.box) { mouse.box.ex = e.clientX; mouse.box.ey = e.clientY; }
});
const selUnit = () => G.sel && G.sel.kind === 'unit' ? G.units.find(u => u.id === G.sel.id && !u.dead) : null;
function unitAt(wx, wy) {
  let best = null, bd = 26;
  for (const u of G.units) { if (u.dead) continue; const d = hypot(u.x - wx, u.y - (wy + (u.fly ? 10 : 0))) - (u.d.hero ? 6 : 0); if (d < bd) { bd = d; best = u; } }
  return best;
}
cvs.addEventListener('mousedown', e => {
  if (!G || G.paused || !isLive()) return;
  mouse.sx = e.clientX; mouse.sy = e.clientY;
  if (e.button === 1) { e.preventDefault(); mouse.mdrag = { sx: e.clientX, sy: e.clientY, cx: G.cam.x, cy: G.cam.y }; return; }
  if (inMinimap(e.clientX, e.clientY)) { if (e.button === 0) { mouse.minimap = true; minimapPan(e.clientX, e.clientY); } return; }
  // 屏幕左下的英雄头像
  for (const r of G.hudRects) if (e.clientX >= r.x && e.clientX <= r.x + r.w && e.clientY >= r.y && e.clientY <= r.y + r.h) {
    if (e.button !== 0) return;
    if (r.kind === 'lord') { G.sel = { kind: 'lord' }; G.freeCam = false; }
    else { const u = G.units.find(o => o.id === r.id); if (u) { G.sel = { kind: 'unit', id: u.id }; G.group = [u.id]; G.cam.x = u.x; G.cam.y = u.y; G.freeCam = true; } }
    G.buildMode = null; updateUI(true); return;
  }
  if (e.button === 2) {
    // 右键取消建造或取消选择
    if (G.buildMode) G.buildMode = null; else { G.sel = null; G.group = []; }
    updateUI(true); return;
  }
  if (e.button !== 0) return;
  if (G.buildMode) { mouse.painting = true; tryPlaceAtMouse(false); return; }
  mouse.box = { sx: e.clientX, sy: e.clientY, ex: e.clientX, ey: e.clientY, add: e.shiftKey };
});
// 左键松开：拖出了框就框选单位，否则是普通点选
function finishBox() {
  const b = mouse.box; mouse.box = null;
  if (!G || G.paused || !isLive()) return;
  const [wx, wy] = toWorld(b.ex, b.ey);
  if (Math.abs(b.ex - b.sx) + Math.abs(b.ey - b.sy) > 10) {
    const [ax, ay] = toWorld(b.sx, b.sy);
    const x0 = Math.min(ax, wx), x1 = Math.max(ax, wx), y0 = Math.min(ay, wy), y1 = Math.max(ay, wy);
    const ids = G.units.filter(u => !u.dead && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1).map(u => u.id);
    G.group = b.add ? [...new Set([...G.group, ...ids])] : ids;
    G.sel = G.group.length === 1 ? { kind: 'unit', id: G.group[0] } : G.group.length ? { kind: 'group' } : null;
    if (G.group.length) sfx('tut');
    updateUI(true); return;
  }
  const h = G.lord, u = unitAt(wx, wy), x = clamp(wx, 20, WORLD_W - 20), y = clamp(wy, 20, WORLD_H - 20);
  const rallyB = G.sel && G.sel.kind === 'bld' && G.bmap.get(G.sel.id), grp = groupUnits();
  if (!h.dead && hypot(h.x - wx, h.y - wy) < 26) { G.sel = { kind: 'lord' }; G.group = []; }
  else if (u) {
    if (b.add) { G.group = G.group.includes(u.id) ? G.group.filter(id => id !== u.id) : [...G.group, u.id]; G.sel = G.group.length > 1 ? { kind: 'group' } : G.group.length ? { kind: 'unit', id: G.group[0] } : null; }
    else { G.sel = { kind: 'unit', id: u.id }; G.group = [u.id]; }
  }
  else {
    const bd = buildingAt(wx, wy);
    // 选中了单位：左键点敌人或敌方建筑就是集火攻击
    const foe = grp.length && !bd ? enemyAt(wx, wy) : null;
    if (foe) { orderAttack(grp, foe); updateUI(true); return; }
    // 选中了单位：左键点地面就是移动（点到自己的建筑则改为选中建筑）
    if (grp.length && !bd) { orderMove(grp, x, y); updateUI(true); return; }
    // 选中了兵营/祭坛/主城：左键点地面设置集结点
    if (rallyB && RALLY_BLD.includes(rallyB.type) && !bd) { setRally(x, y); updateUI(true); return; }
    G.sel = bd ? { kind: 'bld', id: bd.id } : null; G.group = [];
  }
  updateUI(true);
}
const RALLY_BLD = ['barracks', 'altar', 'shrine', 'castle'];
function enemyAt(x, y) {
  let best = null, bd = Infinity;
  for (const e of G.enemies) { if (e.dead) continue; const d = hypot(e.x - x, e.y - y) - e.r; if (d < 14 && d < bd) { bd = d; best = e; } }
  return best;
}
// 指定攻击目标：一直追着打，目标死后原地驻守并自动迎战附近敌人
function orderAttack(grp, e) {
  for (const u of grp) { u.order = { x: e.x, y: e.y, atk: e }; u.target = e; u.retarget = 0.3; }
  G.effects.push({ kind: 'ring', x: e.x, y: e.y, r0: e.r + 40, r1: e.r + 4, t: 0, life: 0.4, color: '#ff5a4a' });
  addText(e.x, e.y - e.r - 20, `${grp.length > 1 ? grp.length + ' 个单位' : grp[0].d.name}：攻击 ${e.d.name}`, '#ff8a6a', 1);
  sfx('tut');
}
function setRally(x, y) {
  G.rally = { x, y }; G.follow = false;
  G.effects.push({ kind: 'ring', x, y, r0: 40, r1: 6, t: 0, life: 0.35, color: '#8fd4ff' });
  addText(x, y - 20, '集结点', '#8fd4ff', 0.8);
}
const groupUnits = () => G.group.map(id => G.units.find(u => u.id === id && !u.dead)).filter(Boolean);
// 左键下令：选中的单位按方阵排开走到目标点并驻守
function orderMove(grp, x, y) {
  const n = grp.length, cols = Math.ceil(Math.sqrt(n)), sp = 34;
  grp.sort((a, b) => (a.d.range > 100) - (b.d.range > 100));
  grp.forEach((u, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    u.order = { x: clamp(x + (c - (cols - 1) / 2) * sp, 20, WORLD_W - 20), y: clamp(y + (r - (Math.ceil(n / cols) - 1) / 2) * sp, 20, WORLD_H - 20) };
    u.target = null; u.retarget = 0.3;
  });
  G.effects.push({ kind: 'ring', x, y, r0: 40, r1: 6, t: 0, life: 0.35, color: '#9fe07a' });
  addText(x, y - 20, n > 1 ? `${n} 个单位：前往驻守` : `${grp[0].d.name}：前往驻守`, '#9fe07a', 0.9);
}
addEventListener('mouseup', e => { if (mouse.box && e.button === 0) { mouse.box.ex = e.clientX; mouse.box.ey = e.clientY; finishBox(); } mouse.painting = false; mouse.mdrag = null; mouse.minimap = false; });
cvs.addEventListener('wheel', e => {
  if (!G) return;
  e.preventDefault();
  const [wx, wy] = toWorld(e.clientX, e.clientY);
  const c = G.cam;
  c.z = clamp(c.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.4, 1.6);
  const [wx2, wy2] = toWorld(e.clientX, e.clientY);
  c.x += wx - wx2; c.y += wy - wy2;
}, { passive: false });

function ghostTile() {
  const [wx, wy] = toWorld(mouse.sx, mouse.sy);
  const n = BUILDINGS[G.buildMode].size;
  return [Math.round(wx / T - n / 2), Math.round(wy / T - n / 2)];
}
function buildLockReason(type) {
  const d = BUILDINGS[type];
  if (d.castle && castleLvl() < d.castle) return `需要 ${d.castle} 级主城`;
  if (d.max && G.buildings.filter(b => b.type === type).length >= d.max) return `${d.name}只能建 ${d.max} 座`;
  return null;
}
function selectBuild(type) {
  if (!G || G.paused || !type) return;
  if (!canBuild()) { toast('只能在准备阶段建造'); sfx('err'); return; }
  const why = buildLockReason(type);
  if (why) { toast(why); sfx('err'); return; }
  G.buildMode = G.buildMode === type ? null : type;
  G.sel = null;
  updateUI(true);
}
function tryPlaceAtMouse(silent) {
  const type = G.buildMode;
  if (!type || !canBuild()) return;
  const d = BUILDINGS[type];
  const [tx, ty] = ghostTile();
  const why = canPlace(type, tx, ty) || buildLockReason(type);
  if (why) { if (!silent) { toast(why); sfx('err'); } return; }
  const c = bCost(type, 1);
  if (!canPay(c)) { if (!silent) { toast('材料不足'); sfx('err'); } return; }
  pay(c);
  const b = placeBuilding(type, tx, ty);
  buildFx(b, false);
  if (G.tut) tutCheck();
  if (d.max || (!d.drag && !keys.ShiftLeft && !keys.ShiftRight)) { G.buildMode = null; G.sel = { kind: 'bld', id: b.id }; }
  updateUI(true);
}

// ================= 新手引导（第一波） =================
const bCount = t => G.buildings.filter(b => b.type === t).length;
const TUT = [
  { text: '欢迎，领主！用 <b>WASD</b> 移动你自己。领主会自动攻击附近敌人，按 <b>Q</b> 在<b>剑术 / 弓术 / 魔法</b>之间切换，<b>空格</b>放对应技能。', done: () => hypot(G.lord.x - G.tut.hx, G.lord.y - G.tut.hy) > 120, target: () => ({ x: G.lord.x, y: G.lord.y, r: 22 }) },
  { text: '敌人只能经过<b>坡道</b>上下高地（红色虚线是进攻路线）。在下方<b>【建筑】</b>页按 <b>F1</b> 选择<b>兵营</b>，放在主城旁边。', tab: 'build', key: 'barracks', done: () => bCount('barracks') > 0, target: () => { const c = castle(); return { x: c.x, y: c.y, r: c.w * 0.7 }; } },
  { text: '在下方<b>【兵种】</b>页（<b>Tab</b> 切换分页）点一个兵种<b>招募士兵</b>，也可以点兵营在右侧面板招募。没有人口上限，但士兵每波要吃<b>粮食</b>。', tab: 'unit', done: () => G.units.length > 0 || G.buildings.some(b => b.queue.length), target: () => { const b = G.buildings.find(o => o.type === 'barracks'); return b && { x: b.x, y: b.y, r: b.w * 0.7 }; } },
  { text: '切到<b>【城防】</b>页按 <b>F2</b> 选择<b>箭塔</b>，建在红线附近。建在高地上射程 +15%，往下射更准、伤害更高。', key: 'arrow', tab: 'def', done: () => bCount('arrow') > 0 },
  { text: '【城防】页按 <b>F1</b> 选择<b>城墙</b>，<b>按住左键拖动</b>在坡道或路线上建一段墙（至少 4 格）。坡道是天然隘口。', key: 'wall', tab: 'def', done: () => bCount('wall') >= 4 },
  { text: '士兵每波开战要吃<b>粮食🍖</b>，不够会士气低迷甚至饥饿。在【建筑】页按 <b>F4</b> 建一块<b>农田</b>（靠近湖泊产量更高）。伐木场、采石场、金矿场也在这一页。', key: 'farm', tab: 'build', done: () => bCount('farm') + bCount('lumber') + bCount('quarry') + bCount('mine') > 0 },
  { text: '准备就绪！之后可以建<b>英雄祭坛</b>召唤英雄，阵亡的英雄能在<b>复活祭坛</b>复活。<b>左键拖框</b>可以框选士兵，再左键点地面让他们过去，<b>Ctrl+数字</b> 编队。现在按 <b>Enter</b> 开战。', done: () => G.phase !== 'prep' },
  { text: '击杀怪物会获得<b>经验</b>，所有单位都会自动升级。怪物掉的<b>金币要领主走过去捡</b>，没捡的只有 10% 变成材料。守住这一波！', done: () => G.phase !== 'battle',
    target: () => { let best = null, bd = 1e9; for (const c of G.coins) { const d = hypot(c.x - G.lord.x, c.y - G.lord.y); if (d < bd) { bd = d; best = c; } } return best && bd < 700 ? { x: best.x, y: best.y, r: 14 } : null; } },
];
function tutTarget() { const st = TUT[G.tut.i]; return st && st.target ? st.target() : null; }
function tutCheck() {
  const st = TUT[G.tut.i];
  if (!st || !st.done()) return;
  G.tut.i++;
  if (G.tut.i >= TUT.length) { tutEnd(true); return; }
  if (TUT[G.tut.i].tab) setTab(BUILD_TABS.findIndex(t => t.id === TUT[G.tut.i].tab));
  sfx('tut');
  G.texts.push({ x: G.lord.x, y: G.lord.y - 46, text: '✔ 完成', color: '#9fe07a', scale: 1.3, life: 1.1, vy: -40 });
  updateUI(true);
}
function tutEnd(done) {
  G.tut = null; SETTINGS.tutorial = false; saveSettings();
  toast(done ? '新手引导完成！可以在设置里重新开启' : '已跳过新手引导');
  updateUI(true);
}
function guideHtml() {
  if (!G.tut) return '';
  const st = TUT[G.tut.i], c = st.key && bCost(st.key, 1);
  return `<div class="gh"><b>📜 新手引导</b><span>${G.tut.i + 1} / ${TUT.length}</span></div><p>${st.text}</p>
    ${c && !canPay(c) ? '<p class="gt">材料不够的话等几秒，主城会持续产出。</p>' : ''}
    ${G.tut.i < 6 ? '<p class="gt">引导期间准备倒计时暂停。</p>' : ''}
    <div class="gs" data-act="tutSkip">跳过引导</div>`;
}

// 建造 / 升级的落地反馈
function buildFx(b, up) {
  b.popT = 0.3;
  const big = b.size >= 2;
  burst(b.x, b.y + b.w * 0.3, '#d8c8a0', big ? 22 : 8, big ? 200 : 120);
  G.effects.push({ kind: 'ring', x: b.x, y: b.y, r0: b.w * 0.4, r1: b.w * (big ? 1.2 : 0.9), t: 0.0, life: 0.3, color: '#e8d8b0' });
  if (big) G.shake = Math.max(G.shake, up ? 6 : 4);
  if (up) {
    G.effects.push({ kind: 'pillar', x: b.x, y: b.y, w: b.w, t: 0, life: 0.7 });
    G.effects.push({ kind: 'ring', x: b.x, y: b.y, r0: 10, r1: b.w * 1.6, t: 0.05, life: 0.45, color: '#ffd76a' });
    burst(b.x, b.y, '#ffd76a', 28, 240);
    G.texts.push({ x: b.x, y: b.y - b.w / 2 - 6, text: `升级！Lv${b.lvl}`, color: '#ffd76a', scale: 1.5, life: 1.3, vy: -45 });
    sfx('upgrade');
  } else sfx('build');
}
function repairAll() {
  if (!G || !canBuild()) { toast('只能在准备阶段修理'); return; }
  let n = 0;
  for (const b of G.buildings) { const c = repairCost(b); if (c && canPay(c)) { pay(c); b.hp = bldMaxHp(b); n++; } }
  toast(n ? `修理了 ${n} 座建筑` : '没有需要修理的建筑（或材料不足）');
  if (n) sfx('build');
  updateUI(true);
}
let toastT = null;
function toast(msg) {
  $hint.textContent = msg; $hint.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => $hint.classList.remove('show'), 1800);
}

// ================= 渲染 =================
let VIEW = null;
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!G) { drawMenuBg(); return; }
  const c = G.cam, z = c.z;
  const sk = SETTINGS.shake ? G.shake : 0, sx = (Math.random() - 0.5) * sk * 2, sy = (Math.random() - 0.5) * sk * 2;
  ctx.fillStyle = '#1a1612'; ctx.fillRect(0, 0, VW, VH);
  ctx.save();
  ctx.translate(VW / 2 + sx, VH / 2 + sy); ctx.scale(z, z); ctx.translate(-c.x, -c.y);
  const hw = VW / 2 / z + 120, hh = VH / 2 / z + 120;
  VIEW = { x0: c.x - hw, y0: c.y - hh, x1: c.x + hw, y1: c.y + hh };
  const vis = (x, y) => x > VIEW.x0 && x < VIEW.x1 && y > VIEW.y0 && y < VIEW.y1;
  drawGround(vis);
  if (G.buildMode) drawGrid();
  drawPortalsAndRoutes(vis);
  drawWilds(vis);
  drawCorpses(vis);
  for (const b of G.buildings) if (b.d.cat === 'trap' && vis(b.x, b.y)) drawBuilding(b);
  for (const k of G.coins) {
    if (!vis(k.x, k.y)) continue;
    const s = k.v >= 6 ? 9 : 6;
    ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(k.x, k.y, s, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(k.x - s * 0.3, k.y - s * 0.3, s * 0.35, 0, TAU); ctx.fill();
  }
  const rb = G.sel && G.sel.kind === 'bld' && G.bmap.get(G.sel.id);
  if (rb && RALLY_BLD.includes(rb.type)) { ctx.strokeStyle = 'rgba(143,212,255,0.6)'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rb.x, rb.y); ctx.lineTo(G.rally.x, G.rally.y); ctx.stroke(); ctx.setLineDash([]); }
  if (!G.follow || rb && RALLY_BLD.includes(rb.type)) {
    const r = G.rally;
    ctx.strokeStyle = 'rgba(143,212,255,0.5)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(r.x, r.y, 36, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    drawSprite('🚩', r.x + 6, r.y - 12, 22);
  }
  const marked = new Set();
  for (const u of groupUnits()) if (u.order && u.order.atk && !marked.has(u.order.atk)) {
    const e = u.order.atk; marked.add(e);
    ctx.strokeStyle = '#ff4a3a'; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(G.time * 8); ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 10, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  for (const u of G.units) if (u.d.hero && u.order && u.order !== 'follow' && !u.order.atk && vis(u.order.x, u.order.y)) {
    ctx.strokeStyle = u.d.color; ctx.globalAlpha = 0.5; ctx.setLineDash([5, 6]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(u.order.x, u.order.y, 22, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  for (const zn of G.zones) {
    if (!vis(zn.x, zn.y)) continue;
    ctx.globalAlpha = 0.18 + 0.06 * Math.sin(G.time * 8); ctx.fillStyle = zn.color;
    ctx.beginPath(); ctx.arc(zn.x, zn.y, zn.r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.6; ctx.strokeStyle = zn.color; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < 6; i++) { const a = G.time * 1.5 + i * 1.05, rr = zn.r * (0.3 + 0.6 * ((i * 0.37 + G.time * 0.4) % 1)); drawSprite(zn.icon || '❄️', zn.x + Math.cos(a) * rr, zn.y + Math.sin(a) * rr, 14); }
    ctx.globalAlpha = 1;
  }
  for (const e of G.enemies) if (e.boss && e.state === 'tele') {
    if (e.ab === 'slam') {
      ctx.fillStyle = 'rgba(255,60,30,0.15)'; ctx.strokeStyle = 'rgba(255,80,40,0.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.slamR, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,60,30,0.25)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.slamR * clamp(1 - e.stT, 0, 1), 0, TAU); ctx.fill();
    } else if (e.ab === 'dash') {
      const l = hypot(e.tdx, e.tdy) || 1;
      ctx.strokeStyle = 'rgba(255,60,60,0.45)'; ctx.lineWidth = e.r * 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.tdx / l * 500, e.y + e.tdy / l * 500); ctx.stroke();
    }
  }
  // 建筑与地面单位按 y 排序
  const ents = [];
  for (const b of G.buildings) if (b.d.cat !== 'trap' && b.x + b.w > VIEW.x0 && b.x - b.w < VIEW.x1 && b.y + b.w > VIEW.y0 && b.y - b.w < VIEW.y1) ents.push(b);
  for (const e of G.enemies) if (!e.fly && vis(e.x, e.y)) ents.push(e);
  for (const u of G.units) if (!u.fly && vis(u.x, u.y)) ents.push(u);
  if (!G.lord.dead) ents.push(G.lord);
  const sortY = o => o.tx !== undefined ? o.y + o.w / 2 - 6 : o.y;
  ents.sort((a, b) => sortY(a) - sortY(b));
  for (const o of ents) {
    if (o === G.lord) drawLord();
    else if (o.tx !== undefined) drawBuilding(o);
    else if (o.isUnit) drawUnit(o);
    else drawEnemy(o);
  }
  for (const u of G.units) if (u.fly && vis(u.x, u.y)) drawUnit(u);
  for (const e of G.enemies) if (e.fly && vis(e.x, e.y)) drawEnemy(e);
  drawProjs(vis);
  drawEffects();
  for (const q of G.particles) {
    if (!vis(q.x, q.y)) continue;
    ctx.globalAlpha = clamp(q.life / q.max * 1.4, 0, 1); ctx.fillStyle = q.color;
    ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of G.texts) {
    if (!vis(t.x, t.y)) continue;
    const pop = t.life > 0.75 ? 1 + (t.life - 0.75) * 4 : 1;
    ctx.globalAlpha = clamp(t.life * 2.5, 0, 1);
    ctx.font = `bold ${Math.round(14 * t.scale * pop)}px "Microsoft YaHei", sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(t.text, t.x, t.y); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  drawBuildGhost();
  if (G.sel && G.sel.kind === 'bld') {
    const b = G.bmap.get(G.sel.id);
    if (b) {
      ctx.strokeStyle = '#ffe07a'; ctx.lineWidth = 2.5; ctx.setLineDash([8, 5]);
      ctx.strokeRect(b.tx * T - 3, b.ty * T - 3, b.w + 6, b.w + 6); ctx.setLineDash([]);
      if (b.d.attack) { ctx.strokeStyle = 'rgba(255,224,122,0.4)'; ctx.beginPath(); ctx.arc(b.x, b.y, rangeAt(b.x, b.y, b.d.attack.range), 0, TAU); ctx.stroke(); }
    }
  }
  ctx.strokeStyle = '#5a4630'; ctx.lineWidth = 16; ctx.strokeRect(-8, -8, WORLD_W + 16, WORLD_H + 16);
  ctx.restore();
  if (VISUAL.vignette > 0) {
    const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.42, VW / 2, VH / 2, Math.hypot(VW, VH) * 0.55);
    g.addColorStop(0, 'rgba(10,8,6,0)'); g.addColorStop(1, `rgba(10,8,6,${VISUAL.vignette})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  }
  if (G.hurtFlash > 0) {
    const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.3, VW / 2, VH / 2, Math.max(VW, VH) * 0.7);
    g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(200,0,0,${G.hurtFlash * 1.2})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  }
  drawHUD();
  if (mouse.box && Math.abs(mouse.box.ex - mouse.box.sx) + Math.abs(mouse.box.ey - mouse.box.sy) > 10) {
    const b = mouse.box, x = Math.min(b.sx, b.ex), y = Math.min(b.sy, b.ey), w = Math.abs(b.ex - b.sx), h = Math.abs(b.ey - b.sy);
    ctx.fillStyle = 'rgba(140,255,120,0.1)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(160,255,130,0.9)'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }
}
function drawGround(vis) {
  if (MAP.chunks) {
    const C = GROUND_CHUNK, cx0 = Math.max(0, Math.floor(VIEW.x0 / C)), cy0 = Math.max(0, Math.floor(VIEW.y0 / C)), cx1 = Math.min(Math.ceil(WORLD_W / C) - 1, Math.floor(VIEW.x1 / C)), cy1 = Math.min(Math.ceil(WORLD_H / C) - 1, Math.floor(VIEW.y1 / C));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) blitPixel(groundChunk(MAP, cx, cy), cx * C, cy * C, C + 0.5, C + 0.5);
  } else if (MAP.ground.width >= WORLD_W) blitPixel(MAP.ground, 0, 0, WORLD_W, WORLD_H); else ctx.drawImage(MAP.ground, 0, 0, WORLD_W, WORLD_H);
  for (const [lx, ly, rx, ry] of G.map.lakes) {
    if (!vis(lx, ly) && !vis(lx + rx, ly) && !vis(lx - rx, ly)) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.ellipse(lx - rx * 0.3 + Math.sin(G.time) * 8, ly - ry * 0.3, rx * 0.3, ry * 0.12, 0, 0, TAU); ctx.fill();
  }
  const fewFlowers = G.map && hasTileArt(G.map) ? VISUAL.flowers : 1e9;
  for (const d of MAP.decor) if (vis(d.x, d.y) && !(d.fl >= fewFlowers)) { const k = DECOR_ART[d.icon]; if (k && ART[k]) drawArt(k, d.icon, d.x, d.y, d.size, d.flip, d.flip, 1.5); else drawSprite(d.icon, d.x, d.y, d.size, d.flip); }
}
function drawGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
  const x0 = Math.max(0, Math.floor(VIEW.x0 / T)) * T, x1 = Math.min(WORLD_W, VIEW.x1), y0 = Math.max(0, Math.floor(VIEW.y0 / T)) * T, y1 = Math.min(WORLD_H, VIEW.y1);
  ctx.beginPath();
  for (let x = x0; x <= x1; x += T) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = y0; y <= y1; y += T) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();
}
function drawPortalsAndRoutes(vis) {
  const active = new Set(G.activePortals);
  const showRoutes = G.phase === 'prep' || (G.phase === 'battle' && G.waveList.length);
  if (showRoutes) {
    ctx.save();
    const lw = Math.max(6, 4 / G.cam.z);
    ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash([lw * 2.6, lw * 2.3]); ctx.lineDashOffset = -performance.now() / 25;
    ctx.strokeStyle = G.phase === 'prep' ? 'rgba(235,70,55,0.55)' : 'rgba(235,70,55,0.22)';
    for (const r of G.routes) {
      ctx.beginPath();
      r.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.stroke();
    }
    ctx.restore();
  }
  PORTALS.forEach((p, i) => {
    if (!vis(p.x, p.y)) return;
    const on = active.has(i) && showRoutes;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(performance.now() / 1000 * (on ? 2 : 0.5));
    ctx.globalAlpha = on ? 1 : 0.4;
    if (ART['fx/portal']) { const c = artImg('fx/portal'), s = on ? 90 : 62; blitPixel(c, -s / 2, -s / 2, s, s); } else drawSprite('🌀', 0, 0, on ? 64 : 44);
    ctx.restore();
    if (on && G.phase === 'prep') {
      const cnt = {};
      for (const s of G.waveList) if (s.portal === i) cnt[s.type] = (cnt[s.type] || 0) + 1;
      const parts = Object.keys(cnt).map(k => `${ENEMIES[k].icon}×${cnt[k]}`);
      const nAff = G.waveList.filter(s => s.portal === i && s.aff).length;
      if (nAff) parts.push(`⭐词条怪×${nAff}`);
      ctx.font = 'bold 15px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lines = [p.name, parts.slice(0, 4).join(' '), parts.slice(4).join(' ')].filter(Boolean);
      const lx = clamp(p.x, 140, WORLD_W - 140);
      lines.forEach((ln, k) => {
        const y = p.y > WORLD_H / 2 ? p.y - 60 - (lines.length - 1 - k) * 20 : p.y + 50 + k * 20;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(ln, lx, y);
        ctx.fillStyle = k ? '#ffd0c0' : '#ff7a6a'; ctx.fillText(ln, lx, y);
      });
    }
  });
}
const WALL_COL = [['#8a6638', '#a88050'], ['#7d7a74', '#a8a49c'], ['#4f5c6c', '#8a9ab0']];
function drawBuilding(b) {
  if (b.popT > 0) {
    const k = b.popT / 0.3, sc = 1 + 0.35 * k * k;
    ctx.save(); ctx.translate(b.x, b.y - 26 * k * k); ctx.scale(sc, sc); ctx.translate(-b.x, -b.y);
    ctx.globalAlpha = 1 - 0.4 * k; b.popT0 = b.popT; b.popT = 0; drawBuilding(b); b.popT = b.popT0;
    ctx.restore(); return;
  }
  const x0 = b.tx * T, y0 = b.ty * T, w = b.w, d = b.d;
  if (b.type === 'wall') {
    const [c1, c2] = WALL_COL[b.lvl - 1];
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x0 + 2, y0 + 6, w, w);
    ctx.fillStyle = c1; ctx.fillRect(x0 + 1, y0 + 1, w - 2, w - 2);
    ctx.fillStyle = c2; ctx.fillRect(x0 + 1, y0 + 1, w - 2, 9);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 1.5, y0 + 1.5, w - 3, w - 3);
    ctx.beginPath(); ctx.moveTo(x0 + w / 2, y0 + 10); ctx.lineTo(x0 + w / 2, y0 + 25); ctx.moveTo(x0 + 1, y0 + 25); ctx.lineTo(x0 + w - 1, y0 + 25); ctx.stroke();
  } else if (b.type === 'trap') {
    ctx.fillStyle = b.flash > 0 ? 'rgba(200,60,60,0.6)' : 'rgba(80,60,50,0.55)'; ctx.fillRect(x0 + 3, y0 + 3, w - 6, w - 6);
    ctx.fillStyle = b.lvl === 3 ? '#9ab0c8' : '#c8c8c8';
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const px = x0 + 9 + i * 11, py = y0 + 9 + j * 11;
      ctx.beginPath(); ctx.moveTo(px - 3, py + 4); ctx.lineTo(px, py - 5); ctx.lineTo(px + 3, py + 4); ctx.fill();
    }
  } else if (ART['buildings/' + b.type]) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(b.x, y0 + w * 0.82, w * 0.5, w * 0.2, 0, 0, TAU); ctx.fill();
    if (b.type === 'altar') { ctx.globalAlpha = 0.25 + 0.15 * Math.sin(G.time * 3); ctx.fillStyle = '#c8a8ff'; ctx.beginPath(); ctx.arc(b.x, b.y, w * 0.42, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    drawArt('buildings/' + b.type, d.icon, b.x, y0 + w / 2 - 2, w, false, false, ART_SCALE.bld);
    if (b.lvl > 1) { ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText('★'.repeat(b.lvl - 1), b.x, y0 + w - 6); ctx.fillText('★'.repeat(b.lvl - 1), b.x, y0 + w - 6); }
    if (b.queue.length) {
      const k = b.trainT / UNITS[b.queue[0]].time;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0 + 8, y0 - 12, w - 16, 7);
      ctx.fillStyle = '#7ad7ff'; ctx.fillRect(x0 + 8, y0 - 12, (w - 16) * k, 7);
    }
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x0 + 4, y0 + 8, w - 4, w - 4);
    ctx.fillStyle = d.cat === 'defense' ? '#6c6258' : d.cat === 'eco' ? '#7a6a4a' : b.type === 'castle' ? '#8a7a64' : b.type === 'altar' ? '#6a5a7a' : '#6a5a50';
    ctx.fillRect(x0 + 3, y0 + 3, w - 6, w - 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2; ctx.strokeRect(x0 + 3, y0 + 3, w - 6, w - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x0 + 3, y0 + 3, w - 6, 8);
    if (b.type === 'altar') { ctx.globalAlpha = 0.25 + 0.15 * Math.sin(G.time * 3); ctx.fillStyle = '#c8a8ff'; ctx.beginPath(); ctx.arc(b.x, b.y, w * 0.42, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    drawSprite(d.icon, b.x, b.y - (d.cat === 'defense' ? 6 : 2), w * (b.type === 'castle' ? 0.8 : 0.62));
    if (b.lvl > 1) { ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★'.repeat(b.lvl - 1), b.x, y0 + w - 8); }
    if (b.queue.length) {
      const k = b.trainT / UNITS[b.queue[0]].time;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0 + 8, y0 - 12, w - 16, 7);
      ctx.fillStyle = '#7ad7ff'; ctx.fillRect(x0 + 8, y0 - 12, (w - 16) * k, 7);
      drawSprite(UNITS[b.queue[0]].icon, x0 + w - 4, y0 - 9, 14);
    }
  }
  if (b.flash > 0 && b.type !== 'trap') { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x0 + 2, y0 + 2, w - 4, w - 4); }
  const mh = bldMaxHp(b);
  if (b.hp < mh - 0.5) {
    const k = clamp(b.hp / mh, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x0 + 2, y0 - 4, w - 4, 5);
    ctx.fillStyle = k > 0.5 ? '#5ae05a' : k > 0.25 ? '#ffc23a' : '#ff3a3a'; ctx.fillRect(x0 + 2, y0 - 4, (w - 4) * k, 5);
  }
}
function drawBuildGhost() {
  if (!G.buildMode) return;
  const type = G.buildMode, d = BUILDINGS[type], [tx, ty] = ghostTile();
  const ok = !canPlace(type, tx, ty) && canPay(bCost(type, 1));
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = ok ? '#5ae05a' : '#ff4a4a';
  ctx.fillRect(tx * T, ty * T, d.size * T, d.size * T);
  ctx.globalAlpha = 0.85;
  const cx = (tx + d.size / 2) * T, cy = (ty + d.size / 2) * T;
  if (ART['buildings/' + type]) drawArt('buildings/' + type, d.icon, cx, cy - 2, d.size * T, false, false, ART_SCALE.bld); else drawSprite(d.icon, cx, cy, d.size * T * 0.6);
  ctx.globalAlpha = 1;
  // 联动预览：这座建筑会得到的加成（绿线），以及会给旁边建筑带来的加成（蓝线）
  if (G.synDirty) computeSynergy();
  const rect = { type, tx, ty, size: d.size }, mine = synOf(type, rect, G.buildings), lines = mine.list.map(r => r.text);
  const gives = [];
  const giveCnt = new Map();
  for (const o of G.buildings) for (const r of SYNERGY) if (r.a === o.type && r.b === type && bldGap(rect, o) <= 1) { gives.push(o); const t = `→ ${BUILDINGS[o.type].name}：${r.text}`; giveCnt.set(t, (giveCnt.get(t) || 0) + 1); }
  for (const [t, n] of giveCnt) lines.push(n > 1 ? `${t} ×${n}` : t);
  ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
  for (const [arr, col] of [[mine.partners, 'rgba(120,255,140,0.85)'], [gives, 'rgba(120,200,255,0.85)']]) for (const o of new Set(arr)) { ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(o.x, o.y); ctx.stroke(); }
  ctx.setLineDash([]);
  if (lines.length) {
    ctx.font = 'bold 13px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    lines.slice(0, 5).forEach((t, i) => { const y = ty * T + d.size * T + 16 + i * 17; ctx.strokeText('🔗 ' + t, cx, y); ctx.fillStyle = t.startsWith('→') ? '#9ad8ff' : '#9dffa8'; ctx.fillText('🔗 ' + t, cx, y); });
  }
  if (d.attack) {
    const hi = MAP.hgt[clamp(ty, 0, GH - 1) * GW + clamp(tx, 0, GW - 1)];
    ctx.strokeStyle = hi ? 'rgba(255,230,140,0.7)' : 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, d.attack.range * (hi ? 1.15 : 1), 0, TAU); ctx.stroke();
    if (hi) { ctx.font = 'bold 13px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe68c'; ctx.fillText('高地：射程 +15%', cx, cy - d.size * T * 0.7); }
  }
}
function shadow(x, y, r) { ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.8, r * 0.9, r * 0.35, 0, 0, TAU); ctx.fill(); }
function hpBar(x, y, w, k, col) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
  ctx.fillStyle = col || (k > 0.5 ? '#5ae05a' : k > 0.25 ? '#ffc23a' : '#ff3a3a'); ctx.fillRect(x - w / 2, y, w * clamp(k, 0, 1), 4);
}
function drawLord() {
  const h = G.lord, bob = Math.sin(h.walk) * 2, md = LORD.modes[h.mode];
  shadow(h.x, h.y, h.r);
  ctx.strokeStyle = 'rgba(255,210,74,0.15)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(h.x, h.y, G.s.pickup, 0, TAU); ctx.stroke();
  ctx.fillStyle = LORD.color; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(h.x, h.y + 4, h.r + 6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = LORD.color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(h.x, h.y + 4, h.r + 6, 0, TAU); ctx.stroke();
  if (G.sel && G.sel.kind === 'lord') { ctx.strokeStyle = '#ffe07a'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(h.x, h.y + 4, h.r + 12, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
  if (h.spinT > 0) { ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(G.time * 20); drawSprite('⚔️', 0, -30, 26); ctx.restore(); }
  poseBegin(h, h.y + 13);
  drawArt('lord/' + h.mode, LORD.icon, h.x, h.y - 4 + bob, 34, h.face < 0, h.face < 0, undefined, h.flash > 0 ? 0.65 : 0);
  ctx.restore();
  if (!ART['lord/' + h.mode]) drawSprite(md.icon, h.x + h.face * 16, h.y + 4 + bob, 16);
  if (h.flash > 0 && !ART['lord/' + h.mode]) { ctx.fillStyle = 'rgba(255,60,60,0.35)'; ctx.beginPath(); ctx.arc(h.x, h.y, 18, 0, TAU); ctx.fill(); }
  const lift = artLift('lord/' + h.mode, 34);
  hpBar(h.x, h.y - 38 - lift, 44, h.hp / lordStats().hp);
  drawStatus(h, h.x, h.y - 50 - lift);
}
function drawUnit(u) {
  const hero = u.d.hero, fly = u.fly, by = fly ? Math.sin(u.bob) * 4 - 10 : Math.sin(u.bob) * 1.5;
  shadow(u.x, u.y, hero ? 14 : 11);
  if (hero) {
    ctx.fillStyle = u.d.color; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.ellipse(u.x, u.y + 11, 18, 7, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = u.d.color; ctx.lineWidth = 2.5;
  } else ctx.strokeStyle = u.evo ? '#ffd76a' : u.temp !== undefined ? 'rgba(176,122,255,0.8)' : G.buffT > 0 ? '#ffb35a' : 'rgba(120,200,255,0.85)';
  if (!hero) ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(u.x, u.y + 10, hero ? 18 : 13, hero ? 7 : 5.5, 0, 0, TAU); ctx.stroke();
  if (G.group.includes(u.id) || (G.sel && G.sel.kind === 'unit' && G.sel.id === u.id)) { ctx.strokeStyle = '#9fff7a'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.ellipse(u.x, u.y + 6, hero ? 26 : 19, hero ? 13 : 10, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
  if (u.rageT > 0) { ctx.fillStyle = 'rgba(255,80,40,0.3)'; ctx.beginPath(); ctx.arc(u.x, u.y, 24 + Math.sin(G.time * 12) * 3, 0, TAU); ctx.fill(); }
  const big = u.d.pop === 2 || u.type === 'golem' || u.type === 'dragon';
  poseBegin(u, u.y + 12);
  drawArt(unitArtKey(u), u.d.icon, u.x, u.y + by, hero ? 34 : big ? 30 : 24, u.face < 0, u.face < 0, undefined, u.flash > 0 ? 0.6 : 0);
  ctx.restore();
  if (u.flash > 0 && !ART[unitArtKey(u)]) { ctx.fillStyle = 'rgba(255,80,80,0.4)'; ctx.beginPath(); ctx.arc(u.x, u.y + by, 12, 0, TAU); ctx.fill(); }
  const hr = u.hp / unitStats(u).hp;
  { const lift = artLift(unitArtKey(u), hero ? 34 : big ? 30 : 24); if (lift) { ctx.save(); ctx.translate(0, -lift); } u._lift = lift; }
  if (hero) {
    hpBar(u.x, u.y - 34 + by, 40, hr);
    ctx.font = 'bold 11px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; const nm = `${u.d.name} Lv${u.lvl}`;
    ctx.strokeText(nm, u.x, u.y - 42 + by); ctx.fillStyle = u.d.color; ctx.fillText(nm, u.x, u.y - 42 + by);
    if (u.lvl < LVL_MAX.hero) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(u.x - 20, u.y - 29 + by, 40, 2); ctx.fillStyle = '#ffd76a'; ctx.fillRect(u.x - 20, u.y - 29 + by, 40 * clamp(u.xp / XP_NEED(u.lvl), 0, 1), 2); }
    drawStatus(u, u.x, u.y - 54 + by);
  } else {
    if (hr < 0.99) hpBar(u.x, u.y - 22 + by, 24, hr, '#6ac8ff');
    if (u.lvl > 1) { ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(u.lvl, u.x + 12, u.y - 12 + by); ctx.fillStyle = '#ffd76a'; ctx.fillText(u.lvl, u.x + 12, u.y - 12 + by); }
    drawStatus(u, u.x, u.y - 30 + by);
    if (canEvolve(u)) { const k = 0.6 + 0.4 * Math.sin(G.time * 5); ctx.globalAlpha = k; drawSprite('⭐', u.x - 12, u.y - 14 + by, 12); ctx.globalAlpha = 1; }
  }
  if (u._lift) ctx.restore();
  const gn = unitGroupNo(u);
  if (gn) { ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(gn, u.x - 13, u.y + 12 + by); ctx.fillStyle = '#9fff7a'; ctx.fillText(gn, u.x - 13, u.y + 12 + by); }
}
// 头顶的异常状态图标
function drawStatus(o, x, y) {
  const S = o.st; if (!S) return;
  const ks = Object.keys(S); if (!ks.length) return;
  ks.forEach((k, i) => drawSprite(ST_INFO[k].icon, x + (i - (ks.length - 1) / 2) * 13, y, 12));
  if (S.stun) { ctx.save(); ctx.translate(x, y + 8); ctx.rotate(G.time * 6); drawSprite('💫', 10, 0, 10); ctx.restore(); }
}
function drawCamp(e) {
  const d = CAMPS[e.camp.kind], R = e.r, key = 'camps/' + e.camp.kind;
  ctx.fillStyle = 'rgba(60,20,15,0.35)'; ctx.beginPath(); ctx.ellipse(e.x, e.y + R * 0.4, R * 1.9, R * 0.95, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(110,70,40,0.9)'; ctx.lineWidth = 4; ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.ellipse(e.x, e.y + R * 0.4, R * 1.8, R * 0.9, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  drawArt(key, d.icon, e.x, e.y, R * 2, false, false, 1.6);
  if (e.flash > 0) { ctx.globalAlpha = 0.4; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(e.x, e.y, R * 0.8, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  drawSprite('🚩', e.x + R * 0.9, e.y - R * 1.2 - (ART[key] ? R * 0.6 : 0), 22);
  const w = R * 2.4, y = e.y - R - 20 - (ART[key] ? R * 1.2 : 0);
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(e.x - w / 2, y, w, 7);
  ctx.fillStyle = '#e04a3a'; ctx.fillRect(e.x - w / 2, y, w * clamp(e.hp / e.maxHp, 0, 1), 7);
  ctx.font = 'bold 14px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(d.name, e.x, y - 3); ctx.fillStyle = '#ffb08a'; ctx.fillText(d.name, e.x, y - 3);
  drawStatus(e, e.x, y - 24);
}
function drawEnemy(e) {
  if (e.camp) return drawCamp(e);
  if (e.eb) return drawEBld(e);
  shadow(e.x, e.y + (e.fly ? 12 : 0), e.r * (e.fly ? 0.7 : 1));
  // 敌人脚下的红圈（中立野怪是橙圈），和我方的蓝圈一眼分清
  ctx.strokeStyle = e.lair ? 'rgba(255,170,60,0.85)' : 'rgba(255,70,50,0.85)'; ctx.lineWidth = e.boss ? 3 : 2;
  ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.78 + (e.fly ? 12 : 0), e.r * 1.05, e.r * 0.42, 0, 0, TAU); ctx.stroke();
  if (e.elite || e.boss) {
    ctx.fillStyle = e.boss ? 'rgba(255,40,40,0.25)' : 'rgba(255,170,30,0.25)';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.3 + Math.sin(G.time * 6) * 3, 0, TAU); ctx.fill();
  }
  const wob = Math.sin(G.time * 10 + e.wob) * (e.boss ? 1 : 2);
  if (e.type === 'ghost') ctx.globalAlpha = 0.8;
  const ek = e.d.art ? 'enemies/' + e.d.art : 'enemies/' + e.type;
  poseBegin(e, e.y + e.r);
  drawArt(ek, e.d.icon, e.x, e.y + wob * 0.5 - (e.fly ? 10 : 0), e.r * 1.9, e.face > 0, e.face < 0, undefined, e.flash > 0 ? 0.85 : 0);
  ctx.restore();
  if (e.flash > 0 && !ART[ek]) { ctx.globalAlpha = 0.6; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.85, 0, TAU); ctx.fill(); }
  if (e.slowT > 0 || e.st.chill) { ctx.globalAlpha = 0.3; ctx.fillStyle = '#9adfff'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.9, 0, TAU); ctx.fill(); }
  if (e.st.burn) { ctx.globalAlpha = 0.22; ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.9, 0, TAU); ctx.fill(); }
  else if (e.st.poison) { ctx.globalAlpha = 0.22; ctx.fillStyle = '#7ad03a'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.9, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
  const el = artLift(ek, e.r * 1.9);
  if (e.shield > 0) { ctx.strokeStyle = 'rgba(120,200,255,0.85)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.15, -Math.PI / 2, -Math.PI / 2 + TAU * e.shield / e.shieldMax); ctx.stroke(); ctx.fillStyle = 'rgba(120,200,255,0.12)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.15, 0, TAU); ctx.fill(); }
  if (e.enraged) { ctx.fillStyle = 'rgba(255,60,30,0.2)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.1 + Math.sin(G.time * 14) * 2, 0, TAU); ctx.fill(); }
  if (e.frT !== undefined) { ctx.strokeStyle = 'rgba(150,220,255,0.25)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(e.x, e.y, 120, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
  if (e.aff && !e.boss) e.aff.forEach((a, i) => drawSprite(AFFIXES[a].icon, e.x + (i - (e.aff.length - 1) / 2) * 13, e.y - e.r - 30 - el, 11));
  drawStatus(e, e.x, e.y - e.r - (e.aff ? 44 : 18) - el);
  if (e.hp < e.maxHp && !e.boss) {
    const w = Math.max(20, e.r * 1.8), hr = e.hp / e.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2, e.y - e.r - 10 - el, w, 4);
    ctx.fillStyle = e.elite ? '#ffae3a' : '#e04a3a'; ctx.fillRect(e.x - w / 2, e.y - e.r - 10 - el, w * hr, 4);
  }
}
function drawProjs(vis) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of G.projs) {
    if (!vis(b.x, b.y)) continue;
    // 拖尾
    if (b.tr && b.tr.length >= 4 && b.kind !== 'arrow') {
      const n = b.tr.length / 2; ctx.strokeStyle = b.color; ctx.lineCap = 'round';
      for (let i = 1; i < n; i++) { const q = i / n; ctx.globalAlpha = 0.45 * q; ctx.lineWidth = b.r * 1.7 * q; ctx.beginPath(); ctx.moveTo(b.tr[i * 2 - 2], b.tr[i * 2 - 1]); ctx.lineTo(b.tr[i * 2], b.tr[i * 2 + 1]); ctx.stroke(); }
      ctx.globalAlpha = 0.45; ctx.lineWidth = b.r * 1.7; ctx.beginPath(); ctx.moveTo(b.tr[b.tr.length - 2], b.tr[b.tr.length - 1]); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (b.team === 'enemy') {
      ctx.fillStyle = b.color; ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.9, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.55, 0, TAU); ctx.fill();
    } else if (b.kind === 'arrow') {
      // 箭：淡淡的风痕 + 箭杆 + 箭头 + 尾羽
      const l = hypot(b.vx, b.vy) || 1, ux = b.vx / l, uy = b.vy / l, nx = -uy, ny = ux;
      ctx.globalAlpha = 0.25; ctx.strokeStyle = b.color; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.x - ux * 46, b.y - uy * 46); ctx.lineTo(b.x - ux * 20, b.y - uy * 20); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#d8c8a0'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(b.x - ux * 20, b.y - uy * 20); ctx.lineTo(b.x - ux * 4, b.y - uy * 4); ctx.stroke();
      ctx.fillStyle = '#eef2f6'; ctx.beginPath(); ctx.moveTo(b.x + ux * 4, b.y + uy * 4); ctx.lineTo(b.x - ux * 5 + nx * 3.5, b.y - uy * 5 + ny * 3.5); ctx.lineTo(b.x - ux * 5 - nx * 3.5, b.y - uy * 5 - ny * 3.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = b.color; for (const sgn of [1, -1]) { ctx.beginPath(); ctx.moveTo(b.x - ux * 16, b.y - uy * 16); ctx.lineTo(b.x - ux * 22 + nx * 4 * sgn, b.y - uy * 22 + ny * 4 * sgn); ctx.lineTo(b.x - ux * 20, b.y - uy * 20); ctx.closePath(); ctx.fill(); }
      ctx.globalCompositeOperation = 'lighter';
    } else {
      ctx.fillStyle = b.color; ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2.2, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}
function drawEffects() {
  for (const f of G.effects) {
    if (f.t < 0) {
      if (f.kind === 'meteor') { ctx.strokeStyle = 'rgba(255,120,40,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.stroke(); }
      continue;
    }
    const k = f.t / f.life;
    ctx.save();
    if (f.kind === 'slash') {
      const x = f.follow ? G.lord.x : f.x, y = f.follow ? G.lord.y : f.y;
      ctx.globalAlpha = Math.max(0, 1 - k) * 0.45; ctx.fillStyle = f.color;
      ctx.beginPath();
      const a0 = f.ang - f.half, a1 = f.ang + f.half;
      ctx.arc(x, y, f.r, a0, a1); ctx.arc(x, y, f.r * (0.55 + 0.25 * k), a1, a0, true);
      ctx.closePath(); ctx.fill();
    } else if (f.kind === 'ring') {
      const r = Math.max(1, f.r0 + (f.r1 - f.r0) * Math.sqrt(Math.min(1, k))), a = Math.max(0, 1 - k);
      if (f.fill) {
        const gr = ctx.createRadialGradient(f.x, f.y, r * 0.3, f.x, f.y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.75, f.color); gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = a * 0.35; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = f.color;
      ctx.globalAlpha = a * 0.25; ctx.lineWidth = 16 * a + 3; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = a; ctx.lineWidth = 5 * a + 1; ctx.stroke();
    } else if (f.kind === 'spark') {
      // 命中火花：沿受击方向迸出几道短光
      const rs = mulberry32((f.seed * 1e6) | 0); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = f.color; ctx.lineCap = 'round';
      ctx.globalAlpha = Math.max(0, 1 - k); ctx.lineWidth = 2.5 * (1 - k) + 0.8;
      for (let i = 0; i < f.n; i++) { const a = f.ang + (rs() - 0.5) * 1.9, l0 = f.len * (0.15 + k * 0.7), l1 = f.len * (0.5 + k) * (0.6 + rs() * 0.6); ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * l0, f.y + Math.sin(a) * l0); ctx.lineTo(f.x + Math.cos(a) * l1, f.y + Math.sin(a) * l1); ctx.stroke(); }
      if (k < 0.4) { ctx.globalAlpha = (0.4 - k) * 2; ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, 6 + f.len * 0.2, 0, TAU); ctx.fill(); }
    } else if (f.kind === 'rune') {
      // 施法法阵：贴地的旋转圆环、符文刻度和六芒星
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.sin(Math.min(1, k) * Math.PI) * 0.9;
      ctx.translate(f.x, f.y); ctx.scale(1, 0.5); ctx.rotate(G.time * 2.2);
      const R = f.r * (0.7 + 0.3 * Math.min(1, k * 3));
      ctx.strokeStyle = f.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, R * 0.78, 0, TAU); ctx.stroke();
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.fillStyle = f.color; ctx.fillRect(Math.cos(a) * R * 0.89 - 2.5, Math.sin(a) * R * 0.89 - 2.5, 5, 5); }
      ctx.lineWidth = 2; for (const off of [0, Math.PI]) { ctx.beginPath(); for (let i = 0; i <= 3; i++) { const a = off + i / 3 * TAU - Math.PI / 2; i ? ctx.lineTo(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78) : ctx.moveTo(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78); } ctx.stroke(); }
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, R); gr.addColorStop(0, f.color); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha *= 0.35; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    } else if (f.kind === 'zap') {
      ctx.globalAlpha = Math.max(0, 1 - k); ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 3; ctx.shadowColor = '#7ac8ff'; ctx.shadowBlur = 12;
      const r = mulberry32((f.seed * 1e6) | 0);
      ctx.beginPath(); ctx.moveTo(f.x, f.y);
      for (let i = 1; i < 6; i++) { const q = i / 6; ctx.lineTo(f.x + (f.x2 - f.x) * q + (r() - 0.5) * 24, f.y + (f.y2 - f.y) * q + (r() - 0.5) * 24); }
      ctx.lineTo(f.x2, f.y2); ctx.stroke();
    } else if (f.kind === 'beam') {
      ctx.globalAlpha = Math.max(0, 1 - k); ctx.strokeStyle = f.color; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
    } else if (f.kind === 'flash') {
      ctx.globalAlpha = Math.max(0, 1 - k) * 0.85; ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      gr.addColorStop(0, '#fff6d0'); gr.addColorStop(0.4, 'rgba(255,190,90,0.7)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
    } else if (f.kind === 'pillar') {
      ctx.globalAlpha = Math.sin(Math.min(1, k) * Math.PI) * 0.7; ctx.globalCompositeOperation = 'lighter';
      const ww = f.w * (0.9 - 0.4 * k), gr = ctx.createLinearGradient(0, f.y - 260, 0, f.y + f.w / 2);
      gr.addColorStop(0, 'rgba(255,215,106,0)'); gr.addColorStop(1, 'rgba(255,225,140,0.9)');
      ctx.fillStyle = gr; ctx.fillRect(f.x - ww / 2, f.y - 260, ww, 260 + f.w / 2);
    } else if (f.kind === 'meteor') {
      ctx.strokeStyle = 'rgba(255,120,40,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - k * 0.3), 0, TAU); ctx.stroke();
      // 火球从右上方坠落，拖着长长的火尾
      const hh = (1 - k) * 500, mx = f.x + hh * 0.5, my = f.y - hh;
      ctx.globalCompositeOperation = 'lighter';
      const tl = ctx.createLinearGradient(mx, my, mx + 90, my - 180); tl.addColorStop(0, 'rgba(255,160,60,0.9)'); tl.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.strokeStyle = tl; ctx.lineCap = 'round'; ctx.lineWidth = 22; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + 90, my - 180); ctx.stroke();
      const fb = ctx.createRadialGradient(mx, my, 0, mx, my, 26); fb.addColorStop(0, '#fffbe0'); fb.addColorStop(0.35, '#ffc060'); fb.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = fb; ctx.beginPath(); ctx.arc(mx, my, 26, 0, TAU); ctx.fill();
    } else if (f.kind === 'strike') {
      // 箭雨：箭从天而降
      const hh = (1 - k) * 260;
      ctx.strokeStyle = '#e6f5a8'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(f.x - 6 - hh * 0.2, f.y - 26 - hh); ctx.lineTo(f.x - hh * 0.2, f.y - hh); ctx.stroke();
    } else if (f.kind === 'bomb') {
      const blink = Math.floor(f.t * (f.t > 1 ? 14 : 6)) % 2;
      drawSprite('💣', f.x, f.y, 26);
      ctx.strokeStyle = blink ? 'rgba(255,60,60,0.9)' : 'rgba(255,60,60,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, 150 * (0.3 + 0.7 * k), 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  if (G.tut) drawTutArrow();
}
function drawTutArrow() {
  const p = tutTarget(); if (!p) return;
  const bob = Math.sin(performance.now() / 160) * 8;
  ctx.save(); ctx.globalAlpha = 0.95; drawSprite('👇', p.x, p.y - 44 + bob, 34); ctx.restore();
  ctx.strokeStyle = 'rgba(255,215,106,0.7)'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6 + bob * 0.4, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, Math.max(0, w), h, r); else ctx.rect(x, y, Math.max(0, w), h); }
function drawHUD() {
  const h = G.lord, st = lordStats(), md = LORD.modes[h.mode];
  drawIntel();
  const bx = 14, by = VH - 100 - ($build.offsetHeight || 0);
  G.hudRects = [{ kind: 'lord', x: bx, y: by, w: 290, h: 88 }];
  ctx.fillStyle = 'rgba(15,10,18,0.82)'; roundRect(bx, by, 290, 88, 10); ctx.fill();
  drawPortrait(['portraits/lord', 'lord/' + h.mode], LORD.icon, bx + 30, by + 30, 30);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffe7a8'; ctx.font = 'bold 11px "Microsoft YaHei",sans-serif';
  ctx.fillText(`Lv${h.lvl}`, bx + 30, by + 58);
  if (h.lvl < LVL_MAX.lord) { ctx.fillStyle = '#3a3020'; ctx.fillRect(bx + 10, by + 68, 40, 4); ctx.fillStyle = '#ffd76a'; ctx.fillRect(bx + 10, by + 68, 40 * clamp(h.xp / XP_NEED(h.lvl), 0, 1), 4); }
  ctx.textAlign = 'left';
  ctx.font = 'bold 13px "Microsoft YaHei",sans-serif'; ctx.fillText(`${LORD.name}`, bx + 60, by + 14);
  // 三种攻击方式
  MODE_ORDER.forEach((m, i) => {
    const on = m === h.mode, x = bx + 110 + i * 34, y = by + 4;
    ctx.fillStyle = on ? 'rgba(255,215,106,0.3)' : 'rgba(255,255,255,0.06)'; roundRect(x, y, 30, 22, 5); ctx.fill();
    if (on) { ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.globalAlpha = on ? 1 : 0.5; drawSprite(LORD.modes[m].icon, x + 15, y + 11, 15); ctx.globalAlpha = 1;
  });
  ctx.fillStyle = '#a8987a'; ctx.font = '11px "Microsoft YaHei",sans-serif'; ctx.fillText('[Q] 切换', bx + 216, by + 15);
  const hr = clamp(h.hp / st.hp, 0, 1);
  ctx.fillStyle = '#3a1a1a'; roundRect(bx + 60, by + 30, 218, 14, 4); ctx.fill();
  ctx.fillStyle = '#e03a3a'; roundRect(bx + 60, by + 30, 218 * hr, 14, 4); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(h.dead ? `复活 ${Math.ceil(h.respawnT)}s` : `${Math.ceil(h.hp)} / ${Math.round(st.hp)}`, bx + 169, by + 37);
  const sk = md.skill, cd = h.cds[h.mode];
  ctx.textAlign = 'left'; ctx.font = '12px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = cd > 0 ? '#a8987a' : '#ffd76a';
  ctx.fillText(`[空格] ${sk.icon} ${sk.name}` + (cd > 0 ? `  ${cd.toFixed(1)}s` : '  就绪'), bx + 60, by + 60);
  ctx.fillStyle = G.follow ? '#8fd4ff' : '#a8987a';
  const nSol = G.units.filter(u => !u.d.hero).length;
  ctx.fillText(`[F] 士兵${G.follow ? '跟随领主' : '驻守集结点'} · ${nSol} 人`, bx + 60, by + 77);
  // 英雄头像
  const heroes = G.units.filter(u => u.d.hero && !u.dead);
  heroes.forEach((u, i) => {
    const x = bx + i * 54, y = by - 60, w = 48, hh = 52;
    G.hudRects.push({ kind: 'hero', id: u.id, x, y, w, h: hh });
    const sel = G.group.includes(u.id);
    ctx.fillStyle = 'rgba(15,10,18,0.82)'; roundRect(x, y, w, hh, 8); ctx.fill();
    ctx.strokeStyle = sel ? '#ffe07a' : u.d.color; ctx.lineWidth = sel ? 2.5 : 1.5; ctx.stroke();
    drawPortrait(['portraits/' + u.type, unitArtKey(u)], u.d.icon, x + w / 2, y + 22, 26);
    ctx.fillStyle = '#ffe7a8'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Lv' + u.lvl, x + w / 2, y + hh - 18);
    const k = clamp(u.hp / unitStats(u).hp, 0, 1);
    ctx.fillStyle = '#3a1a1a'; ctx.fillRect(x + 5, y + hh - 11, w - 10, 5);
    ctx.fillStyle = k > 0.5 ? '#5ae05a' : k > 0.25 ? '#ffc23a' : '#ff3a3a'; ctx.fillRect(x + 5, y + hh - 11, (w - 10) * k, 5);
    const ab = u.d.ability, rdy = u.abT <= 0;
    ctx.fillStyle = rdy ? '#ffd76a' : '#a8987a'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(rdy ? ab.icon : Math.ceil(u.abT) + 's', x + w - 9, y + 9);
    if (u.order && u.order !== 'follow') { ctx.fillText('📍', x + 9, y + 9); }
  });
  drawMinimap();
  if (G.phase === 'battle' && G.morale && G.morale !== 'fed') {
    const mo = MORALE[G.morale];
    ctx.font = 'bold 15px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const txt = `${mo.icon} ${mo.name}：粮食不足，士兵和英雄战力下降`, tw = ctx.measureText(txt).width + 24;
    ctx.fillStyle = 'rgba(40,10,10,0.8)'; roundRect(VW / 2 - tw / 2, 88, tw, 28, 8); ctx.fill();
    ctx.fillStyle = mo.color; ctx.fillText(txt, VW / 2, 102);
  }
  if (G.announce && !G.paused && G.phase !== 'over') {
    const a = G.announce;
    ctx.globalAlpha = clamp(a.t * 2, 0, 1); ctx.textAlign = 'center';
    ctx.font = 'bold 44px "Microsoft YaHei",sans-serif';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(a.text, VW / 2, VH * 0.24); ctx.fillStyle = a.boss ? '#ff5a4a' : '#ffd76a'; ctx.fillText(a.text, VW / 2, VH * 0.24);
    if (a.sub) { ctx.font = 'bold 18px "Microsoft YaHei",sans-serif'; ctx.strokeText(a.sub, VW / 2, VH * 0.24 + 40); ctx.fillStyle = '#f1e6c8'; ctx.fillText(a.sub, VW / 2, VH * 0.24 + 40); }
    ctx.globalAlpha = 1;
  }
  if (G.combo >= 5 && G.phase === 'battle') {
    const pop = 1 + Math.max(0, G.comboT - 2.3) * 2.5, hot = G.combo >= 50 ? '#ff5a3a' : G.combo >= 20 ? '#ffb03a' : '#ffd76a';
    ctx.save(); ctx.translate(VW - 200, 112); ctx.scale(pop, pop); ctx.textAlign = 'center'; ctx.globalAlpha = clamp(G.comboT, 0, 1);
    ctx.font = 'bold 34px "Microsoft YaHei",sans-serif'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(`${G.combo} 连杀`, 0, 0); ctx.fillStyle = hot; ctx.fillText(`${G.combo} 连杀`, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(-70, 22, 140, 4); ctx.fillStyle = hot; ctx.fillRect(-70, 22, 140 * clamp(G.comboT / 2.5, 0, 1), 4);
    ctx.restore();
  }
  const boss = G.bossRef && !G.bossRef.dead && G.enemies.includes(G.bossRef) ? G.bossRef : null;
  if (boss) {
    const w = Math.min(520, VW - 360), k = clamp(boss.hp / boss.maxHp, 0, 1), y = 58;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; roundRect(VW / 2 - w / 2 - 3, y, w + 6, 22, 6); ctx.fill();
    ctx.fillStyle = '#b01a2a'; roundRect(VW / 2 - w / 2, y + 3, w * k, 16, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${boss.d.name}  ${Math.ceil(boss.hp)}${boss.shield > 0 ? `  🔰${Math.ceil(boss.shield)}` : ''}`, VW / 2, y + 11);
    if (boss.aff) { ctx.font = 'bold 12px "Microsoft YaHei",sans-serif'; ctx.fillStyle = '#ffd0a0'; ctx.fillText(affIcons(boss.aff), VW / 2, y + 34); }
  }
}
const MM = 170;
function mmRect() { return { x0: VW - MM - 14, y0: VH - MM - 14 - ($build.offsetHeight || 0) }; }
function inMinimap(sx, sy) { const { x0, y0 } = mmRect(); return sx >= x0 && sx <= x0 + MM && sy >= y0 && sy <= y0 + MM; }
function minimapPan(sx, sy) { const { x0, y0 } = mmRect(); G.cam.x = (sx - x0) / MM * WORLD_W; G.cam.y = (sy - y0) / MM * WORLD_H; G.freeCam = true; }
function drawMinimap() {
  const { x0, y0 } = mmRect(), k = MM / WORLD_W;
  ctx.fillStyle = 'rgba(15,10,18,0.85)'; ctx.fillRect(x0 - 3, y0 - 3, MM + 6, MM + 6);
  ctx.drawImage(MAP.mini, x0, y0, MM, MM);
  if (G.phase === 'prep') {
    ctx.strokeStyle = 'rgba(255,70,60,0.85)'; ctx.lineWidth = 1.5;
    for (const r of G.routes) { ctx.beginPath(); r.pts.forEach(([x, y], i) => i ? ctx.lineTo(x0 + x * k, y0 + y * k) : ctx.moveTo(x0 + x * k, y0 + y * k)); ctx.stroke(); }
  }
  for (const b of G.buildings) { ctx.fillStyle = b.type === 'castle' ? '#ffd76a' : b.type === 'wall' ? '#c8c0b0' : '#d8b878'; ctx.fillRect(x0 + b.tx * T * k, y0 + b.ty * T * k, Math.max(1.5, b.w * k), Math.max(1.5, b.w * k)); }
  const act = new Set(G.activePortals);
  PORTALS.forEach((p, i) => { const on = act.has(i) && G.phase === 'prep'; ctx.fillStyle = on ? '#ff4a4a' : '#9a6ad0'; ctx.beginPath(); ctx.arc(x0 + p.x * k, y0 + p.y * k, on ? 4 : 2.5, 0, TAU); ctx.fill(); });
  ctx.fillStyle = '#ff4a4a';
  for (const f of liveFacs()) for (const b of f.blds) { const s = b.eb.kind === 'hq' ? 9 : 4; ctx.fillStyle = f.color; ctx.fillRect(x0 + b.x * k - s / 2, y0 + b.y * k - s / 2, s, s); if (b.eb.kind === 'hq') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(x0 + b.x * k - s / 2, y0 + b.y * k - s / 2, s, s); } }
  for (const p of G.pings || []) { ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(G.time * 10); ctx.beginPath(); ctx.arc(x0 + p.x * k, y0 + p.y * k, 6 + (8 - p.t) * 1.5, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.fillStyle = '#ff4a4a';
  for (const e of G.enemies) { const s = e.boss ? 6 : e.elite ? 3 : 1.8; if (!e.camp && !e.eb) ctx.fillRect(x0 + e.x * k - s / 2, y0 + e.y * k - s / 2, s, s); }
  for (const l of G.lairs || []) if (l.alive) { ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.arc(x0 + l.x * k, y0 + l.y * k, 3, 0, TAU); ctx.fill(); }
  for (const r of G.relics || []) { ctx.fillStyle = '#fff3a0'; ctx.fillRect(x0 + r.x * k - 1.5, y0 + r.y * k - 1.5, 3, 3); }
  for (const c of aliveCamps()) { ctx.fillStyle = '#ff4a2a'; ctx.strokeStyle = '#ffd0a0'; ctx.lineWidth = 1.5; ctx.fillRect(x0 + c.x * k - 4, y0 + c.y * k - 4, 8, 8); ctx.strokeRect(x0 + c.x * k - 4, y0 + c.y * k - 4, 8, 8); }
  for (const u of G.units) { ctx.fillStyle = u.d.hero ? u.d.color : '#7ac8ff'; const s = u.d.hero ? 4 : 2; ctx.fillRect(x0 + u.x * k - s / 2, y0 + u.y * k - s / 2, s, s); }
  if (!G.lord.dead) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x0 + G.lord.x * k, y0 + G.lord.y * k, 3.5, 0, TAU); ctx.fill(); }
  const c = G.cam, hw = VW / 2 / c.z, hh = VH / 2 / c.z;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
  ctx.strokeRect(x0 + (c.x - hw) * k, y0 + (c.y - hh) * k, hw * 2 * k, hh * 2 * k);
}
let menuT = 0;
function drawMenuBg() {
  menuT += 0.016;
  ctx.fillStyle = '#120e16'; ctx.fillRect(0, 0, VW, VH);
  for (let i = 0; i < 40; i++) {
    const x = (i * 197 + menuT * 20 * (1 + i % 3)) % (VW + 100) - 50, y = (i * 131) % VH;
    ctx.globalAlpha = 0.12; drawSprite(['🏰', '⚔️', '🧱', '🏹', '👹', '🛡️', '🛕', '🧙'][i % 8], x, y, 30 + (i % 4) * 10);
  }
  ctx.globalAlpha = 1;
}

// ================= 界面（DOM） =================
function hideOverlay() { overlay.className = 'hidden'; overlay.innerHTML = ''; }
function showOverlay(html, light) { overlay.className = light ? 'light' : ''; overlay.innerHTML = html; overlay.scrollTop = 0; }
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { fn(el.dataset.i, el); if (isLive()) updateUI(true); }
});
// 底部快捷栏：建筑 / 城防 / 兵种 / 英雄 四个分页，F1~F10 对应当前分页里的第 N 项（数字键留给编队）
const KEY_LABEL = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10'];
function barItems() {
  const tab = BUILD_TABS.find(t => t.id === G.barTab) || BUILD_TABS[0];
  if (tab.list) return tab.list.map(id => ({ kind: 'bld', id, d: BUILDINGS[id] }));
  if (tab.id === 'unit') return RECRUITABLE.map(id => ({ kind: 'unit', id, d: UNITS[id] }));
  return Object.keys(HEROES).map(id => ({ kind: 'hero', id, d: HEROES[id] }));
}
function buildBarInit() {
  const tabs = BUILD_TABS.map((t, i) => `<div class="bt ${G.barTab === t.id ? 'on' : ''}" data-act="tab" data-i="${i}">${t.icon} ${t.name}</div>`).join('');
  const items = barItems().map((it, i) => `<div class="bb" data-act="quick" data-i="${i}" data-id="${it.id}" title="${it.d.name}：${it.d.desc}"><span class="bk">${KEY_LABEL[i] || ''}</span><span class="bi">${iconHtml((it.kind === 'bld' ? 'buildings/' : it.kind === 'hero' ? 'heroes/' : 'units/') + it.id, it.d.icon)}</span><span class="bn">${it.d.name}</span><span class="bc"></span></div>`).join('');
  $build.innerHTML = `<div class="btabs">${tabs}<span class="bth">Tab 切换分页 · F1~F10 快捷选择</span></div><div class="bitems">${items}</div>`;
}
function setTab(i) {
  if (!G || i < 0) return;
  G.barTab = BUILD_TABS[i].id;
  if (G.barTab !== 'build' && G.barTab !== 'def') G.buildMode = null;
  buildBarInit(); updateUI(true);
}
// 快捷栏每一项当前的状态：{ text, cant, locked, on, alive }
function barState(it) {
  const id = it.id;
  if (it.kind === 'bld') {
    const c = bCost(id, 1), why = buildLockReason(id);
    return { text: why ? (why.startsWith('需要') ? why.replace('需要 ', '需') : '已建造') : costStr(c), cant: !canPay(c) || !canBuild(), locked: !!why, on: G.buildMode === id };
  }
  if (it.kind === 'unit') {
    const u = UNITS[id], n = G.units.filter(o => o.type === id).length;
    if (!isUnlocked('unit', id)) return { text: `🔒荣耀${unlockOf('unit', id).need}`, locked: true };
    if (!G.buildings.some(b => b.type === 'barracks' && b.lvl >= u.barracks)) return { text: u.barracks > 1 ? `需${u.barracks}级兵营` : '需兵营', locked: true };
    const c = unitCost(id);
    return { text: `🪙${c}${n ? ` ·${n}` : ''}`, cant: G.res.gold < c };
  }
  const d = HEROES[id], alive = G.units.find(o => o.type === id && !o.dead);
  if (!isUnlocked('hero', id)) return { text: `🔒荣耀${unlockOf('hero', id).need}`, locked: true };
  if (alive) return { text: `在场 Lv${alive.lvl}`, alive: true };
  if (G.heroDead[id]) return shrine() ? { text: `复活🪙${reviveCost(id)}`, cant: !!reviveLock(id), dead: true } : { text: '✝ 需复活祭坛', locked: true, dead: true };
  const a = altar();
  if (!a) return { text: '需英雄祭坛', locked: true };
  if (a.lvl < d.altar) return { text: `需${d.altar}级祭坛`, locked: true };
  return { text: `🪙${heroCost(id)}`, cant: !!summonLock(id) };
}
function quickPick(i) {
  const it = barItems()[i]; if (!it) return;
  if (it.kind === 'bld') selectBuild(it.id);
  else if (it.kind === 'unit') quickRecruit(it.id);
  else {
    const alive = G.units.find(o => o.type === it.id && !o.dead);
    if (alive) ACTIONS.selUnit(alive.id);
    else if (G.heroDead[it.id]) reviveHero(it.id);
    else summonHero(it.id);
  }
  updateUI(true);
}
const QUEUE_MAX = 8;
// 从快捷栏招募：自动挑一座够等级、队列最短的兵营
function quickRecruit(t) {
  const u = UNITS[t];
  if (!isUnlocked('unit', t)) { toast(`累计荣耀 ${unlockOf('unit', t).need} 解锁`); sfx('err'); return false; }
  const bs = G.buildings.filter(b => b.type === 'barracks' && b.lvl >= u.barracks && b.queue.length < QUEUE_MAX).sort((a, b) => a.queue.length - b.queue.length);
  if (!bs.length) { toast(G.buildings.some(b => b.type === 'barracks' && b.lvl >= u.barracks) ? '兵营训练队列已满' : `需要 ${u.barracks} 级兵营`); sfx('err'); return false; }
  const c = unitCost(t);
  if (G.res.gold < c) { toast('金币不足'); sfx('err'); return false; }
  G.res.gold -= c; bs[0].queue.push(t); sfx('buy');
  return true;
}
let lastPanel = '', lastTop = '', lastGuide = '';
const $guide = document.getElementById('guide');
function updateUI() {
  if (!G || !isLive()) return;
  if (!$build.querySelector('.btabs')) buildBarInit();
  const ps = { gold: 0, wood: 0, stone: 0, food: 0 };
  for (const b of G.buildings) for (const k in ps) ps[k] += bProd(b, k);
  const r = G.res;
  const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const phase = G.phase === 'war'
    ? `<span class="ph battle" title="敌人强度每 ${CONQ.eraTime} 秒提升一级">👑 征服 ${mmss(G.time)} · 敌国 ${liveFacs().length}/${G.facs.length}</span>`
    : G.phase === 'prep'
    ? `<span class="ph prep">准备 ${Math.ceil(G.prepT)}s</span><span class="tb" data-act="go">⚔ 立即开战 <small>Enter</small></span><span class="tb ghost" data-act="repairAll">🔧 全部修理 <small>R</small></span>`
    : `<span class="ph battle">⚔ 战斗中 · 剩余敌人 ${G.waveList.length + G.enemies.length}</span>`;
  const top = `<span class="res g" title="金币：招募士兵、召唤英雄、升级领主和英雄、铁匠铺、训练">🪙 ${fmt(r.gold)} <small>+${ps.gold.toFixed(1)}/s</small></span>
    <span class="res" title="木材：建造">🪵 ${fmt(r.wood)} <small>+${ps.wood.toFixed(1)}/s</small></span>
    <span class="res" title="石材：建造">🪨 ${fmt(r.stone)} <small>+${ps.stone.toFixed(1)}/s</small></span>
    <span class="res" title="粮食：农田和主城产出，每波开战时士兵和英雄要吃饭">🍖 ${fmt(r.food)} <small>+${ps.food.toFixed(1)}/s</small></span>
    <span class="res ${r.food < foodNeed() ? 'bad' : ''}" title="下一波开战要消耗的粮食。不够会士气低迷（攻击 -20%）甚至饥饿（攻击 -40%、持续掉血）">🍽 ${foodNeed()}/${G.conq ? `${Math.ceil(G.upkeepT)}s` : '波'}</span>
    ${fighting() && G.morale ? `<span class="res" style="color:${MORALE[G.morale].color}" title="${MORALE[G.morale].desc}">${MORALE[G.morale].icon} ${MORALE[G.morale].name}</span>` : ''}
    <span class="res" title="在场英雄 / 祭坛英雄位">🛕 ${heroesAlive().length}/${heroSlots()}</span>
    <span class="wave">${G.conq ? `${G.map.icon} 敌军强度 ${G.wave}` : `${G.map.icon} 第 ${G.wave}/${MAX_WAVE} 波${isBossWave(G.wave) ? ' · 首领' : ''}`}</span>${phase}
    <span class="spacer"></span>
    <span class="tb ghost" data-act="lord" title="领主面板 (H)">${LORD.icon} 领主</span>
    <span class="tb ghost" data-act="speed" title="倍速 (T)">⏩ ${G.speed}x</span>
    <span class="tb ghost" data-act="pause" title="暂停 (P)">⏸</span>`;
  if (top !== lastTop) { $top.innerHTML = top; lastTop = top; }
  const items = barItems(), tk = G.tut && TUT[G.tut.i].key;
  for (const el of $build.querySelectorAll('.bb')) {
    const it = items[+el.dataset.i]; if (!it) continue;
    const st = barState(it);
    el.classList.toggle('on', !!st.on); el.classList.toggle('cant', !!st.cant); el.classList.toggle('locked', !!st.locked);
    el.classList.toggle('alive', !!st.alive); el.classList.toggle('dead', !!st.dead);
    el.classList.toggle('tut', it.id === tk);
    const bc = el.querySelector('.bc'); if (bc.textContent !== st.text) bc.textContent = st.text;
  }
  $build.classList.toggle('battle', !canBuild() && (G.barTab === 'build' || G.barTab === 'def'));
  const gh = guideHtml();
  if (gh !== lastGuide) { $guide.innerHTML = gh; lastGuide = gh; $guide.classList.toggle('hidden', !gh); }
  const html = panelHtml();
  if (html !== lastPanel) { $panel.innerHTML = html; lastPanel = html; }
  $panel.classList.toggle('hidden', !html);
}
function btn(act, i, label, cost, enabled, extra = '') {
  return `<div class="pb ${enabled ? '' : 'cant'} ${extra}" data-act="${act}" data-i="${i}"><span class="pl">${label}</span>${cost ? `<span class="pc">${cost}</span>` : ''}</div>`;
}
const pct = v => Math.round(v * 100) + '%';
const redu = d => Math.round((1 - defMul(d)) * 100);
// 属性表：生命、物攻/魔攻、物防/魔防（减伤）、攻速、射程、精度、弹速、暴击、吸血、回血、移速
function statRows(st, hp, opt = {}) {
  const r = [];
  if (hp !== undefined) r.push(['生命', `${Math.ceil(hp)}/${Math.round(st.hp)}`]);
  r.push(['物理攻击', st.patk ? Math.round(st.patk) : '—'], ['魔法攻击', st.matk ? Math.round(st.matk) : '—']);
  if (st.pdef !== undefined) r.push(['物理防御', `${Math.round(st.pdef)} <small>(-${redu(st.pdef)}%)</small>`], ['魔法防御', `${Math.round(st.mdef)} <small>(-${redu(st.mdef)}%)</small>`]);
  r.push(['攻速', `${(1 / st.cd).toFixed(2)}/秒`], ['射程', Math.round(st.range)]);
  if (opt.ranged) r.push(['精度', pct(Math.min(1, st.acc))], ['弹速', Math.round(st.pspd)]);
  r.push(['暴击', `${pct(st.crit || 0)} ×${st.critMul || 2}`]);
  if (st.ls !== undefined) r.push(['吸血', pct(st.ls)]);
  if (st.regen !== undefined) r.push(['回血', `${(+st.regen).toFixed(1)}/秒`]);
  if (st.dodge) r.push(['闪避', pct(st.dodge)]);
  if (st.spd) r.push(['移速', Math.round(st.spd)]);
  return `<div class="kv">${r.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>`;
}
function xpBar(a, max) {
  if (a.lvl >= max) return `<div class="xpb max"><i style="width:100%"></i><span>Lv${a.lvl} 已满级</span></div>`;
  const need = XP_NEED(a.lvl);
  return `<div class="xpb"><i style="width:${clamp(a.xp / need, 0, 1) * 100}%"></i><span>Lv${a.lvl} · 经验 ${Math.floor(a.xp)}/${need}</span></div>`;
}
const onText = on => on ? `${ST_INFO[on.st].icon}${Math.round((on.chance === undefined ? 1 : on.chance) * 100)}% ${ST_INFO[on.st].name}` : '';
const stLine = o => { const ks = Object.keys(o.st || {}); return ks.length ? `<p class="tip">状态：${ks.map(k => `${ST_INFO[k].icon}${ST_INFO[k].name} ${o.st[k].t.toFixed(1)}s`).join('、')}</p>` : ''; };
function lordPanel() {
  const h = G.lord, st = lordStats(), md = LORD.modes[h.mode];
  let s = `<h3>${LORD.icon} ${LORD.name} <small>Lv${h.lvl}</small></h3>${xpBar(h, LVL_MAX.lord)}
    <p>你本人。剑、弓、魔法三种攻击方式随时切换（<b>Q</b>），每种有自己的技能（<b>空格</b>）。击杀敌人获得经验自动升级。阵亡后 10 秒在主城复活。</p>
    <h4>当前：${md.icon} ${md.name} <small>${md.desc}</small></h4>${statRows(st, h.hp, { ranged: h.mode !== 'sword' })}${stLine(h)}`;
  s += `<h4>攻击方式</h4>`;
  for (const m of MODE_ORDER) {
    const d = LORD.modes[m], on = m === h.mode;
    s += btn('lordMode', m, `${d.icon} ${d.name}${on ? '（当前）' : ''} <small>${d.skill.icon} ${d.skill.name}：${d.skill.desc}（${d.skill.cd}秒）</small>`, '', true, on ? 'on' : '');
  }
  return s;
}
function orderBtns(u) {
  const hold = u.order && u.order.x !== undefined, fol = u.d.hero ? !hold : u.order === 'follow';
  return `<div class="row2">${btn('unitFollow', u.id, '👣 跟随领主', '', !fol, fol ? 'on' : '')}${u.d.hero ? '' : btn('unitRally', u.id, '🚩 回集结点', '', !!u.order, !u.order ? 'on' : '')}</div>
    <p class="tip">${hold ? '📍 正在驻守指定位置。' : ''}左键点地面让它去指定位置驻守；左键拖框可以一次选中多个单位；Ctrl+数字 编队。</p>`;
}
function unitPanel(u) {
  const d = u.d, st = unitStats(u), ranged = d.range > 100;
  if (!d.hero) {
    const tr = G.train[u.type] || 1;
    return `<h3>${d.icon} ${d.name} <small>${d.role || ''} · Lv${u.lvl}</small></h3>${d.special ? '' : xpBar(u, lvlMaxOf(u))}${u.evo ? `<p class="tip">⭐ 由${d.baseName}进化而来，等级上限 ${EVO_LVL_MAX}</p>` : ''}${evoBtns(u)}<p>${d.desc || ''}</p>${statRows(st, u.hp, { ranged })}
      ${d.onhit ? `<p class="tip">特殊攻击：${onText(d.onhit)}</p>` : ''}${stLine(u)}
      ${u.temp !== undefined ? `<p class="tip">召唤物，${Math.ceil(u.temp)} 秒后消失</p>` : `<p class="tip">击杀敌人获得经验，每级生命和攻击 +10%、双防 +2。${!d.special && tr > 1 ? `训练场加成 +${(tr - 1) * 15}%。` : ''}阵亡后要重新花 🪙${unitCost(u.type)} 招募。</p>`}
      ${u.temp === undefined ? orderBtns(u) : ''}`;
  }
  const ab = d.ability, hold = u.order && u.order !== 'follow';
  let s = `<h3>${d.icon} ${d.name} <small>${d.title} · Lv${u.lvl}</small></h3>${xpBar(u, LVL_MAX.hero)}<p>${d.desc}</p>${statRows(st, u.hp, { ranged })}${stLine(u)}
    <h4>${ab.icon} ${ab.name} <small>冷却 ${(ab.cd * (1 - st.cdr)).toFixed(1)} 秒 · ${u.abT > 0 ? `还需 ${Math.ceil(u.abT)} 秒` : '就绪'}</small></h4><p class="tip">${ab.desc}（自动释放）</p>
    <h4>成长技能 <small>升级自动学会</small></h4><div class="perks">`;
  for (const p of d.perks) {
    const got = u.lvl >= p.lvl;
    s += `<div class="pk ${got ? 'got' : ''}"><span>${p.icon}</span><div><b>${p.name}</b> <small>${got ? '已学会' : `Lv${p.lvl} 解锁`}</small><br><small>${p.desc}</small></div></div>`;
  }
  s += `</div>` + orderBtns(u) + `<p class="tip">英雄会自动躲避弹道和首领技能，残血时会后撤。阵亡后可在复活祭坛复活（保留等级和技能）。</p>`;
  return s;
}
// 满级士兵的进化按钮（单位面板里）
function evoBtns(u) {
  if (!canEvolve(u)) return !u.evo && !u.d.special && !u.d.hero && u.temp === undefined && EVOLUTIONS[u.type] ? `<p class="tip">满 ${LVL_MAX.unit} 级后可以在训练场进化（二选一）。</p>` : '';
  const tg = trainingGround(), c = EVO_COST(u.type);
  let s = `<h4>⭐ 选择进化方向 <small>${tg ? '二选一，不能更改' : '需要先建造训练场'}</small></h4>`;
  for (const br of EVOLUTIONS[u.type]) s += btn('evolve', `${u.id}:${br.id}`, `${br.icon} ${br.name} <small>${br.desc}</small>`, costStr(c), !!tg && canPay(c));
  return s;
}
function groupPanel() {
  const grp = groupUnits();
  if (!grp.length) { G.sel = null; G.group = []; return ''; }
  if (grp.length === 1) { G.sel = { kind: 'unit', id: grp[0].id }; return unitPanel(grp[0]); }
  const cnt = {};
  for (const u of grp) { const k = u.type; cnt[k] = cnt[k] || { d: u.d, n: 0, hp: 0, mx: 0 }; cnt[k].n++; cnt[k].hp += u.hp; cnt[k].mx += unitStats(u).hp; }
  let s = `<h3>🎯 已选中 ${grp.length} 个单位</h3><div class="grp">`;
  for (const k in cnt) { const c = cnt[k]; s += `<div class="gu" title="${c.d.name}"><span>${c.d.icon}</span><b>×${c.n}</b><i style="width:${c.hp / c.mx * 100}%"></i></div>`; }
  s += `</div><div class="row2">${btn('groupFollow', 0, '👣 跟随领主', '', true)}${btn('groupRally', 0, '🚩 回集结点', '', true)}</div>
    ${btn('groupClear', 0, '✖ 取消选择', '', true)}
    <p class="tip"><b>左键</b>点地面：选中的单位排成方阵走过去驻守（远程站后排）。<b>Shift</b> 拖框或点击追加/移除单位，<b>Ctrl+数字</b> 编队，<b>数字</b> 选中该队（按两下视角跳过去），<b>右键</b> 取消选择。</p>`;
  return s;
}
function shrinePanel(b) {
  const dead = Object.keys(G.heroDead);
  let s = `<h4>阵亡英雄 <small>在场 ${heroesAlive().length}/${heroSlots()}</small></h4>`;
  if (!dead.length) return s + `<p class="tip">目前没有阵亡的英雄。</p>`;
  for (const id of dead) {
    const d = HEROES[id], sn = G.heroDead[id], c = reviveCost(id), why = reviveLock(id);
    const perks = d.perks.filter(p => sn.lvl >= p.lvl).map(p => p.icon + p.name).join('、') || '无';
    s += btn('revive', id, `${d.icon} ${d.name} Lv${sn.lvl} <small>技能：${perks}｜原价 ${heroCost(id)} + 估值 ${heroValue(id, sn.lvl)}，×130%${b.d.discount[b.lvl - 1] ? `，祭坛折扣 ${pct(b.d.discount[b.lvl - 1])}` : ''}${why && why !== '金币不足' ? `｜${why}` : ''}</small>`, `🪙${c}`, !why);
  }
  return s;
}
function altarRoster(b) {
  let s = `<h4>召唤英雄 <small>在场 ${heroesAlive().length}/${heroSlots()}</small></h4><div class="heroes">`;
  for (const id in HEROES) {
    const d = HEROES[id], alive = G.units.find(u => u.type === id && !u.dead);
    let state, cls = '', act = '';
    if (!isUnlocked('hero', id)) { state = `🔒 荣耀 ${unlockOf('hero', id).need}`; cls = 'locked'; }
    else if (G.heroDead[id]) { state = shrine() ? `✝ 复活🪙${reviveCost(id)}` : '✝ 需复活祭坛'; cls = 'dead'; act = shrine() ? `data-act="revive" data-i="${id}"` : ''; }
    else if (alive) { state = `在场 Lv${alive.lvl}`; cls = 'alive'; act = `data-act="selUnit" data-i="${alive.id}"`; }
    else if (b.lvl < d.altar) { state = `需 ${d.altar} 级祭坛`; cls = 'locked'; }
    else { const why = summonLock(id); state = `🪙${heroCost(id)}`; cls = why ? 'cant' : ''; act = `data-act="summon" data-i="${id}"`; }
    const tip = `${d.name}（${d.title}）：${d.desc}｜${d.ability.icon}${d.ability.name}：${d.ability.desc}`;
    s += `<div class="hb ${cls}" ${act} title="${tip}" style="--c:${d.color}"><span class="hi">${d.icon}</span><b>${d.name}</b><span>${state}</span></div>`;
  }
  return s + `</div><p class="tip">每种英雄同时只能有一位。阵亡后要在复活祭坛复活（保留等级和技能）。英雄每波吃 ${FOOD_UPKEEP.hero} 粮食。悬停查看技能。</p>`;
}
function panelHtml() {
  if (G.buildMode) {
    const d = BUILDINGS[G.buildMode];
    return `<h3>${d.icon} 建造：${d.name}</h3><p>${d.desc}</p><p class="cost">${costStr(bCost(G.buildMode, 1))}</p>
      <p class="tip">左键放置${d.drag ? '，按住拖动可连续建造' : '，按住 Shift 可连续放置'}；右键或 Esc 取消。不能横跨悬崖。</p>`;
  }
  if (!G.sel) return '';
  if (G.sel.kind === 'lord') return lordPanel();
  if (G.sel.kind === 'unit') { const u = selUnit(); if (!u) { G.sel = null; return ''; } return unitPanel(u); }
  if (G.sel.kind === 'group') return groupPanel();
  const b = G.bmap.get(G.sel.id);
  if (!b) { G.sel = null; return ''; }
  const d = b.d, L = b.lvl - 1, mh = bldMaxHp(b), prep = canBuild();
  let s = `<h3>${d.icon} ${bName(b)} <small>Lv${b.lvl}${hAt(b.x, b.y) ? ' · 高地' : ''}</small></h3><p>${d.desc}</p><div class="kv"><span>生命</span><b>${Math.ceil(b.hp)}/${Math.round(mh)}</b>`;
  if (d.trap) s += `<span>物理伤害</span><b>${Math.round(d.trap.patk[L] * G.s.towerDmg)}/${d.trap.cd}s</b>`;
  for (const k of RES_KEYS) { const v = bProd(b, k); if (v) s += `<span>${RES_ICON[k]} 产出</span><b>+${v.toFixed(1)}/s</b>`; }
  if (d.near || d.nearWater) s += `<span>附近加成</span><b>+${Math.round(b.bonus * 100)}%</b>`;
  if (d.slots) s += `<span>英雄位</span><b>${d.slots[L]}</b>`;
  s += `</div>`;
  if (G.synDirty) computeSynergy();
  const synAll = SYNERGY.filter(r => r.a === b.type);
  if (synAll.length) s += `<h4>🔗 建筑联动</h4><p class="syn">${synAll.map(r => { const on = b.syn && b.syn.list.includes(r); return `<span class="${on ? 'on' : 'off'}">${on ? '✔' : '○'} ${r.text}${on ? '' : `（旁边建${BUILDINGS[r.b].name}）`}</span>`; }).join('<br>')}</p>`;
  if (d.attack) s += `<h4>${d.attack.kind === 'chain' ? '⚡ 连锁闪电' : d.attack.kind === 'shell' ? '💥 炮弹' : '🏹 箭矢'}${d.attack.air ? '' : ' <small>打不到飞行</small>'}</h4>` + statRows(towerStats(b), undefined, { ranged: true });
  if (b.lvl < d.hp.length) {
    const nc = bCost(b.type, b.lvl + 1);
    const label = b.type === 'wall' ? `⬆ 升级为${d.names[b.lvl]}` : `⬆ 升到 ${b.lvl + 1} 级`;
    if (b.type !== 'castle' && b.lvl + 1 > castleLvl()) s += btn('none', 0, label, `需${b.lvl + 1}级主城`, false);
    else s += btn('upgrade', b.id, label, costStr(nc), prep && canPay(nc));
    if (b.type === 'wall') s += btn('upgradeWalls', b.id, `⬆ 所有${bName(b)}一起升级`, '', prep && b.lvl + 1 <= castleLvl());
  }
  const rc = repairCost(b);
  if (rc) s += btn('repair', b.id, '🔧 修理', costStr(rc), prep && canPay(rc));
  if (RALLY_BLD.includes(b.type)) s += `<p class="tip">🚩 选中时左键点地面设置<b>集结点</b>：新兵和没有命令的士兵会去那里驻守。</p>`;
  if (b.type === 'altar') s += altarRoster(b);
  if (b.type === 'shrine') s += shrinePanel(b);
  if (b.type === 'barracks') {
    s += `<h4>招募士兵 <small>队列 ${b.queue.length}/${QUEUE_MAX} · 没有人口上限</small></h4><div class="units">`;
    for (const t of RECRUITABLE) {
      const u = UNITS[t];
      const tip = `${u.name}（${u.role}）：${u.desc}｜生命 ${u.hp} 物攻 ${u.patk || 0} 魔攻 ${u.matk || 0} 物防 ${u.pdef || 0} 魔防 ${u.mdef || 0} 射程 ${u.range}${u.acc ? ` 精度 ${pct(u.acc)}` : ''} 每波口粮 ${u.pop * FOOD_UPKEEP.pop}${u.onhit ? ' ' + onText(u.onhit) : ''}`;
      if (!isUnlocked('unit', t)) { s += `<div class="ub locked" title="${tip}">${u.icon}<b>${u.name}</b><span>🔒荣耀${unlockOf('unit', t).need}</span></div>`; continue; }
      if (u.barracks > b.lvl) { s += `<div class="ub locked" title="${tip}">${u.icon}<b>${u.name}</b><span>${u.barracks}级兵营</span></div>`; continue; }
      const c = unitCost(t), ok = G.res.gold >= c && b.queue.length < QUEUE_MAX;
      s += `<div class="ub ${ok ? '' : 'cant'}" data-act="recruit" data-i="${b.id}:${t}" title="${tip}">${u.icon}<b>${u.name}</b><span>🪙${c}</span></div>`;
    }
    s += `</div>`;
    if (b.queue.length) s += `<p class="tip">训练队列：${b.queue.map(q => UNITS[q].icon).join(' ')}</p>`;
    const fl = Object.keys(G.fallen).filter(k => G.fallen[k] > 0);
    if (fl.length) {
      const tot = fl.reduce((a, k) => a + G.fallen[k] * unitCost(k), 0);
      s += btn('refill', b.id, `♻ 补充阵亡士兵 <small>${fl.map(k => `${UNITS[k].icon}×${G.fallen[k]}`).join(' ')}（按原价重新招募）</small>`, `🪙${tot}`, G.res.gold >= unitCost(fl[0]));
    }
    s += `<p class="tip">没有人口上限，但每个士兵每波开战要吃 ${FOOD_UPKEEP.pop} 粮食（骑兵等大型单位翻倍）。也可以在下方【兵种】页直接招募。</p>`;
  }
  if (b.type === 'smithy') {
    const cap = b.lvl * SMITHY_MAX_PER_LVL;
    s += `<h4>装备升级 <small>上限 ${cap} 级</small></h4>`;
    for (const k of SMITHY) {
      const lvl = G.smithy[k.id], c = smithyCost(k, lvl + 1);
      s += lvl >= cap ? btn('none', 0, `${k.icon} ${k.name} Lv${lvl}`, lvl >= SMITHY_MAX_PER_LVL * 3 ? '满级' : '需升级铁匠铺', false)
        : btn('smith', k.id, `${k.icon} ${k.name} Lv${lvl}→${lvl + 1} <small>${k.desc}</small>`, costStr(c), canPay(c));
    }
  }
  if (b.type === 'training') {
    const ready = {};
    for (const u of G.units) if (canEvolve(u)) (ready[u.type] = ready[u.type] || []).push(u);
    s += `<h4>⭐ 兵种进化 <small>满 ${LVL_MAX.unit} 级的士兵可以二选一进化，等级上限提高到 ${EVO_LVL_MAX}</small></h4>`;
    if (!Object.keys(ready).length) s += `<p class="tip">现在没有满级士兵。士兵靠击杀升级，满级后会提示“可以进化”。</p>`;
    for (const t in ready) {
      const c = EVO_COST(t);
      s += `<p class="tip"><b>${UNITS[t].icon} ${UNITS[t].name} ×${ready[t].length}</b> 可进化（每次进化 1 个）</p>`;
      for (const br of EVOLUTIONS[t]) s += btn('evolveType', `${t}:${br.id}`, `${br.icon} ${br.name} <small>${br.desc}</small>`, costStr(c), canPay(c));
    }
    const cap = Math.min(TRAIN_MAX, b.lvl + 2);
    s += `<h4>兵种训练 <small>上限 ${cap} 级 · 对该兵种所有士兵生效</small></h4>`;
    for (const t of RECRUITABLE) {
      if (!isUnlocked('unit', t)) continue;
      const u = UNITS[t], lvl = G.train[t], c = trainCost(t);
      s += lvl >= cap ? btn('none', 0, `${u.icon} ${u.name} Lv${lvl}`, lvl >= TRAIN_MAX ? '满级' : '需升级训练场', false)
        : btn('train', t, `${u.icon} ${u.name} 训练 ${lvl}→${lvl + 1} <small>该兵种生命和攻击 +15%（叠加在经验等级上）</small>`, `🪙${c}`, G.res.gold >= c);
    }
  }
  if (b.type === 'castle') s += `<p class="tip">主城自带箭楼，并持续产出材料（${G.map.name}：${Object.keys(G.map.castleProd).map(k => RES_ICON[k]).join('')}），被摧毁即失败。升级主城解锁 2/3 级建筑、法师塔和高级兵种。</p>`;
  else if (prep) s += btn('demolish', b.id, '🗑 拆除 <small>返还 50% 材料</small>', '', true, 'danger');
  return s;
}
const ACTIONS = {
  evolve(v) { const [id, br] = v.split(':'); const u = G.units.find(o => o.id === +id); if (u) evolveUnit(u, br); },
  evolveType(v) { const [t, br] = v.split(':'); const u = G.units.filter(o => o.type === t && canEvolve(o)).sort((a, b) => b.hp - a.hp)[0]; if (u) evolveUnit(u, br); },
  pickMap(id) { SETTINGS.map = id; saveSettings(); showNewGame(); },
  pickDiff(id) { SETTINGS.diff = id; saveSettings(); showNewGame(); },
  startGame() { newGame(SETTINGS.map, SETTINGS.diff); },
  menuNew() { showModes(); },
  pickMode(m) { SETTINGS.mode = m; const ok = MAPS.filter(x => !!x.conquest === (m === 'conquest')); if (!ok.some(x => x.id === SETTINGS.map)) SETTINGS.map = ok[0].id; saveSettings(); showNewGame(); },
  menuContinue() { loadGame(lsGet('save-auto')); },
  menuLoad() { showSaves('load'); },
  menuSettings() { showSettings(); },
  menuHelp() { showHelp(); },
  back() { if (G && G.paused) showPauseMenu(); else showMenu(); },
  loadSlot(k) {
    const d = lsGet('save-' + k); if (!d) return;
    if (G && G.paused && !confirm('读取存档会丢失当前进度，确定吗？')) return;
    loadGame(d);
  },
  saveSlot(k) {
    if (!G || !G.paused) return;
    if (lsGet('save-' + k) && !confirm(`覆盖${SLOT_NAME[k]}？`)) return;
    const d = canBuild() ? serialize() : G.snap;
    toast(lsSet('save-' + k, d) ? `已保存到${SLOT_NAME[k]}` : '保存失败（浏览器禁止了本地存储）');
    showSaves('save');
  },
  delSlot(k) { if (!confirm(`删除${SLOT_NAME[k]}？`)) return; lsDel('save-' + k); showSaves(overlay.dataset.mode || 'load'); },
  opt(k) { SETTINGS[k] = !SETTINGS[k]; saveSettings(); showSettings(); },
  optSpeed(v) { SETTINGS.speed = +v; saveSettings(); showSettings(); },
  optVol(v) { SETTINGS.vol = clamp(Math.round((SETTINGS.vol + +v) * 10) / 10, 0, 1); saveSettings(); sfx('coin'); showSettings(); },
  pauseSave() { showSaves('save'); },
  tutSkip() { if (G && G.tut) tutEnd(false); },
  menuGlory() { showGlory(); },
  resetMeta() { if (!confirm('清空所有荣耀和解锁进度？')) return; for (const k in META) delete META[k]; Object.assign(META, { glory: 0, runs: 0, wins: 0, best: {}, bestCombo: 0 }); saveMeta(); showGlory(); },
  retryWave() { if (!G || !G.snap) return; const paid = G.gloryPaid; loadGame(G.snap); G.gloryPaid = paid; },
  build(t) { selectBuild(t); },
  go() { startBattle(); },
  repairAll() { repairAll(); },
  lord() { G.sel = { kind: 'lord' }; G.group = []; G.buildMode = null; },
  speed() { G.speed = G.speed === 1 ? 2 : 1; },
  pause() { togglePause(); },
  resume() { togglePause(); },
  lordMode(m) { const h = G.lord; if (h.mode === m) return; h.mode = MODE_ORDER[(MODE_ORDER.indexOf(m) + 2) % 3]; switchMode(); },
  selUnit(id) { const u = G.units.find(o => o.id === +id); if (u) { G.sel = { kind: 'unit', id: u.id }; G.group = [u.id]; G.cam.x = u.x; G.cam.y = u.y; G.freeCam = true; } },
  summon(type) { summonHero(type); },
  unitFollow(id) { const u = G.units.find(o => o.id === +id); if (u) { u.order = 'follow'; addText(u.x, u.y - 40, '跟随领主', '#9fe07a', 1); } },
  unitRally(id) { const u = G.units.find(o => o.id === +id); if (u) { u.order = u.d.hero ? 'follow' : null; addText(u.x, u.y - 40, '回集结点', '#8fd4ff', 1); } },
  groupFollow() { for (const u of groupUnits()) u.order = 'follow'; toast('选中的单位：跟随领主'); },
  groupRally() { for (const u of groupUnits()) u.order = u.d.hero ? 'follow' : null; toast('选中的单位：回到集结点（英雄跟随领主）'); },
  groupClear() { G.group = []; G.sel = null; },
  tab(i) { setTab(+i); },
  quick(i) { quickPick(+i); },
  revive(id) { reviveHero(id); },
  refill(id) {
    const b = G.bmap.get(+id); if (!b) return; let n = 0;
    for (const t of Object.keys(G.fallen)) {
      while (G.fallen[t] > 0 && b.queue.length < QUEUE_MAX && G.res.gold >= unitCost(t) && UNITS[t].barracks <= b.lvl) { G.res.gold -= unitCost(t); b.queue.push(t); G.fallen[t]--; n++; }
      if (!G.fallen[t]) delete G.fallen[t];
    }
    if (n) { sfx('buy'); toast(`补充了 ${n} 名士兵`); } else { toast('金币不足、队列已满或兵营等级不够'); sfx('err'); }
  },
  upgrade(id) {
    const b = G.bmap.get(+id); if (!b || !canBuild()) return;
    const c = bCost(b.type, b.lvl + 1); if (!canPay(c)) return;
    if (b.type !== 'castle' && b.lvl + 1 > castleLvl()) return;
    pay(c); for (const k in c) b.spent[k] = (b.spent[k] || 0) + c[k];
    b.lvl++; b.hp = bldMaxHp(b); buildFx(b, true);
    G.flowDirty = true;
  },
  upgradeWalls(id) {
    const b0 = G.bmap.get(+id); if (!b0 || !canBuild()) return;
    const from = b0.lvl; let n = 0;
    for (const b of G.buildings) {
      if (b.type !== 'wall' || b.lvl !== from || from >= 3 || from + 1 > castleLvl()) continue;
      const c = bCost('wall', from + 1); if (!canPay(c)) break;
      pay(c); for (const k in c) b.spent[k] = (b.spent[k] || 0) + c[k];
      b.lvl++; b.hp = bldMaxHp(b); n++;
    }
    if (n) { for (const b of G.buildings) if (b.type === 'wall' && b.lvl === from + 1) { b.popT = 0.3; burst(b.x, b.y, '#ffd76a', 3, 120); } sfx('upgrade'); G.shake = Math.max(G.shake, 5); toast(`升级了 ${n} 段城墙`); G.flowDirty = true; } else toast('材料不足');
  },
  repair(id) { const b = G.bmap.get(+id); const c = b && repairCost(b); if (!c || !canPay(c) || !canBuild()) return; pay(c); b.hp = bldMaxHp(b); sfx('build'); },
  demolish(id) {
    const b = G.bmap.get(+id); if (!b || b.type === 'castle' || !canBuild()) return;
    for (const k in b.spent) if (k !== 'gold') G.res[k] += Math.floor(b.spent[k] * 0.5);
    burst(b.x, b.y, '#a08a6a', 16, 160); removeBuilding(b); sfx('build');
  },
  recruit(v) {
    const [id, t] = v.split(':'); const b = G.bmap.get(+id); if (!b) return;
    const u = UNITS[t], c = unitCost(t);
    if (!isUnlocked('unit', t)) return;
    if (G.res.gold < c) { toast('金币不足'); sfx('err'); return; }
    if (b.queue.length >= QUEUE_MAX) { toast('训练队列已满'); return; }
    G.res.gold -= c; b.queue.push(t); sfx('buy');
  },
  smith(id) {
    const k = SMITHY.find(x => x.id === id), lvl = G.smithy[id], c = smithyCost(k, lvl + 1);
    const sm = G.buildings.find(b => b.type === 'smithy');
    if (!sm || lvl >= sm.lvl * SMITHY_MAX_PER_LVL || !canPay(c)) return;
    pay(c); G.smithy[id]++; sfx('level');
    if (id === 'lordArmor') G.lord.hp += 30;
  },
  train(t) {
    const tr = G.buildings.find(b => b.type === 'training'), c = trainCost(t);
    if (!tr || G.train[t] >= Math.min(TRAIN_MAX, tr.lvl + 2) || G.res.gold < c) return;
    G.res.gold -= c; G.train[t]++; for (const u of G.units) if (u.type === t) u.hp = unitStats(u).hp; sfx('level');
  },
  pickBoon(i) {
    applyBoon(G.boonOpts[+i]);
    sfx('level');
    maybeEvent();
  },
  pickEvent(i) {
    const ev = G.evt, o = ev && ev.opts[+i];
    if (!o || (o.cost && !canPay(o.cost))) { sfx('err'); return; }
    if (o.cost) pay(o.cost);
    G.evt = null;
    startPrep();
    const got = [];
    if (o.gain) for (const k in o.gain) { G.res[k] += o.gain[k]; got.push(RES_ICON[k] + o.gain[k]); }
    if (o.fx) got.push(EVENT_FX[o.fx]());
    if (got.length) { G.announce = { text: `${ev.icon} ${ev.name}`, sub: got.join(' · '), t: 3.5 }; sfx('level'); }
  },
  toMenu() { if (G && G.paused && G.phase === 'prep') takeSnapshot(); G = null; $guide.innerHTML = ''; $guide.classList.add('hidden'); lastGuide = ''; $top.innerHTML = ''; $build.innerHTML = ''; $panel.innerHTML = ''; $panel.classList.add('hidden'); lastTop = lastPanel = ''; showMenu(); },
  retry() { newGame(G.map.id, G.diff.id); },
  none() {},
};
function togglePause() {
  if (!G || !isLive()) return;
  G.paused = !G.paused;
  if (G.paused) showPauseMenu();
  else { hideOverlay(); last = performance.now(); }
}
function showPauseMenu() {
  const note = G.phase === 'battle' ? '<div class="hint">战斗中保存的是本波开战前的状态</div>' : '';
  showOverlay(`<div class="panel menu"><h2>⏸ 暂停</h2><div class="hint">${G.map.icon} ${G.map.name} · 第 ${G.wave}/${MAX_WAVE} 波 · 难度：${G.diff.icon} ${G.diff.name}</div>
    <div class="mbtns"><div class="btn" data-act="resume">继续游戏</div>
    <div class="btn ghost" data-act="pauseSave">💾 保存游戏</div>
    <div class="btn ghost" data-act="menuLoad">📂 读取存档</div>
    <div class="btn ghost" data-act="menuSettings">⚙ 设置</div>
    <div class="btn ghost" data-act="menuHelp">📖 操作说明</div>
    <div class="btn ghost" data-act="toMenu">🏠 返回主菜单</div></div>${note}
    <div class="hint">${SETTINGS.autosave ? '已开启自动存档：每波准备和开战时自动保存' : '自动存档已关闭'}</div></div>`, true);
}
const CONTROLS_HTML = `<span class="kbd">WASD</span> 移动领主（自动攻击、走近捡金币）· <span class="kbd">Q</span> 切换剑/弓/魔法 · <span class="kbd">空格</span> 当前武器技能 · <span class="kbd">H</span> 领主面板<br>
  <span class="kbd">左键</span> 选中单位或建筑 · <span class="kbd">左键拖框</span> 框选士兵和英雄（<span class="kbd">Shift</span> 追加）· 选中单位后 <span class="kbd">左键</span> 点地面 按方阵前往驻守 · <span class="kbd">右键</span> 取消选择<br>
  选中兵营/祭坛/主城后 <span class="kbd">左键</span> 点地面 设置集结点 · <span class="kbd">Ctrl+1~9</span> 编队，<span class="kbd">1~9</span> 选中该队（连按两下视角跳过去）· <span class="kbd">F</span> 全体士兵跟随领主/回集结点<br>
  <span class="kbd">Tab</span> 切换快捷栏分页（建筑/城防/兵种/英雄）· <span class="kbd">F1</span>~<span class="kbd">F10</span> 选择当前分页里的项目<br>
  <span class="kbd">方向键</span> / <span class="kbd">中键拖动</span> / <span class="kbd">点小地图</span> 移动视角 · <span class="kbd">滚轮</span> 缩放 · <span class="kbd">C</span> 视角回到领主<br>
  <span class="kbd">Enter</span> 立即开战 · <span class="kbd">R</span> 全部修理 · <span class="kbd">T</span> 倍速 · <span class="kbd">P</span>/<span class="kbd">Esc</span> 暂停菜单 · <span class="kbd">M</span> 静音`;
const backBtn = () => `<div class="btn ghost" data-act="back" data-esc="1">← 返回</div>`;
function showMenu() {
  const auto = saveInfo(lsGet('save-auto'));
  const canCont = auto && !auto.old;
  showOverlay(`<div class="panel menu">
    <h1 class="title">军团之王：要塞</h1>
    <div class="subtitle">领主亲征 · 召唤英雄 · 🏰 守城挡下 ${MAX_WAVE} 波魔物，或 👑 征服整片大陆</div>
    <div class="mbtns">
      ${canCont ? `<div class="btn" data-act="menuContinue">▶ 继续游戏<small>${auto.text} · ${auto.when}</small></div>` : ''}
      <div class="btn ${canCont ? 'ghost' : ''}" data-act="menuNew">⚔ 新游戏</div>
      <div class="btn ghost" data-act="menuLoad">📂 读取存档</div>
      <div class="btn ghost" data-act="menuGlory">🏆 荣耀殿堂<small>荣耀 ${META.glory} · 已解锁 ${UNLOCKS.filter(u => META.glory >= u.need).length}/${UNLOCKS.length}</small></div>
      <div class="btn ghost" data-act="menuSettings">⚙ 设置</div>
      <div class="btn ghost" data-act="menuHelp">📖 玩法与操作</div>
    </div></div>`);
}
function showGlory() {
  const rows = UNLOCKS.map(u => {
    const n = unlockName(u), ok = META.glory >= u.need, k = Math.min(1, META.glory / u.need);
    return `<div class="slot ${ok ? '' : 'dim'}"><div class="ui">${n.icon}</div><div class="si"><b>${n.name}</b> <small style="display:inline">${u.kind === 'hero' ? '英雄' : '兵种'}</small>
      <small>${n.desc}</small><div class="bar"><i style="width:${k * 100}%"></i></div></div>
      <div class="need">${ok ? '✔ 已解锁' : `${META.glory}/${u.need}`}</div></div>`;
  }).join('');
  const best = DIFFICULTIES.map(d => `${d.icon}${d.name} ${META.best[d.id] || 0}波`).join(' · ');
  const bm = META.bestMap || {};
  const bestMap = MAPS.map(m => `${m.icon}${m.name} ${bm[m.id] || 0}波`).join(' · ');
  showOverlay(`<div class="panel menu"><h2>🏆 荣耀殿堂</h2>
    <div class="hint">每局结束（胜利或失败）都会获得荣耀：守住的波数 ×2，击杀首领 +5，通关 +30，再乘难度倍率（简单 ×0.6、普通 ×1、困难 ×1.5、噩梦 ×2）。<br>
    累计荣耀 <b style="color:#ffd76a">${META.glory}</b> · 已玩 ${META.runs} 局 · 通关 ${META.wins} 次 · 最高连杀 ${META.bestCombo || 0}<br>难度纪录：${best}<br>地图纪录：${bestMap}</div>
    <div class="slots">${rows}</div>${backBtn()}<div class="btn sm ghost" data-act="resetMeta">重置进度</div></div>`, !!G);
}
function showModes() {
  const card = (id, icon, name, color, tags, desc) => `<div class="card map-card mode-card" data-act="pickMode" data-i="${id}" style="--c:${color}">
    <div class="icon">${icon}</div><div class="name" style="color:${color}">${name}</div>
    <div class="tags">${tags.map(t => `<span>${t}</span>`).join('')}</div><div class="desc">${desc}</div></div>`;
  showOverlay(`<div class="panel"><h2>选择模式</h2><div class="cards">
    ${card('defense', '🏰', '守城模式', '#8fd4ff', ['20 波', '3 张地图', '肉鸽天赋'], '据守高地，建城筑墙、招兵召唤英雄，挡下 20 波魔物和首领。每波之间选天赋、遇随机事件，还可以出兵摧毁敌方据点。')}
    ${card('conquest', '👑', '征服大陆', '#ffd76a', ['王国征服', '3 个敌国', '大地图'], '从一座小城开始发展。三个敌国各有王城和强大的国王，军队等级比你高，也会发育、按你的实力派兵进攻。大陆上还有野怪巢穴和宝物。消灭所有敌国即称霸大陆。')}
  </div>${backBtn()}</div>`);
}
function showNewGame() {
  const conqMode = SETTINGS.mode === 'conquest';
  const maps = MAPS.filter(m => !!m.conquest === conqMode).map((m, i) => `<div class="card map-card ${SETTINGS.map === m.id ? 'on' : ''}" data-act="pickMap" data-i="${m.id}" data-key="${i + 1}" style="--c:${m.color}">
      <div class="key">${i + 1}</div><div class="icon">${m.icon}</div><div class="name" style="color:${m.color}">${m.name}</div>
      <div class="tags">${m.tags.map(t => `<span>${t}</span>`).join('')}</div>
      <div class="desc">${m.desc}</div>
      <div class="stats">开局：🪙×${m.res.gold} 🪵×${m.res.wood} 🪨×${m.res.stone}<br>主城产出：${Object.keys(m.castleProd).map(k => `${RES_ICON[k]}${m.castleProd[k][0]}/s`).join(' ')}</div>
      ${(META.bestMap || {})[m.id] ? `<div class="best">最佳：${META.bestMap[m.id]} 波</div>` : ''}</div>`).join('');
  const diffs = DIFFICULTIES.map(d => `<div class="diff ${SETTINGS.diff === d.id ? 'on' : ''}" data-act="pickDiff" data-i="${d.id}" style="--c:${d.color}">
    <div class="di">${d.icon}</div><b>${d.name}</b><span>${d.desc}</span></div>`).join('');
  showOverlay(`<div class="panel">
    <h2>${conqMode ? '👑 征服大陆' : '🏰 守城模式 · 选择地图'}</h2><div class="cards">${maps}</div>
    <h2>选择难度</h2><div class="diffs">${diffs}</div>
    <div class="hint">🏆 荣耀 ${META.glory} · 英雄在游戏中建造「英雄祭坛」后召唤${SETTINGS.tutorial ? ' · 本局会显示新手引导' : ''}</div>
    <div class="btn" data-act="startGame">⚔ 开始游戏</div><div class="btn ghost" data-act="menuNew">↩ 换模式</div>${backBtn()}</div>`);
}
function showSaves(mode) {
  const rows = SAVE_SLOTS.filter(k => mode === 'load' || k !== 'auto').map(k => {
    const d = lsGet('save-' + k), inf = saveInfo(d);
    const act = mode === 'save' ? `<div class="btn sm" data-act="saveSlot" data-i="${k}">${d ? '覆盖' : '保存'}</div>`
      : d && !inf.old ? `<div class="btn sm" data-act="loadSlot" data-i="${k}">读取</div>` : '';
    return `<div class="slot"><div class="sn">${SLOT_NAME[k]}</div><div class="si">${inf ? `${inf.text}<small>${inf.when}</small>` : '<span class="empty">空</span>'}</div>
      ${act}${d ? `<div class="btn sm ghost" data-act="delSlot" data-i="${k}">删除</div>` : ''}</div>`;
  }).join('');
  showOverlay(`<div class="panel menu"><h2>${mode === 'save' ? '💾 保存游戏' : '📂 读取存档'}</h2>
    <div class="hint">存档保存在本浏览器里。读档会回到存档时的准备阶段。</div>
    <div class="slots">${rows}</div>${backBtn()}</div>`, !!G);
  overlay.dataset.mode = mode;
}
function showSettings() {
  const tog = (k, label, desc) => `<div class="opt" data-act="opt" data-i="${k}"><div><b>${label}</b><small>${desc}</small></div><span class="sw ${SETTINGS[k] ? 'on' : ''}">${SETTINGS[k] ? '开' : '关'}</span></div>`;
  showOverlay(`<div class="panel menu"><h2>⚙ 设置</h2><div class="opts">
    ${tog('sfx', '音效', '快捷键 M 也可切换')}
    <div class="opt"><div><b>音量</b><small>${Math.round(SETTINGS.vol * 100)}%</small></div>
      <span><span class="btn sm ghost" data-act="optVol" data-i="-0.1">－</span><span class="btn sm ghost" data-act="optVol" data-i="0.1">＋</span></span></div>
    ${tog('shake', '屏幕震动', '爆炸、首领出场时的镜头抖动')}
    ${tog('dmgNums', '伤害数字', '白色为物理伤害，紫色为魔法伤害，金色为暴击')}
    ${tog('autosave', '自动存档', '每波准备开始和开战时自动保存')}
    ${tog('tutorial', '新手引导', '下次开新游戏时在第一波显示分步引导')}
    <div class="opt"><div><b>默认游戏速度</b><small>新开或读档时的倍速，游戏中按 T 切换</small></div>
      <span>${[1, 2].map(v => `<span class="btn sm ${SETTINGS.speed === v ? '' : 'ghost'}" data-act="optSpeed" data-i="${v}">${v}x</span>`).join('')}</span></div>
  </div>${backBtn()}</div>`, !!G);
}
function showHelp() {
  showOverlay(`<div class="panel menu"><h2>📖 玩法与操作</h2>
    <div class="controls" style="text-align:left;max-width:780px;margin:12px auto">
    <b>领主</b>：你本人，可在剑术（近战扇形斩、吸血）、弓术（远程穿透）、魔法（范围魔法伤害）之间随时切换，每种都有专属技能。阵亡 10 秒后在主城复活。<br>
    <b>英雄</b>：建造英雄祭坛后花金币召唤，每种只能有一位。英雄会自动放技能、躲弹道和首领技能、残血后撤。阵亡后在<b>复活祭坛</b>复活，保留等级和技能，价格是（原价 + 能力估值）× 130%。<br>
    <b>经验</b>：击杀敌人获得经验，领主、英雄、士兵都会自动升级。士兵升级只加基础属性；英雄在 3、6、10 级还会学会新技能。<br>
    <b>士兵</b>：没有人口上限，阵亡后要按原价重新招募（兵营里可以一键补充）。左键拖框选兵，再左键点地面让他们排成方阵去指定位置驻守；Ctrl+数字 编队。选中兵营后左键点地面设集结点。<br>
    <b>粮食</b>：农田和主城产出粮食。每波开战时士兵和英雄要吃饭，不够就会<b>士气低迷</b>（攻击 -20%）甚至<b>饥饿</b>（攻击 -40%、持续掉血）。<br>
    <b>特殊攻击</b>：🔥灼烧（魔法持续伤害）、🧪中毒（无视防御，回血减半）、🩸流血（物理持续伤害）、❄️冰冻（减速）、💫眩晕（无法行动）。敌我双方都有。<br>
    <b>属性</b>：攻击分物理和魔法，防御也分物理和魔法。减伤 = 防御 ÷ (100 + 防御)。骷髅、怨灵物防高要用魔法打；暗影术士魔防高要用物理打。<br>
    <b>精度</b>：远程攻击会预判目标移动，精度越高越准；从高处往低处射，射程 +15%、精度 +10%、伤害 +10%，从低处往高处射精度 -25%。<br>
    <b>地形</b>：高地和低地之间只能走坡道，坡道就是隘口。防御塔建在高地上射程 +15%。<br>
    <b>兵种进化</b>：士兵满 10 级后选中它或打开训练场，花金币二选一进化（例如剑士→圣盾卫士 / 狂刃剑圣），进化后等级上限 15。<br><br>
    <b>敌方据点</b>：地图上有 3 座敌方据点（⛺哥布林营地、🏕️兽人战帐、🪦亡灵墓穴），周围有守卫，营地会朝靠近的单位射击。据点活着时每波都会从附近刷怪口派出额外增援，生命也会逐波变强。选中军队，左键点据点就会出击；摧毁后获得大量资源，那个方向以后不再有增援。据点附近不能建造。<br><br>
    <b>👑 征服大陆模式</b>：160×160 的大地图，你从一座主城开始发育，另外三个敌国（哥布林、兽人、亡灵）各有一座大城市，也会采矿伐木、扩建、练兵。每个敌国开局有一段和平期，之后会按你的军力和他们自己的军力调整策略：你很强时他们龟缩防守，势均力敌时伺机进攻，你很弱时会频繁骚扰。左上角「敌国情报」显示每国的姿态和军力。每 90 秒你的军队要消耗一次粮食。每个敌国有一位<b>国王</b>（首领级，会放技能、召唤援军），国王活着时王城只受 30% 伤害，要先打倒国王。敌国士兵的等级比你高（开局 3/4/5 级），还会随科技继续升级。大陆上有<b>野怪巢穴</b>（清光守卫得资源，高级巢穴还送天赋）和<b>宝物</b>（📦宝箱、🗿神龛、⛲生命之泉，领主走过去就能拾取）。选中军队后<b>左键点敌人或敌方建筑</b>就会集火攻击它。摧毁一国的王城就消灭这个国家，消灭全部三国即称霸大陆。敌国城市附近不能建造。<br><br>
    <b>建筑联动</b>：相邻（最多隔 1 格）的建筑互相加成：${SYNERGY.map(r => `${BUILDINGS[r.a].name}+${BUILDINGS[r.b].name}（${r.text.split('：')[1]}）`).join('、')}。建造时绿线是这座建筑得到的加成，蓝线是它给旁边建筑的加成。<br><br>
    <b>随机事件</b>：从第 2 波起，每波选完天赋后有一半几率遇到事件（商队、佣兵、诅咒祭坛、古代遗迹等），有的要花资源，有的有风险。<br><br>
    <b>精英词条</b>：精英怪带 1~3 个词条，第 10 波起首领也会带，后期普通怪偶尔带 1 个：${Object.values(AFFIXES).map(a => `${a.icon}${a.name}（${a.desc}）`).join('、')}。每个词条额外 +40% 金币和经验。<br><br>
    <b>其他</b>：吸血按造成伤害回血，回血每秒恢复生命。敌人先打领主、英雄和士兵，其次城墙和防御塔，最后才是其他建筑。金币要领主亲自去捡，没捡的只按 10% 转成材料。<br><br>${CONTROLS_HTML}</div>${backBtn()}</div>`, !!G);
}
function applyBoon(bn) {
  if (bn.apply) bn.apply(G.s);
  if (bn.rehp) for (const b of G.buildings) b.hp = bldMaxHp(b);
  if (bn.grant) { const c = castle(); for (let k = 0; k < bn.grant[1]; k++) addUnit(bn.grant[0], (c ? c.x : 1600) + rand(-60, 60), (c ? c.y + c.w / 2 + 40 : 1700) + rand(-20, 20)); }
  if (bn.res) for (const k in bn.res) G.res[k] += bn.res[k];
}
// ---------- 随机事件：选完天赋后有几率触发，选项在 data.js 的 EVENTS ----------
const EVENT_FX = {
  boon() { const bn = pick(BOONS); applyBoon(bn); return `获得天赋 ${bn.icon}${bn.name}`; },
  mercs() {
    const pool = Object.keys(UNITS).filter(t => !UNITS[t].special && !UNITS[t].fly && isUnlocked('unit', t) && UNITS[t].cost <= 70), c = castle(), got = [];
    for (let i = 0; i < 3; i++) { const t = pick(pool); addUnit(t, c.x + rand(-80, 80), c.y + c.w / 2 + 50 + rand(-20, 20), 3); got.push(UNITS[t].icon + UNITS[t].name); }
    return '佣兵加入：' + got.join('、');
  },
  curse() { G.curse = { wave: G.wave }; return '本波敌人生命 +30%，金币掉落 ×2'; },
  xpAll() { let n = 0; for (const u of G.units) if (!u.d.hero && u.temp === undefined) { addXp(u, XP_NEED(u.lvl) * 1.5); n++; } return n ? `${n} 名士兵获得经验` : '可惜现在没有士兵'; },
  refugee() { G.s.goldProd += 0.08; G.s.matProd += 0.08; G.s.foodProd += 0.08; return '产量永久 +8%'; },
  ruins() {
    if (Math.random() < 0.6) { G.res.gold += 250; G.res.wood += 120; G.res.stone += 120; return '找到宝藏：🪙250 🪵120 🪨120'; }
    const r = G.routes[0], pt = r ? r.pts[Math.floor(r.pts.length * 0.6)] : [castle().x, castle().y + 300];
    spawnEnemy(G.wave >= 8 ? 'ogre' : 'orc', pt[0], pt[1], true);
    return '⚠ 遗迹守卫醒了，正冲向主城！';
  },
  repair() { for (const b of G.buildings) b.hp = bldMaxHp(b); return '所有建筑恢复满生命'; },
  spy() {
    const c = pick(aliveCamps()); if (!c) return '敌营已经不在了';
    if (c.ent) c.ent.hp *= 0.5;
    const gs = G.enemies.filter(e => e.home && e.home.camp === c);
    gs.slice(0, Math.ceil(gs.length / 2)).forEach(e => { e.dead = true; burst(e.x, e.y, '#8a2a2a', 8, 120); });
    return `${CAMPS[c.kind].name}内乱：生命 -50%，守卫减半`;
  },
};
function maybeEvent() {
  const pool = EVENTS.filter(ev => ev.need !== 'camp' || aliveCamps().length);
  if (G.wave + 1 < EVENT_FROM || G.tut || Math.random() >= EVENT_CHANCE) { startPrep(); return; }
  showEvent(pick(pool));
}
function showEvent(ev) {
  G.evt = ev;
  const cards = ev.opts.map((o, i) => {
    const ok = !o.cost || canPay(o.cost);
    const lines = [o.cost ? `花费 ${costStr(o.cost)}` : '', o.gain ? `获得 ${costStr(o.gain)}` : '', o.desc || '', !o.cost && !o.gain && !o.fx ? '什么也不做' : ''].filter(Boolean);
    return `<div class="card evt ${ok ? '' : 'locked'}" data-act="pickEvent" data-i="${i}" data-key="${i + 1}"><div class="key">${i + 1}</div><div class="name">${o.label}</div><div class="desc">${lines.join('<br>')}${ok ? '' : '<br><b style="color:#ff7a6a">资源不足</b>'}</div></div>`;
  }).join('');
  showOverlay(`<div class="panel"><h2>${ev.icon} ${ev.name}</h2><div class="hint">${ev.text}</div><div class="cards">${cards}</div></div>`);
}
function showBoons() {
  G.phase = 'reward'; G.buildMode = null; sfx('victory');
  if (G.tut) tutCheck();
  $guide.classList.add('hidden'); lastGuide = '';
  $panel.classList.add('hidden');
  G.boonOpts = shuffle(BOONS.slice()).slice(0, 3);
  const info = G.lastWaveInfo;
  const cards = G.boonOpts.map((b, i) => `<div class="card" data-act="pickBoon" data-i="${i}" data-key="${i + 1}">
    <div class="key">${i + 1}</div><div class="icon">${b.icon}</div><div class="name">${b.name}</div><div class="desc">${b.desc}</div></div>`).join('');
  showOverlay(`<div class="panel"><h2>第 ${G.wave} 波 守住了！</h2>
    <div class="hint">${info.total ? `遗落 ${info.total} 枚金币，转化为 🪵${info.mat} 🪨${info.mat}` : '金币全部捡到了！'} · 选择一项天赋</div>
    <div class="cards">${cards}</div></div>`);
}
function showEnd(win) {
  G.phase = 'over'; G.buildMode = null; G.tut = null;
  $guide.classList.add('hidden'); lastGuide = '';
  sfx(win ? 'victory' : 'defeat');
  const aw = awardGlory(win);
  $panel.classList.add('hidden');
  const heroes = G.units.filter(u => u.d.hero).map(u => `${u.d.icon}${u.d.name} Lv${u.lvl}`).join('、') || '无';
  const fallen = Object.keys(G.heroDead).map(k => HEROES[k].icon).join(' ') || '无';
  const army = G.units.filter(u => !u.d.hero).map(u => u.d.icon).join(' ');
  showOverlay(`<div class="panel">
    <h1 class="title" style="color:${win ? '#ffd76a' : '#ff5a4a'}">${win ? (G.conq ? '称霸大陆' : '王国永存') : '主城陷落'}</h1>
    <div class="subtitle">${G.conq ? (win ? '三个敌国尽数覆灭，你统一了整片大陆！' : '主城被攻破，王国覆灭……') : win ? '你守住了要塞，远古黑龙倒在城墙之下！' : `主城在第 ${G.wave} 波被攻破……`}</div>
    <div class="big-stats">
      <span>地图</span><b>${G.map.icon} ${G.map.name}</b>
      <span>难度</span><b>${G.diff.icon} ${G.diff.name}</b>
      <span>领主</span><b>${LORD.icon} Lv${G.lord.lvl}</b>
      ${G.conq ? `<span>用时</span><b>${Math.floor(G.time / 60)} 分钟</b><span>消灭敌国</span><b>${G.facs.filter(f => !f.alive).length} / ${G.facs.length}</b>` : `<span>守住波次</span><b>${win ? G.wave : G.wave - 1} / ${MAX_WAVE}</b>`}
      <span>击杀</span><b>${G.kills}</b>
      <span>召唤英雄</span><b>${G.heroesSummoned} 次</b>
      <span>存活英雄</span><b>${heroes}</b>
      <span>阵亡英雄</span><b>${fallen}</b>
      <span>累计金币</span><b>${fmt(G.totalGold)}</b>
      <span>最高连杀</span><b>${G.bestCombo}</b>
    </div>
    <div class="glory-gain">🏆 获得荣耀 <b>+${aw ? aw.gain : 0}</b>（累计 ${META.glory}）
      ${aw && aw.fresh.length ? aw.fresh.map(u => { const n = unlockName(u); return `<div class="unlock">🔓 解锁${u.kind === 'hero' ? '新英雄' : '新兵种'}：${n.icon} ${n.name}</div>`; }).join('') : ''}
      ${aw && aw.next ? `<div class="gt">下一个解锁：${unlockName(aw.next).icon} ${unlockName(aw.next).name}（还差 ${aw.next.need - META.glory} 荣耀）</div>` : ''}</div>
    <div style="font-size:26px;margin-bottom:18px;max-width:700px;margin-inline:auto">${army}</div>
    ${!win && G.snap ? `<div class="btn" data-act="retryWave">↺ 从第 ${G.snap.wave} 波重来</div>` : ''}<div class="btn ${win ? '' : 'ghost'}" data-act="retry">再来一局</div><div class="btn ghost" data-act="toMenu">主菜单</div></div>`);
  lsDel('save-auto');
}

// 调试接口（浏览器控制台）
window.__dbg = { get G() { return G; }, orderAttack, enemyAt, facLvl, spawnKing, updateRelics, aiTick, launchAttack, playerPower, liveFacs, facTech, trainEUnit, autoBuild, initCamps, refreshCamps, aliveCamps, computeSynergy, synOf, showEvent, maybeEvent, EVENT_FX, ART, spawnEnemy, hitEnemy, killEnemy, setupWave, evolveUnit, canEvolve, addXp, rollAffixes, newGame, startBattle, placeBuilding, addUnit, summonHero, computeFlow, canPlace, bCost, ACTIONS, updateUI, nextTile, dist, MAPS, lordStats, unitStats, killUnit, useSkill, switchMode, loadGame, serialize };

loadArt();
showMenu();
requestAnimationFrame(frame);
