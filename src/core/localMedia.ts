/** Local Media: files the person chose on this phone. Nothing is scanned, copied or uploaded. */
export type LocalKind = 'video' | 'audio';
/** `moved`: the file or its access is gone. `unsupported`: this device could not decode it. */
export type LocalProblem = 'moved' | 'unsupported';

export interface LocalItem {
  id: string;
  uri: string;
  name: string;
  kind: LocalKind;
  size?: number;
  openedAt: number;
  positionMs: number;
  durationMs?: number;
  problem?: LocalProblem;
}
export interface PickedFile { uri: string; name: string; mimeType?: string; size?: number }

export const MAX_RECENTS = 30;
const VIDEO = new Set(['mp4', 'm4v', 'mov', 'mkv', 'webm', '3gp', 'avi', 'wmv', 'flv', 'ts', 'mpg', 'mpeg']);
const AUDIO = new Set(['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus', 'amr', 'wma', 'mid']);

/** MIME type first, because a content:// name may lack an extension; the extension is the fallback. */
export function classifyMedia(name: string, mime?: string): LocalKind | undefined {
  if (mime?.startsWith('video/')) return 'video';
  if (mime?.startsWith('audio/')) return 'audio';
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!ext) return undefined;
  return VIDEO.has(ext) ? 'video' : AUDIO.has(ext) ? 'audio' : undefined;
}

export function localId(uri: string): string {
  let hash = 5381;
  for (let i = 0; i < uri.length; i++) hash = ((hash << 5) + hash + uri.charCodeAt(i)) | 0;
  return `local-${(hash >>> 0).toString(36)}`;
}

/** Newly chosen files go first. Re-choosing a known file restores it and keeps its progress. */
export function mergePicked(items: readonly LocalItem[], picked: readonly PickedFile[], now: number): { items: LocalItem[]; added: number; skipped: string[] } {
  let next = [...items];
  let added = 0;
  const skipped: string[] = [];
  for (const file of picked) {
    const kind = classifyMedia(file.name, file.mimeType);
    if (!kind) { skipped.push(file.name); continue; }
    const id = localId(file.uri);
    const existing = next.find(item => item.id === id);
    next = next.filter(item => item.id !== id);
    if (existing) next.unshift({ ...existing, name: file.name, size: file.size ?? existing.size, problem: undefined });
    else { next.unshift({ id, uri: file.uri, name: file.name, kind, size: file.size, openedAt: now, positionMs: 0 }); added++; }
  }
  return { items: next.slice(0, MAX_RECENTS), added, skipped };
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const update = (items: readonly LocalItem[], id: string, change: (item: LocalItem) => LocalItem) => items.map(item => item.id === id ? change(item) : item);

export function recordProgress(items: readonly LocalItem[], id: string, positionMs: number, durationMs: number | undefined, now: number): LocalItem[] {
  if (!finite(positionMs) || positionMs < 0) return [...items];
  return update(items, id, item => ({ ...item, positionMs: Math.round(positionMs), durationMs: finite(durationMs) && durationMs > 0 ? Math.round(durationMs) : item.durationMs, openedAt: now, problem: undefined }));
}
export function markProblem(items: readonly LocalItem[], id: string, problem: LocalProblem | undefined): LocalItem[] {
  return update(items, id, item => ({ ...item, problem }));
}
export function removeItem(items: readonly LocalItem[], id: string): LocalItem[] { return items.filter(item => item.id !== id); }

/** Opening near the end, or just after the start, begins from the top instead of resuming. */
export function resumePosition(item: Pick<LocalItem, 'positionMs' | 'durationMs'>): number {
  if (item.positionMs < 5_000) return 0;
  if (item.durationMs && item.positionMs >= item.durationMs * 0.95) return 0;
  return item.positionMs;
}
export function progressFraction(item: Pick<LocalItem, 'positionMs' | 'durationMs'>): number {
  if (!item.durationMs || resumePosition(item) === 0) return 0;
  return Math.max(0, Math.min(1, item.positionMs / item.durationMs));
}

export function formatDuration(ms: number | undefined): string {
  if (!finite(ms) || ms < 0) return '';
  const total = Math.floor(ms / 1000), h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Stored data is untrusted after app updates and edits; keep only well-formed items. */
export function parseStored(text: string | null | undefined): LocalItem[] {
  if (!text) return [];
  try {
    const data = JSON.parse(text) as unknown;
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    const items: LocalItem[] = [];
    for (const raw of data as Partial<LocalItem>[]) {
      if (!raw || typeof raw.uri !== 'string' || typeof raw.name !== 'string' || (raw.kind !== 'video' && raw.kind !== 'audio')) continue;
      const id = localId(raw.uri);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({
        id, uri: raw.uri, name: raw.name, kind: raw.kind,
        size: finite(raw.size) ? raw.size : undefined,
        openedAt: finite(raw.openedAt) ? raw.openedAt : 0,
        positionMs: finite(raw.positionMs) && raw.positionMs >= 0 ? raw.positionMs : 0,
        durationMs: finite(raw.durationMs) && raw.durationMs > 0 ? raw.durationMs : undefined,
        problem: raw.problem === 'moved' || raw.problem === 'unsupported' ? raw.problem : undefined,
      });
    }
    return items.slice(0, MAX_RECENTS);
  } catch { return []; }
}

/** A missing or unreadable file reads differently from a file the decoder cannot handle. */
export function classifyPlaybackError(message: string | undefined): LocalProblem {
  return /not.?found|no such file|enoent|permission|denied|eacces|securityexception|expired|open failed|forbidden|404/i.test(message ?? '') ? 'moved' : 'unsupported';
}
