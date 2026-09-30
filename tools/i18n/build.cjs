'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, locales, files, within, slash, inspectContent, loadTaxonomy, config, readPost } = require('./lib.cjs');
const { finalize } = require('./html.cjs');
const { check } = require('./check.cjs');
function build({ contentRoot = ROOT, publish = true } = {}) {
  if (new URL(config.url).pathname.replace(/\/$/, '')) throw new Error('This site uses domain-root language paths. Keep the custom domain URL, or migrate root paths explicitly before using a GitHub repository subpath.');
  inspectContent(contentRoot);
  loadTaxonomy(contentRoot);
  const runDir = path.join(ROOT, 'work', 'i18n', `${Date.now()}-${process.pid}`);
  fs.mkdirSync(runDir, { recursive: true });
  const records = [];
  for (const locale of locales) {
    const dir = path.join(runDir, locale.id);
    const source = path.join(dir, 'source');
    fs.cpSync(path.join(contentRoot, locale.source), source, { recursive: true, preserveTimestamps: true,
      // Hexo's page generator does not honor published:false itself.
      filter: file => !fs.statSync(file).isFile() || !/\.(md|markdown)$/i.test(file) || readPost(file).published !== false });
    // Mirror only shared static files. Never copy Chinese Markdown into a translated site.
    if (locale.id !== 'zh-CN') for (const file of files(path.join(contentRoot, 'source'))) {
      const rel = path.relative(path.join(contentRoot, 'source'), file);
      if (slash(rel).split('/').some(s => s.startsWith('_')) || /\.(md|markdown|html?|pug|ejs|swig|njk)$/i.test(file)) continue;
      const target = path.join(source, rel);
      if (!fs.existsSync(target)) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(file, target); }
    }
    const r = spawnSync(process.execPath, [path.join(__dirname, 'worker.cjs'), locale.id, dir, contentRoot], {
      cwd: ROOT, env: { ...process.env, TZ: 'Asia/Tokyo' }, encoding: 'utf8'
    });
    if (r.status !== 0) throw new Error(`${locale.id} build failed:\n${r.stdout}\n${r.stderr}`);
    console.log(r.stdout.trim());
    if (r.stderr.trim()) console.error(r.stderr.trim());
    records.push(...JSON.parse(fs.readFileSync(path.join(dir, 'routes.json'), 'utf8')));
  }
  const output = path.join(runDir, 'site');
  for (const locale of locales) {
    fs.cpSync(path.join(runDir, locale.id, 'public'), path.join(output, locale.root.slice(1)), { recursive: true });
  }
  finalize(output, records);
  check(output);
  if (publish) {
    const live = path.join(ROOT, 'public');
    const backup = path.join(runDir, 'previous-public');
    // Both paths are fixed generated directories; the old output is retained for rollback.
    within(ROOT, live); within(path.join(ROOT, 'work'), backup);
    if (fs.existsSync(live)) fs.renameSync(live, backup);
    try { fs.renameSync(output, live); }
    catch (e) { if (fs.existsSync(backup)) fs.renameSync(backup, live); throw e; }
    console.log('Verified multilingual site is ready in public/. Previous output retained in ' + path.relative(ROOT, backup));
    return live;
  }
  return output;
}
if (require.main === module) {
  try { build(); } catch (e) { console.error(e.stack); process.exitCode = 1; }
}
module.exports = { build };
