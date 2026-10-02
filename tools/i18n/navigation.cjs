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
    body: Object.fromEntries(Object.entries($('body').attr()).filter(([key]) => key.startsWith('data-'))),
    metadata: $(metadata).toArray().map(el => $.html(el)),
    search: { title: $('.search-dialog-title').text(), placeholder: $('.local-search-input input').attr('placeholder') },
    comments: { ...theme.twikoo.option, envId: theme.twikoo.envId, region: theme.twikoo.region || '', lang: locale.id, path: commentPath }
  };
  $('#config-diff').prepend(`window.sitePage = ${json(state)};\nObject.assign(GLOBAL_CONFIG, window.sitePage.config);\nwindow.siteNavigation?.apply();\n`);
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
  $('.card-webinfo .webinfo').append(`<button type="button" class="service-retry" data-retry-stats hidden>${locale.services.retry}</button>`);
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
    replace('    $loadDataItem.nextElementSibling', '    if (!$loadDataItem) { inputEventFunction(); return }\n    $loadDataItem.nextElementSibling');
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
