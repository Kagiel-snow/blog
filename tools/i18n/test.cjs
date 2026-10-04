'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');
const { ROOT, locales, write, files, inspectContent, protectedParts, readPost } = require('./lib.cjs');
const { createPost } = require('./new-post.cjs');
const { build } = require('./build.cjs');
const { createServer } = require('./serve.cjs');

test('single-source build preserves drafts, technical snippets, old language URLs, services and media', { timeout: 180000 }, async () => {
  const fixture = path.join(ROOT, 'work/tests', `${Date.now()}-${process.pid}`);
  fs.cpSync(path.join(ROOT, 'source'), path.join(fixture, 'source'), { recursive: true });
  assert.deepEqual(locales.map(l => l.id), ['zh-CN']);
  // An invalid archived translation must not affect publication.
  write(path.join(fixture, 'locales/en/source/_posts/outdated.md'), '---\nlang: ja\n---\nOLD TRANSLATION');
  const draft = createPost({ key: 'fixture-draft', title: '未发布草稿', contentRoot: fixture });
  assert.equal(readPost(draft).published, false);
  assert.throws(() => createPost({ key: 'fixture-draft', contentRoot: fixture }), /already exists/);
  assert.throws(() => createPost({ key: 'fixture-draft', lang: 'en', contentRoot: fixture }), /只需维护中文/);
  write(path.join(fixture, 'source/private-note/index.md'), '---\ntitle: Private\npublished: false\n---\nDO NOT PUBLISH');
  const body = '\n```js\nconst message = "<中文 & English>";\n```\n\n`npm ci`\n\n$$E=mc^2$$\n\n![snow](/img/snow.png)\n';
  write(path.join(fixture, 'source/_posts/fixture-tech.md'), '---\ntitle: 技术片段\nlang: zh-CN\ntranslation_key: fixture-tech\npermalink: posts/fixture-tech/\ndate: 2026-09-01T00:30:00+09:00\nupdated: 2026-09-01T00:30:00+09:00\n---\n' + body);
  assert.equal(inspectContent(fixture).some(p => p.locale.id !== 'zh-CN'), false);
  const output = build({ contentRoot: fixture, publish: false });
  const records = JSON.parse(fs.readFileSync(path.join(output, 'i18n-routes.json')));
  assert.equal(records.every(r => r.lang === 'zh-CN'), true);
  assert.equal(records.filter(r => r.kind === 'post').length, inspectContent(ROOT).filter(p => p.post).length + 1);
  assert.equal(fs.existsSync(path.join(output, 'private-note/index.html')), false);
  assert.equal(fs.existsSync(path.join(output, 'posts/fixture-draft/index.html')), false);
  const $ = cheerio.load(fs.readFileSync(path.join(output, 'posts/fixture-tech/index.html'), 'utf8'));
  assert.match($('pre').text(), /const message = "<中文 & English>";/);
  assert.match($('#article-container').text(), /E=mc\^2/);
  assert.equal($('#menus [data-locale="en"]').attr('href'), '/posts/fixture-tech/?lang=en');
  assert.equal($('script[src="/js/translation.js"]').length, 1);
  assert.equal($('#twikoo-wrap').attr('data-comment-path'), '/posts/fixture-tech/');
  assert.equal($('[data-retry-stats]').length, 1, 'article view counters need a retry control too');
  assert.equal($('.local-search-input input').attr('maxlength'), '80');
  assert.equal($('#search-button > .search').attr('tabindex'), '0');
  const aliases = JSON.parse(fs.readFileSync(path.join(output, 'language-redirects.json')));
  assert.equal(aliases.find(a => a.url === '/ja/posts/hello-blog/').target, '/2026/08/03/hello%20world/');
  for (const alias of aliases) {
    const html = fs.readFileSync(path.join(output, alias.output), 'utf8');
    assert.match(html, /noindex,follow/);
    assert.ok(html.includes(alias.target + '?lang=' + alias.lang));
    assert.ok(html.includes('location.hash'));
  }
  for (const file of files(output).filter(f => f.endsWith('.html'))) {
    const page = cheerio.load(fs.readFileSync(file, 'utf8'));
    page('script:not([src])').each((_, el) => {
      if (!page(el).attr('type') || /javascript/.test(page(el).attr('type'))) new vm.Script(page(el).text(), { filename: file });
    });
  }
  const catalog = require('../../source/data/collections.json');
  const music = cheerio.load(fs.readFileSync(path.join(output, 'music/index.html'), 'utf8'));
  const gallery = cheerio.load(fs.readFileSync(path.join(output, 'Gallery/index.html'), 'utf8'));
  const cinema = cheerio.load(fs.readFileSync(path.join(output, 'movies/index.html'), 'utf8'));
  assert.equal(music('.track-play').length, catalog.tracks.length);
  assert.deepEqual(JSON.parse(music('#site-music-data').text()), catalog.tracks);
  assert.equal(music('#body-wrap #kagiel-player, .js-pjax #kagiel-player').length, 0);
  assert.equal(music('#kagiel-player').length, 1);
  assert.equal(music('#twikoo-wrap').attr('data-comment-path'), '/music/');
  assert.match(music('script').text(), /Pjax.switches.innerHTML/);
  assert.equal(music('script[src*="busuanzi"]').length, 0);
  assert.equal(gallery('.wallpaper-card').length, catalog.images.length);
  assert.equal(cinema('video[controls]:not([autoplay])').length, catalog.videos.length);
  assert.deepEqual(protectedParts(body), protectedParts(readPost(path.join(fixture, 'source/_posts/fixture-tech.md'))._content));
  const server = createServer(output);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const r of [...records, ...aliases]) assert.equal((await fetch(base + r.url)).status, 200, r.url);
    assert.equal((await fetch(base + '/ja/this-page-does-not-exist/')).status, 404);
    for (const item of [...catalog.tracks, ...catalog.videos]) {
      const media = await fetch(base + item.url, { headers: { Range: 'bytes=0-15' } });
      assert.equal(media.status, 206);
      assert.equal((await media.arrayBuffer()).byteLength, 16);
    }
    assert.equal((await fetch(base + '/2026/08/04/hello%20world/')).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log('Fixture output: ' + output);
});
