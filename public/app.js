import { sortUnique, reorder, nudge, plan } from './model.js';
const $ = (id) => document.getElementById(id);
let cookie = '',
  snapshot = null,
  items = [],
  selected = new Set(),
  busy = false,
  blocked = false,
  anchor = null,
  drag = null;
$('cookie-form').reset();
$('playlist-form').reset();
const ids = () => items.map((item) => item.id);
const changed = () =>
  !!snapshot &&
  (items.length !== snapshot.items.length ||
    items.some((item, i) => item.id !== snapshot.items[i]?.id));
function status(text, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
}
function controls() {
  const locked = busy || blocked || !snapshot;
  $('load').disabled = busy || !cookie;
  for (const input of $('cookie-form').elements) input.disabled = busy;
  $('playlist').disabled = busy;
  for (const id of ['sort', 'all']) $(id).disabled = locked || !items.length;
  for (const id of ['up', 'down', 'delete']) $(id).disabled = locked || !selected.size;
  for (const id of ['reset', 'commit']) $(id).disabled = locked || !changed();
  $('selected').textContent = `${selected.size} selected`;
  $('all').checked = !!items.length && selected.size === items.length;
  $('all').indeterminate = selected.size > 0 && selected.size < items.length;
  $('count').textContent = `${items.length} song${items.length === 1 ? '' : 's'}`;
  $('songs').setAttribute('aria-busy', String(busy));
}
function paintSelection() {
  for (const row of $('songs').querySelectorAll('.song')) {
    row.classList.toggle('picked', selected.has(row.dataset.id));
    row.querySelector('input').checked = selected.has(row.dataset.id);
  }
  controls();
}
function render() {
  const scroll = $('songs').scrollTop;
  const rows = document.createDocumentFragment();
  for (const [index, item] of items.entries()) {
    const row = document.createElement('div');
    row.className = 'song';
    row.dataset.id = item.id;
    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.textContent = '⠿';
    grip.title = 'Drag to reorder';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = selected.has(item.id);
    check.disabled = busy || blocked;
    check.setAttribute('aria-label', `Select ${item.title}`);
    const number = document.createElement('span');
    number.className = 'number';
    number.textContent = index + 1;
    const text = document.createElement('div');
    text.className = 'song-text';
    const title = document.createElement('strong');
    title.textContent = item.title;
    title.title = item.title;
    const artist = document.createElement('span');
    artist.textContent = item.channel || 'Unknown channel';
    artist.title = item.channel;
    text.append(title, artist);
    row.append(grip, check, number, text);
    rows.append(row);
  }
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = snapshot ? 'This playlist is empty.' : 'Your playlist will appear here.';
    rows.append(empty);
  }
  $('songs').replaceChildren(rows);
  $('songs').scrollTop = scroll;
  $('title').textContent = snapshot?.title || 'No playlist loaded';
  paintSelection();
}
function edit(next, message) {
  if (busy || blocked || !snapshot) return;
  items = next;
  const kept = new Set(ids());
  selected = new Set([...selected].filter((id) => kept.has(id)));
  render();
  status(message + ' Commit to apply.');
}
$('cookie-form').onsubmit = (event) => {
  event.preventDefault();
  const value = $('cookie').value.trim();
  if (!value || /[\r\n]/u.test(value))
    return status('Paste the Cookie header value on one line.', true);
  cookie = value;
  $('cookie').value = '';
  controls();
  status('Cookie set for this page. Load your playlist.');
  $('playlist').focus();
};
$('playlist-form').onsubmit = async (event) => {
  event.preventDefault();
  if (!cookie || busy) return;
  if (changed() && !blocked && !confirm('Discard the current edits and load this playlist?'))
    return;
  busy = true;
  controls();
  status('Loading playlist…');
  try {
    const response = await fetch('/api/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie, playlist: $('playlist').value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    snapshot = data;
    items = [...data.items];
    selected.clear();
    blocked = false;
    anchor = null;
    $('progress-panel').hidden = true;
    status('Loaded. Sort or arrange the songs, then commit.');
  } catch (error) {
    status(error.message || 'Could not load the playlist.', true);
  } finally {
    busy = false;
    render();
  }
};
$('sort').onclick = () => {
  const next = sortUnique(items),
    removed = items.length - next.length;
  edit(
    next,
    `Sorted A–Z by artist/channel. ${removed} duplicate${removed === 1 ? '' : 's'} removed.`,
  );
  $('songs').scrollTop = 0;
};
$('reset').onclick = () => {
  selected.clear();
  edit([...snapshot.items], 'Edits reset.');
};
$('all').onchange = () => {
  selected = $('all').checked ? new Set(ids()) : new Set();
  paintSelection();
};
$('delete').onclick = () => {
  const count = selected.size;
  edit(
    items.filter((item) => !selected.has(item.id)),
    `${count} song${count === 1 ? '' : 's'} removed.`,
  );
};
for (const [id, direction] of [
  ['up', -1],
  ['down', 1],
])
  $(id).onclick = () => edit(nudge(items, selected, direction), 'Selection moved.');
$('songs').onclick = (event) => {
  if (busy || blocked) return;
  const row = event.target.closest('.song');
  if (!row) return;
  if (drag?.active) return;
  const id = row.dataset.id;
  const choosing = event.target.matches('input') ? event.target.checked : !selected.has(id);
  if (event.shiftKey && anchor && ids().includes(anchor)) {
    const a = ids().indexOf(anchor),
      b = ids().indexOf(id);
    for (const item of items.slice(Math.min(a, b), Math.max(a, b) + 1)) {
      if (choosing) selected.add(item.id);
      else selected.delete(item.id);
    }
  } else if (choosing) selected.add(id);
  else selected.delete(id);
  anchor = id;
  paintSelection();
};
function clearDrop() {
  $('songs').classList.remove('drop-end');
  $('songs')
    .querySelectorAll('.drop-before')
    .forEach((row) => row.classList.remove('drop-before'));
}
function endDrag() {
  if (!drag) return;
  cancelAnimationFrame(drag.frame);
  clearDrop();
  $('songs')
    .querySelectorAll('.dragged')
    .forEach((row) => row.classList.remove('dragged'));
  if ($('songs').hasPointerCapture(drag.pointer)) $('songs').releasePointerCapture(drag.pointer);
  drag = null;
}
function markDrop() {
  clearDrop();
  const bounds = $('songs').getBoundingClientRect();
  drag.valid =
    drag.x >= bounds.left &&
    drag.x <= bounds.right &&
    drag.y >= bounds.top &&
    drag.y <= bounds.bottom;
  if (!drag.valid) return;
  const row = document.elementFromPoint(drag.x, drag.y)?.closest('.song');
  let before = row?.dataset.id || null;
  if (row && drag.y > row.getBoundingClientRect().top + row.offsetHeight / 2)
    before = row.nextElementSibling?.dataset.id || null;
  drag.before = before;
  if (before)
    [...$('songs').children]
      .find((child) => child.dataset.id === before)
      ?.classList.add('drop-before');
  else $('songs').classList.add('drop-end');
}
function scrollDrag() {
  if (!drag?.active) return;
  const box = $('songs'),
    bounds = box.getBoundingClientRect();
  if (drag.valid) {
    const speed = drag.y < bounds.top + 40 ? -12 : drag.y > bounds.bottom - 40 ? 12 : 0;
    if (speed) {
      box.scrollTop += speed;
      markDrop();
    }
  }
  drag.frame = requestAnimationFrame(scrollDrag);
}
$('songs').onpointerdown = (event) => {
  if (busy || blocked || event.button !== 0 || event.target.closest('input')) return;
  const row = event.target.closest('.song');
  if (!row) return;
  drag = {
    pointer: event.pointerId,
    id: row.dataset.id,
    x: event.clientX,
    y: event.clientY,
    active: false,
    valid: false,
    before: null,
  };
};
$('songs').onpointermove = (event) => {
  if (!drag || event.pointerId !== drag.pointer) return;
  if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
  if (!drag.active) {
    drag.active = true;
    $('songs').setPointerCapture(event.pointerId);
    if (!selected.has(drag.id)) selected = new Set([drag.id]);
    paintSelection();
    $('songs')
      .querySelectorAll('.song')
      .forEach((row) => row.classList.toggle('dragged', selected.has(row.dataset.id)));
    drag.frame = requestAnimationFrame(scrollDrag);
  }
  event.preventDefault();
  drag.x = event.clientX;
  drag.y = event.clientY;
  markDrop();
};
$('songs').onpointerup = (event) => {
  if (!drag || event.pointerId !== drag.pointer) return;
  const { active, valid, before } = drag;
  // Suppress the synthetic click after dragging, before clearing pointer state.
  if (active)
    $('songs').addEventListener('click', (click) => click.stopImmediatePropagation(), {
      once: true,
      capture: true,
    });
  endDrag();
  if (active && valid) edit(reorder(items, selected, before), 'Songs reordered.');
};
$('songs').onpointercancel = endDrag;
$('songs').onlostpointercapture = endDrag;
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') endDrag();
});

