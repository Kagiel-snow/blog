'use strict';
(() => {
  const languages = {
    'zh-CN': { label: '简体中文' },
    'zh-TW': { label: '繁體中文', service: 'chinese_traditional', loading: '正在翻譯…', done: '機器翻譯 · 原文為中文', error: '部分內容未翻譯，暫時顯示原文', retry: '重試', original: '查看原文' },
    ja: { label: '日本語', service: 'japanese', loading: '翻訳中…', done: '機械翻訳 · 原文は中国語です', error: '一部を翻訳できませんでした。原文を表示しています', retry: '再試行', original: '原文を読む' },
    en: { label: 'English', service: 'english', loading: 'Translating…', done: 'Machine translation · Original in Chinese', error: 'Some text could not be translated. Showing the original.', retry: 'Retry', original: 'Read original' }
  };
  // Only public prose is sent. Never collect comments, form values or technical blocks.
  const excluded = 'script,style,noscript,pre,code,kbd,samp,textarea,input,select,svg,math,iframe,[contenteditable],[translate="no"],.notranslate,.katex,.MathJax,mjx-container,.i18n-menu,.translation-notice,#site-comments,#post-comment,.service-status,[data-retry-stats],[id^="busuanzi"],#kagiel-player,.track-body h2,.track-body p,.local-search-input,.search-result-list';
  const nodes = new Map();
  let cache = new Map();
  try { cache = new Map(JSON.parse(sessionStorage.getItem('site-translation-cache-v1') || '[]')); } catch {}
  let language = 'zh-CN', generation = 0, navigating = false, running = false, queued = false, timer, library;
  const cacheKey = (lang, text) => lang + '\n' + text;
  const savedLanguage = () => { try { return localStorage.getItem('site-reading-language'); } catch { return null; } };
  const selectedLanguage = () => {
    const value = new URLSearchParams(location.search).get('lang') || savedLanguage();
    return Object.hasOwn(languages, value) ? value : 'zh-CN';
  };
  let notice;
  function status(state) {
    if (!notice) {
      notice = document.createElement('aside');
      notice.className = 'translation-notice'; notice.setAttribute('translate', 'no');
      notice.innerHTML = '<span role="status" aria-live="polite"></span><button type="button" data-translation-retry></button><button type="button" data-translation-original></button>';
      document.body.append(notice);
    }
    notice.hidden = language === 'zh-CN';
    if (notice.hidden) return;
    const t = languages[language];
    notice.lang = language;
    notice.querySelector('span').textContent = t[state];
    const retry = notice.querySelector('[data-translation-retry]');
    retry.hidden = state !== 'error'; retry.textContent = t.retry;
    notice.querySelector('[data-translation-original]').textContent = t.original;
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
  function loadLibrary() {
    if (window.translate) return Promise.resolve(window.translate);
    if (library) return library;
    library = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const fail = () => { clearTimeout(timeout); script.remove(); library = null; reject(new Error('Translation library unavailable')); };
      const timeout = setTimeout(fail, 10000);
      script.src = '/vendor/translate/translate-3.5.1.js';
      script.onload = () => { clearTimeout(timeout); resolve(window.translate); };
      script.onerror = fail;
      document.head.append(script);
    });
    return library;
  }
  async function request(texts, lang) {
    const api = await loadLibrary();
    // Use only the text API. The library never scans the DOM, refreshes the page,
    // initializes its public server, or handles language selection for this site.
    api.service.use('client.edge');
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Translation timed out')), 15000);
      api.request.post(api.request.api.translate, {
        from: 'chinese_simplified', to: languages[lang].service, text: encodeURIComponent(JSON.stringify(texts))
      }, result => {
        clearTimeout(timeout);
        if (result?.result !== 1 || !Array.isArray(result.text) || result.text.length !== texts.length || result.text.some(v => typeof v !== 'string' || !v.trim())) reject(new Error('Invalid translation response'));
        else resolve(result.text);
      });
    });
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
    generation++; restore(); language = lang;
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
  });
  document.addEventListener('pjax:send', () => { navigating = true; generation++; clearTimeout(timer); });
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
