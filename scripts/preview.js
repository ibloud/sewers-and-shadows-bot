'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { bundle } = require('./build.js');
const assets = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
for(const f of ['chapter.js','story.js','cards.js','products.js','media.js','vendor/ink-full.js']) assets['/'+f]=[f,'text/javascript'];
assets['/symbol.png']=['symbol.png','image/png'];
const server = http.createServer((req, res) => {
  let url = new URL(req.url, 'http://localhost').pathname;
  const base=process.env.PREVIEW_BASE_PATH||'';
  if(base){if(!url.startsWith(base+'/')){res.writeHead(404);return res.end('Not found');}url=url.slice(base.length);}
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'none'; img-src 'self' data: https://images.squarespace-cdn.com; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-src https://www.youtube-nocookie.com; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  if (url === '/game.js') { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); return res.end(bundle()); }
  if (!assets[url]) { res.writeHead(404); return res.end('Not found'); }
  const [file, type] = assets[url];
  res.setHeader('Content-Type', type + '; charset=utf-8');
  res.end(fs.readFileSync(path.join(__dirname, '..', 'browser', file)));
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log('Float Chess review: http://127.0.0.1:' + server.address().port));
