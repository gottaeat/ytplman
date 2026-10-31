import test from 'node:test';
import assert from 'node:assert/strict';
import { commit, validateCommit } from '../src/commit.js';
const snapshot = () => ({
  id: 'PLtest',
  owner: 'me',
  items: ['a', 'b', 'c', 'd'].map((id) => ({
    id,
    videoId: 'same-video',
    title: id,
    channel: 'Artist',
  })),
});
function fixture() {
  const initial = snapshot(),
    live = structuredClone(initial),
    calls = [],
    events = [];
  return {
    initial,
    live,
    calls,
    events,
    options: { delay: 0, send: (event) => events.push(event) },
    client: {
      async read() {
        calls.push('read');
        return structuredClone(live);
      },
      async remove(id, entry) {
        calls.push('remove:' + entry);
        live.items = live.items.filter((item) => item.id !== entry);
      },
      async move(id, entry, before) {
        calls.push('move:' + entry);
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
    },
  };
}

test('commit checks live state, removes exact entries, reorders, verifies and reaches 100%', async () => {
  const f = fixture();
  await commit(f.client, f.initial, ['d', 'b', 'a'], f.options);
  assert.deepEqual(f.calls, ['read', 'remove:c', 'move:d', 'move:b', 'read']);
  assert.deepEqual(
    f.live.items.map((item) => item.id),
    ['d', 'b', 'a'],
  );
  const last = f.events.at(-1);
  assert.equal(last.type, 'done');
  assert.equal(last.done, last.total);
  assert.ok(f.events.slice(0, -1).every((event) => event.done < event.total));
});

test('preflight rejects changes in owner, entries, videos or order before writing', async () => {
  for (const change of [
    (live) => {
      live.owner = 'someone';
    },
    (live) => {
      live.items.reverse();
    },
    (live) => {
      live.items[0].videoId = 'another';
    },
    (live) => {
      live.items.push({ id: 'x', videoId: 'x' });
    },
  ]) {
    const f = fixture();
    change(f.live);
    await assert.rejects(commit(f.client, f.initial, ['d', 'b', 'a'], f.options), /changed/);
    assert.deepEqual(f.calls, ['read']);
  }
});

test('an unconfirmed write is never retried or followed by another edit', async () => {
  const f = fixture();
  f.client.remove = async () => {
    f.calls.push('write');
    throw new Error('upstream');
  };
  await assert.rejects(commit(f.client, f.initial, ['d', 'b'], f.options));
  assert.deepEqual(f.calls, ['read', 'write']);
  assert.ok(!f.events.some((event) => event.type === 'done'));
});

test('disconnect stops before the next write; verification detects silent upstream failures', async () => {
  const f = fixture();
  await assert.rejects(
    commit(f.client, f.initial, ['d', 'b'], { ...f.options, stopped: () => true }),
    /closed/,
  );
  assert.deepEqual(f.calls, ['read']);
  f.client.move = async () => {};
  await assert.rejects(
    commit(f.client, f.initial, ['d', 'b', 'a', 'c'], f.options),
    /verification/,
  );
});

test('invalid snapshots and duplicate, invented or malformed targets are rejected', () => {
  for (const [base, target] of [
    [null, []],
    [snapshot(), ['a', 'a']],
    [snapshot(), ['invented']],
    [{ ...snapshot(), items: [{}] }, []],
    [snapshot(), null],
  ]) {
    assert.throws(() => validateCommit(base, target));
  }
});

test('deleting every song verifies an empty playlist', async () => {
  const f = fixture();
  await commit(f.client, f.initial, [], f.options);
  assert.deepEqual(f.live.items, []);
  assert.equal(f.events.at(-1).type, 'done');
});
