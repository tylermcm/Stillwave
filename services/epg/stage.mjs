import { mkdir, readFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const service = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(service, '../..');
const output = path.join(root, '.build-tmp/epg-service');
const copied = new Set();
async function copySource(relative) {
  const filename = path.resolve(root, relative);
  if (!filename.startsWith(root + path.sep)) throw new Error('Source import escaped the repository.');
  if (copied.has(filename)) return;
  copied.add(filename);
  const destination = path.join(output, path.relative(root, filename));
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(filename, destination);
  if (filename.endsWith('.json')) return;
  const text = await readFile(filename, 'utf8');
  for (const match of text.matchAll(/\bfrom\s*['"](\.[^'"]+)['"]/g)) {
    let dependency = path.resolve(path.dirname(filename), match[1]);
    if (!path.extname(dependency)) dependency += '.ts';
    await copySource(path.relative(root, dependency));
  }
}
await mkdir(path.join(output, 'artifacts'), { recursive: true });
for (const file of ['package.json', 'package-lock.json', 'tsconfig.json']) await copyFile(path.join(service, file), path.join(output, file));
await copySource('scripts/audit-guide-coverage.ts');
console.log(`Staged ${copied.size} guide source/data files with a standalone Node dependency lock. Output: ${output}`);
