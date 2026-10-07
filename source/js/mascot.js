'use strict';
(() => {
  const root = document.getElementById('site-mascot');
  const toggle = document.querySelector('.mascot-toggle');
  if (!root || !toggle || root.dataset.initialized) return;
  root.dataset.initialized = 'true';
  const avatar = root.querySelector('.mascot-avatar');
  const dialog = root.querySelector('.mascot-dialog');
  const log = root.querySelector('.mascot-chat-log');
  const topics = root.querySelector('.mascot-topics');
  const form = root.querySelector('form');
  const input = root.querySelector('input');
  const canvas = root.querySelector('canvas');
  const image = root.querySelector('img');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const key = 'kagiel:winged-mascot-hidden:v1';
  let hidden = false;
  try { hidden = localStorage.getItem(key) === 'true'; } catch { /* Session-only preference. */ }
  let targetX = 0, targetY = 0, gazeX = 0, gazeY = 0, frame = 0;
  let renderer = null, reactionTimer = 0;
  const conversation = window.KgyDialogue.createConversation();
  const history = [{ role: 'assistant', content: conversation.greeting().text }];
  let ai = null, aiImport = null, busy = false, replyRevision = 0, aiStartRevision = 0, pendingReply = null;
  const aiStart = root.querySelector('[data-mascot-ai]');
  const aiStop = root.querySelector('[data-mascot-ai-stop]');
  const aiMode = root.querySelector('[data-mascot-ai-mode]');
  const aiStatus = root.querySelector('[data-mascot-ai-status]');
  const aiProgress = root.querySelector('[data-mascot-ai-progress]');

  const clamp = value => Math.max(-1, Math.min(1, value));
  function layout() {
    const content = document.getElementById('content-inner');
    const margin = content ? content.getBoundingClientRect().left : (innerWidth - 1180) / 2;
    const mode = margin >= 185 && innerWidth >= 1500 ? 'full' : margin >= 90 && innerWidth >= 1200 ? 'compact' : 'small';
    root.dataset.layout = mode;
    root.style.setProperty('--mascot-rail-size', Math.min(290, Math.max(160, margin - 24)) + 'px');
    syncControl();
    queuePaint();
  }
  function syncControl() {
    toggle.hidden = false;
    const small = root.dataset.layout === 'small';
    const visible = !hidden && (!small || !dialog.hidden);
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.setAttribute('aria-controls', 'site-mascot');
    const label = small ? visible ? '收起看板娘' : '打开看板娘' : hidden ? '显示看板娘' : '隐藏看板娘';
    toggle.querySelector('span').textContent = label;
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  }
  function update() {
    document.body.classList.toggle('mascot-hidden', hidden);
    if (hidden) close(false);
    syncControl();
    if (!hidden) queuePaint();
  }
  function setHidden(value) {
    hidden = value;
    update();
    try { localStorage.setItem(key, String(value)); } catch { /* Keep the in-memory preference. */ }
  }
  function open(focusInput = false) {
    if (hidden) setHidden(false);
    dialog.hidden = false;
    avatar.setAttribute('aria-expanded', 'true');
    syncControl();
    if (focusInput) input.focus();
  }
  function close(restoreFocus = true) {
    if (dialog.hidden) return;
    dialog.hidden = true;
    avatar.setAttribute('aria-expanded', 'false');
    syncControl();
    if (restoreFocus) (root.dataset.layout === 'small' ? toggle : avatar).focus();
  }
  function react() {
    root.classList.remove('is-happy');
    void avatar.offsetWidth;
    root.classList.add('is-happy');
    clearTimeout(reactionTimer);
    reactionTimer = setTimeout(() => root.classList.remove('is-happy'), 750);
  }
  function context() {
    let tracks = [];
    try { tracks = JSON.parse(document.getElementById('site-music-data')?.textContent || '[]'); } catch { /* Player may not be available. */ }
    return {
      title: document.querySelector('#post-info .post-title, #recent-posts .article-title, #page h1')?.textContent.trim(),
      tracks,
      currentTrack: document.querySelector('.aplayer-title')?.textContent.trim()
    };
  }
  function suggestions(values) {
    topics.replaceChildren();
    for (const value of values.slice(0, 4)) {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.mascotTopic = value; button.textContent = value; button.disabled = busy;
      topics.append(button);
    }
  }
  function setBusy(value) {
    busy = value;
    form.querySelector('button').disabled = value;
    topics.querySelectorAll('button').forEach(button => { button.disabled = value; });
    log.setAttribute('aria-busy', String(value));
  }
  function scrollLog() { log.scrollTop = log.scrollHeight; }
  function append(role, content) {
    const bubble = document.createElement('p');
    bubble.className = 'mascot-message'; bubble.dataset.role = role; bubble.textContent = content;
    log.append(bubble); history.push({ role, content });
    while (history.length > 24) { history.shift(); log.firstElementChild.remove(); }
    scrollLog(); return bubble;
  }
  function aiState(phase, detail = {}) {
    root.dataset.aiState = phase;
    const loading = phase === 'loading', ready = phase === 'ready', generating = phase === 'generating';
    const progress = Math.round((detail.progress || 0) * 100);
    aiMode.textContent = loading ? `准备 ${progress}%` : ready ? '已开启' : generating ? '回复中' : '未开启';
    aiStart.disabled = loading || ready || generating;
    aiStart.textContent = phase === 'error' ? '重新尝试' : '开启 AI 聊天';
    aiStop.hidden = !loading && !ready && !generating;
    aiStop.textContent = loading ? '取消下载' : generating ? '停止回复' : '关闭 AI';
    aiProgress.hidden = !loading; aiProgress.value = progress;
    const messages = {
      off: '使用简短对话。已下载的模型会保存在浏览器缓存中。',
      loading: '正在下载和准备模型，首次可能需要几分钟。期间可以继续简短对话。',
      ready: 'AI 已就绪。可连续聊天，回复在你的设备上生成；回答可能不准确。',
      generating: 'KGY 正在回复，可以随时停止。',
      unsupported: '当前浏览器或设备无法开启 AI。可以换用新版 Chrome 或 Edge，或继续简短对话。',
      error: '暂时无法开启 AI。可以检查网络后重试，或继续简短对话。'
    };
    aiStatus.textContent = messages[phase];
  }
  function interruptReply() {
    replyRevision++;
    if (pendingReply) {
      const content = pendingReply.classList.contains('is-pending') ? '已停止回复。' : pendingReply.textContent + '\n（已停止回复）';
      pendingReply.textContent = content; pendingReply.classList.remove('is-pending');
      history[history.length - 1].content = content; pendingReply = null;
    }
    setBusy(false);
  }
  async function send(value) {
    const text = value.trim().slice(0, 320);
    if (!text || busy) return;
    append('user', text); react();
    const page = context();
    if (ai?.phase !== 'ready') {
      const reply = conversation.reply(text, page);
      append('assistant', reply.text); suggestions(reply.suggestions); return;
    }
    const current = ++replyRevision;
    const messages = history.map(item => ({ ...item }));
    const bubble = append('assistant', '正在想……');
    pendingReply = bubble; bubble.classList.add('is-pending'); setBusy(true);
    try {
      const reply = await ai.generate(messages, page, content => {
        if (current !== replyRevision) return;
        bubble.textContent = content; bubble.classList.remove('is-pending'); scrollLog();
      });
      if (current !== replyRevision) return;
      bubble.textContent = reply; history[history.length - 1].content = reply;
      suggestions(['接着聊', '说简单点', '举个例子', '换个话题']);
    } catch {
      if (current !== replyRevision) return;
      const reply = conversation.reply(text, page);
      bubble.textContent = `AI 暂时无法回复，先用简短对话聊：\n${reply.text}`;
      history[history.length - 1].content = bubble.textContent; suggestions(reply.suggestions);
    } finally {
      if (current === replyRevision) { bubble.classList.remove('is-pending'); pendingReply = null; setBusy(false); scrollLog(); }
    }
  }

  toggle.addEventListener('click', () => {
    if (root.dataset.layout === 'small') {
      if (!dialog.hidden && !hidden) close();
      else { setHidden(false); open(true); }
    } else setHidden(!hidden);
  });
  avatar.addEventListener('click', () => { react(); open(); });
  root.querySelector('.mascot-close').addEventListener('click', () => close());
  root.querySelector('[data-mascot-hide]').addEventListener('click', () => { setHidden(true); toggle.focus(); });
  topics.addEventListener('click', event => {
    const button = event.target.closest('[data-mascot-topic]');
    if (!button || button.disabled) return;
    void send(button.dataset.mascotTopic);
    if (event.detail === 0) log.focus();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (busy || !input.value.trim()) return;
    const text = input.value; input.value = ''; void send(text);
  });
  root.querySelector('[data-mascot-reset]').addEventListener('click', () => {
    if (busy) { interruptReply(); ai?.stop(); }
    conversation.reset(); history.length = 0; log.replaceChildren(); input.value = '';
    const reply = conversation.greeting(); append('assistant', reply.text); suggestions(reply.suggestions);
  });
  aiStart.addEventListener('click', async () => {
    if (aiStart.disabled) return;
    const current = ++aiStartRevision;
    aiState('loading');
    try {
      if (!ai) {
        aiImport ||= import('/js/mascot-ai.mjs?v=20261007-1');
        const module = await aiImport;
        // A cancelled import must not start a download after the user closes AI.
        if (current !== aiStartRevision || root.dataset.aiState !== 'loading') return;
        ai = module.createLocalAI({ onState: aiState });
      }
      await ai.start();
    } catch { if (current === aiStartRevision) { aiImport = null; aiState('error'); } }
  });
  aiStop.addEventListener('click', () => { aiStartRevision++; interruptReply(); if (ai) ai.stop(); else aiState('off'); });
  window.addEventListener('pagehide', () => { aiStartRevision++; interruptReply(); ai?.stop(); });
  root.querySelector('[data-mascot-music]').addEventListener('click', event => {
    // The player outside-click listener must not close the panel we just opened.
    event.stopPropagation();
    close(false);
    const dock = document.querySelector('.music-dock');
    if (dock) { dock.open = true; dock.querySelector('summary').focus(); }
  });
  document.querySelector('.music-dock')?.addEventListener('toggle', event => {
    if (!event.target.open) queuePaint();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !dialog.hidden) close();
  });
  document.addEventListener('click', event => {
    if (!dialog.hidden && !event.composedPath().includes(root) && !event.composedPath().includes(toggle)) close(false);
  });

  // Deform only the illustrated iris regions. The original art/alpha stays local.
  function createRenderer() {
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    function shader(type, source) {
      const item = gl.createShader(type);
      gl.shaderSource(item, source); gl.compileShader(item);
      if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error('Companion shader failed');
      return item;
    }
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, 'attribute vec2 position; varying vec2 uv; void main(){uv=(position+1.0)*0.5;gl_Position=vec4(position,0.0,1.0);}'));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `precision mediump float;
      varying vec2 uv; uniform sampler2D art; uniform vec2 gaze;
      float eye(vec2 point,vec2 center){return 1.0-smoothstep(0.60,1.0,length((point-center)/vec2(0.021,0.011)));}
      void main(){vec2 sampleUV=uv;
        float follow=max(eye(uv,vec2(0.468,0.872)),eye(uv,vec2(0.541,0.882)));
        sampleUV-=gaze*vec2(0.004,0.0025)*follow;
        gl_FragColor=texture2D(art,sampleUV);}`));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.uniform1i(gl.getUniformLocation(program, 'art'), 0);
    const gaze = gl.getUniformLocation(program, 'gaze');
    gl.viewport(0, 0, canvas.width, canvas.height);
    return { draw(x, y) { gl.uniform2f(gaze, x, -y); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); } };
  }
  function paint() {
    frame = 0;
    if (document.hidden || hidden || document.body.classList.contains('music-open')) return;
    gazeX += (targetX - gazeX) * .24;
    gazeY += (targetY - gazeY) * .24;
    root.style.setProperty('--mascot-x', (gazeX * 2).toFixed(2) + 'px');
    root.style.setProperty('--mascot-y', (gazeY * 1.5).toFixed(2) + 'px');
    root.style.setProperty('--mascot-turn', (gazeX * 1.6).toFixed(2) + 'deg');
    canvas.dataset.gazeX = gazeX.toFixed(3); canvas.dataset.gazeY = gazeY.toFixed(3);
    renderer?.draw(gazeX, gazeY);
    if (Math.abs(targetX - gazeX) + Math.abs(targetY - gazeY) > .003) frame = requestAnimationFrame(paint);
  }
  function queuePaint() { if (!frame) frame = requestAnimationFrame(paint); }
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || reducedMotion.matches || hidden || root.dataset.layout === 'small' || document.hidden || document.body.classList.contains('music-open')) return;
    const bounds = avatar.getBoundingClientRect();
    const eyeY = root.dataset.layout === 'full' ? bounds.top + bounds.height * .123 : bounds.top + bounds.height * .4;
    targetX = clamp((event.clientX - (bounds.left + bounds.width * .5)) / 320);
    targetY = clamp((event.clientY - eyeY) / 240);
    queuePaint();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { targetX = 0; targetY = 0; queuePaint(); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { targetX = 0; targetY = 0; queuePaint(); } });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); renderer = null; root.classList.remove('is-rendered');
  });
  canvas.addEventListener('webglcontextrestored', initializeArt);
  function initializeArt() {
    if (!image.naturalWidth) return;
    try { renderer = createRenderer(); } catch { renderer = null; }
    if (renderer) { renderer.draw(0, 0); root.classList.add('is-rendered'); }
    root.dataset.artReady = 'true';
    queuePaint();
  }
  image.addEventListener('load', initializeArt, { once: true });
  image.addEventListener('error', () => {
    // Keep the dialog usable if an asset is temporarily unavailable.
    if (!root.classList.contains('art-unavailable')) { root.classList.add('art-unavailable'); image.src = '/img/avatar.jpg'; }
  });
  if (image.complete) initializeArt();
  window.addEventListener('resize', layout, { passive: true });
  document.addEventListener('pjax:complete', () => { layout(); update(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && frame) { cancelAnimationFrame(frame); frame = 0; }
    else if (!document.hidden) queuePaint();
  });
  layout(); update();
})();
