'use strict';
// Copy the playable files of the legion game into source/games/legion/.
// Usage: node tools/games/sync-legion.cjs <game folder>
const fs = require('node:fs');
const path = require('node:path');
const from = process.argv[2];
if (!from || !fs.existsSync(path.join(from, 'game.js'))) throw new Error('Pass the game folder that holds index.html, style.css, data.js and game.js.');
const to = path.join(__dirname, '..', '..', 'source', 'games', 'legion');
fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to, { recursive: true });
for (const file of ['index.html', 'style.css', 'data.js', 'game.js']) fs.copyFileSync(path.join(from, file), path.join(to, file));
if (fs.existsSync(path.join(from, 'assets'))) fs.cpSync(path.join(from, 'assets'), path.join(to, 'assets'), { recursive: true });
console.log('Synced the legion game into ' + path.relative(process.cwd(), to));
