// Synthetic upstream for local UI checks. Never contacts YouTube.
import { createApp } from '../src/server.js';
const rows = [
  ['Teardrop', 'Massive Attack'],
  ['Roads', 'Portishead'],
  ['La femme d’argent', 'Air'],
  ['Avril 14th', 'Aphex Twin'],
  ['All I Need', 'Air'],
  ['Jóga', 'Björk'],
  ['Teardrop', 'Massive Attack'],
  ['Dayvan Cowboy', 'Boards of Canada'],
  ['Everything In Its Right Place', 'Radiohead'],
  ['Glory Box', 'Portishead'],
  ['Xtal', 'Aphex Twin'],
  ['Hyperballad', 'Björk'],
  ['Roygbiv', 'Boards of Canada'],
  ['Breathe', 'Télépopmusik'],
  ['Angel', 'Massive Attack'],
  ['Playground Love', 'Air'],
  ['Windowlicker', 'Aphex Twin'],
  ['Unravel', 'Björk'],
  ['Kid for Today', 'Boards of Canada'],
  ['Inertia Creeps', 'Massive Attack'],
  ['No Surprises', 'Radiohead'],
  ['Sour Times', 'Portishead'],
];
const playlist = {
  id: 'PLdemo',
  title: 'Demo / late night rotation',
  owner: 'demo',
  items: rows.map(([title, channel], i) => ({
    id: `entry-${i}`,
    videoId: `video-${i}`,
    title,
    channel,
  })),
};
const client = {
  async read(id) {
    if (id !== playlist.id) throw new Error('Use PLdemo.');
    return structuredClone(playlist);
  },
  async remove(id, entry) {
    playlist.items = playlist.items.filter((item) => item.id !== entry);
  },
  async move(id, entry, before) {
    const [item] = playlist.items.splice(
      playlist.items.findIndex((row) => row.id === entry),
      1,
    );
    playlist.items.splice(
      playlist.items.findIndex((row) => row.id === before),
      0,
      item,
    );
  },
};
const port = Number(process.env.PORT || 3001);
createApp({ clientFactory: async () => client, delay: 120 }).listen(port, '127.0.0.1', () => {
  console.log(`Demo ready: http://localhost:${port} — cookie: SAPISID=demo; playlist: PLdemo`);
});
