import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../worker/index.js';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://127.0.0.1:4187');
    if (u.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const r = await worker.fetch(
        new Request(u, {
          method: req.method,
          headers: req.headers,
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
        })
      );
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    const relative = decodeURIComponent(u.pathname === '/' ? 'index.html' : u.pathname.slice(1)),
      p = path.resolve('public', relative);
    if (!p.startsWith(path.resolve('public') + path.sep) || !fs.existsSync(p)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Content-Type', types[path.extname(p)] || 'application/octet-stream');
    res.end(fs.readFileSync(p));
  } catch (e) {
    res.writeHead(500);
    res.end('Preview error');
  }
});
server.listen(4187, '127.0.0.1', () => console.log('SoundSync preview: http://127.0.0.1:4187'));
