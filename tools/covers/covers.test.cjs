'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { load, coverUrl, cardUrl, isRemote, pickCover, fillMissing } = require('./covers.cjs');

const data = {
  proxy: 'https://img.example/{image}?w={width}&q=80', widths: { cover: 1600, card: 800 },
  covers: [{ id: 'a', image: 'host.example/a.jpg' }, { id: 'b', image: 'host.example/b.jpg' }, { id: 'c', image: 'host.example/c.jpg' }]
};
function fixture(posts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'covers-'));
  for (const [name, text] of Object.entries(posts)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

test('the shipped cover list is well formed, unique and served over HTTPS', () => {
  const shipped = load();
  assert.ok(shipped.covers.length >= 12);
  assert.equal(new Set(shipped.covers.map(entry => entry.id)).size, shipped.covers.length);
  assert.equal(new Set(shipped.covers.map(entry => entry.image)).size, shipped.covers.length);
  for (const entry of shipped.covers) {
    const url = new URL(coverUrl(entry, undefined, shipped));
    assert.equal(url.protocol, 'https:');
    assert.match(entry.page, /^https:\/\//);
    assert.ok(!entry.image.startsWith('http'), 'image is stored without protocol so the proxy template can wrap it');
  }
  assert.ok(fs.existsSync(path.join(__dirname, '../../source', shipped.fallback)));
});

test('cover URLs use the proxy template and cards request a smaller width', () => {
  const url = coverUrl(data.covers[0], undefined, data);
  assert.equal(url, 'https://img.example/host.example/a.jpg?w=1600&q=80');
  assert.equal(cardUrl(url, data), 'https://img.example/host.example/a.jpg?w=800&q=80');
  assert.equal(cardUrl('/img/covers/local.jpg?w=1600', data), '/img/covers/local.jpg?w=1600');
  assert.equal(coverUrl(data.covers[0], undefined, { ...data, proxy: '' }), 'https://host.example/a.jpg');
  assert.equal(isRemote(url, data), true);
  assert.equal(isRemote('/img/cover.jpg', data), false);
});

test('picking prefers unused covers and falls back to the least used one', () => {
  const dir = fixture({
    'one.md': '---\ntitle: one\ncover: https://img.example/host.example/a.jpg?w=1600&q=80\n---\n',
    'two.md': '---\ntitle: two\ncover: https://img.example/host.example/b.jpg?w=1600&q=80\n---\n',
    'three.md': '---\ntitle: three\ncover: https://img.example/host.example/b.jpg?w=1600&q=80\n---\n'
  });
  const first = pickCover({ dir, data, random: () => 0 });
  assert.equal(first.entry.id, 'c');
  assert.equal(first.reused, false);
  fs.writeFileSync(path.join(dir, 'four.md'), `---\ntitle: four\ncover: ${first.url}\n---\n`);
  const again = pickCover({ dir, data, random: () => 0 });
  assert.equal(again.entry.id, 'a', 'a and c are used once, b twice');
  assert.equal(again.reused, true);
});

test('fill only adds covers to posts without one and keeps the rest of the file', () => {
  const dir = fixture({
    'has.md': '---\ntitle: has\ncover: /img/covers/mine.jpg\n---\n\nbody\n',
    'empty.md': '---\ntitle: empty\ncover:\ntags: []\n---\n\n正文\n',
    'none.md': '---\ntitle: none\n---\n\n正文\n'
  });
  const changed = fillMissing({ dir, data, random: () => 0 });
  assert.equal(changed.length, 2);
  assert.equal(fs.readFileSync(path.join(dir, 'has.md'), 'utf8'), '---\ntitle: has\ncover: /img/covers/mine.jpg\n---\n\nbody\n');
  const empty = fs.readFileSync(path.join(dir, 'empty.md'), 'utf8');
  assert.match(empty, /^---\ntitle: empty\ntags: \[\]\ncover: https:\/\/img\.example\/host\.example\/[abc]\.jpg\?w=1600&q=80\n---\n\n正文\n$/);
  const none = fs.readFileSync(path.join(dir, 'none.md'), 'utf8');
  assert.match(none, /^---\ntitle: none\ncover: https:\/\/img\.example\//);
  assert.notEqual(empty.match(/cover: (.*)/)[1], none.match(/cover: (.*)/)[1], 'the two filled posts get different covers');
});
