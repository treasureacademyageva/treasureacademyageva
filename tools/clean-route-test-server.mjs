#!/usr/bin/env node
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(await readFile(resolve(root, 'config/public-routes.json'), 'utf8'));
const sourceToClean = new Map(registry.routes.map((row) => [row.source, row.canonical]));
const cleanToSource = new Map(registry.routes.map((row) => [row.canonical, row.source]));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', 'http://test.local');
    const former = sourceToClean.get(requestUrl.pathname);
    if (former) {
      response.writeHead(308, { Location: former + requestUrl.search, 'Cache-Control': 'no-store' });
      return response.end();
    }
    const source = cleanToSource.get(requestUrl.pathname);
    const pathname = source || requestUrl.pathname;
    const file = resolve(root, '.' + decodeURIComponent(pathname));
    if (!file.startsWith(root + '/')) {
      response.writeHead(403, { 'Content-Type': 'text/plain' });
      return response.end('Forbidden');
    }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') return response.end();
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('Not found');
  }
});

server.listen(port, host, () => console.log(`Clean-route test server listening on http://${host}:${port}`));
