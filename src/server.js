import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { youtube, AppError } from './youtube.js';
import { commit, validateCommit } from './commit.js';

export function playlistId(value) {
  if (typeof value !== 'string') throw new AppError('Paste a YouTube playlist link.');
  let id = value.trim();
  if (id.includes('://')) {
    let url;
    try {
      url = new URL(id);
    } catch {
      throw new AppError('Invalid playlist link.');
    }
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      ![
        'youtube.com',
        'www.youtube.com',
        'music.youtube.com',
        'm.youtube.com',
        'youtu.be',
      ].includes(url.hostname)
    ) {
      throw new AppError('Use a YouTube playlist link.');
    }
    id = url.searchParams.get('list') || '';
  }
  if (!/^[\w-]{2,128}$/u.test(id))
    throw new AppError('The link needs a valid playlist ID (list=…).');
  return id;
}

async function body(request) {
  if (!request.headers['content-type']?.startsWith('application/json'))
    throw new AppError('Expected JSON.');
  const parts = [];
  let size = 0;
  for await (const part of request) {
    size += part.length;
    if (size > 8 * 1024 * 1024) throw new AppError('Request is too large.');
    parts.push(part);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString());
  } catch {
    throw new AppError('Invalid JSON.');
  }
}

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.css', ['app.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/model.js', ['model.js', 'text/javascript; charset=utf-8']],
]);

export function createApp({ clientFactory = youtube, delay = 1000, origin } = {}) {
  let busy = false;
  return createServer(async (req, res) => {
    const json = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    let streaming = false;
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
      const port = res.socket.localPort;
      const origins = new Set([
        `http://localhost:${port}`,
        `http://127.0.0.1:${port}`,
        `http://[::1]:${port}`,
      ]);
      if (origin) origins.add(new URL(origin).origin);
      const hosts = new Set([...origins].map((value) => new URL(value).host));
      if (!hosts.has(req.headers.host)) return json(421, { error: 'Unexpected Host.' });
      if (
        req.headers['sec-fetch-site'] === 'cross-site' ||
        (req.headers.origin && !origins.has(req.headers.origin))
      ) {
        return json(403, { error: 'Cross-origin request blocked.' });
      }
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/health') return json(200, { ok: true });
      if (req.method === 'GET' && files.has(path)) {
        const [name, type] = files.get(path);
        const content = await readFile(new URL(`../public/${name}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': type });
        return res.end(content);
      }
      if (req.method !== 'POST' || !['/api/load', '/api/commit'].includes(path))
        return json(404, { error: 'Not found.' });
      if (busy) return json(409, { error: 'A commit is running. Wait for it to finish.' });
      const data = await body(req);
      if (!data || typeof data.cookie !== 'string')
        throw new AppError('Set your YouTube cookie first.');
      // Recheck after reading the body: concurrent requests can arrive together.
      if (busy) return json(409, { error: 'A commit is running. Wait for it to finish.' });
      if (path === '/api/load') {
        const id = playlistId(data.playlist);
        const client = await clientFactory(data.cookie);
        return json(200, await client.read(id));
      }
      validateCommit(data.snapshot, data.order);
      busy = true;
      let closed = false;
      res.on('close', () => {
        closed = true;
      });
      try {
        const client = await clientFactory(data.cookie);
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'X-Accel-Buffering': 'no' });
        streaming = true;
        res.flushHeaders();
        const send = (event) => {
          if (!closed) res.write(JSON.stringify(event) + '\n');
        };
        try {
          await commit(client, data.snapshot, data.order, { send, stopped: () => closed, delay });
        } catch (error) {
          send({
            type: 'error',
            message:
              error instanceof AppError
                ? error.message
                : 'Commit stopped. Load the playlist again to check its actual state.',
          });
        }
        res.end();
      } finally {
        busy = false;
      }
    } catch (error) {
      if (streaming || res.headersSent) return res.end();
      json(error instanceof AppError ? 400 : 500, {
        error:
          error instanceof AppError
            ? error.message
            : 'Request failed. Check the connection and try loading again.',
      });
    }
  });
}
