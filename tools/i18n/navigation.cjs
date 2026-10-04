'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');
const { ROOT, locales, encodePath } = require('./lib.cjs');
const theme = yaml.load(fs.readFileSync(path.join(ROOT, '_config.butterfly.yml'), 'utf8'));
const metadata = 'meta[name="description"], meta[name="keywords"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"], link[hreflang], script[type="application/ld+json"]';
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');

function enhanceNavigation($, record, records, locale) {
  const configScript = $('script').toArray().find(el => $(el).text().startsWith('const GLOBAL_CONFIG ='));
  const pjaxScript = $('script').toArray().find(el => $(el).text().includes('const pjaxSelectors ='));
  if (!configScript || !pjaxScript || !$('#config-diff').length) throw new Error('Butterfly navigation hooks changed');
  const config = vm.runInNewContext($(configScript).text() + '; GLOBAL_CONFIG', {}, { timeout: 1000 });
  // Match translations by their stable content key, not by translated slugs.
  const original = records.find(r => r.key === record.key && r.lang === 'zh-CN');
  const commentPath = original ? encodePath(original.url) : '/comments/' + encodeURIComponent(record.key) + '/';
  $('#twikoo-wrap').attr('data-comment-path', commentPath);
  $('#twikoo-wrap').wrap('<div id="site-comments"></div>');
  const state = {
    lang: locale.id, config, appearance: locale.appearance, services: locale.services,
    statistics: record.noindex ? null : { url: record.canonical },
    body: Object.fromEntries(Object.entries($('body').attr()).filter(([key]) => key.startsWith('data-'))),
    metadata: $(metadata).toArray().map(el => $.html(el)),
    search: { title: $('.search-dialog-title').text(), placeholder: $('.local-search-input input').attr('placeholder') },
    comments: { ...theme.twikoo.option, envId: theme.twikoo.envId, region: theme.twikoo.region || '', lang: locale.id, path: commentPath }
  };
  // Script text must not pass through HTML fragment parsing (&quot; in metadata).
  $('#config-diff').text(`window.sitePage = ${json(state)};\nObject.assign(GLOBAL_CONFIG, window.sitePage.config);\nwindow.siteNavigation?.apply();\n` + $('#config-diff').text());
  // The player and search dialog remain mounted. Replace the mobile menu too.
  const selectors = ['head > title', '#config-diff', '#body-wrap', '#sidebar-menus .menus_items', '#sidebar-menus .site-data', '#rightside-config-hide', '#rightside-config-show', '.js-pjax'];
  $(pjaxScript).text($(pjaxScript).text().replace(/const pjaxSelectors = [^\n]+/, `const pjaxSelectors = ${json(selectors)}`)
    .replace('selectors: pjaxSelectors,', "selectors: pjaxSelectors,\n      switches: { '#sidebar-menus .menus_items': Pjax.switches.innerHTML },")
    .replace('a:not([target="_blank"]):not([data-fancybox])', 'a:not([target="_blank"]):not([download]):not([data-no-pjax]):not([data-track-id]):not([data-fancybox])'));
  // A single lifecycle-aware loader owns comments and statistics, including failures.
  $('script').each((_, el) => {
    const text = $(el).text();
    if (text.includes('const loadTwikoo =')) $(el).remove();
    if (($(el).attr('src') || '').includes('busuanzi')) $(el).remove();
    // Butterfly 5.6 registers a typed cleanup even when the effect is disabled.
    // Also keep a delayed Chinese quote from writing into a translated page.
    if (text.includes('window.typedJSFn =')) {
      $(el).text('(() => {\nconst subtitleElement = document.getElementById("subtitle");\n' + text
        .replace('typed && typed.destroy()', 'window.typed && window.typed.destroy()')
        .replace('processSubtitle: (content, extraContents = []) => {', 'processSubtitle: (content, extraContents = []) => {\n      if (!subtitleElement?.isConnected) return')
        .replace("document.getElementById('subtitle').textContent", 'subtitleElement.textContent') + '\n})();');
    } else if (text.includes('function subtitleType ()')) {
      $(el).text('(() => {\nconst subtitleFn = window.typedJSFn;\n' + text.replaceAll('typedJSFn', 'subtitleFn') + '\n})();');
    }
  });
  if ($('#site-comments').length) $('#site-comments').before(`<p class="service-status" data-comment-status role="status"></p>`);
  $('[id^="busuanzi_value_"]').attr('aria-live', 'polite');
  const statsControls = `<span class="stats-controls"><span data-stats-note role="status"></span> <button type="button" class="service-retry" data-retry-stats hidden>${locale.services.retry}</button></span>`;
  if ($('.card-webinfo .webinfo').length) $('.card-webinfo .webinfo').append(statsControls);
  else if ($('#busuanzi_value_page_pv').length) $('#busuanzi_value_page_pv').parent().after(statsControls);
  $('.search-dialog').attr({ role: 'dialog', 'aria-modal': 'true', 'aria-label': '搜索文章' });
  $('.local-search-input input').attr({ 'aria-label': '搜索中文原文', maxlength: '80' });
  $('.search-close-button').attr({ type: 'button', 'aria-label': '关闭搜索' });
  $('#search-button > .search').attr({ role: 'button', tabindex: '0', 'aria-label': '搜索文章' });
  $('.local-search-input').after('<p class="search-hint">搜索中文原文，也可以输入 LAN、SQL 等关键词。</p><p class="service-status" data-search-status role="status" translate="no"></p>');
}

