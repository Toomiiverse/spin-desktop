// Adding and editing music: yubal (YouTube Music downloads) and spin-sources (search, SoundCloud, tag edits,
// deletes, rescans) on the server, both behind one tailscale port. spin-sources sends no CORS headers, so
// this runs in the main process, never the renderer.
import { authHeader, type Session } from './jellyfin';

const BASE = 'https://haruserver.tail6da04d.ts.net:8930';
const ID = /^[0-9a-f]{32}$/;

export type Job = { id: string; url: string; status: string; progress?: number; content_info?: { title?: string; artist?: string; thumbnail_url?: string; track_count?: number } };
export type Result = { kind: string; title: string; artist?: string; detail?: string; duration?: string; thumbnail?: string; url: string };
export type Source = 'youtube' | 'soundcloud';

export function sources(getSession: () => Session, fetchFn: typeof fetch = fetch) {
  const call = async <T>(path: string, init: { method?: string; body?: BodyInit; headers?: Record<string, string>; auth?: boolean } = {}): Promise<T> => {
    const response = await fetchFn(BASE + path, {
      method: init.method ?? 'GET', body: init.body, signal: AbortSignal.timeout(60000),
      headers: { Accept: 'application/json', ...(init.auth ? { Authorization: authHeader(getSession()) } : {}), ...init.headers },
    });
    const text = await response.text();
    let data: { detail?: string | { msg: string }[] } | undefined;
    try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
    if (!response.ok) {
      const detail = data?.detail;
      const why = Array.isArray(detail) ? detail.map(d => d.msg).join(', ') : detail || text || response.statusText;
      throw new Error(`${response.status} ${why}`.slice(0, 300));
    }
    return data as T;
  };
  const json = (body: unknown) => ({ body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  const item = (id: string) => { if (!ID.test(id)) throw new Error('Not a Jellyfin item id'); return id; };
  return {
    search: (query: string, source: Source) => call<{ results: Result[] }>(`/sources/search?q=${encodeURIComponent(query)}&source=${source}`).then(r => r.results),
    addJob: (url: string) => call<Job>('/api/jobs', { method: 'POST', ...json({ url }) }),
    jobs: () => call<{ jobs: Job[] }>('/api/jobs').then(r => r.jobs.reverse()),
    clearJobs: () => call<void>('/api/jobs', { method: 'DELETE' }),
    addSoundcloud: (url: string, force: boolean) => call<{ id: string }>('/sources/soundcloud', { method: 'POST', ...json({ url, force }) }),
    soundcloudJobs: () => call<{ jobs: Job[] }>('/sources/soundcloud').then(r => r.jobs.reverse()),
    clearSoundcloud: () => call<void>('/sources/soundcloud', { method: 'DELETE' }),
    refreshLibrary: () => call<void>('/sources/library/refresh', { method: 'POST', auth: true }),
    editItem: (id: string, fields: { title: string; artist: string; album: string }) => call<void>(`/sources/library/items/${item(id)}`, { method: 'PATCH', auth: true, ...json(fields) }),
    setArt: (id: string, bytes: Uint8Array, mime: string) => call<void>(`/sources/library/items/${item(id)}/art`, { method: 'PUT', auth: true, body: new Blob([bytes as BlobPart]), headers: { 'Content-Type': mime } }),
    deleteItem: (id: string) => call<void>(`/sources/library/items/${item(id)}`, { method: 'DELETE', auth: true }),
  };
}
