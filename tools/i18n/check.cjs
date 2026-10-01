'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');
const { ROOT, locales, files, origin, canonical, translations, legacy } = require('./lib.cjs');
function check(output = path.join(ROOT, 'public')) {
  const records = JSON.parse(fs.readFileSync(path.join(output, 'i18n-routes.json'), 'utf8'));
  const errors = [];
  const allFiles = new Set(files(output).map(f => path.relative(output, f).split(path.sep).join('/')));
  function exists(url, base) {
    const u = new URL(url, origin + base);
    if (u.origin !== origin) return true;
    const p = decodeURIComponent(u.pathname).slice(1);
    return allFiles.has(p) || allFiles.has(p.replace(/\/?$/, '/') + 'index.html') || (!p && allFiles.has('index.html'));
  }
  function checkUrl(value, rel) {
    if (!value || /^(#|mailto:|tel:|data:|javascript:|blob:)/i.test(value)) return;
    try { if (!exists(value, '/' + rel)) errors.push(`${rel}: missing ${value}`); }
    catch { errors.push(`${rel}: malformed URL ${value}`); }
  }
  for (const file of files(output).filter(f => f.endsWith('.html'))) {
    const rel = path.relative(output, file).split(path.sep).join('/');
    const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
    for (const attr of ['href', 'src', 'data-lazy-src', 'poster']) for (const el of $(`[${attr}]`).toArray()) checkUrl($(el).attr(attr), rel);
    $('[srcset]').each((_, el) => { const value = $(el).attr('srcset'); if (!value.includes('data:')) for (const src of value.split(',')) checkUrl(src.trim().split(/\s+/)[0], rel); });
    $('[style]').each((_, el) => { for (const m of $(el).attr('style').matchAll(/url\(['"]?([^'"()]+)['"]?\)/g)) checkUrl(m[1], rel); });
    // Existing APlayer playlist resources are in inline scripts, not HTML src attributes.
    $('script:not([src])').each((_, el) => { for (const m of $(el).text().matchAll(/\b(?:url|cover)\s*:\s*['"]([^'"]+)['"]/g)) checkUrl(m[1], rel); });
    if ($('#kagiel-player').length) {
      try {
        const tracks = JSON.parse($('#site-music-data').text());
        if (!Array.isArray(tracks) || !tracks.length || new Set(tracks.map(t => t.id)).size !== tracks.length) throw new Error('empty or duplicate track IDs');
        for (const track of tracks) {
          if (![track.id, track.name, track.artist, track.url, track.cover].every(v => typeof v === 'string' && v.length)) throw new Error('incomplete track metadata');
          checkUrl(track.url, rel); checkUrl(track.cover, rel);
        }
        for (const button of $('[data-track-id]').toArray()) if (!tracks.some(t => t.id === $(button).attr('data-track-id'))) throw new Error('unknown track button');
      } catch (err) { errors.push(`${rel}: invalid music catalog (${err.message})`); }
    }
  }
  for (const file of files(output).filter(f => f.endsWith('.css'))) {
    const rel = path.relative(output, file).split(path.sep).join('/');
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/url\(['"]?([^'"()]+)['"]?\)/g)) checkUrl(m[1], rel);
  }
  for (const r of records) {
    const $ = cheerio.load(fs.readFileSync(path.join(output, r.output), 'utf8'));
    if ($('html').attr('lang') !== r.lang) errors.push(`Wrong lang: ${r.output}`);
    if ($('link[rel="canonical"]').length !== 1 || $('link[rel="canonical"]').attr('href') !== canonical(r.url)) errors.push(`Wrong canonical: ${r.output}`);
    const expected = translations(records, r.key);
    for (const p of expected) if ($(`link[hreflang="${p.lang}"]`).attr('href') !== p.canonical) errors.push(`Wrong hreflang ${p.lang}: ${r.output}`);
    if ($('link[hreflang]').not('[hreflang="x-default"]').length !== expected.length) errors.push(`Unexpected hreflang: ${r.output}`);
    const original = expected.find(p => p.lang === 'zh-CN');
    if (($('link[hreflang="x-default"]').attr('href') || undefined) !== original?.canonical) errors.push(`Wrong x-default: ${r.output}`);
    $('script[type="application/ld+json"]').each((_, el) => {
      const text = $(el).text().trim();
      if (!text) return;
      try { const data = JSON.parse(text); if (data['@type'] === 'BlogPosting' && (data.url !== r.canonical || data.inLanguage !== r.lang)) errors.push(`Wrong structured article data: ${r.output}`); }
      catch { errors.push(`Invalid structured data: ${r.output}`); }
    });
    if ($('.i18n-menu').length !== 2 || $('#menus .i18n-menu a').length !== 4) errors.push(`Missing desktop/mobile language navigation: ${r.output}`);
    const locale = locales.find(l => l.id === r.lang);
    const groups = $('#menus .site-page.group').map((_, el) => $(el).text().trim()).get();
    if (!groups.includes(locale.menu[4])) errors.push(`Collection menu was not localized: ${r.output}`);
    if ($('script[src*="tw_cn.js"]').length) errors.push(`Old text converter still enabled: ${r.output}`);
  }
  for (const l of locales) {
    for (const p of ['', 'music/', 'Gallery/', 'movies/', 'tags/', 'categories/', 'link/', 'about/', 'archives/']) if (!exists(l.root + p, '/')) errors.push(`Required page missing: ${l.root + p}`);
    const db = JSON.parse(fs.readFileSync(path.join(output, l.root, 'search.json'), 'utf8'));
    const urls = new Set(records.filter(r => r.lang === l.id && r.kind === 'post').map(r => r.url));
    for (const result of db) if (!urls.has(result.url)) errors.push(`Search leaked another language or draft: ${result.url}`);
  }
  for (const file of files(output).filter(f => /sitemap[^/\\]*\.xml$/.test(f))) {
    const $ = cheerio.load(fs.readFileSync(file, 'utf8'), { xml: true });
    $('loc').each((_, el) => {
      const u = $(el).text();
      if (!exists(u, '/')) errors.push(`Sitemap target missing: ${u}`);
      if ($('urlset').length && !records.some(r => r.canonical === u && !r.noindex)) errors.push(`Sitemap contains a noncanonical/unknown page: ${u}`);
    });
  }
  for (const target of Object.values(legacy)) if (!exists(target, '/')) errors.push(`Old published URL missing: ${target}`);
  if (errors.length) throw new Error([...new Set(errors)].join('\n'));
  console.log(`PASS: ${records.length} multilingual HTML pages; internal links, required routes, language isolation, canonical, hreflang and sitemaps.`);
  return records;
}
if (require.main === module) { try { check(process.argv[2]); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { check };
