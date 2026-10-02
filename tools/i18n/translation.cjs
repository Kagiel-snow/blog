'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { allLocales, write, escape: e, canonical, within } = require('./lib.cjs');
const aliases = require('../../i18n/legacy-language-routes.json');

function translationMenu(record) {
  return `<div class="menus_item i18n-menu" translate="no"><span class="site-page group" tabindex="0" aria-label="选择阅读语言"><i class="fas fa-language fa-fw" aria-hidden="true"></i> <span data-language-label>语言</span> <i class="fas fa-chevron-down" aria-hidden="true"></i></span><ul class="menus_item_child">` + allLocales.map(l =>
    `<li><a class="site-page child" data-no-pjax data-locale="${l.id}" lang="${l.id}" href="${e(record.url)}?lang=${l.id}" ${l.id === 'zh-CN' ? 'aria-current="true"' : ''}>${e(l.label)}${l.id === 'zh-CN' ? ' · 原文' : ''}</a></li>`
  ).join('') + `<li class="translation-hint">其他语言使用机器翻译</li></ul></div>`;
}

function languageRedirects(output, records) {
  const redirects = new Map();
  // Preserve published translated slugs, including hello-blog's different Chinese URL.
  for (const old of aliases) {
    const target = records.find(r => r.key === old.key && !r.noindex);
    if (target) redirects.set(old.url, { lang: old.lang, target: target.url });
  }
  for (const l of allLocales.filter(l => l.id !== 'zh-CN')) {
    for (const r of records.filter(r => !r.noindex)) {
      const url = l.root.slice(0, -1) + r.url;
      if (!redirects.has(url)) redirects.set(url, { lang: l.id, target: r.url });
    }
  }
  const manifest = [];
  for (const [url, { lang, target }] of redirects) {
    const relative = decodeURIComponent(url.slice(1)) + (url.endsWith('/') ? 'index.html' : '');
    const file = within(output, path.join(output, relative));
    if (fs.existsSync(file)) throw new Error('Language alias would overwrite a page: ' + url);
    const destination = target + '?lang=' + lang;
    write(file, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="robots" content="noindex,follow"><link rel="canonical" href="${e(canonical(target))}"><meta http-equiv="refresh" content="0;url=${e(destination)}"><title>继续阅读</title></head><body><p>文章已合并到中文原文，打开后可自动翻译。</p><a href="${e(destination)}">继续阅读</a><script>location.replace(${JSON.stringify(destination)} + location.hash);</script></body></html>`);
    manifest.push({ url, lang, target, output: relative });
  }
  write(path.join(output, 'language-redirects.json'), JSON.stringify(manifest, null, 2));
}
module.exports = { translationMenu, languageRedirects };
