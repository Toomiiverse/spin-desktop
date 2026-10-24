// Jellyfin, the same calls the phone makes. Every request carries the MediaBrowser header; the fetch is
// injectable so a test can stand in for the server.
export type Session = { server: string; userId: string; deviceId: string; token: string };

export type Song = {
  Id: string; Name: string; Album?: string; AlbumId?: string; Artists?: string[]; RunTimeTicks?: number;
  ImageTags?: Record<string, string>; AlbumPrimaryImageTag?: string; ProductionYear?: number; Genres?: string[];
  IndexNumber?: number; ParentIndexNumber?: number; DateCreated?: string; PlaylistItemId?: string;
  UserData?: { PlayCount?: number; IsFavorite?: boolean };
  MediaSources?: { Bitrate?: number; Size?: number; Container?: string; MediaStreams?: { Type: string; Codec?: string; SampleRate?: number; BitRate?: number; Channels?: number }[] }[];
};
export type Playlist = { Id: string; Name: string; ChildCount?: number; ImageTags?: Record<string, string> };

export const authHeader = (session: { deviceId: string; token?: string }) =>
  `MediaBrowser Client="Spin", Device="Desktop", DeviceId="${session.deviceId}", Version="1.0"` + (session.token ? `, Token="${session.token}"` : '');

/** Trimmed, no trailing slash, https when no scheme was typed. */
export const normalizeServer = (typed: string) => {
  const trimmed = typed.trim().replace(/\/+$/, '');
  return /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

async function request<T>(fetchFn: typeof fetch, url: string, auth: string, method: string, body?: unknown, timeout = 30000): Promise<T> {
  const response = await fetchFn(url, {
    method, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout),
    headers: { Authorization: auth, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 200)}`.trim());
  return (text ? JSON.parse(text) : undefined) as T;
}

export function jellyfin(getSession: () => Session, fetchFn: typeof fetch = fetch) {
  const call = <T>(method: string, path: string, body?: unknown) => {
    const session = getSession();
    return request<T>(fetchFn, session.server + path, authHeader(session), method, body);
  };
  const ids = (list: string[]) => list.map(encodeURIComponent).join(',');
  return {
    async login(server: string, deviceId: string, username: string, password: string) {
      const origin = normalizeServer(server);
      const reply = await request<{ AccessToken: string; User: { Id: string } }>(fetchFn, `${origin}/Users/AuthenticateByName`, authHeader({ deviceId }), 'POST', { Username: username, Pw: password });
      return { server: origin, token: reply.AccessToken, userId: reply.User.Id };
    },
    songs: () => call<{ Items: Song[] }>('GET', `/Items?userId=${getSession().userId}&includeItemTypes=Audio&recursive=true&sortBy=DateCreated,SortName&sortOrder=Descending&fields=MediaSources,DateCreated,ProductionYear,Genres,IndexNumber,ParentIndexNumber`).then(r => r.Items),
    playlists: () => call<{ Items: Playlist[] }>('GET', `/Items?userId=${getSession().userId}&includeItemTypes=Playlist&recursive=true&sortBy=SortName&fields=ChildCount`).then(r => r.Items),
    playlistItems: (playlistId: string) => call<{ Items: Song[] }>('GET', `/Playlists/${encodeURIComponent(playlistId)}/Items?userId=${getSession().userId}&fields=MediaSources,DateCreated,ProductionYear,Genres,IndexNumber,ParentIndexNumber`).then(r => r.Items),
    createPlaylist: (name: string, songIds: string[]) => call<{ Id: string }>('POST', '/Playlists', { Name: name, Ids: songIds, UserId: getSession().userId, MediaType: 'Audio' }),
    addToPlaylist: (playlistId: string, songIds: string[]) => call<void>('POST', `/Playlists/${encodeURIComponent(playlistId)}/Items?userId=${getSession().userId}&ids=${ids(songIds)}`),
    removeFromPlaylist: (playlistId: string, entryIds: string[]) => call<void>('DELETE', `/Playlists/${encodeURIComponent(playlistId)}/Items?entryIds=${ids(entryIds)}`),
    deletePlaylist: (playlistId: string) => call<void>('DELETE', `/Items/${encodeURIComponent(playlistId)}`),
  };
}
