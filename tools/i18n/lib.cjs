'use strict';
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const matter = require('hexo-front-matter');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const allLocales = require('../../i18n/locales.json');
// Only Chinese is published; the language menu translates this source on demand.
const locales = allLocales.filter(l => l.id === 'zh-CN');
const taxonomy = require('../../i18n/taxonomies.json');
const legacy = require('../../i18n/legacy-routes.json');
const config = yaml.load(fs.readFileSync(path.join(ROOT, '_config.yml'), 'utf8'));
const origin = new URL(config.url).origin;
const slash = s => s.split(path.sep).join('/');
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const encodePath = s => s.split('/').map(x => encodeURIComponent(decodeURIComponent(x))).join('/');
function files(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) throw new Error(`Symbolic links are not supported in content: ${p}`);
    return e.isDirectory() ? files(p) : [p];
  });
}
function readPost(file) { return matter.parse(fs.readFileSync(file, 'utf8')); }
function write(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); }
function within(base, target) {
  const rel = path.relative(path.resolve(base), path.resolve(target));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Unsafe generated path: ${target}`);
  return target;
}
function documentKey(doc, relative, post) {
  if (post) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(doc.translation_key || '')) throw new Error(`Post requires a stable translation_key: ${relative}`);
    return `post:${doc.translation_key}`;
  }
  return `page:${doc.translation_key || relative.replace(/(?:\/index)?\.(md|markdown|html)$/i, '')}`;
}
function taxonomyKey(kind, name, lang, registry = taxonomy) {
  const match = Object.entries(registry[kind] || {}).find(([, t]) => t.names?.[lang] === name);
  return match ? match[0] : `unmapped:${lang}:${name}`;
}
function loadTaxonomy(contentRoot = ROOT) {
  const file = path.join(contentRoot, 'i18n/taxonomies.json');
  const registry = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : taxonomy;
  for (const kind of ['tags', 'categories']) for (const l of locales) {
    const names = new Set(), slugs = new Set();
    for (const [id, term] of Object.entries(registry[kind] || {})) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Invalid taxonomy id: ${id}`);
      const name = term.names?.[l.id], slug = term.slugs?.[l.id];
      if (name && names.has(name)) throw new Error(`Duplicate ${kind} name: ${l.id} ${name}`);
      if (slug && (slugs.has(slug) || /[\\/?#]|^\./.test(slug))) throw new Error(`Invalid/duplicate taxonomy slug: ${slug}`);
      if (name) names.add(name); if (slug) slugs.add(slug);
    }
  }
  return registry;
}
function routeUrl(root, route) { return encodePath(root + route.replace(/^\//, '').replace(/index\.html$/, '')); }
function canonical(urlPath) {
  const u = new URL(urlPath, origin);
  u.search = ''; u.hash = '';
  if (config.pretty_urls?.trailing_index !== false && u.pathname.endsWith('/')) u.pathname += 'index.html';
  return u.href;
}
function translations(records, key) { return records.filter(r => r.key === key && !r.noindex); }
function targetFor(record, locale, records) {
  if (record.noindex) return { url: locale.root, exact: false };
  const exact = records.find(r => r.key === record.key && r.lang === locale.id && !r.noindex);
  if (exact) return { url: exact.url, exact: true };
  let url = locale.root;
  if (record.kind === 'tag') url += 'tags/';
  else if (record.kind === 'category') url += 'categories/';
  else if (record.kind === 'archive') url += 'archives/';
  return { url: `${url}?missing=${encodeURIComponent(record.key)}#missing-${encodeURIComponent(record.key)}`, exact: false };
}
// Preserve raw technical fragments. Only prose is intended for localization.
function protectedParts(text) {
  const parts = [];
  let rest = text.replace(/^(`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?^\1[^\S\r\n]*$/gm, m => { parts.push(m); return ''; });
  rest = rest.replace(/(`+)([^\n]*?)\1/g, m => { parts.push(m); return ''; });
  rest = rest.replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\$)[^\n$]+(?<!\\)\$/g, m => { parts.push(m); return ''; });
  const destinations = /!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)|^\s*\[[^\]]+\]:\s*(\S+)|https?:\/\/[^\s<>"')]+|(?:src|href)=["']([^"']+)["']/gm;
  for (const m of rest.matchAll(destinations)) parts.push(m[1] || m[2] || m[3] || m[0]);
  for (const m of rest.matchAll(/{%[\s\S]*?%}|{{[\s\S]*?}}/g)) parts.push(m[0]);
  return parts.map(s => s.replace(/\r\n/g, '\n')).sort();
}
function inspectContent(contentRoot = ROOT) {
  const docs = [], seen = new Set();
  for (const locale of locales) {
    const src = path.join(contentRoot, locale.source);
    if (!fs.existsSync(src)) throw new Error(`Missing source for ${locale.id}: ${src}`);
    for (const file of files(src).filter(f => /\.(md|markdown)$/i.test(f))) {
      const relative = slash(path.relative(src, file));
      if (relative.startsWith('_drafts/')) continue;
      const doc = readPost(file);
      if (doc.published === false) continue;
      if (doc.lang && doc.lang !== locale.id) throw new Error(`Language mismatch: ${file}`);
      const post = relative.startsWith('_posts/');
      if (!post && relative.split('/').some(p => p.startsWith('_'))) continue;
      const key = documentKey(doc, relative, post);
      if (seen.has(`${locale.id}:${key}`)) throw new Error(`Duplicate translation: ${locale.id} ${key}`);
      seen.add(`${locale.id}:${key}`);
      if (post && (!doc.date || !doc.updated)) throw new Error(`Post requires explicit date and updated: ${file}`);
      if (doc.permalink && (doc.permalink.includes('..') || /[?#]|^[a-z]+:/i.test(doc.permalink))) throw new Error(`Invalid permalink: ${file}`);
      for (const field of ['date', 'updated']) if (doc[field] && Number.isNaN(new Date(doc[field]).getTime())) throw new Error(`Invalid ${field}: ${file}`);
      docs.push({ file, relative, locale, key, post, doc });
    }
  }
  for (const item of docs.filter(d => d.post && d.locale.id !== 'zh-CN')) {
    const original = docs.find(d => d.key === item.key && d.locale.id === 'zh-CN');
    if (!original) throw new Error(`Translation has no Chinese source: ${item.file}`);
    const a = protectedParts(original.doc._content), b = protectedParts(item.doc._content);
    if (JSON.stringify(a) !== JSON.stringify(b) && item.doc.technical_changes_reviewed !== true) throw new Error(`Protected code, math or URLs differ: ${item.file}. Review explicitly before setting technical_changes_reviewed.`);
    const revision = 'sha256:' + crypto.createHash('sha256').update(original.doc._content.replace(/\r\n/g, '\n')).digest('hex');
    if (item.doc.source_revision?.startsWith('sha256:') && item.doc.source_revision !== revision) console.warn(`Source changed; review translation: ${item.file}`);
  }
  return docs;
}
module.exports = { ROOT, locales, allLocales, taxonomy, loadTaxonomy, legacy, config, origin, slash, files, write, within, readPost, escape, encodePath, documentKey, taxonomyKey, routeUrl, canonical, translations, targetFor, protectedParts, inspectContent };
