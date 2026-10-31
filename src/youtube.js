import { Innertube, Log } from 'youtubei.js';
Log.setLevel(Log.Level.NONE);
export class AppError extends Error {}

export function parseCookie(input) {
  if (typeof input !== 'string' || input.length > 60000 || /[\r\n\x00-\x1f]/u.test(input)) throw new AppError('Invalid Cookie header.');
  const pairs = new Map();
  for (const part of input.trim().replace(/^cookie:\s*/iu, '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    if (!/^[\w-]+$/u.test(key)) throw new AppError('Invalid Cookie header.');
    pairs.set(key, part.slice(index + 1).trim());
  }
  if (!pairs.get('SAPISID')) pairs.set('SAPISID', pairs.get('__Secure-3PAPISID'));
  if (!pairs.get('SAPISID')) throw new AppError('Missing YouTube sign-in cookie.');
  return [...pairs].map(([key, value]) => `${key}=${value}`).join('; ');
}
export function authenticatedFetch(fetchImpl = fetch) {
  return async (input, init) => {
    const response = await fetchImpl(input, { ...init, signal: AbortSignal.timeout(30000) });
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin === 'https://www.youtube.com' && url.pathname.startsWith('/youtubei/') &&
      new Headers(init?.headers ?? input?.headers).has('authorization')) {
      const data = response.ok ? await response.clone().json().catch(() => null) : null;
      if (response.status === 401 || data?.responseContext?.mainAppWebResponseContext?.loggedOut === true) throw new AppError('Cookie expired.');
    }
    return response;
  };
}
async function request(action) {
  try { return await action(); }
  catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('YouTube request failed. Check cookie and connection.');
  }
}
export function operations(session) {
  return {
    async read(id) {
      let page = await request(() => session.getPlaylist(id));
      if (id === 'LM' || page.info.is_editable !== true || page.info.can_reorder === false) throw new AppError('Cannot edit this playlist.');
      const snapshot = { id, title: String(page.info.title || id), owner: page.info.author?.id || '', items: [] };
      const seen = new Set();
      for (let pages = 0; ; pages++) {
        for (const video of page.items) {
          const entry = video.set_video_id, videoId = video.id;
          if (!entry || !videoId || seen.has(entry)) throw new AppError('Incomplete or duplicate entry IDs.');
          seen.add(entry);
          snapshot.items.push({ id: entry, videoId, title: String(video.title || videoId),
            channel: String(video.author?.name || '') });
          if (snapshot.items.length > 10000) throw new AppError('Playlist exceeds 10,000 songs.');
        }
        if (!page.has_continuation) return snapshot;
        if (pages >= 99) throw new AppError('Pagination limit reached.');
        page = await request(() => page.getContinuation());
      }
    },
    async edit(id, action) {
      const result = await request(() => session.actions.execute('/browse/edit_playlist', { playlistId: id, actions: [action] }));
      if (!result.success || result.data?.status !== 'STATUS_SUCCEEDED') throw new AppError('Edit unconfirmed. Load again.');
    },
    remove(id, entry) { return this.edit(id, { action: 'ACTION_REMOVE_VIDEO', setVideoId: entry }); },
    move(id, entry, before) { return this.edit(id, { action: 'ACTION_MOVE_VIDEO_BEFORE', setVideoId: entry, movedSetVideoIdSuccessor: before }); },
  };
}
export async function youtube(cookie) {
  return operations(await request(() => Innertube.create({
    cookie: parseCookie(cookie), retrieve_player: false, enable_session_cache: false, fetch: authenticatedFetch(),
  })));
}
