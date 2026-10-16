'use strict';
// Small local games for /games/: 2048, minesweeper and snake. No network requests; best scores stay in localStorage.
(() => {
  const STORE = 'kagiel:games:v1';
  let store = {};
  try { store = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { store = {}; }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(store)); } catch { /* Scores stay for this visit only. */ } };
  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
  let current = null, root = null;

  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    node.append(...children);
    return node;
  }
  // Swipes on a board become directions; the board uses touch-action: none so the page does not scroll.
  function swipe(target, onDirection) {
    let start = null;
    target.addEventListener('pointerdown', event => { if (event.pointerType !== 'mouse') start = { x: event.clientX, y: event.clientY }; });
    target.addEventListener('pointerup', event => {
      if (!start) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      start = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      onDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });
    target.addEventListener('pointercancel', () => { start = null; });
  }
  function stats(items) {
    const box = h('div', { class: 'game-stats' });
    const values = {};
    for (const [key, label] of items) {
      values[key] = h('strong', { text: '0' });
      box.append(h('div', {}, h('span', { text: label }), values[key]));
    }
    return { box, set(key, value) { values[key].textContent = value; } };
  }

  // ---- 2048
  function game2048(panel) {
    const size = 4;
    let cells, score, won, over;
    const info = stats([['score', '分数'], ['best', '最高']]);
    const message = h('p', { class: 'game-message', role: 'status' });
    const board = h('div', { class: 'game-board game-2048', 'aria-label': '2048 棋盘，可用方向键或滑动操作' });
    const restart = h('button', { type: 'button', class: 'game-button', text: '重新开始', onclick: () => reset() });
    panel.append(h('div', { class: 'game-toolbar' }, info.box, restart), board, message,
      h('p', { class: 'game-help', text: '方向键 / WASD 或在棋盘上滑动，相同数字相撞会合并。' }));
    swipe(board, move);

    function add() {
      const empty = cells.map((value, index) => value ? -1 : index).filter(index => index >= 0);
      if (!empty.length) return -1;
      const index = empty[(Math.random() * empty.length) | 0];
      cells[index] = Math.random() < .9 ? 2 : 4;
      return index;
    }
    function reset() {
      cells = Array(size * size).fill(0); score = 0; won = false; over = false;
      const fresh = [add(), add()];
      message.textContent = '';
      render(fresh, []);
    }
    function line(direction, n) {
      const indexes = [];
      for (let i = 0; i < size; i++) {
        if (direction === 'left') indexes.push(n * size + i);
        if (direction === 'right') indexes.push(n * size + size - 1 - i);
        if (direction === 'up') indexes.push(i * size + n);
        if (direction === 'down') indexes.push((size - 1 - i) * size + n);
      }
      return indexes;
    }
    function move(direction) {
      if (over) return;
      let moved = false;
      const merged = [];
      for (let n = 0; n < size; n++) {
        const indexes = line(direction, n);
        const values = indexes.map(index => cells[index]).filter(Boolean);
        const result = [];
        for (let i = 0; i < values.length; i++) {
          if (values[i] === values[i + 1]) {
            result.push(values[i] * 2); score += values[i] * 2; merged.push(indexes[result.length - 1]); i++;
          } else result.push(values[i]);
        }
        indexes.forEach((index, i) => {
          const value = result[i] || 0;
          if (cells[index] !== value) moved = true;
          cells[index] = value;
        });
      }
      if (!moved) return;
      const fresh = add();
      if (score > (store.best2048 || 0)) { store.best2048 = score; save(); }
      if (!won && cells.includes(2048)) { won = true; message.textContent = '合成了 2048！可以继续玩下去。'; }
      if (!canMove()) { over = true; message.textContent = '没有可以移动的格子了，点「重新开始」再来一局。'; }
      render([fresh], merged);
    }
    function canMove() {
      if (cells.includes(0)) return true;
      for (let i = 0; i < cells.length; i++) {
        if (i % size < size - 1 && cells[i] === cells[i + 1]) return true;
        if (i < cells.length - size && cells[i] === cells[i + size]) return true;
      }
      return false;
    }
    function render(fresh, merged) {
      board.replaceChildren(...cells.map((value, index) => {
        const level = value ? Math.log2(value) : 0;
        const tile = h('div', { class: 'tile' + (value ? ' has-value' : '') + (fresh.includes(index) ? ' is-new' : '') + (merged.includes(index) ? ' is-merged' : ''), text: value || '' });
        if (value) {
          tile.style.setProperty('--tile-mix', Math.min(100, 8 + level * 8) + '%');
          if (level >= 6) tile.classList.add('is-strong');
          if (value >= 1024) tile.classList.add('is-small');
        }
        return tile;
      }));
      info.set('score', score); info.set('best', store.best2048 || 0);
    }
    reset();
    return { key(direction) { if (direction) { move(direction); return true; } return false; } };
  }

  // ---- Minesweeper
  function mines(panel) {
    const width = 9, height = 9, count = 10;
    let mine, open, flag, started, ended, flagMode = false, timer = 0, seconds = 0, suppress = false;
    const info = stats([['left', '剩余雷'], ['time', '用时'], ['best', '最快']]);
    const message = h('p', { class: 'game-message', role: 'status' });
    const board = h('div', { class: 'game-board game-mines', 'aria-label': '扫雷棋盘' });
    const mode = h('button', { type: 'button', class: 'game-button is-quiet', 'aria-pressed': 'false', onclick: () => { flagMode = !flagMode; syncMode(); } });
    const restart = h('button', { type: 'button', class: 'game-button', text: '重新开始', onclick: () => reset() });
    panel.append(h('div', { class: 'game-toolbar' }, info.box, h('div', { class: 'game-actions' }, mode, restart)), board, message,
      h('p', { class: 'game-help', text: '点击翻开格子。右键、长按或切换到「插旗」来标记雷，第一下不会踩雷。' }));
    board.addEventListener('contextmenu', event => event.preventDefault());

    const around = index => {
      const x = index % width, y = (index / width) | 0, list = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < width && ny < height) list.push(ny * width + nx);
      }
      return list;
    };
    function syncMode() { mode.textContent = flagMode ? '模式：插旗' : '模式：翻开'; mode.setAttribute('aria-pressed', String(flagMode)); }
    function stopTimer() { clearInterval(timer); timer = 0; }
    function reset() {
      stopTimer();
      mine = Array(width * height).fill(false); open = Array(width * height).fill(false); flag = Array(width * height).fill(false);
      started = false; ended = false; seconds = 0; message.textContent = '';
      syncMode(); build(); render();
    }
    function plant(safe) {
      const blocked = new Set([safe, ...around(safe)]);
      let placed = 0;
      while (placed < count) {
        const index = (Math.random() * mine.length) | 0;
        if (!mine[index] && !blocked.has(index)) { mine[index] = true; placed++; }
      }
      started = true;
      timer = setInterval(() => { seconds++; info.set('time', seconds + ' 秒'); }, 1000);
    }
    function reveal(index) {
      if (ended || flag[index] || open[index]) return;
      if (!started) plant(index);
      if (mine[index]) { open[index] = true; finish(false, index); return; }
      const stack = [index];
      while (stack.length) {
        const item = stack.pop();
        if (open[item] || flag[item]) continue;
        open[item] = true;
        if (!around(item).some(n => mine[n])) stack.push(...around(item).filter(n => !open[n]));
      }
      if (open.filter(Boolean).length === mine.length - count) finish(true);
      render();
    }
    function toggleFlag(index) {
      if (ended || open[index]) return;
      flag[index] = !flag[index];
      render();
    }
    function finish(win, hit) {
      ended = true; stopTimer();
      if (win) {
        if (!store.bestMines || seconds < store.bestMines) { store.bestMines = seconds; save(); }
        message.textContent = `扫雷成功，用时 ${seconds} 秒。`;
      } else message.textContent = '踩到雷了，再来一局吧。';
      board.dataset.hit = hit ?? '';
      render();
    }
    function build() {
      board.replaceChildren(...mine.map((_, index) => {
        const cell = h('button', { type: 'button', class: 'cell' });
        let press = 0;
        cell.addEventListener('pointerdown', event => {
          if (event.pointerType === 'mouse') return;
          press = setTimeout(() => { press = 0; suppress = true; toggleFlag(index); navigator.vibrate?.(15); }, 420);
        });
        const cancel = () => { clearTimeout(press); press = 0; };
        cell.addEventListener('pointerup', cancel); cell.addEventListener('pointerleave', cancel); cell.addEventListener('pointercancel', cancel);
        cell.addEventListener('click', () => {
          if (suppress) { suppress = false; return; }
          if (flagMode) toggleFlag(index); else reveal(index);
        });
        cell.addEventListener('contextmenu', event => { event.preventDefault(); toggleFlag(index); });
        return cell;
      }));
    }
    function render() {
      [...board.children].forEach((cell, index) => {
        const near = around(index).filter(n => mine[n]).length;
        cell.className = 'cell';
        cell.textContent = '';
        if (open[index] || (ended && mine[index])) {
          cell.classList.add('is-open');
          if (mine[index]) { cell.textContent = '✱'; cell.classList.add('is-mine'); if (String(index) === board.dataset.hit) cell.classList.add('is-hit'); }
          else if (near) { cell.textContent = near; cell.dataset.near = near; }
        } else if (flag[index]) { cell.textContent = '⚑'; cell.classList.add('is-flag'); }
        const x = index % width + 1, y = ((index / width) | 0) + 1;
        cell.setAttribute('aria-label', `第 ${y} 行第 ${x} 列，` + (cell.classList.contains('is-open') ? (mine[index] ? '雷' : near ? `周围 ${near} 颗雷` : '空白') : flag[index] ? '已插旗' : '未翻开'));
      });
      info.set('left', count - flag.filter(Boolean).length);
      info.set('time', seconds + ' 秒');
      info.set('best', store.bestMines ? store.bestMines + ' 秒' : '—');
    }
    reset();
    return { key() { return false; }, pause: () => {}, destroy: stopTimer };
  }

  // ---- Snake
  function snake(panel) {
    const grid = 16;
    let body, food, direction, queue, score, timer = 0, state = 'ready';
    const info = stats([['score', '分数'], ['best', '最高']]);
    const message = h('p', { class: 'game-message', role: 'status' });
    const canvas = h('canvas', { class: 'game-board game-snake', width: '320', height: '320', 'aria-label': '贪吃蛇游戏画面' });
    const play = h('button', { type: 'button', class: 'game-button', onclick: () => toggle() });
    const pad = h('div', { class: 'game-pad', 'aria-label': '方向按钮' });
    for (const [dir, label, symbol] of [['up', '向上', '▲'], ['left', '向左', '◀'], ['down', '向下', '▼'], ['right', '向右', '▶']]) {
      pad.append(h('button', { type: 'button', class: 'pad-' + dir, 'aria-label': label, text: symbol, onclick: () => steer(dir) }));
    }
    panel.append(h('div', { class: 'game-toolbar' }, info.box, play), canvas, message, pad,
      h('p', { class: 'game-help', text: '方向键 / WASD、在画面上滑动或点方向按钮控制，空格暂停。' }));
    swipe(canvas, steer);
    canvas.addEventListener('click', () => { if (state !== 'running') toggle(); });

    const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
    const delta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    function reset() {
      body = [[7, 8], [6, 8], [5, 8]]; direction = 'right'; queue = []; score = 0;
      placeFood(); info.set('score', 0); info.set('best', store.bestSnake || 0);
    }
    function placeFood() {
      do food = [(Math.random() * grid) | 0, (Math.random() * grid) | 0];
      while (body.some(([x, y]) => x === food[0] && y === food[1]));
    }
    function steer(dir) {
      if (state === 'ready' || state === 'over') { if (state === 'over') reset(); start(); }
      const last = queue[queue.length - 1] || direction;
      if (dir !== last && dir !== opposite[last] && queue.length < 3) queue.push(dir);
    }
    function start() { state = 'running'; clearInterval(timer); timer = setInterval(tick, 140); sync(); }
    function pause() { if (state !== 'running') return; state = 'paused'; clearInterval(timer); timer = 0; sync(); draw(); }
    function toggle() {
      if (state === 'running') pause();
      else { if (state === 'over') reset(); start(); }
    }
    function tick() {
      if (queue.length) direction = queue.shift();
      const [dx, dy] = delta[direction];
      const head = [body[0][0] + dx, body[0][1] + dy];
      const eating = head[0] === food[0] && head[1] === food[1];
      const rest = eating ? body : body.slice(0, -1);
      if (head[0] < 0 || head[1] < 0 || head[0] >= grid || head[1] >= grid || rest.some(([x, y]) => x === head[0] && y === head[1])) {
        state = 'over'; clearInterval(timer); timer = 0;
        if (score > (store.bestSnake || 0)) { store.bestSnake = score; save(); info.set('best', score); }
        sync(); draw(); return;
      }
      body = [head, ...rest];
      if (eating) { score++; info.set('score', score); if (body.length < grid * grid) placeFood(); }
      draw();
    }
    function sync() {
      play.textContent = state === 'running' ? '暂停' : state === 'paused' ? '继续' : state === 'over' ? '再来一局' : '开始';
      message.textContent = state === 'ready' ? '点「开始」或按方向键出发。' : state === 'paused' ? '已暂停。' : state === 'over' ? `撞到了，本局得分 ${score}。` : '';
    }
    function draw() {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const size = Math.round(canvas.clientWidth * ratio) || 320;
      if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
      const ctx = canvas.getContext('2d');
      const style = getComputedStyle(canvas);
      const cell = size / grid;
      ctx.fillStyle = style.getPropertyValue('--snow-soft').trim() || '#eef3f8';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = style.getPropertyValue('--snow-border').trim() || '#e2e8ef';
      for (let i = 0; i < grid; i++) for (let j = (i % 2); j < grid; j += 2) ctx.fillRect(i * cell, j * cell, cell, cell);
      const blue = style.getPropertyValue('--snow-blue').trim() || '#4f7cab';
      ctx.fillStyle = style.getPropertyValue('--snow-text').trim() || '#2f3a47';
      ctx.beginPath(); ctx.arc((food[0] + .5) * cell, (food[1] + .5) * cell, cell * .32, 0, Math.PI * 2); ctx.fill();
      body.forEach(([x, y], index) => {
        ctx.globalAlpha = index ? Math.max(.45, 1 - index * .03) : 1;
        ctx.fillStyle = blue;
        const pad = cell * .08;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x * cell + pad, y * cell + pad, cell - pad * 2, cell - pad * 2, cell * .25) : ctx.rect(x * cell + pad, y * cell + pad, cell - pad * 2, cell - pad * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    reset(); sync(); draw();
    return {
      key(dir, event) {
        if (event.key === ' ') { toggle(); return true; }
        if (dir) { steer(dir); return true; }
        return false;
      },
      pause, redraw: draw,
      destroy() { clearInterval(timer); timer = 0; state = 'paused'; }
    };
  }

  const GAMES = [['2048', '2048', game2048], ['mines', '扫雷', mines], ['snake', '贪吃蛇', snake]];
  function mount() {
    const node = document.getElementById('site-games');
    if (!node || node.dataset.ready) return;
    node.dataset.ready = 'true'; root = node;
    const tabs = h('div', { class: 'game-tabs', role: 'tablist', 'aria-label': '选择游戏' });
    const panels = {}, controllers = {};
    for (const [id, label, create] of GAMES) {
      const tab = h('button', { type: 'button', role: 'tab', id: 'game-tab-' + id, 'aria-controls': 'game-panel-' + id, text: label, onclick: () => select(id, true) });
      tabs.append(tab);
      panels[id] = h('section', { class: 'game-panel', role: 'tabpanel', id: 'game-panel-' + id, 'aria-labelledby': 'game-tab-' + id, hidden: '' });
      controllers[id] = { create, tab };
    }
    node.replaceChildren(tabs, ...Object.values(panels));
    function select(id, focus) {
      if (!controllers[id]) id = '2048';
      current?.pause?.();
      for (const [key, item] of Object.entries(controllers)) {
        const on = key === id;
        item.tab.setAttribute('aria-selected', String(on)); item.tab.tabIndex = on ? 0 : -1;
        panels[key].hidden = !on;
      }
      const item = controllers[id];
      item.instance ||= item.create(panels[id]);
      current = item.instance;
      current.redraw?.();
      if (focus) item.tab.focus();
      store.last = id; save();
    }
    tabs.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault(); event.stopPropagation();
      const ids = GAMES.map(([id]) => id);
      const index = ids.indexOf(store.last) + (event.key === 'ArrowRight' ? 1 : -1);
      select(ids[(index + ids.length) % ids.length], true);
    });
    node.cleanup = () => Object.values(controllers).forEach(item => item.instance?.destroy?.());
    select(store.last, false);
  }
  function unmount() {
    root?.cleanup?.();
    current = null; root = null;
  }
  document.addEventListener('keydown', event => {
    if (!current || !root?.isConnected || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest?.('input,textarea,select,[contenteditable],.game-tabs,.mascot-dialog')) return;
    const bounds = root.getBoundingClientRect();
    if (bounds.bottom < 0 || bounds.top > innerHeight) return;
    if (current.key(KEYS[event.key], event)) event.preventDefault();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) current?.pause?.(); });
  window.addEventListener('resize', () => current?.redraw?.(), { passive: true });
  document.addEventListener('pjax:send', unmount);
  document.addEventListener('pjax:complete', mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
