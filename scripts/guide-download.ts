import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Bounded downloads also bound chunked responses without Content-Length. */
export async function downloadGuideFile(url: string, cache: string, limit: number, reuse: boolean) {
  if (reuse) {
    const saved = await readFile(cache).catch(() => undefined);
    if (saved && saved.length <= limit) return saved;
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'StillWave personal guide collector' } });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > limit) throw new Error('Schedule exceeded download size limit.');
      parts.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const data = Buffer.concat(parts);
  await mkdir(path.dirname(cache), { recursive: true });
  await writeFile(cache, data);
  return data;
}
