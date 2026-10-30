import { EMPTY_LIBRARY, type Library } from '../types';
import { createLibraryWriter } from '../core/libraryWriter';
import { restoreLibrary } from '../core/playlists';

// Browsers allow only ~5 MB in localStorage, which a full program guide exceeds.
// IndexedDB holds structured data far beyond that. If it is unavailable (some
// private windows), fall back to localStorage so small libraries still work.
interface Store { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>; del(key: string): Promise<void> }

const local: Store = {
  get: async key => { try { const value = localStorage.getItem(`stillwave-${key}`); return value === null ? undefined : JSON.parse(value); } catch { return undefined; } },
  set: async (key, value) => localStorage.setItem(`stillwave-${key}`, JSON.stringify(value)),
  del: async key => localStorage.removeItem(`stillwave-${key}`),
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('stillwave', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('kv');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Storage is blocked.'));
  });
}

const request = <T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  const transaction = db.transaction('kv', mode);
  const result = run(transaction.objectStore('kv'));
  transaction.oncomplete = () => resolve(result.result);
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error);
});

let opened: Promise<Store> | undefined;
function store(): Promise<Store> {
  return opened ??= (async () => {
    let db: IDBDatabase;
    try { db = await openDatabase(); } catch { return local; }
    const idb: Store = {
      get: key => request(db, 'readonly', s => s.get(key)),
      set: async (key, value) => { await request(db, 'readwrite', s => s.put(value, key)); },
      del: async key => { await request(db, 'readwrite', s => s.delete(key)); },
    };
    await migrateLocalStorage(idb);
    return idb;
  })();
}

/** Earlier web builds kept everything in localStorage. Move it once, then free that space. */
async function migrateLocalStorage(idb: Store) {
  try {
    const keys = Object.keys(localStorage).filter(key => key.startsWith('stillwave-'));
    if (!keys.length || await idb.get('snapshot:library') !== undefined) return;
    for (const key of keys) {
      const name = key.slice('stillwave-'.length);
      const snapshot = /^(library|channels|guide|guides)-v1$/.exec(name);
      // Snapshots were saved as JSON; cached guide XML was saved as plain text.
      if (snapshot) await idb.set(`snapshot:${snapshot[1]}`, JSON.parse(localStorage.getItem(key)!));
      else if (name.startsWith('guide-source')) await idb.set(`source:${name === 'guide-source' ? 'legacy-guide' : name.slice('guide-source:'.length)}`, localStorage.getItem(key));
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch { /* A failed migration leaves localStorage untouched. */ }
}

// Web is a development preview. Use the native app for private provider sources.
export async function loadLibrary(): Promise<Library> {
  const db = await store();
  const value = await db.get('snapshot:library') as Library | undefined;
  if (!value) return { ...EMPTY_LIBRARY };
  const [channels, guide, sources] = await Promise.all([db.get('snapshot:channels'), db.get('snapshot:guide'), db.get('snapshot:guides')]);
  if (channels) value.channels = channels as Library['channels'];
  if (guide) value.guide = guide as Library['guide'];
  if (sources) value.guideSources = sources as Library['guideSources'];
  const loaded = restoreLibrary(value);
  saveLibrary.seed(loaded);
  return loaded;
}

export const saveLibrary = createLibraryWriter(async (name, data) => { await (await store()).set(`snapshot:${name}`, data); });

export async function cacheGuideSource(text: string, id = 'legacy-guide'): Promise<void> { await (await store()).set(`source:${id}`, text); }
export async function loadGuideSource(id = 'legacy-guide'): Promise<string | undefined> { return (await (await store()).get(`source:${id}`)) as string | undefined; }
export async function removeGuideCache(id: string): Promise<void> { await (await store()).del(`source:${id}`); }
