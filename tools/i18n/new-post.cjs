'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const { ROOT, locales, files, readPost, within, write } = require('./lib.cjs');
function createPost({ key, lang = 'zh-CN', title, contentRoot = ROOT }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(key || '')) throw new Error('Use a stable lowercase key, for example hello-blog.');
  const locale = locales.find(l => l.id === lang);
  if (!locale) throw new Error('只需维护中文原文（zh-CN），其他语言由页面上的翻译按钮提供。');
  const directory = path.join(contentRoot, locale.source, '_posts');
  if (files(directory).some(f => /\.md$/i.test(f) && readPost(f).translation_key === key)) throw new Error(`${key} already exists in ${lang}; nothing overwritten.`);
  const file = within(directory, path.join(directory, key + '.md'));
  if (fs.existsSync(file)) throw new Error(`File already exists: ${file}`);
  // Store the offset explicitly so local and CI dates agree.
  const now = new Date(Date.now() + 9 * 3600000).toISOString().replace('Z', '+09:00');
  let original;
  if (lang !== 'zh-CN') {
    original = files(path.join(contentRoot, 'source', '_posts')).filter(f => /\.md$/i.test(f)).map(readPost).find(d => d.translation_key === key);
    if (!original) throw new Error(`No Chinese source with translation_key: ${key}`);
  }
  const front = { title: title || original?.title || key, lang, translation_key: key, permalink: `posts/${key}/`, date: now, updated: now, published: false, tags: [], categories: [] };
  if (original) front.source_revision = 'sha256:' + crypto.createHash('sha256').update(original._content.replace(/\r\n/g, '\n')).digest('hex');
  write(file, '---\n' + yaml.dump(front, { lineWidth: -1 }) + '---\n\n' + (original ? original._content.trimStart() : '# ' + (title || key) + '\n\n'));
  return file;
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2), key = args.shift();
    const options = { key };
    while (args.length) {
      const arg = args.shift();
      if (!['--lang', '--title'].includes(arg) || !args.length) throw new Error('Usage: npm run post:new -- my-post --title "文章标题"');
      options[arg.slice(2)] = args.shift();
    }
    console.log('Draft created: ' + createPost(options));
    console.log('写好这份中文草稿后，设置 published: true。无需再写其他语言版本。');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { createPost };
