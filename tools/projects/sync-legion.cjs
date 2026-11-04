'use strict';
// Copy the playable files of the legion game into source/projects/legion/.
// Usage: node tools/projects/sync-legion.cjs <game folder>
// The source art is far larger than the game ever draws it, so each PNG is shrunk to the size the
// game caches it at (game.js artImg): with VISUAL.smooth, its pixel grid x VISUAL.artRes (tiles 320)
// by area averaging; otherwise 2x its grid, each 2x2 block holding the colour the game would sample.
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const from = process.argv[2];
if (!from || !fs.existsSync(path.join(from, 'game.js'))) throw new Error('Pass the game folder that holds index.html and game.js.');
const to = path.join(__dirname, '..', '..', 'source', 'projects', 'legion');
fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to, { recursive: true });
// index.html plus every local stylesheet and script it loads.
const html = fs.readFileSync(path.join(from, 'index.html'), 'utf8');
const pages = ['index.html', ...[...html.matchAll(/(?:src|href)="([^":?#]+)(?:\?[^"]*)?"/g)].map(m => m[1])];
for (const file of new Set(pages)) fs.copyFileSync(path.join(from, file), path.join(to, file));

const read = file => fs.readFileSync(path.join(from, file), 'utf8');
const literal = read('game.js').match(/const PIXEL_GRID = (\{[\s\S]*?\n\});/);
if (!literal) throw new Error('PIXEL_GRID not found in game.js');
const GRID = new Function(`return ${literal[1]}`)();
const gridOf = key => GRID[key] || GRID[key.split('/')[0]] || 64;
const smooth = /\bsmooth:\s*true\b/.test(read('data.js'));
const artRes = Number(read('data.js').match(/\bartRes:\s*(\d+)/)?.[1] || 4);

function nearest(src, grid) {
  const w = grid, h = Math.max(1, Math.round(grid * src.height / src.width));
  const out = new PNG({ width: w * 2, height: h * 2 });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(src.width - 1, Math.floor((x + 0.5) * src.width / w));
    const sy = Math.min(src.height - 1, Math.floor((y + 0.5) * src.height / h));
    const s = (sy * src.width + sx) * 4;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) src.data.copy(out.data, ((y * 2 + dy) * w * 2 + x * 2 + dx) * 4, s, s + 4);
  }
  return out;
}
// Box filter with premultiplied alpha, so transparent edges do not pick up dark fringes.
function average(src, w) {
  const h = Math.max(1, Math.round(w * src.height / src.width));
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * src.height / h), y1 = Math.max(y0 + 1, Math.floor((y + 1) * src.height / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * src.width / w), x1 = Math.max(x0 + 1, Math.floor((x + 1) * src.width / w));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
        const i = (sy * src.width + sx) * 4, al = src.data[i + 3];
        r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al; a += al; n++;
      }
      const o = (y * w + x) * 4;
      if (a) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); }
      out.data[o + 3] = Math.round(a / n);
    }
  }
  return out;
}
function shrink(file, key) {
  const raw = fs.readFileSync(file), src = PNG.sync.read(raw);
  const target = smooth ? (key.startsWith('tiles/') ? 320 : gridOf(key) * artRes) : gridOf(key) * 2;
  if (src.width <= target) return raw;
  return PNG.sync.write(smooth ? average(src, target) : nearest(src, gridOf(key)));
}
const assets = path.join(from, 'assets');
let count = 0, before = 0, after = 0;
for (const file of fs.existsSync(assets) ? fs.readdirSync(assets, { recursive: true }) : []) {
  const full = path.join(assets, file), rel = file.split(path.sep).join('/');
  // ui/poster.png is the promotional poster: the blog uses it as the project cover, the game never loads it.
  if (!/\.(png|jpe?g|webp)$/i.test(file) || rel.startsWith('backups/') || rel === 'ui/poster.png' || !fs.statSync(full).isFile()) continue;
  const key = rel.replace(/\.png$/, '');
  // Photos such as the menu background (style.css) are copied as they are; only the PNG art is shrunk.
  const data = !rel.endsWith('.png') || key.startsWith('_') ? fs.readFileSync(full) : shrink(full, key);
  fs.mkdirSync(path.dirname(path.join(to, 'assets', file)), { recursive: true });
  fs.writeFileSync(path.join(to, 'assets', file), data);
  count++; before += fs.statSync(full).size; after += data.length;
}
console.log(`Synced the legion game into ${path.relative(process.cwd(), to)} (${[...new Set(pages)].join(', ')}): ${count} images, ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
