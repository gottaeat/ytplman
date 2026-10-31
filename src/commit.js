import { setTimeout as pause } from 'node:timers/promises';
import { plan } from '../public/model.js';
import { AppError } from './youtube.js';

const validId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 512;
export function validateCommit(snapshot, order) {
  if (
    !snapshot ||
    typeof snapshot.id !== 'string' ||
    !/^[\w-]{2,128}$/u.test(snapshot.id) ||
    typeof snapshot.owner !== 'string' ||
    snapshot.owner.length > 128 ||
    !Array.isArray(snapshot.items) ||
    snapshot.items.length > 10000 ||
    !snapshot.items.every((item) => item && validId(item.id) && validId(item.videoId)) ||
    !Array.isArray(order) ||
    order.length > 10000 ||
    !order.every(validId)
  ) {
    throw new AppError('Invalid playlist. Load it again.');
  }
  try {
    return plan(snapshot.items, order);
  } catch {
    throw new AppError('Invalid playlist order. Load it again.');
  }
}

function same(actual, expected) {
  return (
    actual.length === expected.length &&
    actual.every(
      (item, index) => item.id === expected[index].id && item.videoId === expected[index].videoId,
    )
  );
}

export async function commit(
  client,
  snapshot,
  order,
  { send, stopped = () => false, delay = 1000 } = {},
) {
  const { removed, moves } = validateCommit(snapshot, order);
  const total = removed.length + moves.length + 1;
  if (total === 1) throw new AppError('There are no changes to commit.');
  const checkConnection = () => {
    if (stopped()) throw new AppError('Connection closed. Load the playlist again.');
  };
  const live = await client.read(snapshot.id);
  if (live.owner !== snapshot.owner || !same(live.items, snapshot.items)) {
    throw new AppError('The playlist changed on YouTube. Load it again before committing.');
  }
  let done = 0,
    lastWrite = 0;
  const progress = (message) => send({ type: 'progress', done, total, message });
  progress('Playlist checked.');
  const write = async (message, action) => {
    checkConnection();
    if (lastWrite) await pause(Math.max(0, delay - (Date.now() - lastWrite)));
    checkConnection();
    progress(message);
    lastWrite = Date.now();
    await action();
    done++;
    progress(message);
  };
  for (const item of removed) {
    await write('Removing a song…', () => client.remove(snapshot.id, item.id));
  }
  for (const move of moves) {
    await write('Reordering songs…', () => client.move(snapshot.id, move.id, move.before));
  }
  checkConnection();
  progress('Checking the final playlist…');
  const result = await client.read(snapshot.id);
  const byId = new Map(snapshot.items.map((item) => [item.id, item]));
  if (
    result.owner !== snapshot.owner ||
    !same(
      result.items,
      order.map((id) => byId.get(id)),
    )
  ) {
    throw new AppError('Final verification failed. Load the playlist again to check what changed.');
  }
  send({
    type: 'done',
    done: total,
    total,
    message: 'Committed. Playlist verified.',
    snapshot: result,
  });
}
