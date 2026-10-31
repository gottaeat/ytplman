import { sortUnique, reorder, nudge, plan } from './model.js';
const $ = (id) => document.getElementById(id);
const list = $('songs');
let cookie = '', snapshot = null, items = [], selected = new Set();
let busy = false, blocked = false, anchor = null, dragging = false, before = null;
$('cookie-form').reset();
$('playlist-form').reset();
const ids = () => items.map((item) => item.id);
const changed = () => snapshot && (items.length !== snapshot.items.length || items.some((item, i) => item.id !== snapshot.items[i]?.id));
const status = (text) => { $('status').textContent = text; };
function element(tag, text = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
function controls() {
  const locked = busy || blocked || !snapshot;
  $('editor').disabled = locked;
  $('load').disabled = busy || !cookie;
  for (const input of $('cookie-form').elements) input.disabled = busy;
  $('playlist').disabled = busy;
  for (const id of ['up', 'down', 'delete']) $(id).disabled = !selected.size;
  for (const id of ['reset', 'commit']) $(id).disabled = !changed();
  for (const id of ['sort', 'all']) $(id).disabled = !items.length;
  $('all').checked = !!items.length && selected.size === items.length;
  $('all').indeterminate = selected.size > 0 && selected.size < items.length;
  for (const row of list.children) {
    row.draggable = !locked;
    row.classList.toggle('picked', selected.has(row.dataset.id));
    row.firstChild.checked = selected.has(row.dataset.id);
  }
}
function render() {
  const scroll = list.scrollTop;
  list.replaceChildren(...items.map((item, i) => {
    const row = element('div'); row.className = 'song'; row.dataset.id = item.id;
    const check = element('input'); check.type = 'checkbox'; check.setAttribute('aria-label', `Select ${item.title}`);
    const text = element('span', `${i + 1}. ${item.channel} / ${item.title}`);
    row.append(check, text);
    return row;
  }));
  list.scrollTop = scroll;
  $('title').textContent = snapshot?.title || '';
  controls();
}
function edit(next) {
  if (busy || blocked || !snapshot) return;
  items = next;
  const kept = new Set(ids());
  selected = new Set([...selected].filter((id) => kept.has(id)));
  $('progress').hidden = true; status(''); render();
}
async function post(path, data) {
  const response = await fetch('/api/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cookie, ...data }),
  });
  if (!response.ok) throw new Error((await response.json()).error);
  return response;
}
$('cookie-form').onsubmit = (event) => {
  event.preventDefault();
  cookie = $('cookie').value.trim(); $('cookie').value = '';
  controls(); status('Cookie set.'); $('playlist').focus();
};
$('playlist-form').onsubmit = async (event) => {
  event.preventDefault();
  if (!cookie || busy || (changed() && !blocked && !confirm('Discard edits?'))) return;
  busy = true; controls(); status('Loading…');
  try {
    snapshot = await (await post('load', { playlist: $('playlist').value })).json();
    items = [...snapshot.items]; selected.clear(); blocked = false; anchor = null;
    $('progress').hidden = true; status('');
  } catch (error) { status(error.message); }
  finally { busy = false; render(); }
};
$('sort').onclick = () => { edit(sortUnique(items)); list.scrollTop = 0; };
$('reset').onclick = () => { selected.clear(); edit([...snapshot.items]); };
$('all').onchange = () => { selected = $('all').checked ? new Set(ids()) : new Set(); controls(); };
$('delete').onclick = () => edit(items.filter((item) => !selected.has(item.id)));
for (const [id, direction] of [['up', -1], ['down', 1]]) $(id).onclick = () => edit(nudge(items, selected, direction));
list.onclick = (event) => {
  if (busy || blocked) return;
  const row = event.target.closest('.song'); if (!row) return;
  const id = row.dataset.id;
  const choosing = event.target.matches('input') ? event.target.checked : !selected.has(id);
  const a = ids().indexOf(anchor), b = ids().indexOf(id);
  const range = event.shiftKey && a >= 0 ? items.slice(Math.min(a, b), Math.max(a, b) + 1) : [{ id }];
  for (const item of range) { if (choosing) selected.add(item.id); else selected.delete(item.id); }
  anchor = id; controls();
};
function clearDrop() {
  list.classList.remove('end');
  list.querySelector('.before')?.classList.remove('before');
}
list.ondragstart = (event) => {
  const row = event.target.closest('.song');
  if (!row || busy || blocked) return event.preventDefault();
  if (!selected.has(row.dataset.id)) selected = new Set([row.dataset.id]);
  dragging = true; controls();
  event.dataTransfer.setData('text/plain', row.dataset.id);
  event.dataTransfer.effectAllowed = 'move';
};
list.ondragover = (event) => {
  if (!dragging) return;
  event.preventDefault(); clearDrop();
  event.dataTransfer.dropEffect = 'move';
  const row = event.target.closest('.song');
  before = row && event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2 ? row : row?.nextElementSibling;
  if (before) before.classList.add('before'); else list.classList.add('end');
};
list.ondrop = (event) => {
  if (!dragging) return;
  event.preventDefault(); dragging = false; clearDrop();
  edit(reorder(items, selected, before?.dataset.id || null));
};
list.ondragend = () => { dragging = false; clearDrop(); };
$('commit').onclick = () => {
  const { removed, moves } = plan(snapshot.items, ids());
  $('summary').textContent = `Delete: ${removed.length}. Move: ${moves.length}.`;
  const positions = new Map(snapshot.items.map((item, i) => [item.id, i + 1]));
  $('changes').textContent = [
    ...removed.map((item) => `- ${item.channel} / ${item.title}`),
    ...items.map((item, i) => `${positions.get(item.id)} → ${i + 1}  ${item.channel} / ${item.title}`),
  ].join('\n');
  $('review').showModal(); $('close-review').focus();
};
$('close-review').onclick = () => $('review').close();
$('confirm').onclick = async () => {
  if (busy || blocked || !changed()) return;
  $('review').close(); busy = true; controls();
  const progress = $('progress'); progress.hidden = false; progress.max = 1; progress.value = 0;
  status('Checking…');
  let complete = false;
  try {
    const response = await post('commit', { snapshot, order: ids() });
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const event = JSON.parse(line);
        if (event.type === 'error') throw new Error(event.message);
        progress.max = event.total; progress.value = event.done; status(event.message);
        if (event.type === 'done') { snapshot = event.snapshot; items = [...snapshot.items]; selected.clear(); complete = true; }
      }
      if (done) break;
    }
    if (!complete) throw new Error('Connection lost.');
  } catch (error) { blocked = true; status(`${error.message} Load again before editing.`); }
  finally { busy = false; render(); }
};
window.onbeforeunload = (event) => { if (busy || changed()) event.preventDefault(); };
window.onpagehide = () => { cookie = ''; snapshot = null; items = []; selected.clear(); $('cookie').value = ''; };
window.onpageshow = (event) => { if (event.persisted) location.reload(); };
render();
