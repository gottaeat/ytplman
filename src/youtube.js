import { Innertube, Log } from 'youtubei.js';
Log.setLevel(Log.Level.NONE);

export class AppError extends Error {}

export function parseCookie(input) {
  if (typeof input !== 'string' || input.length > 60000 || /[\r\n\x00-\x1f]/u.test(input)) {
    throw new AppError('Paste the Cookie request header value, on one line.');
  }
  const pairs = new Map();
  for (const part of input
    .trim()
    .replace(/^cookie:\s*/iu, '')
    .split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    if (!/^[\w-]+$/u.test(key)) throw new AppError('Invalid Cookie header.');
    pairs.set(key, part.slice(index + 1).trim());
  }
  if (!pairs.get('SAPISID')) pairs.set('SAPISID', pairs.get('__Secure-3PAPISID'));
  if (!pairs.get('SAPISID'))
    throw new AppError('No sign-in cookie. Copy the Cookie header from a signed-in YouTube tab.');
  return [...pairs].map(([key, value]) => `${key}=${value}`).join('; ');
}

export function authenticatedFetch(fetchImpl = fetch) {
  return async (input, init) => {
    const response = await fetchImpl(input, { ...init, signal: AbortSignal.timeout(30000) });
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (
      url.origin === 'https://www.youtube.com' &&
      url.pathname.startsWith('/youtubei/') &&
      new Headers(init?.headers ?? input?.headers).has('authorization')
    ) {
      const data = response.ok
        ? await response
            .clone()
            .json()
            .catch(() => null)
        : null;
      if (
        response.status === 401 ||
        data?.responseContext?.mainAppWebResponseContext?.loggedOut === true
      ) {
        throw new AppError('YouTube says the cookie has expired. Paste a fresh Cookie header.');
      }
    }
    return response;
  };
}

async function request(action) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('YouTube did not complete the request. Check your cookie and connection.');
  }
}

export function operations(session) {
  return {
    async read(id) {
      let page = await request(() => session.getPlaylist(id));
      if (id === 'LM' || page.info.is_editable !== true || page.info.can_reorder === false) {
        throw new AppError(
          'This cookie cannot edit that playlist. Use a playlist you own, with manual ordering.',
        );
      }
      const snapshot = {
        id,
        title: String(page.info.title || 'Untitled playlist'),
        owner: page.info.author?.id || '',
        items: [],
      };
      const seen = new Set();
      for (let pages = 0; ; pages++) {
        for (const video of page.items) {
          const entry = video.set_video_id;
          const videoId = video.id || video.content_id;
          if (!entry || !videoId || seen.has(entry)) {
            throw new AppError(
              'YouTube returned an unavailable song or incomplete entry IDs. No edits were made.',
            );
          }
          seen.add(entry);
          snapshot.items.push({
            id: entry,
            videoId,
            title: String(video.title || video.metadata?.title || 'Unavailable video'),
            channel: String(
              video.author?.name ||
                video.metadata?.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text ||
                '',
            ),
          });
          if (snapshot.items.length > 10000)
            throw new AppError('Maximum playlist size: 10,000 songs.');
        }
        if (!page.has_continuation) return snapshot;
        if (pages >= 99) throw new AppError('Playlist pagination limit reached.');
        page = await request(() => page.getContinuation());
      }
    },
    async edit(id, action) {
      const result = await request(() =>
        session.actions.execute('/browse/edit_playlist', { playlistId: id, actions: [action] }),
      );
      if (!result.success || result.data?.status !== 'STATUS_SUCCEEDED') {
        throw new AppError(
          'YouTube did not confirm the edit. Load the playlist again to check its actual state.',
        );
      }
    },
    remove(id, entry) {
      return this.edit(id, { action: 'ACTION_REMOVE_VIDEO', setVideoId: entry });
    },
    move(id, entry, before) {
      return this.edit(id, {
        action: 'ACTION_MOVE_VIDEO_BEFORE',
        setVideoId: entry,
        movedSetVideoIdSuccessor: before,
      });
    },
  };
}

export async function youtube(cookie) {
  const value = parseCookie(cookie);
  const session = await request(() =>
    Innertube.create({
      cookie: value,
      retrieve_player: false,
      enable_session_cache: false,
      fetch: authenticatedFetch(),
    }),
  );
  return operations(session);
}