function enhanceSearch(output) {
  for (const locale of locales) {
    const file = path.join(output, locale.root, 'js/search/local-search.js');
    let source = fs.readFileSync(file, 'utf8');
    const replace = (from, to) => {
      if (!source.includes(from)) throw new Error('Butterfly search hook changed: ' + from);
      source = source.replace(from, to);
    };
    replace('const { path, top_n_per_article, unescape, languages, pagination }', 'let { path, top_n_per_article, unescape, languages, pagination }');
    replace('const localSearch = new LocalSearch({', 'let localSearch = new LocalSearch({');
    // The search script is after its markup and utils.js. Do not wait for slow
    // external images/widgets (or a stuck statistics JSONP) to fire window.load.
    replace("window.addEventListener('load', () => {", '(() => {');
    source = source.trimEnd().replace(/\}\)$/, '})()');
    replace('    $loadDataItem.nextElementSibling.style.visibility = \'visible\'\n    $loadDataItem.remove()', `    document.querySelector('.local-search-input').style.visibility = 'visible'
    $loadDataItem?.remove()
    document.querySelector('[data-search-status]').textContent = ''
    inputEventFunction()`);
    replace('    fetch(this.path)', `    if (this.pending) return this.pending
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    window.dispatchEvent(new Event('search:loading'))
    this.pending = fetch(this.path, { signal: controller.signal })`);
    replace('        this.isfetched = true\n        this.datas', '        this.datas');
    replace('        // Remove loading animation', '        this.isfetched = true\n        // Remove loading animation');
    replace(`        console.error('Local search data fetch failed:', error)
        this.isfetched = true
        this.datas = []
        window.dispatchEvent(new Event('search:loaded'))
      })`, `        this.isfetched = false
        this.datas = []
        window.dispatchEvent(new Event('search:failed'))
      })
      .finally(() => { clearTimeout(timeout); this.pending = null })
    return this.pending`);
    replace("    if (!loadFlag) {\n      !localSearch.isfetched && localSearch.fetchData()", "    !localSearch.isfetched && localSearch.fetchData()\n    if (!loadFlag) {");
    replace("    btf.addEventListenerPjax(document.querySelector('#search-button > .search'), 'click', openSearch)", `    // Delegate once: the navigation button is replaced by PJAX.
    document.addEventListener('click', event => {
      if (event.target.closest('#search-button > .search')) openSearch()
    })
    document.addEventListener('keydown', event => {
      if (event.target.closest('#search-button > .search') && ['Enter', ' '].includes(event.key)) {
        event.preventDefault(); openSearch()
      }
    })`);
    replace("    searchClickFn()\n  })", "  })");
    replace("  searchClickFn()\n  searchFnOnce()", `  const searchStatus = document.querySelector('[data-search-status]')
  document.querySelector('.local-search-input').style.visibility = 'visible'
  window.addEventListener('search:loading', () => { searchStatus.textContent = '正在加载文章索引…' })
  window.addEventListener('search:failed', () => {
    document.getElementById('loading-database')?.remove()
    searchStatus.textContent = '文章索引没有加载成功。 '
    const retry = document.createElement('button')
    retry.type = 'button'; retry.className = 'service-retry'; retry.textContent = '重试'
    retry.addEventListener('click', () => localSearch.fetchData())
    searchStatus.append(retry)
  })
  searchClickFn()
  searchFnOnce()`);
    // A keyword longer than the snippet must still consume its match.
    replace('position + 100)', 'position + Math.max(100, item.word.length))');
    replace("    const params = new URL(location.href)", "    this._processedKeywords = null\n    const params = new URL(location.href)");
    replace("    !btf.isHidden($searchMask) && closeSearch()", `    !btf.isHidden($searchMask) && closeSearch()
    if (localSearch.path !== GLOBAL_CONFIG.localSearch.path) {
      clearTimeout(searchTimeout)
      localSearch = new LocalSearch(GLOBAL_CONFIG.localSearch)
      languages = GLOBAL_CONFIG.localSearch.languages
      $input.value = ''
      clearSearchResults()
      localSearch.fetchData()
    }`);
    fs.writeFileSync(file, source);
  }
}
module.exports = { enhanceNavigation, enhanceSearch };
