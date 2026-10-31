import test from 'node:test';
import assert from 'node:assert/strict';
import { sortUnique, reorder, nudge, plan } from '../public/model.js';
const make = (...ids) => ids.map((id) => ({ id }));
const ids = (items) => items.map((item) => item.id);

test('A–Z uses literal channel then title; exact pairs dedupe, keeping the first', () => {
  const input = [
    { id: '1', channel: 'Z', title: 'One' },
    { id: '2', channel: 'Air', title: 'Two' },
    { id: '3', channel: 'Air', title: 'One' },
    { id: '4', channel: 'Air', title: 'One' },
    { id: '5', channel: 'air', title: 'One' },
    { id: '6', channel: 'Other', title: 'One' },
    { id: '7', channel: 'Air', title: 'One ' },
  ];
  const saved = structuredClone(input),
    result = sortUnique(input);
  assert.deepEqual(ids(result), ['3', '5', '7', '2', '6', '1']);
  assert.deepEqual(input, saved);
});

test('multi-song drag preserves relative order and ignores a drop onto the selection', () => {
  const input = make('a', 'b', 'c', 'd', 'e'),
    picked = new Set(['d', 'b']);
  assert.deepEqual(ids(reorder(input, picked, 'a')), ['b', 'd', 'a', 'c', 'e']);
  assert.deepEqual(ids(reorder(input, picked)), ['a', 'c', 'e', 'b', 'd']);
  assert.deepEqual(reorder(input, picked, 'd'), input);
  assert.deepEqual(reorder(input, picked, 'missing'), input);
});

test('up/down moves selected groups once, without crossing the list edges', () => {
  const input = make('a', 'b', 'c', 'd', 'e'),
    picked = new Set(['b', 'c', 'e']);
  assert.deepEqual(ids(nudge(input, picked, -1)), ['b', 'c', 'a', 'e', 'd']);
  assert.deepEqual(ids(nudge(input, picked, 1)), ['a', 'd', 'b', 'c', 'e']);
  assert.deepEqual(ids(nudge(make('a', 'b'), new Set(['a', 'b']), 1)), ['a', 'b']);
});

test('plans replay exactly for every subset and permutation of five entries', () => {
  function permutations(values) {
    if (!values.length) return [[]];
    return values.flatMap((value) =>
      permutations(values.filter((v) => v !== value)).map((rest) => [value, ...rest]),
    );
  }
  const input = make('a', 'b', 'c', 'd', 'e');
  for (let mask = 0; mask < 32; mask++) {
    for (const target of permutations(ids(input).filter((id, i) => mask & (1 << i)))) {
      const { removed, moves } = plan(input, target);
      const working = ids(input).filter((id) => !removed.some((item) => item.id === id));
      for (const { id, before } of moves) {
        working.splice(working.indexOf(id), 1);
        working.splice(working.indexOf(before), 0, id);
      }
      assert.deepEqual(working, target);
    }
  }
  assert.throws(() => plan(input, ['a', 'a']));
  assert.throws(() => plan(input, ['unknown']));
});
