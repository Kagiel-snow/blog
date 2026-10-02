'use strict';
(() => {
  const labels = () => window.sitePage.services;
  let commentGeneration = 0;
  let twikooScript;
  const loadTwikoo = () => {
    if (window.twikoo) return Promise.resolve();
    if (twikooScript) return twikooScript;
    twikooScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const fail = () => { clearTimeout(timer); script.remove(); twikooScript = null; reject(new Error('Comments unavailable')); };
      const timer = setTimeout(fail, 10000);
      script.src = 'https://cdn.jsdelivr.net/npm/twikoo@1.7.14/dist/twikoo.all.min.js';
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = fail;
      document.head.append(script);
    });
    return twikooScript;
  };
  async function comments() {
    const generation = ++commentGeneration;
    const host = document.getElementById('site-comments');
    const status = document.querySelector('[data-comment-status]');
    if (!host || !status) return;
    const options = { ...window.sitePage.comments };
    const t = labels();
    status.textContent = t.loadingComments;
    let timeout;
    const active = () => generation === commentGeneration && host.isConnected;
    try {
      await loadTwikoo();
      if (!active()) return;
      const el = document.createElement('div');
      el.id = 'twikoo-wrap';
      host.replaceChildren(el);
      await Promise.race([
        window.twikoo.init({ ...options, el, onCommentLoaded: () => {
          if (active()) window.btf?.loadLightbox(document.querySelectorAll('#twikoo .tk-content img:not(.tk-owo-emotion)'));
        } }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Comments timed out')), 12000); })
      ]);
      if (active()) status.textContent = '';
    } catch {
      if (!active()) return;
      status.textContent = t.commentsUnavailable + ' ';
      const retry = document.createElement('button');
      retry.type = 'button'; retry.className = 'service-retry'; retry.textContent = t.retry;
      retry.addEventListener('click', comments, { once: true });
      status.append(retry);
    } finally { clearTimeout(timeout); }
  }

  let cancelStats = () => {};
  let sequence = 0;
  function statistics() {
    cancelStats();
    const elements = [...document.querySelectorAll('[id^="busuanzi_value_"]')];
    if (!elements.length) return;
    const t = labels();
    const retry = document.querySelector('[data-retry-stats]');
    if (retry) retry.hidden = true;
    elements.forEach(el => { el.textContent = t.loading; el.removeAttribute('title'); });
    const script = document.createElement('script');
    const callback = 'BusuanziCallback_' + Date.now() + '_' + (++sequence);
    let done = false;
    const cleanup = () => {
      done = true; clearTimeout(timer); script.remove();
      // A response already in flight may execute after navigation or timeout.
      window[callback] = () => {};
      setTimeout(() => { delete window[callback]; }, 60000);
    };
    const fail = () => {
      if (done) return;
      elements.forEach(el => { el.textContent = t.unavailable; el.title = t.statsUnavailable; });
      if (retry) retry.hidden = false;
      cleanup();
    };
    const timer = setTimeout(fail, 8000);
    window[callback] = data => {
      if (done) return;
      if (!elements.every(el => /^\d+$/.test(String(data?.[el.id.replace('busuanzi_value_', '')])))) { fail(); return; }
      elements.forEach(el => { el.textContent = String(data[el.id.replace('busuanzi_value_', '')]); });
      cleanup();
    };
    cancelStats = cleanup;
    script.src = 'https://busuanzi.ibruce.info/busuanzi?jsonpCallback=' + callback;
    script.referrerPolicy = 'no-referrer-when-downgrade';
    script.onerror = fail;
    document.head.append(script);
  }
  const init = () => { comments(); statistics(); };
  document.addEventListener('click', event => { if (event.target.closest('[data-retry-stats]')) statistics(); });
  document.addEventListener('pjax:send', () => { commentGeneration++; cancelStats(); });
  document.addEventListener('pjax:complete', init);
  init();
})();
