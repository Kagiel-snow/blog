'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, locales } = require('./lib.cjs');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff' };
function createServer(directory = path.join(ROOT, 'public')) {
  if (!fs.existsSync(path.join(directory, 'i18n-routes.json'))) throw new Error('Run npm run build first.');
  return http.createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      let file = path.resolve(directory, '.' + pathname);
      const relative = path.relative(directory, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(403); res.end(); return; }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
        if (!url.pathname.endsWith('/')) { res.writeHead(301, { Location: url.pathname + '/' + url.search }); res.end(); return; }
        file = path.join(file, 'index.html');
      }
      let status = 200;
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        const locale = locales.find(l => l.root !== '/' && pathname.startsWith(l.root)) || locales[0];
        file = path.join(directory, locale.root, '404.html'); status = 404;
      }
      const size = fs.statSync(file).size;
      let start = 0, end = size - 1;
      const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
      if (req.headers.range && status === 200) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (match && (match[1] || match[2])) {
          start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
          end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
          if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
          status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
        }
      }
      headers['Content-Length'] = Math.max(0, end - start + 1);
      res.writeHead(status, headers);
      if (req.method === 'HEAD' || !size) res.end(); else fs.createReadStream(file, { start, end }).pipe(res);
    } catch { if (!res.headersSent) res.writeHead(400); res.end(); }
  });
}
if (require.main === module) {
  const port = Number(process.env.PORT || 4000);
  const server = createServer();
  server.on('error', e => { console.error(e.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port} (Ctrl+C to stop)`));
}
module.exports = { createServer };
