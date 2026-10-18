const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = new Set(['index.html', 'styles.css', 'script.js', 'form-config.json', 'map.js', 'data.js']);
const types = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json'};
http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (request.method !== 'GET' || !files.has(file)) { response.writeHead(404); response.end(); return; }
  fs.readFile(path.join(__dirname, '..', file), (error, contents) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, {'Content-Type': types[path.extname(file)], 'Cache-Control':'no-store'});
    response.end(contents);
  });
}).listen(4173, '127.0.0.1');