function changeRow(label, item, removed = false) {
  const row = document.createElement('div');
  row.className = 'change';
  const marker = document.createElement('span');
  marker.textContent = label;
  if (removed) marker.className = 'removed';
  const text = document.createElement('span');
  text.textContent = `${item.channel || 'Unknown channel'} / ${item.title}`;
  row.append(marker, text);
  return row;
}
$('commit').onclick = () => {
  const { removed, moves } = plan(snapshot.items, ids());
  $('summary').textContent =
    `${snapshot.items.length} → ${items.length} songs. ${removed.length} deletion${removed.length === 1 ? '' : 's'}, ${moves.length} reorder operation${moves.length === 1 ? '' : 's'}.`;
  const content = $('changes');
  content.replaceChildren();
  if (removed.length) {
    const heading = document.createElement('h3');
    heading.textContent = 'Delete from playlist';
    content.append(heading);
    for (const item of removed) content.append(changeRow('− delete', item, true));
  }
  const heading = document.createElement('h3');
  heading.textContent = 'Final order (old → new position)';
  content.append(heading);
  const positions = new Map(snapshot.items.map((item, index) => [item.id, index + 1]));
  for (const [index, item] of items.entries()) {
    const from = positions.get(item.id),
      to = index + 1;
    content.append(changeRow(from === to ? String(to) : `${from} → ${to}`, item));
  }
  if (!items.length) {
    const p = document.createElement('p');
    p.textContent = 'Empty playlist — every song will be removed.';
    content.append(p);
  }
  $('review').showModal();
  $('close-review').focus();
};
$('close-review').onclick = () => $('review').close();
$('confirm').onclick = async () => {
  if (busy || blocked || !changed()) return;
  $('review').close();
  busy = true;
  controls();
  render();
  $('progress-panel').hidden = false;
  $('progress').value = 0;
  $('percent').textContent = '0%';
  $('progress-label').textContent = 'Checking playlist…';
  status('Committing. Keep this page open.');
  let complete = false;
  try {
    const response = await fetch('/api/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie, snapshot, order: ids() }),
    });
    if (!response.ok) throw new Error((await response.json()).error);
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let buffer = '';
    const receive = (line) => {
      const event = JSON.parse(line);
      if (event.type === 'error') throw new Error(event.message);
      $('progress').max = event.total;
      $('progress').value = event.done;
      $('percent').textContent = `${Math.floor((event.done / event.total) * 100)}%`;
      $('progress-label').textContent = event.message;
      if (event.type === 'done') {
        snapshot = event.snapshot;
        items = [...snapshot.items];
        selected.clear();
        complete = true;
      }
    };
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim()) receive(line);
      }
      if (done) break;
    }
    if (!complete) throw new Error('Connection lost; the commit may be partial.');
    status('Committed. Playlist verified.');
  } catch (error) {
    blocked = true;
    const message = `${error.message || 'Commit failed.'} Load the playlist again before editing.`;
    status(message, true);
    $('progress-label').textContent = message;
  } finally {
    busy = false;
    render();
  }
};
window.addEventListener('beforeunload', (event) => {
  if (busy || changed()) event.preventDefault();
});
window.addEventListener('pagehide', () => {
  cookie = '';
  snapshot = null;
  items = [];
  selected.clear();
  $('cookie').value = '';
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});
render();
