const alphabet = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

export function sortUnique(items) {
  const seen = new Set();
  return items
    .filter((item) => {
      const key = JSON.stringify([item.channel, item.title]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => alphabet.compare(a.channel, b.channel) || alphabet.compare(a.title, b.title));
}

export function reorder(items, selection, before = null) {
  if (selection.has(before)) return items;
  const picked = items.filter((item) => selection.has(item.id));
  const rest = items.filter((item) => !selection.has(item.id));
  const index = before === null ? rest.length : rest.findIndex((item) => item.id === before);
  if (index < 0 || !picked.length) return items;
  return [...rest.slice(0, index), ...picked, ...rest.slice(index)];
}

export function nudge(items, selection, direction) {
  const result = [...items];
  for (
    let i = direction < 0 ? 1 : result.length - 2;
    direction < 0 ? i < result.length : i >= 0;
    i -= direction
  ) {
    const neighbor = i + direction;
    if (selection.has(result[i].id) && !selection.has(result[neighbor].id)) {
      [result[i], result[neighbor]] = [result[neighbor], result[i]];
    }
  }
  return result;
}

export function plan(original, order) {
  const known = new Set(original.map((item) => item.id));
  const wanted = new Set(order);
  if (
    known.size !== original.length ||
    wanted.size !== order.length ||
    order.some((id) => !known.has(id))
  ) {
    throw new Error('Invalid playlist order. Load the playlist again.');
  }
  const removed = original.filter((item) => !wanted.has(item.id));
  const working = original.filter((item) => wanted.has(item.id)).map((item) => item.id);
  const moves = [];
  for (let to = 0; to < order.length; to++) {
    if (working[to] === order[to]) continue;
    const from = working.indexOf(order[to]);
    moves.push({ id: order[to], before: working[to] });
    working.splice(to, 0, working.splice(from, 1)[0]);
  }
  return { removed, moves };
}
