'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const cheerio = require('cheerio');
const { ROOT, locales, write, files, inspectContent, protectedParts, targetFor, readPost } = require('./lib.cjs');
const { createPost } = require('./new-post.cjs');
const { build } = require('./build.cjs');
const { createServer } = require('./serve.cjs');

test('protected fragments survive prose reordering; code and destination changes are detected', () => {
  const code = '```sh\nnpm ci\necho "$HOME"\n```';
  const math = '$$E=mc^2$$';
  const original = `中文\n${code}\n${math}\n![雪](/img/snow.png)\n[链接](https://hexo.io/)\n\`git status\``;
  const translated = `English\n${math}\n${code}\n![Snow](/img/snow.png)\n[Link](https://hexo.io/)\n\`git status\``;
  assert.deepEqual(protectedParts(original), protectedParts(translated));
  assert.notDeepEqual(protectedParts(original), protectedParts(translated.replace('npm ci', 'npm install')));
  assert.notDeepEqual(protectedParts(original), protectedParts(translated.replace('/img/snow.png', '/en/img/snow.png')));
});

test('full isolated build: missing translations, empty locale, taxonomies, drafts, snippets and HTTP', { timeout: 180000 }, async () => {
  const fixture = path.join(ROOT, 'work/tests', `${Date.now()}-${process.pid}`);
  for (const l of locales) {
    const src = path.join(ROOT, l.source), dest = path.join(fixture, l.source);
    fs.cpSync(src, dest, { recursive: true, preserveTimestamps: true,
      filter: file => !(l.id === 'ja' && path.relative(src, file).split(path.sep)[0] === '_posts') });
  }
  write(path.join(fixture, 'i18n/taxonomies.json'), JSON.stringify({
    tags: { tools: { names: { 'zh-CN': '工具 & Git', en: 'Tools & Git' }, slugs: { 'zh-CN': 'tools-git', en: 'tools-git' } } },
    categories: { tech: { names: { 'zh-CN': '技术', en: 'Technology' }, slugs: { 'zh-CN': 'tech', en: 'tech' } },
      web: { names: { 'zh-CN': '网站', en: 'Web' }, slugs: { 'zh-CN': 'web', en: 'web' } } }
  }));
  const body = '\n```js\nconst message = "<中文 & English>";\nconsole.log(message);\n```\n\n`npm ci`\n\n$$E=mc^2$$\n\n![snow](/img/snow.png)\n\n[Hexo](https://hexo.io/)\n';
  for (const lang of ['zh-CN', 'en']) {
    const l = locales.find(l => l.id === lang);
    const fm = { title: 'Technical fixture', lang, translation_key: 'fixture-tech', permalink: 'posts/fixture-tech/', date: '2026-09-01T00:30:00+09:00', updated: '2026-09-01T00:30:00+09:00',
      tags: [lang === 'en' ? 'Tools & Git' : '工具 & Git'], categories: [lang === 'en' ? 'Technology' : '技术', lang === 'en' ? 'Web' : '网站'] };
    write(path.join(fixture, l.source, '_posts/fixture-tech.md'), '---\n' + yaml.dump(fm) + '---\n' + body);
  }
  const draft = createPost({ key: 'fixture-tech', lang: 'ja', title: '未公開の下書き', contentRoot: fixture });
  assert.equal(readPost(draft).published, false);
  assert.deepEqual(protectedParts(readPost(draft)._content), protectedParts(body));
  assert.throws(() => createPost({ key: 'fixture-tech', lang: 'ja', contentRoot: fixture }), /already exists/);
  const translatedFile = path.join(fixture, 'locales/en/source/_posts/fixture-tech.md');
  const translation = fs.readFileSync(translatedFile, 'utf8');
  write(translatedFile, translation.replace('npm ci', 'npm install'));
  assert.throws(() => inspectContent(fixture), /Protected code/);
  write(translatedFile, translation);
  write(path.join(fixture, 'locales/en/source/private-note/index.md'), '---\ntitle: Private page draft\npublished: false\n---\nThis must not be published.\n');
  const output = build({ contentRoot: fixture, publish: false });
  const records = JSON.parse(fs.readFileSync(path.join(output, 'i18n-routes.json'), 'utf8'));
  assert.equal(records.filter(r => r.lang === 'ja' && r.kind === 'post').length, 0);
  assert.equal(fs.existsSync(path.join(output, 'en/private-note/index.html')), false);
  const japanese = locales.find(l => l.id === 'ja');
  for (const r of records.filter(r => r.lang === 'zh-CN' && ['post', 'tag', 'category'].includes(r.kind))) {
    const fallback = targetFor(r, japanese, records);
    assert.equal(fallback.exact, false);
    const url = new URL(fallback.url, 'http://localhost');
    const $ = cheerio.load(fs.readFileSync(path.join(output, decodeURIComponent(url.pathname), 'index.html'), 'utf8'));
    assert.equal($('[id]').toArray().filter(e => $(e).attr('id') === decodeURIComponent(url.hash.slice(1))).length, 1, `Missing fallback notice: ${fallback.url}`);
    assert.ok($('.i18n-notices a').toArray().some(a => $(a).attr('href') === r.url));
  }
  const tag = records.find(r => r.lang === 'zh-CN' && r.key === 'tag:tools');
  assert.ok(tag);
  assert.equal(targetFor(tag, locales.find(l => l.id === 'en'), records).url, '/en/tags/tools-git/');
  const nested = records.find(r => r.lang === 'en' && r.key === 'category:tech/web');
  assert.equal(nested.url, '/en/categories/tech/web/');
  const englishPosts = records.filter(r => r.lang === 'en' && r.kind === 'post');
  assert.equal(englishPosts.length, 2);
  for (const post of englishPosts) {
    const $ = cheerio.load(fs.readFileSync(path.join(output, post.output), 'utf8'));
    const expected = records.find(r => r.lang === 'zh-CN' && r.key === post.key);
    assert.equal($('#menus [data-locale="zh-CN"]').attr('href'), expected.url);
  }
  const $ = cheerio.load(fs.readFileSync(path.join(output, 'en/posts/fixture-tech/index.html'), 'utf8'));
  assert.match($('pre').text(), /const message = "<中文 & English>";/);
  assert.match($('#article-container').text(), /E=mc\^2/);
  for (const f of files(path.join(ROOT, 'source/img'))) {
    assert.deepEqual(fs.readFileSync(path.join(output, 'img', path.basename(f))), fs.readFileSync(f));
  }
  const server = createServer(output);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const r of records) assert.equal((await fetch(base + r.url)).status, 200, r.url);
    const error = await fetch(base + '/ja/this-page-does-not-exist/');
    assert.equal(error.status, 404);
    assert.match(await error.text(), /ページが見つかりません/);
    const range = await fetch(base + '/music/nop.mp3', { headers: { Range: 'bytes=0-15' } });
    assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 16);
    assert.equal((await fetch(base + '/2026/08/04/hello%20world/')).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log('Fixture output (retained for inspection): ' + output);
});
