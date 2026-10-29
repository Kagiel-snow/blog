'use strict';
process.env.TZ = 'Asia/Tokyo';
const fs = require('node:fs');
const path = require('node:path');
const Hexo = require('hexo');
const { ROOT, locales, loadTaxonomy, config, origin, write, documentKey, taxonomyKey, routeUrl } = require('./lib.cjs');
const [lang, buildDir, contentRoot] = process.argv.slice(2);
const taxonomy = loadTaxonomy(contentRoot);
const locale = locales.find(l => l.id === lang);
if (!locale || !buildDir) throw new Error('worker requires a locale and an isolated build directory');
const cfg = { ...config, language: lang, url: origin + locale.root, root: locale.root,
  source_dir: path.join(buildDir, 'source'), public_dir: path.join(buildDir, 'public'),
  description: locale.description, keywords: locale.keywords,
  sitemap: { path: lang === 'zh-CN' ? 'sitemap-zh-CN.xml' : 'sitemap.xml', rel: false, tags: true, categories: true },
  tag_map: { ...config.tag_map }, category_map: { ...config.category_map } };
for (const [kind, field] of [['tags', 'tag_map'], ['categories', 'category_map']]) {
  for (const term of Object.values(taxonomy[kind] || {})) if (term.names?.[lang] && term.slugs?.[lang]) cfg[field][term.names[lang]] = term.slugs[lang];
}
const configFile = path.join(buildDir, 'config.json');
write(configFile, JSON.stringify(cfg));
const hexo = new Hexo(ROOT, { config: configFile, output: buildDir, silent: true });
async function run() {
  await hexo.init();
  hexo.extend.filter.register('before_generate', () => {
    const t = hexo.theme.config, m = locale.menu;
    const menuNames = { '/': m[0], '/archives/': m[1], '/tags/': m[2], '/categories/': m[3],
      '/music/': m[5], '/Gallery/': m[6], '/movies/': m[7], '/link/': m[8], '/about/': m[9] };
    const localizeMenu = menu => Object.fromEntries(Object.entries(menu || {}).map(([label, value]) => {
      if (typeof value === 'string') return [locale.menuLabels?.[label] || menuNames[value.split('||')[0].trim()] || label, value];
      const [name, ...icon] = label.split('||');
      const translated = locale.menuLabels?.[name] || (['List', locales[0].menu[4]].includes(name.trim()) ? m[4] : name);
      return [[translated, ...icon].join('||'), localizeMenu(value)];
    }));
    // The existing theme menu remains the source of routes, ordering and icons.
    t.menu = localizeMenu(t.menu);
    t.translate.enable = false;
    // The quote service is Chinese-only; preserve it on the Chinese site.
    if (lang !== 'zh-CN') t.subtitle.source = false;
    t.subtitle.sub = locale.subtitle;
    t.reward.text = locale.reward;
    if (t.reward.QR_code) t.reward.QR_code.forEach(q => { if (/wechat/i.test(q.text)) q.text = locale.wechat; if (/alipay/i.test(q.text)) q.text = locale.alipay; });
    t.search.placeholder = locale.search;
    t.aside.card_author.button.text = locale.follow;
    if (lang !== 'zh-CN') t.aside.card_announcement.content = locale.announcement;
    t.twikoo.option = { ...t.twikoo.option, lang };
    t.error_404 = { ...t.error_404, enable: true, subtitle: locale.notFound };
  }, 2);
  hexo.extend.generator.register('i18n-empty-archive', locals => {
    if (!locals.posts.length) return [
      { path: 'index.html', layout: ['index'], data: { __index: true, posts: locals.posts, base: '', total: 1, current: 1, current_url: '', prev: 0, next: 0, prev_link: '', next_link: '' } },
      { path: 'archives/index.html', layout: ['page'], data: { title: locale.menu[1], content: `<p>${locale.empty}</p>`, lang, comments: false } }
    ];
  });
  await hexo.call('generate', { force: true, bail: true });
  // searchdb 1.5 concatenates root with Hexo 8 explicit permalinks, leaving //.
  // Normalize only this generated index, keeping the original plugin and content.
  const searchFile = path.join(buildDir, 'public', cfg.search.path);
  const search = JSON.parse(fs.readFileSync(searchFile, 'utf8'));
  for (const result of search) result.url = result.url.replace(/\/{2,}/g, '/');
  fs.writeFileSync(searchFile, JSON.stringify(search));
  const records = [];
  for (const [type, isPost] of [['Post', true], ['Page', false]]) {
    hexo.model(type).forEach(doc => {
      if (doc.published === false || (isPost && doc.notPublished())) return;
      const actual = doc.path.replace(/^\//, '');
      const output = actual.endsWith('/') ? actual + 'index.html' : actual;
      if (!output.endsWith('.html') || doc.layout === false) return;
      if (!hexo.route.list().includes(output)) return;
      records.push({ lang, key: documentKey(doc, doc.source, isPost), kind: isPost ? 'post' : 'page', route: output, url: routeUrl(locale.root, output), title: doc.title, source: doc.source });
    });
  }
  for (const [model, kind] of [['Tag', 'tag'], ['Category', 'category']]) {
    hexo.model(model).forEach(term => {
      if (!term.length) return;
      let id = taxonomyKey(kind === 'tag' ? 'tags' : 'categories', term.name, lang, taxonomy);
      if (kind === 'category') {
        const parents = []; let parent = term.parent;
        while (parent) { const p = hexo.model('Category').findById(parent); if (!p) break; parents.unshift(taxonomyKey('categories', p.name, lang, taxonomy)); parent = p.parent; }
        id = [...parents, id].join('/');
      }
      records.push({ lang, key: `${kind}:${id}`, kind, route: term.path + 'index.html', url: routeUrl(locale.root, term.path), title: term.name });
    });
  }
  const known = new Set(records.map(r => r.route));
  for (const route of hexo.route.list().filter(p => p.endsWith('.html') && !known.has(p))) {
    let key, kind;
    if (route === 'index.html') { key = 'home'; kind = 'home'; }
    else if (route.startsWith('archives/')) { key = `archive:${route}`; kind = 'archive'; }
    else if (route === '404.html') { key = 'error:404'; kind = 'error'; }
    else { key = `list:${lang}:${route}`; kind = route.startsWith('tags/') ? 'tag' : route.startsWith('categories/') ? 'category' : 'list'; }
    records.push({ lang, key, kind, route, url: routeUrl(locale.root, route), noindex: kind === 'error' });
  }
  write(path.join(buildDir, 'routes.json'), JSON.stringify(records, null, 2));
  await hexo.exit();
  console.log(`${lang}: ${records.length} HTML routes generated`);
}
run().catch(async e => { console.error(e); await hexo.exit(e); process.exitCode = 1; });
