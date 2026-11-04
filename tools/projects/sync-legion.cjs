'use strict';
// Copy the playable files of the legion game into source/projects/legion/.
// Usage: node tools/projects/sync-legion.cjs <game folder>
// The game draws every PNG at its pixel grid (PIXEL_GRID in game.js) with smoothing off, so the
// large source art is stored here at 2x its grid: each 2x2 block holds the colour the game would
// sample from the original, which keeps the result identical while the files shrink ~100x.
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const from = process.argv[2];
if (!from || !fs.existsSync(path.join(from, 'game.js'))) throw new Error('Pass the game folder that holds index.html, style.css, data.js and game.js.');
const to = path.join(__dirname, '..', '..', 'source', 'projects', 'legion');
fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to, { recursive: true });
for (const file of ['index.html', 'style.css', 'data.js', 'game.js']) fs.copyFileSync(path.join(from, file), path.join(to, file));

const source = fs.readFileSync(path.join(from, 'game.js'), 'utf8');
const literal = source.match(/const PIXEL_GRID = (\{[\s\S]*?\n\});/);
if (!literal) throw new Error('PIXEL_GRID not found in game.js');
const GRID = new Function(`return ${literal[1]}`)();
const gridOf = key => GRID[key] || GRID[key.split('/')[0]] || 64;

function shrink(file, grid) {
  const src = PNG.sync.read(fs.readFileSync(file));
  const w = grid, h = Math.max(1, Math.round(grid * src.height / src.width));
  if (src.width <= w * 2) return fs.readFileSync(file);
  const out = new PNG({ width: w * 2, height: h * 2 });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(src.width - 1, Math.floor((x + 0.5) * src.width / w));
    const sy = Math.min(src.height - 1, Math.floor((y + 0.5) * src.height / h));
    const s = (sy * src.width + sx) * 4;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) src.data.copy(out.data, ((y * 2 + dy) * w * 2 + x * 2 + dx) * 4, s, s + 4);
  }
  return PNG.sync.write(out);
}
const assets = path.join(from, 'assets');
let count = 0, before = 0, after = 0;
for (const file of fs.existsSync(assets) ? fs.readdirSync(assets, { recursive: true }) : []) {
  const full = path.join(assets, file);
  if (!file.endsWith('.png') || !fs.statSync(full).isFile()) continue;
  const key = file.split(path.sep).join('/').replace(/\.png$/, '');
  const data = key.startsWith('_') ? fs.readFileSync(full) : shrink(full, gridOf(key));
  fs.mkdirSync(path.dirname(path.join(to, 'assets', file)), { recursive: true });
  fs.writeFileSync(path.join(to, 'assets', file), data);
  count++; before += fs.statSync(full).size; after += data.length;
}
console.log(`Synced the legion game into ${path.relative(process.cwd(), to)}: ${count} images, ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
