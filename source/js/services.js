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
  let lastVisit = '';
  let visitorRecorded = false;
  const endpoint = 'https://events.vercount.one/api/v2/log';
  const cacheKey = 'site-statistics-v1';
  let cached = {};
  try { cached = JSON.parse(sessionStorage.getItem(cacheKey) || '{}') || {}; } catch {}
  if (typeof cached !== 'object' || Array.isArray(cached)) cached = {};
  const validCounts = data => ['site_uv', 'site_pv', 'page_pv'].every(key => Number.isSafeInteger(data?.[key]) && data[key] >= 0);
  async function statistics({ retrying = false } = {}) {
    cancelStats();
    const elements = [...document.querySelectorAll('[id^="busuanzi_value_"]')];
    if (!window.sitePage.statistics?.url) return;
    const t = labels();
    const retry = document.querySelector('[data-retry-stats]');
    const note = document.querySelector('[data-stats-note]');
    const url = window.sitePage.statistics.url;
    // A preview reads the public site's counters; it must never record visits
    // for localhost or accidentally inflate the production count.
    const target = new URL(url);
    const preview = location.origin !== target.origin;
    const readOnly = preview || retrying || lastVisit === url;
    const description = preview ? 'Vercount · 本地仅查看' : 'Vercount';
    if (retry) retry.hidden = true;
    if (note) note.textContent = '';
    elements.forEach(el => { el.textContent = t.loading; el.removeAttribute('title'); });
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 10000);
    cancelStats = () => { active = false; clearTimeout(timer); controller.abort(); };
    const render = (data, title) => {
      elements.forEach(el => { el.textContent = String(data[el.id.replace('busuanzi_value_', '')]); el.title = title; });
    };
    const cookieName = 'vercount_uv_' + target.host.replace(/[^a-zA-Z0-9_-]/g, '_');
    let isNewUv = !visitorRecorded && !document.cookie.split(';').some(value => value.trim() === cookieName + '=1');
    if (!readOnly) {
      lastVisit = url;
      // Match the provider's browser-UV semantics. Reserve before the request:
      // navigation/aborting a response cannot undo a server-side increment.
      visitorRecorded = true;
      document.cookie = cookieName + '=1; path=/; max-age=31536000; samesite=lax; secure';
    }
    try {
      const response = await fetch(readOnly ? endpoint + '?url=' + encodeURIComponent(url) : endpoint, {
        method: readOnly ? 'GET' : 'POST',
        ...(readOnly ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, isNewUv }) }),
        credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal
      });
      if (!response.ok) throw new Error('Statistics HTTP ' + response.status);
      const result = await response.json();
      if (result.status !== 'success' || !validCounts(result.data)) throw new Error('Invalid statistics response');
      if (!active || controller.signal.aborted) return;
      render(result.data, description);
      if (note) note.textContent = description;
      cached[url] = { data: result.data, time: Date.now() };
      cached = Object.fromEntries(Object.entries(cached).slice(-40));
      try { sessionStorage.setItem(cacheKey, JSON.stringify(cached)); } catch {}
    } catch {
      if (!active) return;
      const previous = cached[url];
      if (validCounts(previous?.data) && Date.now() - previous.time < 30 * 60 * 1000) {
        render(previous.data, '上次成功获取的统计，暂未更新');
        if (note) note.textContent = description + ' · 上次数据，暂未更新';
      } else {
        elements.forEach(el => { el.textContent = t.unavailable; el.title = t.statsUnavailable; });
        if (note) note.textContent = '统计连接失败';
      }
      if (retry) retry.hidden = false;
    } finally { clearTimeout(timer); }
  }
  const init = () => { comments(); statistics(); };
  document.addEventListener('click', event => { if (event.target.closest('[data-retry-stats]')) statistics({ retrying: true }); });
  document.addEventListener('pjax:send', () => { commentGeneration++; cancelStats(); });
  document.addEventListener('pjax:complete', init);
  init();
})();
