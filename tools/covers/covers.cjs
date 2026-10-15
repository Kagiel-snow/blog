'use strict';
// Remote anime covers: the repository keeps links only, images stay on the third-party host.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const DATA = path.join(ROOT, 'source/data/covers.json');
const POSTS = path.join(ROOT, 'source/_posts');

function load(file = DATA) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function coverUrl(entry, width, data = load()) {
  const size = width || data.widths?.cover || 1600;
  if (!data.proxy) return 'https://' + entry.image;
  return data.proxy.replace('{image}', entry.image).replace('{width}', String(size));
}

// The proxy accepts a width; list cards only need a smaller copy of the same picture.
function cardUrl(url, data = load()) {
  if (typeof url !== 'string' || !data.proxy) return url;
  const prefix = data.proxy.slice(0, data.proxy.indexOf('{image}'));
  if (!prefix || !url.startsWith(prefix)) return url;
  return url.replace(/([?&]w=)\d+/, `$1${data.widths?.card || 800}`);
}

function isRemote(url, data = load()) {
  if (typeof url !== 'string') return false;
  return data.covers.some(entry => url.includes(entry.image));
}

function postCovers(dir = POSTS) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => name.endsWith('.md')).map(name => {
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const line = front?.[1].match(/^cover:[ \t]*(.*)$/m);
    return { file: path.join(dir, name), cover: line ? line[1].trim().replace(/^['"]|['"]$/g, '') : '' };
  });
}

// Prefer a cover no post uses yet; once all are used, reuse the least used one.
function pickCover({ dir = POSTS, data = load(), random = crypto.randomInt } = {}) {
  const used = new Map(data.covers.map(entry => [entry.id, 0]));
  for (const { cover } of postCovers(dir)) {
    const entry = data.covers.find(item => cover.includes(item.image));
    if (entry) used.set(entry.id, used.get(entry.id) + 1);
  }
  const least = Math.min(...used.values());
  const choices = data.covers.filter(entry => used.get(entry.id) === least);
  const entry = choices[random(choices.length)];
  return { entry, url: coverUrl(entry, undefined, data), reused: least > 0 };
}

// Add a cover line to posts that have none; posts with a cover are never touched.
function fillMissing({ dir = POSTS, data = load(), random } = {}) {
  const changed = [];
  for (const { file, cover } of postCovers(dir)) {
    if (cover) continue;
    const text = fs.readFileSync(file, 'utf8');
    const front = text.match(/^---\r?\n/);
    if (!front) continue;
    const { url } = pickCover({ dir, data, random });
    const updated = text.replace(/^(---\r?\n[\s\S]*?)(\r?\n---)/, (_, head, end) => `${head.replace(/\r?\ncover:[ \t]*$/m, '')}\ncover: ${url}${end}`);
    fs.writeFileSync(file, updated);
    changed.push({ file, url });
  }
  return changed;
}

if (require.main === module) {
  const command = process.argv[2] || 'pick';
  try {
    if (command === 'pick') {
      const { entry, url, reused } = pickCover();
      console.log(`cover: ${url}`);
      console.log(`预览：${entry.page}（${entry.title}）${reused ? '\n提示：封面都已用过，这是使用次数最少的一张。可以在 source/data/covers.json 继续添加。' : ''}`);
    } else if (command === 'fill') {
      const changed = fillMissing();
      if (!changed.length) console.log('所有文章都已有封面，没有修改。');
      for (const { file, url } of changed) console.log(`${path.relative(ROOT, file)} → ${url}`);
    } else if (command === 'list') {
      const data = load(), posts = postCovers();
      for (const entry of data.covers) {
        const users = posts.filter(post => post.cover.includes(entry.image)).map(post => path.basename(post.file));
        console.log(`${entry.id}  ${entry.title}  ${users.length ? '已用：' + users.join(', ') : '未使用'}`);
      }
    } else throw new Error('Usage: npm run cover -- [pick|fill|list]');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { load, coverUrl, cardUrl, isRemote, postCovers, pickCover, fillMissing };
