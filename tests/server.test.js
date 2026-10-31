import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { createApp, playlistId } from '../src/server.js';
import { parseCookie, authenticatedFetch, operations } from '../src/youtube.js';
const snapshot = {
  id: 'PLtest',
  owner: 'me',
  title: 'Test',
  items: ['a', 'b', 'c'].map((id) => ({ id, videoId: id, channel: 'Artist', title: id })),
};

async function withServer(run, clientFactory) {
  const server = createApp({ clientFactory, delay: 0 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
const post = (url, data, headers = {}) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });

test('playlist links accept YouTube/Music and reject unrelated hosts or missing IDs', () => {
  assert.equal(playlistId('https://music.youtube.com/playlist?list=PLabc'), 'PLabc');
  assert.equal(playlistId('PLabc'), 'PLabc');
  for (const value of [
    'https://example.com/?list=PLx',
    'https://youtube.com/watch?v=abc',
    '',
    null,
  ])
    assert.throws(() => playlistId(value));
});

test('native HTTP serves only explicit files; rejects cross-site and rebinding requests', async () => {
  let calls = 0;
  await withServer(
    async (base) => {
      const response = await fetch(base);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /ytplman/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('set-cookie'), null);
      assert.equal((await fetch(base + '/package.json')).status, 404);
      const rebinding = await new Promise((resolve, reject) => {
        request(base, { headers: { Host: 'evil.example' } }, (response) => {
          response.resume();
          resolve(response.statusCode);
        })
          .on('error', reject)
          .end();
      });
      assert.equal(rebinding, 421);
      assert.equal(
        (
          await post(
            base + '/api/load',
            { cookie: 'private', playlist: 'PLtest' },
            { Origin: 'https://evil.example' },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await post(
            base + '/api/load',
            { cookie: 'private', playlist: 'PLtest' },
            { 'Sec-Fetch-Site': 'cross-site' },
          )
        ).status,
        403,
      );
      const malformed = await fetch(base + '/api/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"cookie":"private"',
      });
      assert.equal(malformed.status, 400);
      assert.ok(!(await malformed.text()).includes('private'));
      assert.equal(calls, 0);
    },
    async () => {
      calls++;
    },
  );
});

test('load and streaming commit have no session, job or persistence protocol', async () => {
  const live = structuredClone(snapshot),
    writes = [];
  const client = {
    async read() {
      return structuredClone(live);
    },
    async remove(id, entry) {
      writes.push(entry);
      live.items = live.items.filter((item) => item.id !== entry);
    },
    async move(id, entry, before) {
      writes.push(entry);
      const [item] = live.items.splice(
        live.items.findIndex((row) => row.id === entry),
        1,
      );
      live.items.splice(
        live.items.findIndex((row) => row.id === before),
        0,
        item,
      );
    },
  };
  await withServer(
    async (base) => {
      assert.deepEqual(
        await (await post(base + '/api/load', { cookie: 'demo', playlist: 'PLtest' })).json(),
        snapshot,
      );
      const response = await post(base + '/api/commit', {
        cookie: 'demo',
        snapshot,
        order: ['c', 'a'],
      });
      assert.match(response.headers.get('content-type'), /ndjson/);
      const events = (await response.text())
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.equal(events.at(-1).type, 'done');
      assert.deepEqual(writes, ['b', 'c']);
      const replay = await post(base + '/api/commit', {
        cookie: 'demo',
        snapshot,
        order: ['c', 'a'],
      });
      assert.match(await replay.text(), /changed/);
      assert.deepEqual(writes, ['b', 'c']);
    },
    async () => client,
  );
});

test('parallel commits are rejected while a write is pending', async () => {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const live = structuredClone(snapshot);
  await withServer(
    async (base) => {
      const data = { cookie: 'demo', snapshot, order: ['a', 'b'] };
      const first = await post(base + '/api/commit', data);
      try {
        assert.equal((await post(base + '/api/commit', data)).status, 409);
      } finally {
        finish();
        await first.text();
      }
    },
    async () => ({
      async read() {
        return structuredClone(live);
      },
      async remove() {
        await pending;
        live.items.pop();
      },
    }),
  );
});

test('raw upstream errors are not returned to the browser', async () => {
  await withServer(
    async (base) => {
      const response = await post(base + '/api/load', { cookie: 'private', playlist: 'PLtest' });
      assert.equal(response.status, 500);
      assert.ok(!(await response.text()).includes('private'));
    },
    async () => {
      throw new Error('cookie=private');
    },
  );
});

test('cookie parser accepts header syntax and the secure equivalent, never echoing secrets', () => {
  assert.equal(parseCookie('Cookie: SAPISID=demo; SID=other'), 'SAPISID=demo; SID=other');
  assert.match(parseCookie('__Secure-3PAPISID=demo'), /SAPISID=demo/);
  for (const cookie of ['SID=private', 'SAPISID=private\nx', null]) {
    assert.throws(
      () => parseCookie(cookie),
      (error) => !error.message.includes('private'),
    );
  }
});

test('authenticated fetch detects signed-out responses without consuming their bodies', async () => {
  const signedOut = authenticatedFetch(async () =>
    Response.json({ responseContext: { mainAppWebResponseContext: { loggedOut: true } } }),
  );
  await assert.rejects(
    signedOut('https://www.youtube.com/youtubei/v1/browse', { headers: { Authorization: 'test' } }),
    /expired/,
  );
  const signedIn = authenticatedFetch(async () => Response.json({ ok: true }));
  assert.deepEqual(
    await (
      await signedIn('https://www.youtube.com/youtubei/v1/browse', {
        headers: { Authorization: 'test' },
      })
    ).json(),
    { ok: true },
  );
});

test('YouTube adapter paginates exact entry IDs and refuses read-only or incomplete lists', async () => {
  const calls = [];
  const client = operations({
    async getPlaylist() {
      return {
        info: { title: 'Test', is_editable: true },
        items: [{ id: 'video', set_video_id: 'a', title: 'Song', author: { name: 'Artist' } }],
        has_continuation: true,
        async getContinuation() {
          return {
            items: [{ id: 'video', set_video_id: 'b', title: 'Song', author: { name: 'Artist' } }],
          };
        },
      };
    },
    actions: {
      async execute(path, data) {
        calls.push(data.actions[0]);
        return { success: true, data: { status: 'STATUS_SUCCEEDED' } };
      },
    },
  });
  assert.deepEqual(
    (await client.read('PLtest')).items.map((item) => item.id),
    ['a', 'b'],
  );
  await client.remove('PLtest', 'b');
  await client.move('PLtest', 'a', 'b');
  assert.deepEqual(calls, [
    { action: 'ACTION_REMOVE_VIDEO', setVideoId: 'b' },
    { action: 'ACTION_MOVE_VIDEO_BEFORE', setVideoId: 'a', movedSetVideoIdSuccessor: 'b' },
  ]);
  await assert.rejects(
    operations({
      async getPlaylist() {
        return { info: { is_editable: false } };
      },
    }).read('PLtest'),
    /cannot edit/i,
  );
  await assert.rejects(
    operations({
      async getPlaylist() {
        return { info: { is_editable: true }, items: [{ id: 'video' }] };
      },
    }).read('PLtest'),
    /incomplete/i,
  );
});
