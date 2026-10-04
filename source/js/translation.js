'use strict';
(() => {
  const languages = {
    'zh-CN': { label: '简体中文' },
    'zh-TW': { label: '繁體中文', service: 'chinese_traditional', loading: '正在翻譯…', done: '機器翻譯 · 原文為中文', error: '部分內容未翻譯，暫時顯示原文', retry: '重試', original: '查看原文', dismiss: '關閉翻譯提示' },
    ja: { label: '日本語', service: 'japanese', loading: '翻訳中…', done: '機械翻訳 · 原文は中国語です', error: '一部を翻訳できませんでした。原文を表示しています', retry: '再試行', original: '原文を読む', dismiss: '翻訳のお知らせを閉じる' },
    en: { label: 'English', service: 'english', loading: 'Translating…', done: 'Machine translation · Original in Chinese', error: 'Some text could not be translated. Showing the original.', retry: 'Retry', original: 'Read original', dismiss: 'Dismiss translation notice' }
  };
  // Only public prose is sent. Never collect comments, form values or technical blocks.
  const excluded = 'script,style,noscript,pre,code,kbd,samp,textarea,input,select,svg,math,iframe,[contenteditable],[translate="no"],.notranslate,.katex,.MathJax,mjx-container,.i18n-menu,.translation-notice,#site-comments,#post-comment,.service-status,[data-retry-stats],[id^="busuanzi"],#kagiel-player,.track-body h2,.track-body p,.local-search-input,.search-result-list';
  const nodes = new Map();
  let cache = new Map();
  try {
    const saved = JSON.parse(sessionStorage.getItem('site-translation-cache-v1') || '[]');
    if (Array.isArray(saved)) cache = new Map(saved.filter(item => Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'string' && item[1].trim()).slice(-1200));
  } catch {}
  let language = 'zh-CN', generation = 0, navigating = false, running = false, queued = false, timer;
  let cancelRequest = () => {};
  const cacheKey = (lang, text) => lang + '\n' + text;
  const savedLanguage = () => { try { return localStorage.getItem('site-reading-language'); } catch { return null; } };
  const selectedLanguage = () => {
    const value = new URLSearchParams(location.search).get('lang') || savedLanguage();
    return Object.hasOwn(languages, value) ? value : 'zh-CN';
  };
  let notice, noticeDismissed = false;
  function status(state) {
    if (!notice) {
      notice = document.createElement('aside');
      notice.className = 'translation-notice'; notice.setAttribute('translate', 'no');
      notice.innerHTML = '<span role="status" aria-live="polite"></span><button type="button" data-translation-retry></button><button type="button" data-translation-original></button><button type="button" data-translation-dismiss>×</button>';
      document.body.append(notice);
    }
    notice.hidden = language === 'zh-CN' || noticeDismissed;
    if (notice.hidden) return;
    const t = languages[language];
    notice.lang = language;
    notice.querySelector('span').textContent = t[state];
    const retry = notice.querySelector('[data-translation-retry]');
    retry.hidden = state !== 'error'; retry.textContent = t.retry;
    notice.querySelector('[data-translation-original]').textContent = t.original;
    notice.querySelector('[data-translation-dismiss]').setAttribute('aria-label', t.dismiss);
    notice.dataset.state = state;
  }
  function updateMenu() {
    document.querySelectorAll('[data-language-label]').forEach(el => { el.textContent = language === 'zh-CN' ? '语言' : languages[language].label; });
    document.querySelectorAll('.i18n-menu [data-locale]').forEach(el => {
      if (el.dataset.locale === language) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');
      const url = new URL(location.href); url.searchParams.set('lang', el.dataset.locale);
      el.href = url.pathname + url.search + url.hash;
    });
  }
  function collect() {
    for (const [node] of nodes) if (!node.isConnected || node.parentElement?.closest(excluded)) nodes.delete(node);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement || node.parentElement.closest(excluded)) continue;
      const known = nodes.get(node);
      if (known && node.nodeValue === known.last) continue;
      // A theme widget may replace its text while this page is open.
      if (/[\u3400-\u9fff]/.test(node.nodeValue)) nodes.set(node, { source: node.nodeValue, last: node.nodeValue });
      else if (known) nodes.delete(node);
    }
  }
  function put(node, entry, value) {
    if (node.isConnected && node.nodeValue === entry.last) {
      entry.last = value; node.nodeValue = value;
    }
  }
  function restore() {
    collect();
    for (const [node, entry] of nodes) put(node, entry, entry.source);
    document.documentElement.lang = 'zh-CN';
  }
  async function request(texts, lang) {
    // Current client.edge protocol, verified against xnx3/translate revision
    // d0dc1c73adf951b029fb6244d8b97d0ef2040075. No remote script or API key.
    const controller = new AbortController();
    const abort = () => controller.abort(); cancelRequest = abort;
    const timeout = setTimeout(abort, 15000);
    const target = lang === 'zh-TW' ? 'zh-CHT' : lang;
    try {
      const response = await fetch('https://edge.microsoft.com/translate/translatetext?from=zh-CHS&to=' + target + '&isEnterpriseClient=false', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(texts), signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer'
      });
      if (!response.ok) throw new Error('Translation unavailable');
      const result = await response.json();
      if (!Array.isArray(result) || result.length !== texts.length) throw new Error('Invalid translation response');
      const values = result.map(item => item.translations?.[0]?.text);
      if (values.some(v => typeof v !== 'string' || !v.trim())) throw new Error('Invalid translation text');
      return values;
    } finally { clearTimeout(timeout); if (cancelRequest === abort) cancelRequest = () => {}; }
  }
  async function run() {
    if (navigating) return;
    if (running) { queued = true; return; }
    collect(); updateMenu();
    if (language === 'zh-CN') { restore(); status('done'); return; }
    const lang = language, current = generation;
    const active = () => current === generation && !navigating;
    const applyCache = () => {
      for (const [node, entry] of nodes) {
        const value = cache.get(cacheKey(lang, entry.source));
        if (typeof value === 'string') put(node, entry, value);
      }
    };
    applyCache();
    const missing = [...new Set([...nodes.values()].map(e => e.source))].filter(text => !cache.has(cacheKey(lang, text)));
    if (!missing.length) { document.documentElement.lang = lang; status('done'); return; }
    running = true; status('loading');
    try {
      // Small batches avoid provider request limits and keep retries bounded.
      while (missing.length && active()) {
        const batch = []; let size = 0;
        while (missing.length && batch.length < 60 && (size + missing[0].length < 12000 || !batch.length)) {
          const text = missing.shift(); batch.push(text); size += text.length;
        }
        const result = await request(batch, lang);
        batch.forEach((text, i) => cache.set(cacheKey(lang, text), result[i]));
        if (active()) applyCache();
      }
      if (active()) { document.documentElement.lang = lang; status('done'); }
      while (cache.size > 1200) cache.delete(cache.keys().next().value);
      try { sessionStorage.setItem('site-translation-cache-v1', JSON.stringify([...cache])); } catch {}
    } catch {
      if (active()) { document.documentElement.lang = lang; status('error'); }
    } finally {
      running = false;
      if (queued) { queued = false; schedule(); }
    }
  }
  function schedule() { clearTimeout(timer); if (!navigating) timer = setTimeout(run, 180); }
  function choose(lang, updateUrl = true) {
    if (!Object.hasOwn(languages, lang)) return;
    // Keep a dismissed notice tucked away across navigation. Choosing a
    // language explicitly opens it again, without tying dismissal to Chinese.
    if (updateUrl || lang !== language) noticeDismissed = false;
    generation++; cancelRequest(); restore(); language = lang;
    try { localStorage.setItem('site-reading-language', lang); } catch {}
    if (updateUrl) {
      const url = new URL(location.href); url.searchParams.set('lang', lang);
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
    updateMenu(); status(lang === 'zh-CN' ? 'done' : 'loading'); schedule();
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('.i18n-menu [data-locale]');
    if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
      event.preventDefault(); choose(link.dataset.locale);
      if (document.getElementById('sidebar-menus')?.classList.contains('open')) document.getElementById('menu-mask')?.click();
      link.blur();
    }
    if (event.target.closest('[data-translation-original]')) choose('zh-CN');
    if (event.target.closest('[data-translation-retry]')) schedule();
    if (event.target.closest('[data-translation-dismiss]') && notice) {
      noticeDismissed = true;
      notice.hidden = true;
    }
  });
  document.addEventListener('pjax:send', () => { navigating = true; generation++; cancelRequest(); clearTimeout(timer); });
  document.addEventListener('pjax:complete', () => { navigating = false; choose(selectedLanguage(), false); });
  document.addEventListener('pjax:error', () => { navigating = false; schedule(); });
  // Translate later public content (e.g. the subtitle), but never our own changes.
  new MutationObserver(records => {
    if (language === 'zh-CN' || navigating) return;
    const changed = records.some(record => {
      const el = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (!el || el.closest(excluded)) return false;
      if (record.type === 'characterData') return nodes.get(record.target)?.last !== record.target.nodeValue;
      return [...record.addedNodes].some(node => /[\u3400-\u9fff]/.test(node.textContent || '') && !(node.nodeType === 1 && node.matches(excluded)));
    });
    if (changed) schedule();
  }).observe(document.body, { childList: true, characterData: true, subtree: true });
  choose(selectedLanguage(), false);
})();
