import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { youtube, AppError } from './youtube.js';
import { commit } from './commit.js';

export function playlistId(value) {
  if (typeof value !== 'string') throw new AppError('Missing playlist.');
  let id = value.trim();
  if (id.includes('://')) {
    let url;
    try { url = new URL(id); } catch { throw new AppError('Invalid playlist URL.'); }
    if (!['http:', 'https:'].includes(url.protocol) || !['youtube.com', 'www.youtube.com', 'music.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) {
      throw new AppError('Use a YouTube playlist URL.');
    }
    id = url.searchParams.get('list') || '';
  }
  if (!/^[\w-]{2,128}$/u.test(id)) throw new AppError('Invalid playlist ID.');
  return id;
}

async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError('Expected JSON.');
  const parts = []; let size = 0;
  for await (const part of req) {
    if ((size += part.length) > 8 * 1024 * 1024) throw new AppError('Request too large.');
    parts.push(part);
  }
  try { return JSON.parse(Buffer.concat(parts).toString()); }
  catch { throw new AppError('Invalid JSON.'); }
}
const files = {
  '/': ['index.html', 'text/html'], '/app.css': ['app.css', 'text/css'],
  '/app.js': ['app.js', 'text/javascript'], '/model.js': ['model.js', 'text/javascript'],
};
export function createApp({ clientFactory = youtube, delay = 1000 } = {}) {
  let busy = false;
  return createServer(async (req, res) => {
    let locked = false, closed = false;
    const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    const send = (data) => { if (!closed) res.write(JSON.stringify(data) + '\n'); };
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
      const hosts = ['localhost', '127.0.0.1', '[::1]'].map((host) => `${host}:${res.socket.localPort}`);
      if (!hosts.includes(req.headers.host)) return json(421, { error: 'Unexpected Host.' });
      if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && !hosts.some((host) => req.headers.origin === 'http://' + host))) {
        return json(403, { error: 'Cross-origin request blocked.' });
      }
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/health') return json(200, { ok: true });
      if (req.method === 'GET' && files[path]) {
        const [name, type] = files[path];
        const content = await readFile(new URL(`../public/${name}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
        return res.end(content);
      }
      if (req.method !== 'POST' || !['/api/load', '/api/commit'].includes(path)) return json(404, { error: 'Not found.' });
      const data = await body(req);
      if (!data || typeof data.cookie !== 'string') throw new AppError('Missing cookie.');
      if (busy) return json(409, { error: 'Commit in progress.' });
      if (path === '/api/load') {
        const id = playlistId(data.playlist), client = await clientFactory(data.cookie);
        return json(200, await client.read(id));
      }
      busy = locked = true;
      res.on('close', () => { closed = true; });
      const client = await clientFactory(data.cookie);
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      await commit(client, data.snapshot, data.order, { send, stopped: () => closed, delay });
      res.end();
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'Request failed.';
      if (res.headersSent) { send({ type: 'error', message }); res.end(); }
      else json(error instanceof AppError ? 400 : 500, { error: message });
    } finally { if (locked) busy = false; }
  });
}
